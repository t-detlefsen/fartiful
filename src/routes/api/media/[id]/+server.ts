import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';

import { database } from '$lib/database/db';
import { media } from '$lib/database/schema';

const mediaRoot = path.resolve(env.MEDIA_ROOT || '/app/media');

export const GET = async ({ params }) => {
	const imageId = params.id;

	if (!imageId) {
		error(400, 'Image ID is required');
	}

	const result = await database
		.select()
		.from(media)
		.where(eq(media.id, imageId))
		.limit(1);

	const image = result[0];

	if (!image) {
		error(404, 'Image not found');
	}

	const imagePath = path.resolve(
		mediaRoot,
		image.eventId,
		image.filename
	);

	if (
		imagePath !== mediaRoot &&
		!imagePath.startsWith(`${mediaRoot}${path.sep}`)
	) {
		error(500, 'Invalid image path');
	}

	let file: Buffer;

	try {
		file = await readFile(imagePath);
	} catch {
		error(404, 'Image file not found');
	}

	return new Response(new Uint8Array(file), {
		headers: {
			'Content-Type': 'image/jpeg',
			'Content-Length': String(file.byteLength),
			'Cache-Control': 'public, max-age=86400',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
