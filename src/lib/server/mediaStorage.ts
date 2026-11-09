import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';

// Check media root in docker-compose.yml
if (!env.MEDIA_ROOT) {
	throw new Error('MEDIA_ROOT is not configured');
}

const MEDIA_ROOT = path.resolve(env.MEDIA_ROOT);

// Check if string is 8 char w/ only letters and numbers
export function isValidEvent(value: string) {
	return /^[A-Za-z0-9]{8}$/.test(value);
}

// Check if storage key fits UUID
export function isValidStorageKey(value: string) {
	const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(\.[a-z]{3,4})?$/i;
	return uuidV4Regex.test(value);
}

// Store image buffer and return filepath
export async function storeProcessedImage(
	eventId: string,
	buffer: Buffer
): Promise<{ storageKey: string; path: string }> {
	// Check if event ID is valid
	if (!isValidEvent(eventId)) {
		throw new Error('Invalid event ID for storage');
	}

	// Set file paths
	const eventDirectory = path.join(MEDIA_ROOT, eventId);
	const temporaryDirectory = path.join(MEDIA_ROOT, '.tmp');

	await mkdir(eventDirectory, { recursive: true });
	await mkdir(temporaryDirectory, { recursive: true });

	const storageKey = `${crypto.randomUUID()}.jpg`;
	const temporaryPath = path.join(
		temporaryDirectory,
		`${crypto.randomUUID()}.tmp`
	);
	const finalPath = path.join(eventDirectory, storageKey);

	// Write temporary file and move to final path
	try {
		// "wx" prevents accidental overwriting of an existing temporary file.
		await writeFile(temporaryPath, buffer, { flag: 'wx' });
		await rename(temporaryPath, finalPath);

		return {
			storageKey,
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

// Check file path and remove 
export async function deleteStoredImage(
	eventId: string,
	storageKey: string
): Promise<void> {
	// Check if event ID is valid
	if (!isValidEvent(eventId)) {
		throw new Error('Invalid event ID for removal');
	}

	// Check if storage key is valid
	console.log(storageKey)
	if (!isValidStorageKey(storageKey)) {
		throw new Error('Invalid storage key for removal');
	}

	// Set file path
	const filePath = path.join(MEDIA_ROOT, eventId, storageKey);

	// Delete file
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