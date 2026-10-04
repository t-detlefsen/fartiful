import sharp from 'sharp';

export const IMAGE_LIMITS = {
	maxSourceBytes: 10 * 1024 * 1024,
	maxWidth: 8000,
	maxHeight: 8000,
	maxPixels: 40_000_000
} as const;

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);

export class ImageValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ImageValidationError';
	}
}

export type ProcessedImage = {
	buffer: Buffer;
	format: 'jpeg';
	width: number;
	height: number;
	size: number;
	sourceFormat: string;
};

export async function processImage(input: Buffer): Promise<ProcessedImage> {
	if (input.length === 0) {
		throw new ImageValidationError('The image is empty');
	}

	if (input.length > IMAGE_LIMITS.maxSourceBytes) {
		throw new ImageValidationError('The image is too large');
	}

	let metadata: sharp.Metadata;

	try {
		metadata = await sharp(input, {
			limitInputPixels: IMAGE_LIMITS.maxPixels
		}).metadata();
	} catch {
		throw new ImageValidationError('The file is not a valid image');
	}

	const format = metadata.format;

	if (!format || !ACCEPTED_FORMATS.has(format)) {
		throw new ImageValidationError('Unsupported image format');
	}

	if (
		!metadata.width ||
		!metadata.height ||
		metadata.width < 1 ||
		metadata.height < 1
	) {
		throw new ImageValidationError('Image dimensions could not be determined');
	}

	const width = metadata.width;
	const height = metadata.height;

	if (width > IMAGE_LIMITS.maxWidth || height > IMAGE_LIMITS.maxHeight) {
		throw new ImageValidationError('Image dimensions are too large');
	}

	if (width * height > IMAGE_LIMITS.maxPixels) {
		throw new ImageValidationError('Image contains too many pixels');
	}

	let output: Buffer;

	try {
		output = await sharp(input, {
			limitInputPixels: IMAGE_LIMITS.maxPixels
		})
			// Apply EXIF orientation before encoding.
			.rotate()
			// JPEG has no alpha channel. Use white for transparent PNG/WebP pixels.
			.flatten({ background: '#ffffff' })
			.jpeg({
				quality: 90,
				mozjpeg: true
			})
			.toBuffer();
	} catch {
		throw new ImageValidationError('The image could not be processed');
	}

	let outputMetadata: sharp.Metadata;

	try {
		outputMetadata = await sharp(output).metadata();
	} catch {
		throw new ImageValidationError('The processed image could not be inspected');
	}

	if (!outputMetadata.width || !outputMetadata.height) {
		throw new ImageValidationError(
			'The processed image has invalid dimensions'
		);
	}

	return {
		buffer: output,
		format: 'jpeg',
		width: outputMetadata.width,
		height: outputMetadata.height,
		size: output.length,
		sourceFormat: format
	};
}
