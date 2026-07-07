import { VideoSubtitleTranslator } from '../components/VideoSubtitleTranslator';

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

type TestTrack = TextTrack & {
  setActiveText: (text: string) => void;
  fireCueChange: () => void;
};

const createTextTrack = (initialMode: TextTrackMode = 'showing'): TestTrack => {
  let cueChangeListener: (() => void) | null = null;

  const track = {
    kind: 'subtitles' as TextTrackKind,
    mode: initialMode,
    activeCues: [] as Array<{ text: string }>,
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
});
