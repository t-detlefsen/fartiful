// src/lib/server/mediaStorage.ts
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';

if (!env.MEDIA_ROOT) {
	throw new Error('MEDIA_ROOT is not configured');
}

const MEDIA_ROOT = path.resolve(env.MEDIA_ROOT);

function isSafePathSegment(value: string) {
	return /^[A-Za-z0-9_-]+$/.test(value);
}

export async function storeProcessedImage(
	eventId: string,
	buffer: Buffer
): Promise<{ filename: string; path: string }> {
	if (!isSafePathSegment(eventId)) {
		throw new Error('Invalid event ID for storage');
	}

	const eventDirectory = path.join(MEDIA_ROOT, eventId);
	const temporaryDirectory = path.join(MEDIA_ROOT, '.tmp');

	await mkdir(eventDirectory, { recursive: true });
	await mkdir(temporaryDirectory, { recursive: true });

	const filename = `${crypto.randomUUID()}.jpg`;
	const temporaryPath = path.join(
		temporaryDirectory,
		`${crypto.randomUUID()}.tmp`
	);
	const finalPath = path.join(eventDirectory, filename);

	try {
		// "wx" prevents accidental overwriting of an existing temporary file.
		await writeFile(temporaryPath, buffer, { flag: 'wx' });
		await rename(temporaryPath, finalPath);

		return {
			filename,
			path: finalPath
		};
	} catch (error) {
		try {
			await unlink(temporaryPath);
		} catch {
			// The temporary file may not have been created.
		}

		throw error;
	}
}

function assertSafePathPart(value: string) {
	if (
		!value ||
		value === '.' ||
		value === '..' ||
		value.includes('/') ||
		value.includes('\\') ||
		value.includes('\0')
	) {
		throw new Error('Invalid media path');
	}
}

export function getStoredImagePath(eventId: string, filename: string) {
	assertSafePathPart(eventId);
	assertSafePathPart(filename);

	return path.join(MEDIA_ROOT, eventId, filename);
}

export async function deleteStoredImage(
	eventId: string,
	filename: string
): Promise<void> {
	const filePath = getStoredImagePath(eventId, filename);

	try {
		await unlink(filePath);
	} catch (error: unknown) {
		// Treat an already-missing file as success. The database row can
		// still be removed so the gallery does not remain broken.
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
}