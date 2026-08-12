import {
  DOCUMENT_SCAN_PREPROCESSOR_LIMITS,
  DocumentScanPreprocessorLimitError,
  calculateOtsuThreshold,
  preprocessDocumentScan
} from '../DocumentScanPreprocessor';

const rgbaImage = (pixels: readonly (readonly [number, number, number, number])[]) => ({
  width: pixels.length,
  height: 1,
  data: new Uint8ClampedArray(pixels.flat())
});

describe('DocumentScanPreprocessor', () => {
  it('keeps a pure-white image white while preserving alpha in a new RGBA buffer', () => {
    const input = rgbaImage([[255, 255, 255, 73], [255, 255, 255, 255]]);
    const result = preprocessDocumentScan(input, { binarize: true });

    expect(Array.from(result.data)).toEqual([
      255, 255, 255, 73,
      255, 255, 255, 255
    ]);
    expect(result.data).not.toBe(input.data);
    expect(result).toMatchObject({ width: 2, height: 1, binarized: true, threshold: 127 });
  });

  it('converts to grayscale and expands low contrast around midpoint 128', () => {
    const input = rgbaImage([[120, 120, 120, 255], [136, 136, 136, 128]]);
    const result = preprocessDocumentScan(input, { contrast: 2 });

    expect(Array.from(result.data)).toEqual([
      112, 112, 112, 255,
      144, 144, 144, 128
    ]);
    expect(result.threshold).toBeNull();
    expect(result.binarized).toBe(false);
  });

  it('uses a deterministic Otsu threshold for separated grayscale values', () => {
    expect(calculateOtsuThreshold(new Uint8ClampedArray([10, 10, 240, 240]))).toBe(10);

    const result = preprocessDocumentScan(
      rgbaImage([[10, 10, 10, 255], [10, 10, 10, 10], [240, 240, 240, 255], [240, 240, 240, 20]]),
      { binarize: true }
    );
    expect(result.threshold).toBe(10);
    expect(Array.from(result.data)).toEqual([
      0, 0, 0, 255,
      0, 0, 0, 10,
      255, 255, 255, 255,
      255, 255, 255, 20
    ]);
  });

  it('does not mutate the source while applying grayscale, contrast, and binarization', () => {
    const input = rgbaImage([[220, 60, 10, 255], [20, 180, 240, 99]]);
    const snapshot = new Uint8ClampedArray(input.data);

    const result = preprocessDocumentScan(input, { contrast: 1.5, binarize: true });

    expect(input.data).toEqual(snapshot);
    expect(result.data).not.toBe(input.data);
    expect(result.data).not.toEqual(input.data);
  });

  it('fails closed on invalid dimensions, pixel counts, buffers, and parameters', () => {
    expect(() => preprocessDocumentScan({
      width: 0,
      height: 1,
      data: new Uint8ClampedArray()
    })).toThrow(TypeError);
    expect(() => preprocessDocumentScan({
      width: DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxWidth + 1,
      height: 1,
      data: new Uint8ClampedArray()
    })).toThrow(expect.objectContaining({ resource: 'width' }));
    expect(() => preprocessDocumentScan({
      width: 5_000,
      height: 5_000,
      data: new Uint8ClampedArray()
    })).toThrow(expect.objectContaining({ resource: 'pixels' }));
    expect(() => preprocessDocumentScan({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray(4)
    })).toThrow('exactly 8 RGBA bytes');
    expect(() => preprocessDocumentScan(rgbaImage([[0, 0, 0, 255]]), {
      contrast: DOCUMENT_SCAN_PREPROCESSOR_LIMITS.maxContrast + 0.01
    })).toThrow(DocumentScanPreprocessorLimitError);
    expect(() => preprocessDocumentScan(
      rgbaImage([[0, 0, 0, 255]]),
      { contrast: Number.NaN }
    )).toThrow(RangeError);
    expect(() => preprocessDocumentScan(
      rgbaImage([[0, 0, 0, 255]]),
      { binarize: 'yes' } as unknown as { binarize: boolean }
    )).toThrow(TypeError);
    expect(() => calculateOtsuThreshold(new Uint8ClampedArray())).toThrow(TypeError);
  });

  it('does not create a canvas or perform browser work', () => {
    const createElement = jest.spyOn(document, 'createElement');

    preprocessDocumentScan(rgbaImage([[20, 40, 60, 255]]));

    expect(createElement).not.toHaveBeenCalled();
  });
});
