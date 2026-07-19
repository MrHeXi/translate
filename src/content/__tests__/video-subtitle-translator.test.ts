import { VideoSubtitleTranslator } from '../components/VideoSubtitleTranslator';

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

type TestTrack = TextTrack & {
  setActiveText: (text: string) => void;
  setActiveCue: (text: string, startTime: number, endTime: number) => void;
  fireCueChange: () => void;
};

const createTextTrack = (initialMode: TextTrackMode = 'showing'): TestTrack => {
  let cueChangeListener: (() => void) | null = null;

  const track = {
    kind: 'subtitles' as TextTrackKind,
    mode: initialMode,
    activeCues: [] as Array<{ text: string; startTime?: number; endTime?: number }>,
    addEventListener: jest.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'cuechange') return;

      cueChangeListener = typeof listener === 'function'
        ? () => listener(new Event('cuechange'))
        : () => listener.handleEvent(new Event('cuechange'));
    }),
    removeEventListener: jest.fn((type: string) => {
      if (type === 'cuechange') {
        cueChangeListener = null;
      }
    }),
    setActiveText(text: string) {
      this.activeCues = text ? [{ text }] : [];
    },
    setActiveCue(text: string, startTime: number, endTime: number) {
      this.activeCues = text ? [{ text, startTime, endTime }] : [];
    },
    fireCueChange() {
      cueChangeListener?.();
    }
  };

  return track as unknown as TestTrack;
};

const mockVideoTracks = (tracks: TextTrack[]): jest.SpyInstance => {
  const video = { textTracks: tracks } as unknown as HTMLVideoElement;

  return jest
    .spyOn(document, 'querySelectorAll')
    .mockReturnValue([video] as unknown as NodeListOf<HTMLVideoElement>);
};

describe('VideoSubtitleTranslator', () => {
  let translator: VideoSubtitleTranslator;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    translator = new VideoSubtitleTranslator();
  });

  afterEach(() => {
    translator.cleanup();
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('does not render an overlay before the user enables subtitle translation', () => {
    const track = createTextTrack();
    mockVideoTracks([track]);

    track.setActiveText('Manual controls should start video subtitle translation.');
    track.fireCueChange();

    expect(document.getElementById('lexibridge-video-subtitle-overlay')).toBeNull();
    expect(track.addEventListener).not.toHaveBeenCalled();
  });

  it('does not translate DOM-rendered captions before manual enablement', () => {
    document.body.innerHTML = [
      '<video></video>',
      '<div class="ytp-caption-window-container">',
      '<span class="ytp-caption-segment">DOM captions still need a manual start.</span>',
      '</div>'
    ].join('');

    expect(document.getElementById('lexibridge-video-subtitle-overlay')).toBeNull();
  });

  it('translates active subtitle cues after manual enablement', async () => {
    const track = createTextTrack('showing');
    mockVideoTracks([track]);
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    const state = translator.enable(translateText);

    expect(state).toEqual({
      isActive: true,
      hasTrack: true,
      message: 'Video subtitle translation started'
    });
    expect(track.mode).toBe('hidden');
    expect(track.addEventListener).toHaveBeenCalledWith('cuechange', expect.any(Function));

    track.setActiveText('<i>Hello from captions.</i>');
    track.fireCueChange();
    await flushPromises();

    const overlay = document.getElementById('lexibridge-video-subtitle-overlay');
    expect(translateText).toHaveBeenCalledWith('Hello from captions.');
    expect(overlay?.textContent).toContain('Hello from captions.');
    expect(overlay?.textContent).toContain('Translated: Hello from captions.');
  });

  it('does not reuse a subtitle translation after the cache identity changes', async () => {
    const track = createTextTrack('showing');
    mockVideoTracks([track]);
    let provider = 'google';
    const translateText = jest.fn(async (text: string) => `${provider}: ${text}`);
    const createCacheKey = (text: string): string => `${provider}:${text}`;

    translator.enable(translateText, createCacheKey);
    track.setActiveText('The same subtitle text.');
    track.fireCueChange();
    await flushPromises();
    expect(translateText).toHaveBeenCalledTimes(1);

    translator.disable();
    provider = 'deepl';
    translator.enable(translateText, createCacheKey);
    track.setActiveText('The same subtitle text.');
    track.fireCueChange();
    await flushPromises();

    expect(translateText).toHaveBeenCalledTimes(2);
    expect(document.getElementById('lexibridge-video-subtitle-overlay')?.textContent)
      .toContain('deepl: The same subtitle text.');
  });

  it('translates DOM-rendered video captions after manual enablement', async () => {
    document.body.innerHTML = [
      '<video></video>',
      '<div class="ytp-caption-window-container">',
      '<span class="ytp-caption-segment">Hello from DOM captions.</span>',
      '</div>'
    ].join('');
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      value: 12.5,
      configurable: true
    });
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    const state = translator.enable(translateText);
    await flushPromises();

    expect(state).toEqual({
      isActive: true,
      hasTrack: true,
      message: 'Video subtitle translation started'
    });
    expect(translateText).toHaveBeenCalledWith('Hello from DOM captions.');
    const overlay = document.getElementById('lexibridge-video-subtitle-overlay');
    expect(overlay?.textContent).toContain('Hello from DOM captions.');
    expect(overlay?.textContent).toContain('Translated: Hello from DOM captions.');

    const exported = translator.exportSubtitles();
    expect(exported.cueCount).toBe(1);
    expect(exported.content).toContain('00:00:12,500 --> 00:00:14,500');
    expect(exported.content).toContain('Translated: Hello from DOM captions.');
  });

  it('removes the overlay and restores the original track mode when disabled', async () => {
    const track = createTextTrack('showing');
    mockVideoTracks([track]);

    translator.enable(async (text: string) => `Translated: ${text}`);
    track.setActiveText('Stopping should restore native caption behavior.');
    track.fireCueChange();
    await flushPromises();

    expect(document.getElementById('lexibridge-video-subtitle-overlay')).not.toBeNull();

    translator.disable();

    expect(document.getElementById('lexibridge-video-subtitle-overlay')).toBeNull();
    expect(track.mode).toBe('showing');
    expect(track.removeEventListener).toHaveBeenCalledWith('cuechange', expect.any(Function));
  });

  it('keeps the mode active while scanning if the current page has no caption track', () => {
    mockVideoTracks([]);

    const state = translator.enable(async (text: string) => `Translated: ${text}`);

    expect(state).toEqual({
      isActive: true,
      hasTrack: false,
      message: 'No caption track found'
    });
    expect(document.getElementById('lexibridge-video-subtitle-overlay')?.textContent).toBe('No caption track found');
  });

  it('exports translated subtitle cues as SRT after manual subtitle translation', async () => {
    document.title = 'Sample / Video';
    const track = createTextTrack('showing');
    mockVideoTracks([track]);
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    track.setActiveCue('<i>Hello from captions.</i>', 1.234, 3.5);
    track.fireCueChange();
    await flushPromises();

    const exported = translator.exportSubtitles();

    expect(exported.cueCount).toBe(1);
    expect(exported.filename).toBe('Sample-Video-lexibridge.srt');
    expect(exported.content).toContain('1');
    expect(exported.content).toContain('00:00:01,234 --> 00:00:03,500');
    expect(exported.content).toContain('Hello from captions.');
    expect(exported.content).toContain('Translated: Hello from captions.');
  });

  it('reports an empty export before any subtitle cue is translated', () => {
    const exported = translator.exportSubtitles();

    expect(exported).toEqual({
      cueCount: 0,
      filename: expect.stringMatching(/lexibridge\.srt$/),
      content: '',
      message: 'No translated subtitles to export yet'
    });
  });
});
