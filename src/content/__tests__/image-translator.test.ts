import { ImageTranslator } from '../components/ImageTranslator';

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

describe('ImageTranslator', () => {
  let translator: ImageTranslator;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    translator = new ImageTranslator();
  });

  afterEach(() => {
    translator.cleanup();
    delete (window as any).TextDetector;
    delete (window as any).createImageBitmap;
    document.body.innerHTML = '';
  });

  it('does not translate images before the user enables image translation mode', async () => {
    document.body.innerHTML = '<img id="target" alt="Text printed in an image">';
    const image = document.getElementById('target') as HTMLImageElement;
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    click(image);
    await flushPromises();

    expect(translateText).not.toHaveBeenCalled();
    expect(document.getElementById('lexibridge-image-translation-overlay')).toBeNull();
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
