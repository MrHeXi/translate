import { BundledOcrService } from '../BundledOcrService';
import {
  getWorkingImageDimensions,
  LOCAL_IMAGE_LIMITS,
  LocalImageTranslationService,
  validateLocalImageDimensions,
  validateLocalImageFile,
  validateLocalImageQueuePixels
} from '../LocalImageTranslationService';

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
});
