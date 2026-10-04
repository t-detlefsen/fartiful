import { json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { database } from '$lib/database/db';
import { events, rsvps, media } from '$lib/database/schema';
import { RSVPStatus } from '$lib/types'; // Adjust this import.
import {
	IMAGE_LIMITS,
	ImageValidationError,
	processImage
} from '$lib/server/imageValidation';
import { storeProcessedImage } from '$lib/server/mediaStorage';

const USER_COOKIE = 'cactoideUserId';
const MAX_FILES_PER_REQUEST = 10;
const MAX_IMAGES_PER_EVENT = 100;

function errorResponse(message: string, status: number) {
	return json({ error: message }, { status });
}

function isFile(value: FormDataEntryValue | null): value is File {
	return value instanceof File;
}

export const POST = async ({
	params,
	request,
	cookies,
	url
}) => {
	const eventId = params.id;

	if (!eventId) {
		return errorResponse('Event ID is required', 400);
	}

	// Optional but useful for cookie-authenticated POST requests.
	// Browsers normally send Origin on fetch POST requests.
	const origin = request.headers.get('origin');

	if (origin && origin !== url.origin) {
		return errorResponse('Invalid request origin', 403);
	}

	const userId = cookies.get(USER_COOKIE);

	// Do not create a new identity inside this upload request.
	// An absent cookie means this request is unauthenticated.
	if (!userId) {
		return errorResponse('Authentication required', 401);
	}

	// If the cookie is intended to contain UUIDs, validate it before using it
	// in database queries.
	const userIdIsUuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			userId
		);

	if (!userIdIsUuid) {
		return errorResponse('Invalid user identity', 401);
	}

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

	const isEventCreator = event.userId === userId;

	let isConfirmedAttendee = false;

    console.log(eventId)
    console.log(userId)

	if (!isEventCreator) {
		const confirmedRsvp = await database.query.rsvps.findFirst({
			where: and(
				eq(rsvps.eventId, eventId),
				eq(rsvps.userId, userId),
				// eq(rsvps.status, RSVPStatus.yes)
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

	if (values.length > MAX_FILES_PER_REQUEST) {
		return errorResponse(
			`A maximum of ${MAX_FILES_PER_REQUEST} files may be uploaded at once`,
			413
		);
	}

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

	/*
	 * This is intentionally only a temporary count check.
	 *
	 * It is not sufficient for the final implementation because two
	 * simultaneous requests can both pass this check. The final database
	 * insertion path needs a transaction or another concurrency-safe
	 * mechanism.
	 */
	const existingMediaCount = await database.execute<{ count: number }>(sql`
		SELECT COUNT(*)::int AS count
		FROM media
		WHERE event_id = ${eventId}
	`);

	const currentCount = Number(existingMediaCount[0]?.count ?? 0);

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

	for (const file of files) {
		let image: Awaited<ReturnType<typeof processImage>>;

		try {
			// The browser MIME type and filename are deliberately ignored.
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
        filename: string;
        path: string;
        width: number;
        height: number;
        size: number;
        sourceFormat: string;
    }> = [];

    try {
        for (const image of processed) {
            const stored = await storeProcessedImage(eventId, image.buffer);

            storedFiles.push({
                filename: stored.filename,
                path: stored.path,
                width: image.width,
                height: image.height,
                size: image.size,
                sourceFormat: image.sourceFormat
            });

            await database.insert(media).values({
                id: crypto.randomUUID(),
                eventId,
                userId,
                filename: stored.filename,
                createdAt: new Date()
            });
        }
    } catch (error) {
        console.error('Failed to store uploaded image:', error);

        // // Clean up any files already stored during this request.
        // for (const stored of storedFiles) {
        //     try {
        //         await unlink(stored.path);
        //     } catch {
        //         console.error('Failed to clean up', stored.path);
        //     }
        // }

        return errorResponse('Failed to store uploaded image', 500);
    }

	return json({
        ok: true,
        eventId,
        count: storedFiles.length,
        images: storedFiles.map((image) => ({
            filename: image.filename,
            sourceFormat: image.sourceFormat,
            width: image.width,
            height: image.height,
            size: image.size
        }))
    });

};
