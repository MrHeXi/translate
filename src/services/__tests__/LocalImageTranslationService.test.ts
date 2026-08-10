import { BundledOcrService } from '../BundledOcrService';
import {
  getWorkingImageDimensions,
  LOCAL_IMAGE_LIMITS,
  LocalImageTranslationService,
  validateLocalImageDimensions,
  validateLocalImageFile,
  validateLocalImageQueuePixels
} from '../LocalImageTranslationService';

interface CanvasHarness {
  getPixel(canvas: HTMLCanvasElement, x: number, y: number): number[];
  getSourceRect(canvas: HTMLCanvasElement): { x: number; y: number; width: number; height: number } | undefined;
}

function installCanvasHarness(
  sourceCanvas: HTMLCanvasElement,
  sourcePixels: Uint8ClampedArray
): CanvasHarness {
  interface CanvasState {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  const states = new WeakMap<HTMLCanvasElement, CanvasState>();
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
  const sourceRects = new WeakMap<HTMLCanvasElement, { x: number; y: number; width: number; height: number }>();
  states.set(sourceCanvas, {
    width: sourceCanvas.width,
    height: sourceCanvas.height,
    data: sourcePixels
  });

  const getState = (canvas: HTMLCanvasElement): CanvasState => {
    const existing = states.get(canvas);
    if (existing && existing.width === canvas.width && existing.height === canvas.height) return existing;
    const state = {
      width: canvas.width,
      height: canvas.height,
      data: new Uint8ClampedArray(canvas.width * canvas.height * 4)
    };
    states.set(canvas, state);
    return state;
  };

  const copyRect = (
    source: CanvasState,
    target: CanvasState,
    sourceX: number,
    sourceY: number,
    width: number,
    height: number,
    targetX: number,
    targetY: number
  ): void => {
    for (let row = 0; row < height; row += 1) {
      const sourceOffset = ((sourceY + row) * source.width + sourceX) * 4;
      const targetOffset = ((targetY + row) * target.width + targetX) * 4;
      target.data.set(source.data.subarray(sourceOffset, sourceOffset + width * 4), targetOffset);
    }
  };

  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    const existing = contexts.get(this);
    if (existing) return existing;
    const canvas = this;
    const context = {
      font: '',
      fillStyle: '',
      textBaseline: '',
      textAlign: '',
      direction: 'ltr',
      drawImage: jest.fn((image: HTMLCanvasElement, ...coordinates: number[]) => {
        const source = getState(image);
        const target = getState(canvas);
        if (coordinates.length === 2) {
          copyRect(source, target, 0, 0, source.width, source.height, coordinates[0], coordinates[1]);
          return;
        }
        const [sourceX, sourceY, sourceWidth, sourceHeight, targetX, targetY, targetWidth, targetHeight] = coordinates;
        if (sourceWidth !== targetWidth || sourceHeight !== targetHeight) {
          throw new Error('The test harness does not scale canvas pixels.');
        }
        if (image === sourceCanvas) {
          sourceRects.set(canvas, { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight });
        }
        copyRect(source, target, sourceX, sourceY, sourceWidth, sourceHeight, targetX, targetY);
      }),
      getImageData: jest.fn((x: number, y: number, width: number, height: number) => {
        const result = {
          width,
          height,
          colorSpace: 'srgb',
          data: new Uint8ClampedArray(width * height * 4)
        } as ImageData;
        copyRect(getState(canvas), { width, height, data: result.data }, x, y, width, height, 0, 0);
        return result;
      }),
      createImageData: jest.fn((width: number, height: number) => ({
        width,
        height,
        colorSpace: 'srgb',
        data: new Uint8ClampedArray(width * height * 4)
      } as ImageData)),
      putImageData: jest.fn((image: ImageData, x: number, y: number) => {
        copyRect(
          { width: image.width, height: image.height, data: image.data },
          getState(canvas),
          0,
          0,
          image.width,
          image.height,
          x,
          y
        );
      }),
      measureText: jest.fn((text: string) => ({ width: text.length * 7 })),
      fillText: jest.fn(),
      fillRect: jest.fn((x: number, y: number, width: number, height: number) => {
        const state = getState(canvas);
        const startX = Math.max(0, Math.floor(x));
        const startY = Math.max(0, Math.floor(y));
        const endX = Math.min(state.width, Math.ceil(x + width));
        const endY = Math.min(state.height, Math.ceil(y + height));
        for (let row = startY; row < endY; row += 1) {
          for (let column = startX; column < endX; column += 1) {
            const offset = (row * state.width + column) * 4;
            state.data[offset] = 255;
            state.data[offset + 1] = 255;
            state.data[offset + 2] = 255;
            state.data[offset + 3] = 224;
          }
        }
      }),
      save: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn()
    } as unknown as CanvasRenderingContext2D;
    contexts.set(canvas, context);
    return context;
  });

  return {
    getPixel(canvas, x, y) {
      const state = getState(canvas);
      const offset = (y * state.width + x) * 4;
      return Array.from(state.data.slice(offset, offset + 4));
    },
    getSourceRect(canvas) {
      return sourceRects.get(canvas);
    }
  };
}

function installTileMetadataHarness(sourceCanvas: HTMLCanvasElement): CanvasHarness {
  const sourceRects = new WeakMap<HTMLCanvasElement, { x: number; y: number; width: number; height: number }>();
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    const canvas = this;
    return {
      drawImage: jest.fn((image: HTMLCanvasElement, ...coordinates: number[]) => {
        if (image === sourceCanvas && coordinates.length === 8) {
          sourceRects.set(canvas, {
            x: coordinates[0],
            y: coordinates[1],
            width: coordinates[2],
            height: coordinates[3]
          });
        }
      })
    } as unknown as CanvasRenderingContext2D;
  });
  return {
    getPixel: () => [],
    getSourceRect: canvas => sourceRects.get(canvas)
  };
}

describe('LocalImageTranslationService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts bounded raster files and rejects unsafe inputs before decoding', () => {
    expect(() => validateLocalImageFile(new File(['x'], 'screen.png', { type: 'image/png' }))).not.toThrow();
    expect(() => validateLocalImageFile(new File(['x'], 'photo.webp', { type: 'image/webp' }))).not.toThrow();
    expect(() => validateLocalImageFile(new File(['x'], 'vector.svg', { type: 'image/svg+xml' })))
      .toThrow('JPG, JPEG, PNG, or WEBP');
    expect(() => validateLocalImageFile(new File([], 'empty.png', { type: 'image/png' })))
      .toThrow('empty');
    const oversized = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: LOCAL_IMAGE_LIMITS.maxFileBytes + 1 });
    expect(() => validateLocalImageFile(oversized)).toThrow('20 MB');
  });

  it('bounds source dimensions and scales only the working OCR canvas', () => {
    expect(getWorkingImageDimensions(1000, 1000)).toEqual({ width: 1000, height: 1000 });
    const scaled = getWorkingImageDimensions(4000, 3000);
    expect(scaled.width * scaled.height).toBeLessThanOrEqual(LOCAL_IMAGE_LIMITS.maxWorkingPixels);
    expect(scaled.width / scaled.height).toBeCloseTo(4 / 3, 2);
    expect(() => validateLocalImageDimensions(0, 100)).toThrow('invalid dimensions');
    expect(() => validateLocalImageDimensions(5000, 5000)).toThrow('16 million pixels');
    expect(() => validateLocalImageQueuePixels(31_500_000, 1000, 1000)).toThrow('32 million pixels');
  });

  it('runs local OCR and rendering only when translate is explicitly called', async () => {
    const recognize = jest.fn(async () => [{
      text: 'Hello world',
      confidence: 94,
      boundingBox: { x: 12, y: 10, width: 76, height: 22 }
    }]);
    const terminate = jest.fn(async () => undefined);
    const ocrService = {
      createSession: jest.fn(() => ({ recognize, terminate }))
    } as unknown as BundledOcrService;
    const service = new LocalImageTranslationService(ocrService);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 100;
    sourceCanvas.height = 50;
    const pixels = new Uint8ClampedArray(100 * 50 * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 248;
      pixels[index + 1] = 248;
      pixels[index + 2] = 248;
      pixels[index + 3] = 255;
    }
    const sourceContext = {
      getImageData: jest.fn(() => ({ data: pixels }))
    };
    const outputContext = {
      font: '',
      fillStyle: '',
      textBaseline: '',
      textAlign: '',
      direction: 'ltr',
      createImageData: jest.fn(() => ({ data: new Uint8ClampedArray(pixels.length) })),
      putImageData: jest.fn(),
      measureText: jest.fn((text: string) => ({ width: text.length * 7 })),
      fillText: jest.fn(),
      fillRect: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn()
    };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      return (this === sourceCanvas ? sourceContext : outputContext) as unknown as CanvasRenderingContext2D;
    });
    const translateText = jest.fn(async () => 'Bonjour le monde');

    expect(recognize).not.toHaveBeenCalled();
    expect(translateText).not.toHaveBeenCalled();
    const controller = new AbortController();
    const result = await service.translate(sourceCanvas, {
      ocrLanguage: 'eng',
      signal: controller.signal,
      translateText
    });

    expect(recognize).toHaveBeenCalledTimes(1);
    expect(translateText).toHaveBeenCalledWith('Hello world', expect.objectContaining({
      requestId: expect.stringMatching(/^image-workspace:/),
      signal: expect.any(AbortSignal)
    }));
    expect(result.translatedTexts).toEqual(['Bonjour le monde']);
    expect(result.canvas.width).toBe(100);
    expect(result.canvas.height).toBe(50);
    expect(outputContext.putImageData).toHaveBeenCalledTimes(1);
    expect(outputContext.fillText).toHaveBeenCalled();
    expect(terminate).toHaveBeenCalled();
  });

  it('terminates OCR and rejects late work when the user stops', async () => {
    let rejectRecognition: ((reason: unknown) => void) | null = null;
    const recognize = jest.fn(() => new Promise<never>((_resolve, reject) => {
      rejectRecognition = reject;
    }));
    const terminate = jest.fn(async () => {
      rejectRecognition?.(new DOMException('Canceled', 'AbortError'));
    });
    const service = new LocalImageTranslationService({
      createSession: jest.fn(() => ({ recognize, terminate }))
    } as unknown as BundledOcrService);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 20;
    sourceCanvas.height = 20;
    jest.spyOn(sourceCanvas, 'getContext').mockReturnValue({
      getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(20 * 20 * 4) }))
    } as unknown as CanvasRenderingContext2D);
    const controller = new AbortController();
    const translation = service.translate(sourceCanvas, {
      ocrLanguage: 'eng',
      signal: controller.signal,
      translateText: jest.fn(async text => text)
    });
    await Promise.resolve();
    controller.abort();

    await expect(translation).rejects.toMatchObject({ name: 'AbortError' });
    expect(terminate).toHaveBeenCalled();
  });

  it('yields before reconstruction so Stop can prevent the canvas commit', async () => {
    const terminate = jest.fn(async () => undefined);
    const service = new LocalImageTranslationService({
      createSession: jest.fn(() => ({
        recognize: jest.fn(async () => [{
          text: 'Stop before render',
          confidence: 90,
          boundingBox: { x: 5, y: 5, width: 40, height: 14 }
        }]),
        terminate
      }))
    } as unknown as BundledOcrService);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 60;
    sourceCanvas.height = 30;
    jest.spyOn(sourceCanvas, 'getContext').mockReturnValue({
      getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(60 * 30 * 4) }))
    } as unknown as CanvasRenderingContext2D);
    const controller = new AbortController();
    const translation = service.translate(sourceCanvas, {
      ocrLanguage: 'eng',
      signal: controller.signal,
      translateText: jest.fn(async () => 'Arreter avant le rendu'),
      onProgress: progress => {
        if (progress.stage === 'render') controller.abort();
      }
    });

    await expect(translation).rejects.toMatchObject({ name: 'AbortError' });
    expect(terminate).toHaveBeenCalled();
  });

  it('terminates the analysis worker immediately when Stop is requested', async () => {
    const originalWorker = global.Worker;
    const workers: Array<{
      terminated: boolean;
      postMessage: jest.Mock;
      onmessage: ((event: MessageEvent<any>) => void) | null;
      onerror: ((event: Event) => void) | null;
    }> = [];
    class WorkerDouble {
      terminated = false;
      postMessage = jest.fn();
      onmessage: ((event: MessageEvent<any>) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(readonly url: string) {
        workers.push(this);
      }

      terminate(): void {
        this.terminated = true;
      }
    }
    Object.defineProperty(global, 'Worker', { configurable: true, value: WorkerDouble });
    (global as any).chrome.runtime.getURL = jest.fn((path: string) => `chrome-extension://test/${path}`);
    const terminateOcr = jest.fn(async () => undefined);
    const service = new LocalImageTranslationService({
      createSession: jest.fn(() => ({
        recognize: jest.fn(async () => [{
          text: 'Worker analysis',
          confidence: 90,
          boundingBox: { x: 2, y: 2, width: 12, height: 8 }
        }]),
        terminate: terminateOcr
      }))
    } as unknown as BundledOcrService);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 20;
    sourceCanvas.height = 20;
    jest.spyOn(sourceCanvas, 'getContext').mockReturnValue({
      getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(20 * 20 * 4) }))
    } as unknown as CanvasRenderingContext2D);
    const controller = new AbortController();
    const translation = service.translate(sourceCanvas, {
      ocrLanguage: 'eng',
      signal: controller.signal,
      translateText: jest.fn(async text => text)
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(workers).toHaveLength(1);
    controller.abort();

    await expect(translation).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].terminated).toBe(true);
    expect(workers[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: expect.any(Array) }),
      [expect.any(ArrayBuffer)]
    );
    Object.defineProperty(global, 'Worker', { configurable: true, value: originalWorker });
  });

  it('OCRs long images serially at source resolution and commits only deduplicated patches', async () => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 2000;
    sourceCanvas.height = 1501;
    const sourcePixels = new Uint8ClampedArray(sourceCanvas.width * sourceCanvas.height * 4);
    for (let index = 0; index < sourcePixels.length; index += 4) {
      sourcePixels[index] = 17;
      sourcePixels[index + 1] = 34;
      sourcePixels[index + 2] = 51;
      sourcePixels[index + 3] = 255;
    }
    const harness = installCanvasHarness(sourceCanvas, sourcePixels);
    let activeRecognitions = 0;
    let maximumActiveRecognitions = 0;
    const recognize = jest.fn(async (canvas: HTMLCanvasElement) => {
      activeRecognitions += 1;
      maximumActiveRecognitions = Math.max(maximumActiveRecognitions, activeRecognitions);
      await Promise.resolve();
      activeRecognitions -= 1;
      const sourceRect = harness.getSourceRect(canvas)!;
      if (sourceRect.y !== 0) return [];
      if (sourceRect.x === 0) {
        return [{
          text: 'Unique left',
          confidence: 91,
          boundingBox: { x: 100, y: 100, width: 40, height: 20 }
        }, {
          text: 'Boundary',
          confidence: 90,
          boundingBox: { x: 984, y: 100, width: 31, height: 20 }
        }];
      }
      return [{
        text: 'Boundary',
        confidence: 96,
        boundingBox: { x: 585, y: 100, width: 31, height: 20 }
      }];
    });
    const terminate = jest.fn(async () => undefined);
    const service = new LocalImageTranslationService({
      createSession: jest.fn(() => ({ recognize, terminate }))
    } as unknown as BundledOcrService);
    const serviceInternals = service as unknown as {
      analyzeImage: (
        image: unknown,
        tokens: Array<{
          id: string;
          text: string;
          rect: { x: number; y: number; width: number; height: number };
          direction?: 'ltr' | 'rtl' | 'vertical' | 'unknown';
          sourcePolygon?: readonly { x: number; y: number }[];
        }>
      ) => Promise<{ bubbles: never[]; groups: Array<Record<string, unknown>> }>;
    };
    jest.spyOn(serviceInternals, 'analyzeImage').mockImplementation(async (_image, tokens) => ({
      bubbles: [],
      groups: tokens.map(token => ({
        id: `group-${token.id}`,
        tokenIds: [token.id],
        tokenRects: [token.rect],
        sourcePolygons: [token.sourcePolygon],
        sourceText: token.text,
        rect: token.rect,
        direction: token.direction || 'ltr',
        geometryReliability: 'precise'
      }))
    }));
    const translateText = jest.fn(async (
      text: string,
      _request: { requestId: string; signal: AbortSignal }
    ) => `FR:${text}`);
    const progressStages: string[] = [];

    const result = await service.translate(sourceCanvas, {
      ocrLanguage: 'eng',
      signal: new AbortController().signal,
      translateText,
      onProgress: progress => progressStages.push(progress.stage)
    });

    expect(recognize).toHaveBeenCalledTimes(4);
    expect(maximumActiveRecognitions).toBe(1);
    expect(recognize.mock.calls.every(([canvas]) => (
      canvas.width * canvas.height <= LOCAL_IMAGE_LIMITS.maxReconstructionPixels
    ))).toBe(true);
    expect(result.canvas.width).toBe(sourceCanvas.width);
    expect(result.canvas.height).toBe(sourceCanvas.height);
    expect(result.sourceTexts).toEqual(['Unique left', 'Boundary']);
    expect(translateText).toHaveBeenCalledTimes(2);
    const requestIds = translateText.mock.calls.map(([, request]) => request.requestId);
    expect(new Set(requestIds).size).toBe(requestIds.length);
    expect(harness.getPixel(result.canvas, 10, 10)).toEqual([17, 34, 51, 255]);
    expect(harness.getPixel(result.canvas, 105, 105)).not.toEqual([17, 34, 51, 255]);
    expect(harness.getPixel(result.canvas, 995, 105)).not.toEqual([17, 34, 51, 255]);
    expect(progressStages.lastIndexOf('ocr')).toBeLessThan(progressStages.indexOf('translate'));
    expect(progressStages.lastIndexOf('translate')).toBeLessThan(progressStages.indexOf('render'));
    expect(terminate).toHaveBeenCalled();
  });

  it('passes AbortSignal to tiled OCR, terminates its session, and starts no later tile', async () => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 2000;
    sourceCanvas.height = 1501;
    installTileMetadataHarness(sourceCanvas);
    let recognitionSignal: AbortSignal | undefined;
    const recognize = jest.fn((
      _canvas: HTMLCanvasElement,
      _onProgress: unknown,
      signal?: AbortSignal
    ) => new Promise<never>((_resolve, reject) => {
      recognitionSignal = signal;
      signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Canceled', 'AbortError')),
        { once: true }
      );
    }));
    const terminate = jest.fn(async () => undefined);
    const service = new LocalImageTranslationService({
      createSession: jest.fn(() => ({ recognize, terminate }))
    } as unknown as BundledOcrService);
    const controller = new AbortController();
    const translation = service.translate(sourceCanvas, {
      ocrLanguage: 'eng',
      signal: controller.signal,
      translateText: jest.fn(async text => text)
    });
    await Promise.resolve();
    expect(recognize).toHaveBeenCalledTimes(1);
    controller.abort();

    await expect(translation).rejects.toMatchObject({ name: 'AbortError' });
    expect(recognitionSignal?.aborted).toBe(true);
    expect(recognize).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalled();
  });

  it('rejects long images that exceed the bounded tile or memory plan before OCR', async () => {
    const createSession = jest.fn();
    const service = new LocalImageTranslationService({ createSession } as unknown as BundledOcrService);
    const tooManyTiles = document.createElement('canvas');
    tooManyTiles.width = 64;
    tooManyTiles.height = 250_000;

    await expect(service.translate(tooManyTiles, {
      ocrLanguage: 'eng',
      signal: new AbortController().signal,
      translateText: jest.fn(async text => text)
    })).rejects.toThrow('local limit is 64');
    expect(createSession).not.toHaveBeenCalled();

    const serviceInternals = service as unknown as {
      assertTiledMemoryBudget(sourcePixels: number, tilePixels: number): void;
    };
    expect(() => serviceInternals.assertTiledMemoryBudget(
      LOCAL_IMAGE_LIMITS.maxSourcePixels,
      LOCAL_IMAGE_LIMITS.maxWorkingPixels * 2
    )).toThrow('local memory limit');
  });

  it('downgrades bubbles clipped by internal tile edges but permits real image edges', () => {
    const service = new LocalImageTranslationService();
    const internals = service as unknown as {
      downgradeUnsafeTileGroups(
        groups: Array<Record<string, unknown>>,
        bubbles: Array<Record<string, unknown>>,
        tile: Record<string, unknown>,
        sourceWidth: number,
        sourceHeight: number
      ): Array<Record<string, unknown>>;
    };
    const group = {
      id: 'group-1',
      bubbleId: 'bubble-1',
      tokenIds: ['token-1'],
      tokenRects: [{ x: 1_520, y: 100, width: 20, height: 10 }],
      sourcePolygons: [undefined],
      sourceText: 'Edge text',
      rect: { x: 1_520, y: 100, width: 20, height: 10 },
      direction: 'ltr',
      geometryReliability: 'precise'
    };
    const bubble = {
      id: 'bubble-1',
      rect: { x: 1_500, y: 80, width: 100, height: 60 },
      tokenIds: ['token-1'],
      backgroundColor: [255, 255, 255, 255],
      textureScore: 0,
      confidence: 1
    };
    const internalTile = {
      id: 'tile-1',
      index: 0,
      row: 0,
      column: 0,
      sourceRect: { x: 0, y: 0, width: 1_600, height: 1_000 },
      coreRect: { x: 0, y: 0, width: 1_536, height: 936 }
    };
    const finalTile = {
      ...internalTile,
      id: 'tile-2',
      index: 1,
      column: 1,
      sourceRect: { x: 1_400, y: 0, width: 1_600, height: 1_000 },
      coreRect: { x: 1_536, y: 0, width: 1_464, height: 936 }
    };

    expect(internals.downgradeUnsafeTileGroups(
      [group], [bubble], internalTile, 3_000, 2_000
    )[0].bubbleId).toBeUndefined();
    expect(internals.downgradeUnsafeTileGroups(
      [group], [bubble], finalTile, 3_000, 2_000
    )[0].bubbleId).toBe('bubble-1');
  });

  it('fails explicitly instead of truncating long-image OCR blocks or characters', async () => {
    const runWithLines = async (lines: Array<{
      text: string;
      confidence: number;
      boundingBox: { x: number; y: number; width: number; height: number };
    }>): Promise<void> => {
      jest.restoreAllMocks();
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = 2000;
      sourceCanvas.height = 1501;
      const harness = installTileMetadataHarness(sourceCanvas);
      const recognize = jest.fn(async (canvas: HTMLCanvasElement) => {
        const sourceRect = harness.getSourceRect(canvas)!;
        return sourceRect.x === 0 && sourceRect.y === 0 ? lines : [];
      });
      const service = new LocalImageTranslationService({
        createSession: jest.fn(() => ({
          recognize,
          terminate: jest.fn(async () => undefined)
        }))
      } as unknown as BundledOcrService);
      await service.translate(sourceCanvas, {
        ocrLanguage: 'eng',
        signal: new AbortController().signal,
        translateText: jest.fn(async text => text)
      });
    };

    const excessBlocks = Array.from({ length: LOCAL_IMAGE_LIMITS.maxBlocks + 1 }, (_item, index) => ({
      text: `line-${index}`,
      confidence: 90,
      boundingBox: { x: 10, y: index * 10, width: 20, height: 8 }
    }));
    await expect(runWithLines(excessBlocks)).rejects.toThrow('more than 64 OCR blocks');

    const excessCharacters = Array.from({ length: 61 }, (_item, index) => ({
      text: `${String(index).padStart(2, '0')}${'x'.repeat(1998)}`,
      confidence: 90,
      boundingBox: { x: 10, y: index * 10, width: 20, height: 8 }
    }));
    await expect(runWithLines(excessCharacters)).rejects.toThrow('more than 120000 characters of OCR text');
  });
});
