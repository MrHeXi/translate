import { ImageTranslator } from '../components/ImageTranslator';
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
      message: 'Translated 1 visible image'
    });
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translateText).toHaveBeenCalledWith('Visible image text');
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
    const translateText = jest.fn(() => firstTranslation);
    translator.enable(translateText);

    const pendingBatch = translator.translateVisibleImages();
    await flushPromises();
    expect(translateText).toHaveBeenCalledWith('First image text');

    translator.disable();
    resolveFirstTranslation('Translated: First image text');

    const result = await pendingBatch;

    expect(result.isActive).toBe(false);
    expect(result.translatedImageCount).toBe(0);
    expect(result.message).toBe('Image translation stopped');
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translateText).not.toHaveBeenCalledWith('Second image text');
    expect(document.querySelectorAll('.lexibridge-image-translation-overlay')).toHaveLength(0);
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
      message: 'Image translation started'
    });
    expect(translateText).toHaveBeenCalledWith('Sale ends tonight');
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
    expect(translateText).toHaveBeenCalledWith('Speech bubble text');
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
    expect(createImageBitmap).toHaveBeenCalledWith(image);
    expect(detect).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(translateText).toHaveBeenCalledWith('OCR detected line');
    expect(overlay?.textContent).toContain('OCR detected line');
    expect(overlay?.textContent).toContain('Translated: OCR detected line');
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
    expect(translateText).toHaveBeenCalledWith('First local line');
    expect(translateText).toHaveBeenCalledWith('Second local line');
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
    expect(translateText).toHaveBeenCalledWith('First bubble');
    expect(translateText).toHaveBeenCalledWith('Second bubble');
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
    expect(createImageBitmap).toHaveBeenCalledWith(image, 40, 40, 120, 80);
    expect(detect).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(translateText).toHaveBeenCalledWith('Selected bubble text');
    expect(overlay?.textContent).toContain('Selected bubble text');
    expect(overlay?.textContent).toContain('Translated: Selected bubble text');
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
});
