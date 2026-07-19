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
    expect(translator.getTranscriptStatus().cueCount).toBe(0);
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
      cueCount: 1,
      message: 'Live caption translation started'
    });
    expect(translateText).toHaveBeenCalledWith('Speaker says hello to everyone.');
    expect(overlay?.textContent).toContain('Speaker says hello to everyone.');
    expect(overlay?.textContent).toContain('Translated: Speaker says hello to everyone.');
  });

  it('does not reuse a live-caption translation after the cache identity changes', async () => {
    document.body.innerHTML = '<div aria-live="polite">The same caption text.</div>';
    let provider = 'google';
    const translateText = jest.fn(async (text: string) => `${provider}: ${text}`);
    const createCacheKey = (text: string): string => `${provider}:${text}`;

    translator.enable(translateText, createCacheKey);
    await flushPromises();
    expect(translateText).toHaveBeenCalledTimes(1);

    translator.disable();
    provider = 'deepl';
    translator.enable(translateText, createCacheKey);
    await flushPromises();

    expect(translateText).toHaveBeenCalledTimes(2);
    expect(document.getElementById('lexibridge-live-caption-overlay')?.textContent)
      .toContain('deepl: The same caption text.');
  });

  it.each([
    [
      'Google Meet',
      '<div class="a4cQT"><span class="iTTPOb">Mina</span><span class="TBMuR">Can everyone see my screen?</span></div>'
    ],
    [
      'Zoom',
      '<div class="closed-caption"><span class="caption-name">Jon</span><span class="caption-text">The demo starts now.</span></div>'
    ],
    [
      'Microsoft Teams',
      '<div data-tid="closed-caption-renderer"><span data-tid="closed-caption-speaker">Ava</span><span data-tid="closed-caption-text">Please check the agenda.</span></div>'
    ],
    [
      'Webex',
      '<div class="closed-caption-content"><span class="speaker-name">Noah</span><span class="caption-content">The recording is not enabled.</span></div>'
    ]
  ])('preserves the speaker label while translating %s caption text', async (_source, markup) => {
    document.body.innerHTML = markup;
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    await flushPromises();

    const overlay = document.getElementById('lexibridge-live-caption-overlay');
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translateText).toHaveBeenCalledWith(expect.not.stringMatching(/Mina|Jon|Ava|Noah/));
    expect(overlay?.textContent).toMatch(/Mina:|Jon:|Ava:|Noah:/);
    expect(overlay?.textContent).toContain('Translated:');
  });

  it('captures timed bilingual cues and exports SRT without recording audio', async () => {
    document.title = 'Weekly product sync';
    document.body.innerHTML = `
      <div class="a4cQT">
        <span class="iTTPOb">Mina</span>
        <span id="caption" class="TBMuR">First agenda item.</span>
      </div>
    `;
    const caption = document.getElementById('caption') as HTMLElement;
    const now = jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2500)
      .mockReturnValueOnce(4000);
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    await flushPromises();

    caption.textContent = 'Second agenda item.';
    await flushPromises();

    const exported = translator.exportTranscript('srt');

    expect(exported.cueCount).toBe(2);
    expect(exported.filename).toBe('Weekly-product-sync-lexibridge-live-captions.srt');
    expect(exported.content).toContain('00:00:00,000 --> 00:00:01,500');
    expect(exported.content).toContain('00:00:01,500 --> 00:00:03,000');
    expect(exported.content).toContain('Mina: First agenda item.');
    expect(exported.content).toContain('Mina: Translated: First agenda item.');
    expect(exported.content).toContain('Mina: Second agenda item.');
    expect(translator.getTranscriptStatus()).toEqual({
      isActive: true,
      cueCount: 2,
      sessionStartedAt: '1970-01-01T00:00:01.000Z',
      message: '2 live caption cues captured'
    });

    now.mockRestore();
  });

  it('exports TXT, VTT, and JSON transcript formats and preserves cues after stopping', async () => {
    document.body.innerHTML = `
      <div data-lexibridge-live-caption-source="zoom">
        <span data-lexibridge-caption-speaker>Jon</span>
        <span data-lexibridge-caption-text>Ship the tested build.</span>
      </div>
    `;
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    await flushPromises();
    translator.disable();

    const txt = translator.exportTranscript('txt');
    const vtt = translator.exportTranscript('vtt');
    const json = translator.exportTranscript('json');
    const parsedJson = JSON.parse(json.content);

    expect(txt.content).toContain('LexiBridge live caption transcript');
    expect(txt.content).toContain('Jon (Zoom)');
    expect(txt.content).toContain('Original: Ship the tested build.');
    expect(txt.content).toContain('Translation: Translated: Ship the tested build.');
    expect(vtt.content).toMatch(/^WEBVTT/);
    expect(vtt.content).toContain('Jon: Ship the tested build.');
    expect(parsedJson.cueCount).toBe(1);
    expect(parsedJson.cues[0]).toEqual(expect.objectContaining({
      source: 'Zoom',
      speaker: 'Jon',
      originalText: 'Ship the tested build.',
      translatedText: 'Translated: Ship the tested build.'
    }));
    expect(translator.getTranscriptStatus().cueCount).toBe(1);
  });

  it('clears a captured transcript explicitly without restarting translation', async () => {
    document.body.innerHTML = '<div aria-live="polite">Caption to clear.</div>';
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    await flushPromises();

    expect(translator.getTranscriptStatus().cueCount).toBe(1);
    expect(translator.clearTranscript()).toEqual({
      isActive: true,
      cueCount: 0,
      sessionStartedAt: null,
      message: 'Live caption transcript cleared'
    });
    expect(translator.exportTranscript('txt').content).toBe('');
    expect(translator.getStatus().isActive).toBe(true);
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

  it('coalesces incremental caption text and ignores a late partial translation', async () => {
    document.body.innerHTML = `
      <div class="a4cQT">
        <span class="iTTPOb">Mina</span>
        <span id="caption" class="TBMuR">We should</span>
      </div>
    `;
    const caption = document.getElementById('caption') as HTMLElement;
    let resolvePartial!: (value: string) => void;
    const partialTranslation = new Promise<string>(resolve => {
      resolvePartial = resolve;
    });
    const translateText = jest.fn((text: string) => text === 'We should'
      ? partialTranslation
      : Promise.resolve(`Translated: ${text}`));

    translator.enable(translateText);
    await flushPromises();

    caption.textContent = 'We should ship the tested build.';
    await flushPromises();
    resolvePartial('Translated partial text');
    await flushPromises();

    const exported = translator.exportTranscript('json');
    const parsed = JSON.parse(exported.content);

    expect(exported.cueCount).toBe(1);
    expect(parsed.cues[0].originalText).toBe('We should ship the tested build.');
    expect(parsed.cues[0].translatedText).toBe('Translated: We should ship the tested build.');
    expect(parsed.cues[0].translatedText).not.toBe('Translated partial text');
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
