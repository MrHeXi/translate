import { LiveCaptionTranslator } from '../components/LiveCaptionTranslator';

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('LiveCaptionTranslator', () => {
  let translator: LiveCaptionTranslator;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    translator = new LiveCaptionTranslator();
  });

  afterEach(() => {
    translator.cleanup();
    document.body.innerHTML = '';
  });

  it('does not render an overlay before the user enables live caption translation', async () => {
    document.body.innerHTML = '<div aria-live="polite">Live caption text waits for manual start.</div>';
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    await flushPromises();

    expect(translateText).not.toHaveBeenCalled();
    expect(document.getElementById('lexibridge-live-caption-overlay')).toBeNull();
  });

  it('translates existing live caption text after manual enablement', async () => {
    document.body.innerHTML = '<div aria-live="polite">Speaker says hello to everyone.</div>';
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    const state = translator.enable(translateText);
    await flushPromises();

    const overlay = document.getElementById('lexibridge-live-caption-overlay');
    expect(state).toEqual({
      isActive: true,
      hasCaption: true,
      message: 'Live caption translation started'
    });
    expect(translateText).toHaveBeenCalledWith('Speaker says hello to everyone.');
    expect(overlay?.textContent).toContain('Speaker says hello to everyone.');
    expect(overlay?.textContent).toContain('Translated: Speaker says hello to everyone.');
  });

  it('updates the overlay when live caption text changes', async () => {
    document.body.innerHTML = '<div id="caption" aria-live="polite">First caption line.</div>';
    const caption = document.getElementById('caption') as HTMLElement;
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    await flushPromises();

    caption.textContent = 'Second caption line.';
    await flushPromises();

    const overlay = document.getElementById('lexibridge-live-caption-overlay');
    expect(translateText).toHaveBeenCalledWith('First caption line.');
    expect(translateText).toHaveBeenCalledWith('Second caption line.');
    expect(overlay?.textContent).toContain('Second caption line.');
    expect(overlay?.textContent).toContain('Translated: Second caption line.');
  });

  it('removes the overlay and stops watching when disabled', async () => {
    document.body.innerHTML = '<div id="caption" aria-live="polite">Caption before stop.</div>';
    const caption = document.getElementById('caption') as HTMLElement;
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    await flushPromises();
    expect(document.getElementById('lexibridge-live-caption-overlay')).not.toBeNull();

    translator.disable();
    caption.textContent = 'Caption after stop.';
    await flushPromises();

    expect(document.getElementById('lexibridge-live-caption-overlay')).toBeNull();
    expect(translateText).not.toHaveBeenCalledWith('Caption after stop.');
  });
});
