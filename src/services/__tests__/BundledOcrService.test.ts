import {
  BUNDLED_OCR_LANGUAGES,
  BundledOcrService,
  TesseractWorkerFactory
} from '../BundledOcrService';

describe('BundledOcrService', () => {
  beforeEach(() => {
    (global as any).chrome.runtime.getURL = jest.fn((path: string) => `chrome-extension://test/${path}`);
  });

  it('ships the configured English, Chinese, Japanese, and Korean OCR choices', () => {
    expect(BUNDLED_OCR_LANGUAGES.map(language => language.code)).toEqual([
      'eng',
      'chi_sim',
      'chi_tra',
      'jpn',
      'kor'
    ]);
  });

  it('creates a local worker, reports progress, and maps positioned OCR lines', async () => {
    const setParameters = jest.fn(async () => undefined);
    const terminate = jest.fn(async () => undefined);
    const workerFactory: TesseractWorkerFactory = jest.fn(async (_language, options) => ({
      setParameters,
      recognize: jest.fn(async () => {
        options.logger({ status: 'recognizing text', progress: 0.62 });
        return {
          data: {
            text: 'Detected first line',
            confidence: 91,
            lines: [{
              text: 'Detected first line\n',
              confidence: 91,
              bbox: { x0: 20, y0: 30, x1: 220, y1: 58 }
            }]
          }
        };
      }),
      terminate
    }));
    const service = new BundledOcrService(workerFactory);
    const session = service.createSession('chi_sim');
    const progress = jest.fn();
    const canvas = document.createElement('canvas');
    const lines = await session.recognize(canvas, progress);

    expect(workerFactory).toHaveBeenCalledWith('chi_sim', expect.objectContaining({
      workerPath: 'chrome-extension://test/ocr/worker.min.js',
      corePath: 'chrome-extension://test/ocr/core/',
      langPath: 'chrome-extension://test/ocr/lang/',
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true
    }));
    expect(setParameters).toHaveBeenCalledWith(expect.objectContaining({
      tessedit_pageseg_mode: '3',
      preserve_interword_spaces: '1'
    }));
    expect(progress).toHaveBeenCalledWith({ status: 'recognizing text', progress: 0.62 });
    expect(lines).toEqual([{
      text: 'Detected first line',
      confidence: 91,
      boundingBox: { x: 20, y: 30, width: 200, height: 28 }
    }]);

    await session.terminate();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('falls back to full-page text when Tesseract has no line boxes', async () => {
    const workerFactory: TesseractWorkerFactory = jest.fn(async () => ({
      setParameters: jest.fn(async () => undefined),
      recognize: jest.fn(async () => ({
        data: {
          text: '  Full page fallback text\n',
          confidence: 73,
          lines: []
        }
      })),
      terminate: jest.fn(async () => undefined)
    }));
    const session = new BundledOcrService(workerFactory).createSession('eng');
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;

    await expect(session.recognize(canvas)).resolves.toEqual([{
      text: 'Full page fallback text',
      confidence: 73,
      boundingBox: { x: 0, y: 0, width: 640, height: 480 }
    }]);
  });

  it('uses English when an unsupported language code is supplied', async () => {
    const workerFactory: TesseractWorkerFactory = jest.fn(async () => ({
      setParameters: jest.fn(async () => undefined),
      recognize: jest.fn(async () => ({ data: { text: '', confidence: 0, lines: [] } })),
      terminate: jest.fn(async () => undefined)
    }));
    const session = new BundledOcrService(workerFactory).createSession('unsupported');

    await session.recognize(document.createElement('canvas'));
    expect(workerFactory).toHaveBeenCalledWith('eng', expect.any(Object));
  });

  it('can terminate cleanly after worker initialization fails', async () => {
    const session = new BundledOcrService(
      jest.fn().mockRejectedValue(new Error('worker load failed'))
    ).createSession('eng');

    await expect(session.recognize(document.createElement('canvas'))).rejects.toThrow('worker load failed');
    await expect(session.terminate()).resolves.toBeUndefined();
    await expect(session.terminate()).resolves.toBeUndefined();
  });
});
