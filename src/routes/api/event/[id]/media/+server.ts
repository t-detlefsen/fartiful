import { json } from '@sveltejs/kit';
import { and, or, eq, sql } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import { database } from '$lib/database/db';
import { events, rsvps, media } from '$lib/database/schema';
import { RSVPStatus } from '$lib/types'; // Adjust this import.
import {
	IMAGE_LIMITS,
	ImageValidationError,
	processImage
} from '$lib/server/imageValidation';
import { storeProcessedImage, deleteStoredImage } from '$lib/server/mediaStorage';

const USER_COOKIE = 'cactoideUserId';
const MAX_FILES_PER_REQUEST = 10;
const MAX_IMAGES_PER_EVENT = 100;

// Package API errors
function errorResponse(message: string, status: number) {
	return json({ error: message }, { status });
}

// Check if value is file
function isFile(value: FormDataEntryValue | null): value is File {
	return value instanceof File;
}

// API Endpoint for image upload
export const POST = async ({
	params,
	request,
	cookies,
	url
}) => {
	// Check for event id
	const eventId = params.id;

	if (!eventId) {
		return errorResponse('Event ID is required', 400);
	}

	// Protect cookie-authenticated state-changing requests.
	const origin = request.headers.get('origin');

	if (origin && origin !== url.origin) {
		return errorResponse('Invalid request origin', 403);
	}

	// Get user id from cookies
	const userId = cookies.get(USER_COOKIE);

	if (!userId) {
		return errorResponse('Authentication required', 401);
	}

	// If the cookie is intended to contain UUIDs, validate it before using it
	const userIdIsUuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			userId
		);

	if (!userIdIsUuid) {
		return errorResponse('Invalid user identity', 401);
	}

	// Validate event
	const event = await database.query.events.findFirst({
		where: eq(events.id, eventId),
		columns: {
			id: true,
			userId: true
		}
	});

	if (!event) {
		return errorResponse('Event not found', 404);
	}

	// Validate user for upload (event creator or yes/maybe attendee)
	const isEventCreator = event.userId === userId;

	let isConfirmedAttendee = false;

	if (!isEventCreator) {
		const confirmedRsvp = await database.query.rsvps.findFirst({
			where: and(
				eq(rsvps.eventId, eventId),
				eq(rsvps.userId, userId),
				or(
					eq(rsvps.status, RSVPStatus.yes),
					eq(rsvps.status, RSVPStatus.maybe)
				)
			),
			columns: {
				userId: true
			}
		});

		isConfirmedAttendee = Boolean(confirmedRsvp);
	}

	if (!isEventCreator && !isConfirmedAttendee) {
		return errorResponse('You are not allowed to upload to this event', 403);
	}

	// Check form data is multipart (multiple image upload)
	const contentType = request.headers.get('content-type') ?? '';

	if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
		return errorResponse('Expected multipart/form-data', 415);
	}

	let formData: FormData;

	try {
        formData = await request.formData();
    } catch (error) {
        console.error('Multipart parsing failed:', error);

        return errorResponse('Invalid multipart request', 400);
    }

	const values = formData.getAll('files');

	if (values.length === 0) {
		return errorResponse('No files were uploaded', 400);
	}

	// Check files against limit
	if (values.length > MAX_FILES_PER_REQUEST) {
		return errorResponse(
			`A maximum of ${MAX_FILES_PER_REQUEST} files may be uploaded at once`,
			413
		);
	}

	// Check each file and add to array
	const files: File[] = [];

	for (const value of values) {
		if (!isFile(value)) {
			return errorResponse('Each uploaded value must be a file', 400);
		}

		if (value.size === 0) {
			return errorResponse('Empty files are not allowed', 400);
		}

		if (value.size > IMAGE_LIMITS.maxSourceBytes) {
			return errorResponse(
				`Each file must be no larger than ${
					IMAGE_LIMITS.maxSourceBytes / 1024 / 1024
				} MB`,
				413
			);
		}

		files.push(value);
	}

	// Avoid race conditions by locking event during upload
	return await database.transaction(async (tx) => {
		// Lock the parent event row to prevent other requests from counting at the same time
		await tx
			.select()
			.from(events)
			.where(eq(events.id, eventId))
			.for('update');

		// Safely get the current count inside the locked transaction
		const [result] = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(media)
			.where(eq(media.eventId, eventId));

		const currentCount = Number(result?.count ?? 0);

		// Enforce file limit rule
		if (currentCount + files.length > MAX_IMAGES_PER_EVENT) {
			return errorResponse(
				`The event can contain at most ${MAX_IMAGES_PER_EVENT} images`,
				409
			);
		}

		type ProcessedImageSummary = {
			buffer: Buffer;
			originalName: string;
			sourceFormat: string;
			width: number;
			height: number;
			size: number;
		};

		const processed: ProcessedImageSummary[] = [];

		// Loop through images and process using processImage())
		for (const file of files) {
			let image: Awaited<ReturnType<typeof processImage>>;

			try {
				const buffer = Buffer.from(await file.arrayBuffer());
				image = await processImage(buffer);
			} catch (error) {
				if (error instanceof ImageValidationError) {
					return errorResponse(
						`${file.name || 'Uploaded file'}: ${error.message}`,
						415
					);
				}

				console.error('Unexpected image-processing error', error);
				return errorResponse('Image processing failed', 422);
			}

			processed.push({
				buffer: image.buffer,
				originalName: file.name,
				sourceFormat: image.sourceFormat,
				width: image.width,
				height: image.height,
				size: image.size
			});
		}

		const storedFiles: Array<{
			storageKey: string;
			path: string;
			width: number;
			height: number;
			size: number;
			sourceFormat: string;
		}> = [];

		// Loop through images and store using storeProcessedImage()
		try {
			for (const image of processed) {
				// Store image in volume
				const stored = await storeProcessedImage(eventId, image.buffer);

				// Mark as stored
				storedFiles.push({
					storageKey: stored.storageKey,
					path: stored.path,
					width: image.width,
					height: image.height,
					size: image.size,
					sourceFormat: image.sourceFormat
				});

				// Add image to database
				await tx.insert(media).values({
					id: crypto.randomUUID(),
					eventId,
					userId,
					storageKey: stored.storageKey,
					createdAt: new Date()
				});
			}
		} catch (error) {
			console.error('Failed to store uploaded image:', error);

			// Clean up any files already stored during this request.
			for (const stored of storedFiles) {
			    try {
			        await unlink(stored.path);
			    } catch {
			        console.error('Failed to clean up', stored.path);
			    }
			}

			return errorResponse('Failed to store uploaded image', 500);
		}

		return json({
			ok: true,
			eventId,
			count: storedFiles.length,
			images: storedFiles.map((image) => ({
				storageKey: image.storageKey,
				sourceFormat: image.sourceFormat,
				width: image.width,
				height: image.height,
				size: image.size
			}))
		});
	});
};

// API Endpoint for image deletion
export const DELETE = async ({ params, request, cookies, url }) => {
	// Check for event id
	const eventId = params.id;

	if (!eventId) {
		return errorResponse('Event ID is required', 400);
	}

	// Protect cookie-authenticated state-changing requests.
	const origin = request.headers.get('origin');

	if (origin && origin !== url.origin) {
		return errorResponse('Invalid request origin', 403);
	}

	// Get user id from cookies
	const userId = cookies.get(USER_COOKIE);

	if (!userId) {
		return errorResponse('Authentication required', 401);
	}

	// If the cookie is intended to contain UUIDs, validate it before using it
	const userIdIsUuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			userId
		);

	if (!userIdIsUuid) {
		return errorResponse('Invalid user identity', 401);
	}

	// Check for media id
	const mediaId = url.searchParams.get('mediaId');

	if (!mediaId) {
		return errorResponse('Media ID is required', 400);
	}

	// Validate event
	const event = await database.query.events.findFirst({
		where: eq(events.id, eventId),
		columns: {
			id: true,
			userId: true
		}
	});

	if (!event) {
		return errorResponse('Event not found', 404);
	}

	// Validate image
	const image = await database.query.media.findFirst({
		where: and(eq(media.id, mediaId), eq(media.eventId, eventId)),
		columns: {
			id: true,
			eventId: true,
			userId: true,
			storageKey: true
		}
	});

	if (!image) {
		return errorResponse('Image not found', 404);
	}

	// Validate user for deletion (event creator or image uploader)
	const canDelete = event.userId === userId || image.userId === userId;

	if (!canDelete) {
		return errorResponse('You are not allowed to delete this image', 403);
	}

	try {
		// Delete the physical file first.
		await deleteStoredImage(image.eventId, image.storageKey);

		// Then delete the database record.
		await database
			.delete(media)
			.where(
				and(
					eq(media.id, image.id),
					eq(media.eventId, eventId)
				)
			);

		return json({
			ok: true,
			mediaId: image.id
		});
	} catch (error) {
		console.error('Failed to delete image:', error);

		return errorResponse('Failed to delete image', 500);
	}
};