import { ImageTranslator } from '../components/ImageTranslator';

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

const click = (element: Element): void => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
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
