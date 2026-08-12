export const DOCUMENT_SCAN_PREPROCESSOR_LIMITS = Object.freeze({
  maxWidth: 20_000,
  maxHeight: 20_000,
  maxPixels: 16_000_000,
  minContrast: 0,
  maxContrast: 4
});

export type DocumentScanPreprocessorLimitResource =
  | 'width'
  | 'height'
  | 'pixels'
  | 'contrast';

export class DocumentScanPreprocessorLimitError extends Error {
  constructor(
    readonly resource: DocumentScanPreprocessorLimitResource,
    readonly actual: number,
    readonly limit: number
  ) {
    super(`${resource} limit exceeded: ${actual} > ${limit}`);
    this.name = 'DocumentScanPreprocessorLimitError';
  }
}

export interface DocumentScanRgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface DocumentScanPreprocessOptions {
  /** Multiplier around midpoint 128. A value of 1 preserves the grayscale contrast. */
  readonly contrast?: number;
  readonly binarize?: boolean;
}

export interface DocumentScanPreprocessResult extends DocumentScanRgbaImage {
  readonly binarized: boolean;
  readonly threshold: number | null;
}

const DEFAULT_CONTRAST = 1;
const UNIFORM_OTSU_THRESHOLD = 127;

export function preprocessDocumentScan(
  image: DocumentScanRgbaImage,
  options: DocumentScanPreprocessOptions = {}
): DocumentScanPreprocessResult {
  const pixelCount = validateImage(image);
  const { contrast, binarize } = validateOptions(options);
  const grayscale = new Uint8ClampedArray(pixelCount);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const luminance = Math.round(
      image.data[offset] * 0.299
      + image.data[offset + 1] * 0.587
      + image.data[offset + 2] * 0.114
    );
    grayscale[pixelIndex] = clampByte(Math.round((luminance - 128) * contrast + 128));
  }

  const threshold = binarize ? calculateOtsuThreshold(grayscale) : null;
  const output = new Uint8ClampedArray(image.data.length);
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const value = threshold === null
      ? grayscale[pixelIndex]
      : grayscale[pixelIndex] > threshold ? 255 : 0;
    output[offset] = value;
    output[offset + 1] = value;
    output[offset + 2] = value;
    output[offset + 3] = image.data[offset + 3];
  }

  return {
    width: image.width,
    height: image.height,
    data: output,
    binarized: binarize,
    threshold
  };
}

export function calculateOtsuThreshold(
  grayscale: Uint8Array | Uint8ClampedArray
): number {
  if (!(grayscale instanceof Uint8Array) && !(grayscale instanceof Uint8ClampedArray)) {
    throw new TypeError('grayscale must be a Uint8Array or Uint8ClampedArray');
  }
  if (grayscale.length === 0) {
    throw new TypeError('grayscale must contain at least one pixel');
  }
  if (grayscale.length > DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxPixels) {
    throw new DocumentScanPreprocessorLimitError(
      'pixels',
      grayscale.length,
      DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxPixels
    );
  }

  const histogram = new Uint32Array(256);
  let minimum = 255;
  let maximum = 0;
  let weightedSum = 0;
  for (const value of grayscale) {
    histogram[value] += 1;
    weightedSum += value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  if (minimum === maximum) return UNIFORM_OTSU_THRESHOLD;

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestThreshold = minimum;
  let bestVariance = -1;
  for (let threshold = minimum; threshold < maximum; threshold += 1) {
    const count = histogram[threshold];
    backgroundWeight += count;
    backgroundSum += threshold * count;
    if (backgroundWeight === 0) continue;

    const foregroundWeight = grayscale.length - backgroundWeight;
    if (foregroundWeight === 0) break;
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedSum - backgroundSum) / foregroundWeight;
    const difference = backgroundMean - foregroundMean;
    const variance = backgroundWeight * foregroundWeight * difference * difference;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = threshold;
    }
  }

  return bestThreshold;
}

function validateImage(image: DocumentScanRgbaImage): number {
  if (!image || typeof image !== 'object') {
    throw new TypeError('image must be an RGBA image object');
  }
  validateDimension(image.width, 'width', DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxWidth);
  validateDimension(image.height, 'height', DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxHeight);

  const pixelCount = image.width * image.height;
  if (!Number.isSafeInteger(pixelCount)) {
    throw new RangeError('image pixel count must be safely representable');
  }
  if (pixelCount > DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxPixels) {
    throw new DocumentScanPreprocessorLimitError(
      'pixels',
      pixelCount,
      DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxPixels
    );
  }

  const expectedLength = pixelCount * 4;
  if (!(image.data instanceof Uint8ClampedArray) || image.data.length !== expectedLength) {
    throw new TypeError(`image.data must contain exactly ${expectedLength} RGBA bytes`);
  }
  return pixelCount;
}

function validateDimension(
  value: number,
  resource: 'width' | 'height',
  limit: number
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${resource} must be a positive integer`);
  }
  if (value > limit) {
    throw new DocumentScanPreprocessorLimitError(resource, value, limit);
  }
}

function validateOptions(options: DocumentScanPreprocessOptions): {
  contrast: number;
  binarize: boolean;
} {
  if (!options || typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }
  const contrast = options.contrast ?? DEFAULT_CONTRAST;
  if (!Number.isFinite(contrast) || contrast < DOCUMENT_SCAN_PREPROCESSOR_LIMITS.minContrast) {
    throw new RangeError(
      `contrast must be between ${DOCUMENT_SCAN_PREPROCESSOR_LIMITS.minContrast} and `
      + DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxContrast
    );
  }
  if (contrast > DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxContrast) {
    throw new DocumentScanPreprocessorLimitError(
      'contrast',
      contrast,
      DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxContrast
    );
  }
  if (options.binarize !== undefined && typeof options.binarize !== 'boolean') {
    throw new TypeError('binarize must be a boolean');
  }
  return { contrast, binarize: options.binarize ?? false };
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}
