import { ImageTranslationRequest, ImageTranslator } from '../components/ImageTranslator';
import { BundledOcrService } from '../../services/BundledOcrService';

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

const click = (element: Element): void => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

const mouse = (target: EventTarget, type: string, clientX: number, clientY: number): void => {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
    clientY
  }));
};

const expectImageTranslationRequest = (): any => expect.objectContaining({
  requestId: expect.stringMatching(/^image-text:[A-Za-z0-9:_-]+$/),
  signal: expect.objectContaining({ aborted: false })
});

const setRect = (
  element: Element,
  left: number,
  top: number,
  width: number,
  height: number
): void => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({})
    }),
    configurable: true
  });
};

const createPixelBuffer = (
  width: number,
  height: number,
  color: readonly [number, number, number, number]
): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set(color, index * 4);
  }
  return data;
};

const paintPixelRect = (
  data: Uint8ClampedArray,
  imageWidth: number,
  rect: { x: number; y: number; width: number; height: number },
  color: readonly [number, number, number, number]
): void => {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      data.set(color, (y * imageWidth + x) * 4);
    }
  }
};

describe('ImageTranslator', () => {
  let translator: ImageTranslator;
  let workerFactory: jest.Mock;
  let setParameters: jest.Mock;
  let recognize: jest.Mock;
  let terminate: jest.Mock;
  let drawImage: jest.Mock;
  let getContext: jest.SpyInstance;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    setParameters = jest.fn().mockResolvedValue(undefined);
    recognize = jest.fn().mockResolvedValue({
      data: { text: '', confidence: 0, lines: [] }
    });
    terminate = jest.fn().mockResolvedValue(undefined);
    workerFactory = jest.fn().mockResolvedValue({
      setParameters,
      recognize,
      terminate
    });
    drawImage = jest.fn();
    getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    translator = new ImageTranslator(new BundledOcrService(workerFactory));
  });

  afterEach(() => {
    translator.cleanup();
    delete (window as any).TextDetector;
    delete (window as any).createImageBitmap;
    getContext.mockRestore();
    document.body.innerHTML = '';
  });

  it('does not translate images before the user enables image translation mode', async () => {
    document.body.innerHTML = '<img id="target" alt="Text printed in an image">';
    const image = document.getElementById('target') as HTMLImageElement;
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    click(image);
    await flushPromises();

    const result = await translator.translateVisibleImages();

    expect(translateText).not.toHaveBeenCalled();
    expect(document.getElementById('lexibridge-image-translation-overlay')).toBeNull();
    expect(result).toEqual({
      isActive: false,
      visibleImageCount: 0,
      translatedImageCount: 0,
      unreadableImageCount: 0,
      failedImageCount: 0,
      operationId: null,
      message: 'Start image translation first'
    });
  });

  it('translates only visible, readable page images in a manual batch', async () => {
    document.body.innerHTML = `
      <img id="visible" alt="Visible image text">
      <img id="offscreen" alt="Offscreen image text">
      <img id="hidden" alt="Hidden image text" style="display: none">
      <img id="tiny" alt="Tiny image text">
      <div id="lexibridge-floating-control"><svg id="owned" aria-label="Extension icon"></svg></div>
    `;

    setRect(document.getElementById('visible')!, 40, 50, 240, 120);
    setRect(document.getElementById('offscreen')!, window.innerWidth + 40, 50, 240, 120);
    setRect(document.getElementById('hidden')!, 40, 200, 240, 120);
    setRect(document.getElementById('tiny')!, 40, 350, 12, 12);
    setRect(document.getElementById('owned')!, 40, 400, 48, 48);

    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);
    translator.enable(translateText);

    const result = await translator.translateVisibleImages();

    expect(result).toEqual({
      isActive: true,
      visibleImageCount: 1,
      translatedImageCount: 1,
      unreadableImageCount: 0,
      failedImageCount: 0,
      operationId: expect.stringMatching(/^image-batch:[A-Za-z0-9:_-]+$/),
      message: 'Translated 1 visible image'
    });
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translateText).toHaveBeenCalledWith('Visible image text', expectImageTranslationRequest());
    expect(document.querySelectorAll('.lexibridge-image-translation-overlay')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('Translated: Offscreen image text');
    expect(document.body.textContent).not.toContain('Translated: Hidden image text');
    expect(document.body.textContent).not.toContain('Translated: Tiny image text');
    expect(document.body.textContent).not.toContain('Translated: Extension icon');
  });

  it('reuses cached text while keeping an overlay for every visible image', async () => {
    document.body.innerHTML = `
      <img id="first" alt="Repeated label">
      <img id="second" alt="Repeated label">
    `;

    setRect(document.getElementById('first')!, 20, 20, 180, 90);
    setRect(document.getElementById('second')!, 240, 20, 180, 90);

    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);
    translator.enable(translateText);

    const result = await translator.translateVisibleImages();

    expect(result.translatedImageCount).toBe(2);
    expect(result.message).toBe('Translated 2 visible images');
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.lexibridge-image-translation-overlay')).toHaveLength(2);
    expect(document.querySelectorAll('.lexibridge-image-translation-result')).toHaveLength(2);
  });

  it('isolates cached image translations by the current provider and target language', async () => {
    document.body.innerHTML = '<img id="target" alt="Repeated label">';
    setRect(document.getElementById('target')!, 20, 20, 180, 90);

    let provider = 'google';
    let targetLanguage = 'zh-CN';
    const translateText = jest.fn(async (text: string) => (
      `${provider}/${targetLanguage}: ${text}`
    ));
    translator.enable(
      translateText,
      'eng',
      text => JSON.stringify([provider, targetLanguage, text])
    );

    await translator.translateVisibleImages();
    await translator.translateVisibleImages();
    expect(translateText).toHaveBeenCalledTimes(1);

    provider = 'deepl';
    await translator.translateVisibleImages();
    expect(translateText).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.lexibridge-image-translation-result')?.textContent)
      .toBe('deepl/zh-CN: Repeated label');

    targetLanguage = 'ja';
    await translator.translateVisibleImages();
    expect(translateText).toHaveBeenCalledTimes(3);
    expect(document.querySelector('.lexibridge-image-translation-result')?.textContent)
      .toBe('deepl/ja: Repeated label');
  });

  it('stops a visible-image batch before processing the next image', async () => {
    document.body.innerHTML = `
      <img id="first" alt="First image text">
      <img id="second" alt="Second image text">
    `;

    setRect(document.getElementById('first')!, 20, 20, 180, 90);
    setRect(document.getElementById('second')!, 240, 20, 180, 90);

    let resolveFirstTranslation!: (value: string) => void;
    const firstTranslation = new Promise<string>(resolve => {
      resolveFirstTranslation = resolve;
    });
    const translateText = jest.fn((_text: string, _request: ImageTranslationRequest) => firstTranslation);
    translator.enable(translateText);

    const pendingBatch = translator.translateVisibleImages();
    await flushPromises();
    expect(translateText).toHaveBeenCalledWith('First image text', expectImageTranslationRequest());

    const activeRequest = translateText.mock.calls[0]![1];

    translator.disable();
    expect(activeRequest.signal.aborted).toBe(true);
    resolveFirstTranslation('Translated: First image text');

    const result = await pendingBatch;

    expect(result.isActive).toBe(false);
    expect(result.translatedImageCount).toBe(0);
    expect(result.message).toBe('Image translation stopped');
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translateText).not.toHaveBeenCalledWith('Second image text', expect.anything());
    expect(document.querySelectorAll('.lexibridge-image-translation-overlay')).toHaveLength(0);
  });

  it('does not let a stopped old batch overwrite a newly completed batch status', async () => {
    document.body.innerHTML = '<img id="target" alt="Batch text">';
    setRect(document.getElementById('target')!, 20, 20, 180, 90);
    let resolveOldTranslation!: (value: string) => void;
    const oldTranslation = new Promise<string>(resolve => {
      resolveOldTranslation = resolve;
    });
    const oldTranslate = jest.fn(() => oldTranslation);
    translator.enable(oldTranslate);
    const oldBatch = translator.translateVisibleImages();
    await flushPromises();

    translator.disable();
    const newTranslate = jest.fn(async () => 'Fresh translation');
    translator.enable(newTranslate);
    const newResult = await translator.translateVisibleImages();
    expect(newResult.message).toBe('Translated 1 visible image');

    resolveOldTranslation('Stale translation');
    await oldBatch;

    expect(translator.getStatus()).toEqual(expect.objectContaining({
      isActive: true,
      isBatchRunning: false,
      message: 'Translated 1 visible image'
    }));
    expect(document.querySelector('.lexibridge-image-translation-result')?.textContent)
      .toBe('Fresh translation');
  });

  it('invalidates pending image translation when settings change without turning mode off', async () => {
    document.body.innerHTML = '<img id="target" alt="Old settings text">';
    const image = document.getElementById('target') as HTMLImageElement;
    let resolveTranslation!: (value: string) => void;
    const pendingTranslation = new Promise<string>(resolve => {
      resolveTranslation = resolve;
    });
    const translateText = jest.fn((_text: string, _request: ImageTranslationRequest) => pendingTranslation);
    translator.enable(translateText);
    click(image);
    await flushPromises();
    const request = translateText.mock.calls[0][1] as ImageTranslationRequest;

    translator.invalidateForSettingsChange();
    expect(request.signal.aborted).toBe(true);
    resolveTranslation('Stale settings translation');
    await flushPromises();

    expect(translator.getStatus()).toEqual(expect.objectContaining({
      isActive: true,
      message: 'Image translation settings updated'
    }));
    expect(document.querySelector('.lexibridge-image-translation-overlay')).toBeNull();
  });

  it('coalesces concurrent visible-image commands into one operation owned by the content script', async () => {
    document.body.innerHTML = '<img id="target" alt="One batch only">';
    setRect(document.getElementById('target')!, 20, 20, 180, 90);

    let resolveTranslation!: (value: string) => void;
    const translation = new Promise<string>(resolve => {
      resolveTranslation = resolve;
    });
    const translateText = jest.fn((_text: string, _request: ImageTranslationRequest) => translation);
    translator.enable(translateText);

    const first = translator.translateVisibleImages();
    const second = translator.translateVisibleImages();
    expect(second).toBe(first);
    await flushPromises();
    expect(translator.getStatus()).toEqual(expect.objectContaining({
      isBatchRunning: true,
      operationId: expect.stringMatching(/^image-batch:[A-Za-z0-9:_-]+$/),
      processedImageCount: 0,
      totalImageCount: 1
    }));
    expect(translateText).toHaveBeenCalledTimes(1);

    resolveTranslation('Translated once');
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(secondResult).toEqual(firstResult);
    expect(firstResult.operationId).toMatch(/^image-batch:[A-Za-z0-9:_-]+$/);
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translator.getStatus()).toEqual(expect.objectContaining({
      isBatchRunning: false,
      message: 'Translated 1 visible image'
    }));
  });

  it('reports an empty visible-image batch without making translation requests', async () => {
    document.body.innerHTML = '<img id="offscreen" alt="Outside viewport">';
    setRect(document.getElementById('offscreen')!, window.innerWidth + 10, 20, 180, 90);

    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);
    translator.enable(translateText);

    const result = await translator.translateVisibleImages();

    expect(result.visibleImageCount).toBe(0);
    expect(result.message).toBe('No visible images found');
    expect(translateText).not.toHaveBeenCalled();
  });

  it('translates readable image metadata after manual enablement', async () => {
    document.body.innerHTML = '<img id="target" alt="Sale ends tonight">';
    const image = document.getElementById('target') as HTMLImageElement;
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    const state = translator.enable(translateText);
    click(image);
    await flushPromises();

    const overlay = document.getElementById('lexibridge-image-translation-overlay');
    expect(state).toEqual({
      isActive: true,
      hasImage: true,
      isBatchRunning: false,
      operationId: null,
      processedImageCount: 0,
      totalImageCount: 0,
      message: 'Image translation started'
    });
    expect(translateText).toHaveBeenCalledWith('Sale ends tonight', expectImageTranslationRequest());
    expect(overlay?.textContent).toContain('Sale ends tonight');
    expect(overlay?.textContent).toContain('Translated: Sale ends tonight');
  });

  it('extracts and translates SVG text for comic-style images', async () => {
    document.body.innerHTML = `
      <svg id="panel" width="200" height="80">
        <text x="10" y="30">Speech bubble text</text>
      </svg>
    `;
    const svg = document.getElementById('panel') as unknown as SVGSVGElement;
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    click(svg);
    await flushPromises();

    const overlay = document.getElementById('lexibridge-image-translation-overlay');
    expect(translateText).toHaveBeenCalledWith('Speech bubble text', expectImageTranslationRequest());
    expect(overlay?.textContent).toContain('Speech bubble text');
    expect(overlay?.textContent).toContain('Translated: Speech bubble text');
  });

  it('uses browser TextDetector OCR when available', async () => {
    document.body.innerHTML = '<img id="target" src="comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    const close = jest.fn();
    const detect = jest.fn(async () => [{ rawValue: 'OCR detected line' }]);
    const createImageBitmap = jest.fn(async () => ({ close }));

    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(window, 'createImageBitmap', {
      value: createImageBitmap,
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({ detect }));

    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    click(image);
    await flushPromises();

    const overlay = document.getElementById('lexibridge-image-translation-overlay');
    expect(createImageBitmap).toHaveBeenCalledWith(image, {
      resizeWidth: 1,
      resizeHeight: 1,
      resizeQuality: 'high'
    });
    expect(detect).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(translateText).toHaveBeenCalledWith('OCR detected line', expectImageTranslationRequest());
    expect(overlay?.textContent).toContain('OCR detected line');
    expect(overlay?.textContent).toContain('Translated: OCR detected line');
  });

  it('bounds browser and bundled OCR inputs before allocating recognition surfaces', async () => {
    document.body.innerHTML = '<img id="target" src="huge-comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 12_000, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 8_000, configurable: true });
    setRect(image, 10, 20, 300, 200);
    const createImageBitmap = jest.fn(async (_source: ImageBitmapSource, _options?: ImageBitmapOptions) => ({
      close: jest.fn()
    }));
    Object.defineProperty(window, 'createImageBitmap', { value: createImageBitmap, configurable: true });
    (window as any).TextDetector = jest.fn(() => ({
      detect: jest.fn(async () => [{ rawValue: 'Bounded browser OCR' }])
    }));

    translator.enable(async text => `Translated: ${text}`);
    click(image);
    await flushPromises();

    const bitmapOptions = createImageBitmap.mock.calls[0][1]!;
    expect((bitmapOptions.resizeWidth || Infinity) * (bitmapOptions.resizeHeight || Infinity))
      .toBeLessThanOrEqual(3_000_000);

    translator.disable();
    delete (window as any).TextDetector;
    delete (window as any).createImageBitmap;
    translator.enable(async text => `Translated: ${text}`);
    click(image);
    await flushPromises();

    const ocrCanvas = recognize.mock.calls[0][0] as HTMLCanvasElement;
    expect(ocrCanvas.width * ocrCanvas.height).toBeLessThanOrEqual(3_000_000);
  });

  it('invalidates OCR started by an older image-mode epoch after Stop and Start', async () => {
    document.body.innerHTML = '<img id="target" src="comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 100, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 40, configurable: true });
    setRect(image, 10, 20, 100, 40);
    let resolveOcr!: (value: any[]) => void;
    const detect = jest.fn(() => new Promise<any[]>(resolve => {
      resolveOcr = resolve;
    }));
    Object.defineProperty(window, 'createImageBitmap', {
      value: jest.fn(async () => ({ close: jest.fn() })),
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({ detect }));
    const oldTranslate = jest.fn(async text => `Old: ${text}`);
    const newTranslate = jest.fn(async text => `New: ${text}`);

    translator.enable(oldTranslate);
    click(image);
    await Promise.resolve();
    await Promise.resolve();
    expect(detect).toHaveBeenCalledTimes(1);
    translator.disable();
    translator.enable(newTranslate);
    resolveOcr([{ rawValue: 'STALE', boundingBox: { x: 10, y: 10, width: 20, height: 8 } }]);
    await flushPromises();

    expect(oldTranslate).not.toHaveBeenCalled();
    expect(newTranslate).not.toHaveBeenCalled();
    expect(document.querySelector('.lexibridge-image-translation-overlay')).toBeNull();
    expect(document.querySelector('.lexibridge-image-region-translation')).toBeNull();
  });

  it('caps OCR blocks and translates them with at most four concurrent requests', async () => {
    document.body.innerHTML = '<img id="target" src="comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 500, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 500, configurable: true });
    setRect(image, 10, 20, 500, 500);
    Object.defineProperty(window, 'createImageBitmap', {
      value: jest.fn(async () => ({ close: jest.fn() })),
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({
      detect: jest.fn(async () => Array.from({ length: 205 }, (_item, index) => ({
        rawValue: `Block ${index}`,
        boundingBox: { x: (index % 20) * 20, y: Math.floor(index / 20) * 20, width: 12, height: 8 }
      })))
    }));
    let inFlight = 0;
    let maxInFlight = 0;
    const translateText = jest.fn(async (text: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return `Translated: ${text}`;
    });

    translator.enable(translateText);
    click(image);
    await flushPromises();

    expect(translateText).toHaveBeenCalledTimes(200);
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  it('uses bundled OCR with positioned blocks and terminates its worker on stop', async () => {
    document.body.innerHTML = '<img id="target" src="comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;

    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 200, configurable: true });
    setRect(image, 10, 20, 200, 100);
    recognize.mockResolvedValue({
      data: {
        text: 'First local line\nSecond local line',
        confidence: 91,
        lines: [
          {
            text: 'First local line',
            confidence: 92,
            bbox: { x0: 20, y0: 10, x1: 100, y1: 40 }
          },
          {
            text: 'Second local line',
            confidence: 90,
            bbox: { x0: 120, y0: 60, x1: 210, y1: 95 }
          }
        ]
      }
    });
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText, 'jpn');
    click(image);
    await flushPromises();

    const regionOverlays = document.querySelectorAll('.lexibridge-image-region-translation');
    expect(workerFactory).toHaveBeenCalledWith('jpn', expect.objectContaining({
      workerPath: expect.stringContaining('ocr/worker.min.js'),
      corePath: expect.stringContaining('ocr/core/'),
      langPath: expect.stringContaining('ocr/lang/')
    }));
    expect(setParameters).toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 400, 200, 0, 0, 400, 200);
    expect(translateText).toHaveBeenCalledWith('First local line', expectImageTranslationRequest());
    expect(translateText).toHaveBeenCalledWith('Second local line', expectImageTranslationRequest());
    expect(regionOverlays).toHaveLength(2);
    expect((regionOverlays[0] as HTMLElement).style.left).toBe('20px');
    expect((regionOverlays[0] as HTMLElement).style.top).toBe('25px');

    translator.disable();
    await flushPromises();

    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('renders separate overlays for OCR blocks with bounding boxes', async () => {
    document.body.innerHTML = '<img id="target" src="comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    const close = jest.fn();
    const detect = jest.fn(async () => [
      {
        rawValue: 'First bubble',
        boundingBox: { x: 20, y: 10, width: 80, height: 30 }
      },
      {
        rawValue: 'Second bubble',
        boundingBox: { x: 120, y: 60, width: 90, height: 35 }
      }
    ]);
    const createImageBitmap = jest.fn(async () => ({ close }));

    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 200, configurable: true });
    Object.defineProperty(image, 'getBoundingClientRect', {
      value: () => ({
        x: 10,
        y: 20,
        left: 10,
        top: 20,
        right: 210,
        bottom: 120,
        width: 200,
        height: 100,
        toJSON: () => ({})
      }),
      configurable: true
    });
    Object.defineProperty(window, 'createImageBitmap', {
      value: createImageBitmap,
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({ detect }));

    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    click(image);
    await flushPromises();

    const regionOverlays = document.querySelectorAll('.lexibridge-image-region-translation');
    expect(regionOverlays).toHaveLength(2);
    expect(document.getElementById('lexibridge-image-translation-overlay')).toBeNull();
    expect(translateText).toHaveBeenCalledWith('First bubble', expectImageTranslationRequest());
    expect(translateText).toHaveBeenCalledWith('Second bubble', expectImageTranslationRequest());
    expect(regionOverlays[0].textContent).toContain('Translated: First bubble');
    expect(regionOverlays[1].textContent).toContain('Translated: Second bubble');
    expect((regionOverlays[0] as HTMLElement).style.left).toBe('20px');
    expect((regionOverlays[0] as HTMLElement).style.top).toBe('25px');
  });

  it('keeps duplicate OCR text when the bounding boxes are different', async () => {
    document.body.innerHTML = '<img id="target" src="comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    const close = jest.fn();
    const detect = jest.fn(async () => [
      {
        rawValue: 'Yes',
        boundingBox: { x: 20, y: 10, width: 60, height: 24 }
      },
      {
        rawValue: 'Yes',
        boundingBox: { x: 140, y: 60, width: 60, height: 24 }
      }
    ]);
    const createImageBitmap = jest.fn(async () => ({ close }));

    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 200, configurable: true });
    Object.defineProperty(image, 'getBoundingClientRect', {
      value: () => ({
        x: 10,
        y: 20,
        left: 10,
        top: 20,
        right: 210,
        bottom: 120,
        width: 200,
        height: 100,
        toJSON: () => ({})
      }),
      configurable: true
    });
    Object.defineProperty(window, 'createImageBitmap', {
      value: createImageBitmap,
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({ detect }));

    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    click(image);
    await flushPromises();

    const regionOverlays = document.querySelectorAll('.lexibridge-image-region-translation');
    expect(regionOverlays).toHaveLength(2);
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(regionOverlays[0].textContent).toContain('Translated: Yes');
    expect(regionOverlays[1].textContent).toContain('Translated: Yes');
  });

  it('translates a dragged image region with browser OCR', async () => {
    document.body.innerHTML = '<img id="target" src="comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    const close = jest.fn();
    const detect = jest.fn(async () => [{ rawValue: 'Selected bubble text' }]);
    const createImageBitmap = jest.fn(async () => ({ close }));

    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 200, configurable: true });
    Object.defineProperty(image, 'getBoundingClientRect', {
      value: () => ({
        x: 10,
        y: 20,
        left: 10,
        top: 20,
        right: 210,
        bottom: 120,
        width: 200,
        height: 100,
        toJSON: () => ({})
      }),
      configurable: true
    });
    Object.defineProperty(window, 'createImageBitmap', {
      value: createImageBitmap,
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({ detect }));

    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    mouse(image, 'mousedown', 30, 40);
    mouse(document, 'mousemove', 90, 80);
    mouse(document, 'mouseup', 90, 80);
    await flushPromises();

    const overlay = document.getElementById('lexibridge-image-translation-overlay');
    expect(createImageBitmap).toHaveBeenCalledWith(image, 40, 40, 120, 80, {
      resizeWidth: 120,
      resizeHeight: 80,
      resizeQuality: 'high'
    });
    expect(detect).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(translateText).toHaveBeenCalledWith('Selected bubble text', expectImageTranslationRequest());
    expect(overlay?.textContent).toContain('Selected bubble text');
    expect(overlay?.textContent).toContain('Translated: Selected bubble text');
  });

  it('reconstructs a safe comic bubble, removes source pixels, and typesets inside the image', async () => {
    document.body.innerHTML = '<img id="target" src="comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    const width = 100;
    const height = 40;
    const pixels = createPixelBuffer(width, height, [120, 120, 120, 255]);
    paintPixelRect(pixels, width, { x: 5, y: 5, width: 35, height: 28 }, [248, 248, 248, 255]);
    paintPixelRect(pixels, width, { x: 14, y: 15, width: 10, height: 5 }, [5, 5, 5, 255]);

    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true });
    setRect(image, 10, 20, width, height);

    const close = jest.fn();
    Object.defineProperty(window, 'createImageBitmap', {
      value: jest.fn(async () => ({ close })),
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({
      detect: jest.fn(async () => [{
        rawValue: 'YES',
        boundingBox: { x: 14, y: 15, width: 10, height: 5 }
      }])
    }));

    const captureContext = {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(pixels) }))
    };
    const putImageData = jest.fn();
    const fillText = jest.fn();
    const outputContext = {
      createImageData: jest.fn((canvasWidth: number, canvasHeight: number) => ({
        data: new Uint8ClampedArray(canvasWidth * canvasHeight * 4)
      })),
      putImageData,
      measureText: jest.fn((text: string) => ({ width: Array.from(text).length * 5 })),
      fillText,
      save: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn(),
      font: '',
      fillStyle: '',
      direction: 'ltr',
      textAlign: 'left',
      textBaseline: 'alphabetic'
    };
    getContext.mockImplementation((_contextId: string, options?: CanvasRenderingContext2DSettings) => (
      options?.alpha === true ? captureContext : outputContext
    ) as unknown as CanvasRenderingContext2D);

    translator.enable(async () => 'JA');
    click(image);
    await flushPromises();
    await flushPromises();

    const comicOverlay = document.querySelector('.lexibridge-image-comic-overlay') as HTMLCanvasElement | null;
    expect(comicOverlay).not.toBeNull();
    expect(comicOverlay?.getAttribute('data-lexibridge-owned')).toBe('true');
    expect(comicOverlay?.width).toBe(width);
    expect(comicOverlay?.height).toBe(height);
    expect(comicOverlay?.style.left).toBe('10px');
    expect(comicOverlay?.style.top).toBe('20px');
    expect(document.querySelector('.lexibridge-image-region-translation')).toBeNull();
    expect(putImageData).toHaveBeenCalledTimes(1);
    const renderedPixels = putImageData.mock.calls[0][0].data as Uint8ClampedArray;
    expect(renderedPixels[(17 * width + 18) * 4]).toBeGreaterThan(240);
    expect(fillText).toHaveBeenCalledWith('JA', expect.any(Number), expect.any(Number));
    expect(fillText.mock.calls[0][1]).toBeGreaterThanOrEqual(5);
    expect(fillText.mock.calls[0][1]).toBeLessThanOrEqual(40);
    expect(fillText.mock.calls[0][2]).toBeGreaterThanOrEqual(5);
    expect(fillText.mock.calls[0][2]).toBeLessThanOrEqual(33);
    expect(outputContext.clip).toHaveBeenCalledTimes(1);
    expect(outputContext.rect).toHaveBeenCalledWith(5, 5, 35, 28);
  });

  it('falls back to positioned DOM translation when source pixels are cross-origin tainted', async () => {
    document.body.innerHTML = '<img id="target" src="https://example.test/comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 100, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 40, configurable: true });
    setRect(image, 10, 20, 100, 40);
    Object.defineProperty(window, 'createImageBitmap', {
      value: jest.fn(async () => ({ close: jest.fn() })),
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({
      detect: jest.fn(async () => [{
        rawValue: 'TAINTED',
        boundingBox: { x: 14, y: 15, width: 10, height: 5 }
      }])
    }));
    getContext.mockReturnValue({
      drawImage: jest.fn(),
      getImageData: jest.fn(() => {
        throw new DOMException('Tainted canvases may not be exported', 'SecurityError');
      })
    } as unknown as CanvasRenderingContext2D);

    translator.enable(async text => `Translated: ${text}`);
    click(image);
    await flushPromises();

    expect(document.querySelector('.lexibridge-image-comic-overlay')).toBeNull();
    expect(document.querySelector('.lexibridge-image-region-result')?.textContent).toBe('Translated: TAINTED');
  });

  it('never reconstructs or erases from a near-whole-image OCR fallback box', async () => {
    document.body.innerHTML = '<img id="target" src="comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 100, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 40, configurable: true });
    setRect(image, 10, 20, 100, 40);
    Object.defineProperty(window, 'createImageBitmap', {
      value: jest.fn(async () => ({ close: jest.fn() })),
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({
      detect: jest.fn(async () => [{
        rawValue: 'WHOLE PAGE',
        boundingBox: { x: 2, y: 1, width: 96, height: 38 }
      }])
    }));
    const pixelRead = jest.fn();
    getContext.mockReturnValue({ drawImage: jest.fn(), getImageData: pixelRead } as unknown as CanvasRenderingContext2D);

    translator.enable(async text => `Translated: ${text}`);
    click(image);
    await flushPromises();

    expect(pixelRead).not.toHaveBeenCalled();
    expect(document.querySelector('.lexibridge-image-comic-overlay')).toBeNull();
    expect(document.querySelector('.lexibridge-image-region-result')?.textContent).toBe('Translated: WHOLE PAGE');
  });

  it('does not commit a reconstructed canvas after Stop while the image commit is pending', async () => {
    document.body.innerHTML = '<img id="target" src="comic.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    const pixels = createPixelBuffer(100, 40, [248, 248, 248, 255]);
    paintPixelRect(pixels, 100, { x: 14, y: 15, width: 10, height: 5 }, [5, 5, 5, 255]);
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 100, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 40, configurable: true });
    setRect(image, 10, 20, 100, 40);
    Object.defineProperty(window, 'createImageBitmap', {
      value: jest.fn(async () => ({ close: jest.fn() })),
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({
      detect: jest.fn(async () => [{
        rawValue: 'WAIT',
        boundingBox: { x: 14, y: 15, width: 10, height: 5 }
      }])
    }));
    const captureContext = {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(pixels) }))
    };
    const outputContext = {
      createImageData: jest.fn(() => ({ data: new Uint8ClampedArray(100 * 40 * 4) })),
      putImageData: jest.fn(),
      measureText: jest.fn(() => ({ width: 10 })),
      fillText: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn()
    };
    getContext.mockImplementation((_contextId: string, options?: CanvasRenderingContext2DSettings) => (
      options?.alpha === true ? captureContext : outputContext
    ) as unknown as CanvasRenderingContext2D);
    let releaseCommit!: () => void;
    const pendingCommit = new Promise<void>(resolve => {
      releaseCommit = resolve;
    });
    (translator as any).yieldForImageCommit = () => pendingCommit;

    translator.enable(async () => 'STOPPED');
    click(image);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    translator.disable();
    releaseCommit();
    await flushPromises();

    expect(document.querySelector('.lexibridge-image-comic-overlay')).toBeNull();
    expect(document.querySelector('.lexibridge-image-region-translation')).toBeNull();
  });

  it('removes image mode styling and overlay when disabled', async () => {
    document.body.innerHTML = '<img id="target" alt="Close this overlay">';
    const image = document.getElementById('target') as HTMLImageElement;

    translator.enable(async (text: string) => `Translated: ${text}`);
    click(image);
    await flushPromises();

    expect(document.body.classList.contains('lexibridge-image-translation-mode')).toBe(true);
    expect(document.getElementById('lexibridge-image-translation-overlay')).not.toBeNull();

    translator.disable();

    expect(document.body.classList.contains('lexibridge-image-translation-mode')).toBe(false);
    expect(document.getElementById('lexibridge-image-translation-overlay')).toBeNull();
    expect(document.getElementById('lexibridge-image-translation-style')).toBeNull();
  });

  it('tracks a right-clicked image without OCR and translates it only after the explicit command', async () => {
    document.body.innerHTML = '<img id="target" src="/comic.png" alt="Context image text">';
    const image = document.getElementById('target') as HTMLImageElement;
    const translateText = jest.fn(async text => `Translated: ${text}`);

    translator.initialize();
    image.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(translateText).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();

    translator.enableContextMode(translateText);
    const result = await translator.translateImageFromSourceUrl(new URL('/comic.png', document.baseURI).href);

    expect(result).toEqual({
      isActive: true,
      translated: true,
      message: 'Image translated'
    });
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('lexibridge-image-translation-mode')).toBe(false);
    click(image);
    await flushPromises();
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.lexibridge-image-translation-result')?.textContent)
      .toBe('Translated: Context image text');
  });

  it('refuses an ambiguous context-image URL instead of translating the wrong duplicate', async () => {
    document.body.innerHTML = `
      <img src="/shared.png" alt="First duplicate">
      <img src="/shared.png" alt="Second duplicate">
    `;
    const translateText = jest.fn(async text => `Translated: ${text}`);
    translator.enableContextMode(translateText);

    const result = await translator.translateImageFromSourceUrl(
      new URL('/shared.png', document.baseURI).href
    );

    expect(result).toEqual({
      isActive: true,
      translated: false,
      message: 'Image is no longer available'
    });
    expect(translateText).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();
  });

  it('arms one-shot Z selection without OCR and ignores Z inside editable fields', async () => {
    document.body.innerHTML = '<input id="editor"><img id="target" alt="Shortcut image text">';
    const input = document.getElementById('editor') as HTMLInputElement;
    const image = document.getElementById('target') as HTMLImageElement;
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 100, configurable: true });
    setRect(image, 10, 20, 200, 100);
    const detect = jest.fn(async () => [{
      rawValue: 'Selected shortcut text',
      boundingBox: { x: 10, y: 10, width: 80, height: 20 }
    }]);
    Object.defineProperty(window, 'createImageBitmap', {
      value: jest.fn(async () => ({ close: jest.fn() })),
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({ detect }));
    const translateText = jest.fn(async text => `Translated: ${text}`);
    translator.configure(translateText);

    image.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.querySelector('.lexibridge-image-hover-toolbar')).toBeNull();
    expect(translateText).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z',
      bubbles: true,
      cancelable: true
    }));
    await flushPromises();
    expect(translateText).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z',
      bubbles: true,
      cancelable: true
    }));
    await flushPromises();
    expect(detect).not.toHaveBeenCalled();
    expect(translateText).not.toHaveBeenCalled();
    expect(document.body.classList.contains('lexibridge-image-region-armed')).toBe(true);

    mouse(image, 'mousedown', 30, 40);
    mouse(document, 'mousemove', 100, 80);
    mouse(document, 'mouseup', 100, 80);
    await flushPromises();
    expect(detect).toHaveBeenCalledTimes(1);
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Translated: Selected shortcut text');
    expect(document.body.classList.contains('lexibridge-image-region-armed')).toBe(false);
  });

  it('retranslates with a fresh provider request instead of reusing the completed cache', async () => {
    document.body.innerHTML = '<img id="target" alt="Refresh image text">';
    const image = document.getElementById('target') as HTMLImageElement;
    let request = 0;
    const translateText = jest.fn(async () => `Translation ${++request}`);
    translator.enable(translateText);

    image.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    click(image);
    await flushPromises();
    expect(translateText).toHaveBeenCalledTimes(1);

    const retranslate = document.querySelector<HTMLButtonElement>('button[data-action="retranslate"]');
    expect(retranslate).not.toBeNull();
    click(retranslate!);
    await flushPromises();

    expect(translateText).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.lexibridge-image-translation-result')?.textContent)
      .toBe('Translation 2');
  });

  it('invalidates the old target run before a retranslation OCR scan completes', async () => {
    document.body.innerHTML = '<img id="target" src="race.png">';
    const image = document.getElementById('target') as HTMLImageElement;
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 100, configurable: true });
    setRect(image, 10, 20, 200, 100);
    let resolveSecondOcr!: (value: any[]) => void;
    const secondOcr = new Promise<any[]>(resolve => {
      resolveSecondOcr = resolve;
    });
    const detect = jest.fn()
      .mockResolvedValueOnce([{
        rawValue: 'Race text',
        boundingBox: { x: 10, y: 10, width: 80, height: 20 }
      }])
      .mockReturnValueOnce(secondOcr);
    Object.defineProperty(window, 'createImageBitmap', {
      value: jest.fn(async () => ({ close: jest.fn() })),
      configurable: true
    });
    (window as any).TextDetector = jest.fn(() => ({ detect }));
    let resolveFirstTranslation!: (value: string) => void;
    const firstTranslation = new Promise<string>(resolve => {
      resolveFirstTranslation = resolve;
    });
    const translateText = jest.fn()
      .mockReturnValueOnce(firstTranslation)
      .mockResolvedValueOnce('Fresh translation');
    translator.enable(translateText);

    const oldRun = (translator as any).translateTarget(image, false);
    await flushPromises();
    expect(translateText).toHaveBeenCalledTimes(1);
    const freshRun = (translator as any).translateTarget(image, true);
    await Promise.resolve();
    resolveFirstTranslation('Stale translation');
    await flushPromises();

    expect(document.body.textContent).not.toContain('Stale translation');
    resolveSecondOcr([{
      rawValue: 'Race text',
      boundingBox: { x: 10, y: 10, width: 80, height: 20 }
    }]);
    const [oldOutcome, freshOutcome] = await Promise.all([oldRun, freshRun]);

    expect(oldOutcome).toBe('cancelled');
    expect(freshOutcome).toBe('translated');
    expect(document.body.textContent).toContain('Fresh translation');
  });

  it('does not fall back to a stale DOM result when the source changes during reconstruction', async () => {
    document.body.innerHTML = '<img id="target" src="before.png" alt="Source changes">';
    const image = document.getElementById('target') as HTMLImageElement;
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 100, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 50, configurable: true });
    setRect(image, 10, 20, 100, 50);
    jest.spyOn(translator as any, 'tryRenderComicImage').mockImplementation(async () => {
      image.src = 'after.png';
      return false;
    });
    translator.enable(async text => `Translated: ${text}`);

    click(image);
    await flushPromises();

    expect(document.querySelector('.lexibridge-image-comic-overlay')).toBeNull();
    expect(document.querySelector('.lexibridge-image-translation-overlay')).toBeNull();
    expect(document.querySelector('.lexibridge-image-region-translation')).toBeNull();
    expect(document.body.textContent).not.toContain('Translated: Source changes');
  });

  it('closes the image hover entry for the document without starting OCR or translation', async () => {
    document.body.innerHTML = '<img id="first" alt="First"><img id="second" alt="Second">';
    const first = document.getElementById('first') as HTMLImageElement;
    const second = document.getElementById('second') as HTMLImageElement;
    const translateText = jest.fn(async text => `Translated: ${text}`);
    translator.enable(translateText);

    first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const closeButton = document.querySelector<HTMLButtonElement>('button[data-action="close"]');
    expect(closeButton).not.toBeNull();
    click(closeButton!);
    second.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(document.querySelector('.lexibridge-image-hover-toolbar')).toBeNull();
    expect(translateText).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();
  });

  it('clears stale hover targets and leaves IME Escape untouched', async () => {
    document.body.innerHTML = '<img id="target" alt="Hover target"><div id="outside"></div>';
    const image = document.getElementById('target') as HTMLImageElement;
    const outside = document.getElementById('outside')!;
    const translateText = jest.fn(async text => `Translated: ${text}`);
    translator.configure(translateText);

    image.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    image.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: outside }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true }));
    expect(document.body.classList.contains('lexibridge-image-region-armed')).toBe(false);

    image.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true }));
    expect(document.body.classList.contains('lexibridge-image-region-armed')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      isComposing: true
    }));
    expect(document.body.classList.contains('lexibridge-image-region-armed')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    }));
    expect(document.body.classList.contains('lexibridge-image-region-armed')).toBe(false);
    expect(translateText).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();
  });

  it('finds a hovered image through a Shadow DOM composed event path', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const image = document.createElement('img');
    shadowRoot.appendChild(image);
    translator.configure(async text => `Translated: ${text}`);

    image.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z',
      bubbles: true,
      cancelable: true,
      composed: true
    }));

    expect(document.body.classList.contains('lexibridge-image-region-armed')).toBe(true);
  });

  it('applies and undoes only extension overlays without mutating the source image', async () => {
    document.body.innerHTML = '<div id="host"><img id="target" src="source.png" srcset="source-2x.png 2x" alt="Keep source"></div>';
    const image = document.getElementById('target') as HTMLImageElement;
    const sourceSnapshot = {
      src: image.getAttribute('src'),
      srcset: image.getAttribute('srcset'),
      style: image.getAttribute('style'),
      parent: image.parentNode
    };
    translator.enable(async text => `Translated: ${text}`);

    image.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    click(image);
    await flushPromises();
    const apply = document.querySelector<HTMLButtonElement>('button[data-action="apply"]');
    expect(apply).not.toBeNull();
    click(apply!);

    expect(document.querySelector('[data-lexibridge-image-state="applied"]')).not.toBeNull();
    expect(image.getAttribute('src')).toBe(sourceSnapshot.src);
    expect(image.getAttribute('srcset')).toBe(sourceSnapshot.srcset);
    expect(image.getAttribute('style')).toBe(sourceSnapshot.style);
    expect(image.parentNode).toBe(sourceSnapshot.parent);

    const undo = document.querySelector<HTMLButtonElement>('button[data-action="undo"]');
    expect(undo).not.toBeNull();
    click(undo!);
    expect(document.querySelector('.lexibridge-image-translation-overlay')).toBeNull();
    expect(image.getAttribute('src')).toBe(sourceSnapshot.src);
    expect(image.getAttribute('srcset')).toBe(sourceSnapshot.srcset);
    expect(image.getAttribute('style')).toBe(sourceSnapshot.style);
    expect(image.parentNode).toBe(sourceSnapshot.parent);
  });

  it('moves overlays with their source and removes stale results after the source changes', async () => {
    document.body.innerHTML = '<img id="target" alt="Moving source">';
    const image = document.getElementById('target') as HTMLImageElement;
    setRect(image, 50, 60, 200, 100);
    translator.enable(async text => `Translated: ${text}`);
    click(image);
    await flushPromises();

    const overlay = document.querySelector<HTMLElement>('.lexibridge-image-translation-overlay')!;
    const initialLeft = Number.parseFloat(overlay.style.left);
    const initialTop = Number.parseFloat(overlay.style.top);
    setRect(image, 80, 100, 200, 100);
    window.dispatchEvent(new Event('scroll'));

    expect(Number.parseFloat(overlay.style.left)).toBe(initialLeft + 30);
    expect(Number.parseFloat(overlay.style.top)).toBe(initialTop + 40);

    image.setAttribute('src', 'replacement.png');
    await flushPromises();
    expect(document.querySelector('.lexibridge-image-translation-overlay')).toBeNull();
  });

  it('offers PNG download only for reconstructed canvases and revokes its object URL', async () => {
    document.body.innerHTML = '<img id="target" alt="Download source">';
    const image = document.getElementById('target') as HTMLImageElement;
    translator.enable(async text => `Translated: ${text}`);
    const createObjectURL = jest.fn(() => 'blob:translated-image');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

    expect(await (translator as any).downloadTargetTranslation(image)).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();

    const canvas = document.createElement('canvas');
    canvas.className = 'lexibridge-image-comic-overlay';
    document.body.appendChild(canvas);
    (translator as any).overlayElements.set(image, [canvas]);
    jest.spyOn(canvas, 'toBlob').mockImplementation(callback => {
      callback(new Blob(['png'], { type: 'image/png' }));
    });
    const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    expect(await (translator as any).downloadTargetTranslation(image)).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:translated-image');
    anchorClick.mockRestore();
  });

  it('cancels a pending canvas PNG encode on Stop before creating an object URL', async () => {
    document.body.innerHTML = '<img id="target" alt="Pending download">';
    const image = document.getElementById('target') as HTMLImageElement;
    translator.enable(async text => `Translated: ${text}`);
    const createObjectURL = jest.fn(() => 'blob:should-not-exist');
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    const canvas = document.createElement('canvas');
    canvas.className = 'lexibridge-image-comic-overlay';
    document.body.appendChild(canvas);
    (translator as any).overlayElements.set(image, [canvas]);
    jest.spyOn(canvas, 'toBlob').mockImplementation(() => undefined);

    const pendingDownload = (translator as any).downloadTargetTranslation(image);
    await Promise.resolve();
    translator.disable();

    await expect(pendingDownload).resolves.toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
