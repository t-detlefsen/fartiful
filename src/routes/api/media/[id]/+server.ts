import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';

import { database } from '$lib/database/db';
import { media } from '$lib/database/schema';

import { isValidEvent, isValidStorageKey } from '$lib/server/mediaStorage';

// Check media root in docker-compose.yml
if (!env.MEDIA_ROOT) {
	throw new Error('MEDIA_ROOT is not configured');
}

const mediaRoot = path.resolve(env.MEDIA_ROOT);

// API endpoint for image retrieval
export const GET = async ({ params }) => {
	// Check for image id
	const imageId = params.id;

	if (!imageId) {
		error(400, 'Image ID is required');
	}

	// Check if storage key is valid
	console.log(imageId)
	if (!isValidStorageKey(imageId)) {
		error(500, 'Invalid storage key');
	}

	// Retrieve image
	const result = await database
		.select()
		.from(media)
		.where(eq(media.id, imageId))
		.limit(1);

	const image = result[0];

	if (!image) {
		error(404, 'Image not found');
	}

	// Check if event ID is valid
	if (!isValidEvent(image.eventId)) {
		error(500, 'Invalid event ID for removal');
	}

	// Get filepath
	const imagePath = path.resolve(
		mediaRoot,
		image.eventId,
		image.storageKey
	);

	if (
		imagePath !== mediaRoot &&
		!imagePath.startsWith(`${mediaRoot}${path.sep}`)
	) {
		error(500, 'Invalid image path');
	}

	// Load image
	let file: Buffer;

	try {
		file = await readFile(imagePath);
	} catch {
		error(404, 'Image file not found');
	}

	// Return image
	return new Response(new Uint8Array(file), {
		headers: {
			'Content-Type': 'image/jpeg',
			'Content-Length': String(file.byteLength),
			'Cache-Control': 'public, max-age=86400',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
