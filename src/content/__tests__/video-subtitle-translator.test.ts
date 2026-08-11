import { VideoSubtitleTranslator } from '../components/VideoSubtitleTranslator';
import * as videoSiteRegistry from '../../services/VideoSiteAdapterRegistry';

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

const createYouTubeLiveContext = () => ({
  adapterId: 'youtube',
  adapterVersion: 1,
  siteLabel: 'YouTube',
  pageType: 'live' as const,
  navigationKey: 'youtube:live:stream-1',
  videoSelectors: ['#movie_player video', 'video'],
  playerSelectors: ['#movie_player'],
  captionRootSelectors: ['.ytp-caption-window-container'],
  captionSegmentSelectors: ['.ytp-caption-segment'],
  canGenerateFromTab: true
});

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

  it('loads generated cues only after an explicit apply and never starts playback', () => {
    document.body.innerHTML = '<video id="source-video" src="lecture.mp4"></video>';
    const video = document.getElementById('source-video') as HTMLVideoElement;
    let currentTime = 0;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: value => { currentTime = value; }
    });
    const play = jest.spyOn(video, 'play').mockResolvedValue(undefined);

    expect(document.getElementById('lexibridge-generated-video-subtitle-overlay')).toBeNull();

    const result = translator.applyGeneratedVideoSubtitles([{
      start: 1,
      end: 3,
      originalText: '<b>Generated source</b>',
      translatedText: 'Generated translation'
    }]);

    expect(result).toEqual({
      success: true,
      cueCount: 1,
      message: 'Applied 1 generated subtitle cue'
    });
    expect(play).not.toHaveBeenCalled();
    const overlay = document.getElementById('lexibridge-generated-video-subtitle-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('none');

    currentTime = 1.5;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.textContent).toContain('<b>Generated source</b>');
    expect(overlay.querySelector('b')).toBeNull();
    expect(overlay.textContent).toContain('Generated translation');
    expect(overlay.style.display).toBe('block');

    currentTime = 3;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.textContent).toBe('');
    expect(overlay.style.display).toBe('none');
  });

  it('rejects malformed generated cues before binding to a video', () => {
    document.body.innerHTML = '<video></video>';
    const video = document.querySelector('video') as HTMLVideoElement;
    const addEventListener = jest.spyOn(video, 'addEventListener');

    expect(translator.applyGeneratedVideoSubtitles([{
      start: 2,
      end: 1,
      originalText: 'Invalid timing',
      translatedText: ''
    }])).toEqual({
      success: false,
      cueCount: 0,
      message: 'Generated subtitles are invalid or empty'
    });
    expect(addEventListener).not.toHaveBeenCalled();
    expect(document.getElementById('lexibridge-generated-video-subtitle-overlay')).toBeNull();
  });

  it('rejects generated cues when the originating video identity changed', () => {
    document.body.innerHTML = '<video id="source-video" src="lecture.mp4"></video>';
    const video = document.getElementById('source-video') as HTMLVideoElement;
    const addEventListener = jest.spyOn(video, 'addEventListener');

    expect(translator.applyGeneratedVideoSubtitles([{
      start: 0,
      end: 2,
      originalText: 'Caption from the previous video',
      translatedText: 'Previous translation'
    }], 'v1:00000000:0')).toEqual({
      success: false,
      cueCount: 0,
      message: 'Source video changed; generate captions again'
    });
    expect(addEventListener).not.toHaveBeenCalled();
    expect(document.getElementById('lexibridge-generated-video-subtitle-overlay')).toBeNull();
  });

  it('replaces generated subtitle bindings and clears them immediately', () => {
    document.body.innerHTML = '<video id="source-video" src="lecture.mp4"></video>';
    const video = document.getElementById('source-video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 1, writable: true });
    const nativeTrack = { mode: 'showing' };
    Object.defineProperty(video, 'textTracks', { configurable: true, value: [nativeTrack] });
    const addEventListener = jest.spyOn(video, 'addEventListener');
    const removeEventListener = jest.spyOn(video, 'removeEventListener');
    const cue = {
      start: 0,
      end: 2,
      originalText: 'First source',
      translatedText: 'First translation'
    };

    translator.applyGeneratedVideoSubtitles([cue]);
    const firstOverlay = document.getElementById('lexibridge-generated-video-subtitle-overlay');
    translator.applyGeneratedVideoSubtitles([{
      ...cue,
      originalText: 'Replacement source'
    }]);

    expect(firstOverlay?.isConnected).toBe(false);
    expect(addEventListener).toHaveBeenCalledTimes(8);
    expect(removeEventListener).toHaveBeenCalledTimes(4);
    expect(document.getElementById('lexibridge-generated-video-subtitle-overlay')?.textContent)
      .toContain('Replacement source');

    expect(translator.clearGeneratedVideoSubtitles()).toEqual({
      success: true,
      cueCount: 0,
      message: 'Generated video subtitles cleared'
    });
    expect(removeEventListener).toHaveBeenCalledTimes(8);
    expect(document.getElementById('lexibridge-generated-video-subtitle-overlay')).toBeNull();
    expect(nativeTrack.mode).toBe('showing');
  });

  it('keeps generated playback and live subtitle translation mutually exclusive', () => {
    document.body.innerHTML = '<video id="source-video" src="lecture.mp4"></video>';
    const video = document.getElementById('source-video') as HTMLVideoElement;
    const track = createTextTrack('showing');
    Object.defineProperty(video, 'textTracks', { configurable: true, value: [track] });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 1, writable: true });

    translator.enable(async text => `Translated: ${text}`);
    expect(track.mode).toBe('hidden');
    expect(document.getElementById('lexibridge-video-subtitle-overlay')).not.toBeNull();

    translator.applyGeneratedVideoSubtitles([{
      start: 0,
      end: 2,
      originalText: 'Generated source',
      translatedText: 'Generated translation'
    }]);
    expect(translator.getStatus().isActive).toBe(false);
    expect(track.mode).toBe('showing');
    expect(document.getElementById('lexibridge-video-subtitle-overlay')).toBeNull();
    expect(document.getElementById('lexibridge-generated-video-subtitle-overlay')).not.toBeNull();

    translator.enable(async text => `Translated again: ${text}`);
    expect(document.getElementById('lexibridge-generated-video-subtitle-overlay')).toBeNull();
    expect(document.getElementById('lexibridge-video-subtitle-overlay')).not.toBeNull();
    expect(track.mode).toBe('hidden');
  });

  it('clears generated subtitles when the source page changes', () => {
    const originalUrl = window.location.href;
    document.body.innerHTML = '<video id="source-video" src="lecture.mp4"></video>';
    const video = document.getElementById('source-video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 1, writable: true });

    try {
      translator.applyGeneratedVideoSubtitles([{
        start: 0,
        end: 2,
        originalText: 'Old page source',
        translatedText: 'Old page translation'
      }]);
      expect(document.getElementById('lexibridge-generated-video-subtitle-overlay')).not.toBeNull();

      window.history.pushState({}, '', '/another-video');
      video.dispatchEvent(new Event('timeupdate'));

      expect(document.getElementById('lexibridge-generated-video-subtitle-overlay')).toBeNull();
      expect(translator.clearGeneratedVideoSubtitles().message)
        .toBe('No generated video subtitles to clear');
    } finally {
      window.history.replaceState({}, '', originalUrl);
    }
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

    expect(state).toEqual(expect.objectContaining({
      isActive: true,
      hasTrack: true,
      message: 'Video subtitle translation started'
    }));
    expect(track.mode).toBe('hidden');
    expect(track.addEventListener).toHaveBeenCalledWith('cuechange', expect.any(Function));

    track.setActiveText('<i>Hello from captions.</i>');
    track.fireCueChange();
    await flushPromises();

    const overlay = document.getElementById('lexibridge-video-subtitle-overlay');
    expect(translateText).toHaveBeenCalledWith('Hello from captions.', expect.any(Object));
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

    expect(state).toEqual(expect.objectContaining({
      isActive: true,
      hasTrack: true,
      message: 'Video subtitle translation started'
    }));
    expect(translateText).toHaveBeenCalledWith('Hello from DOM captions.', expect.any(Object));
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

    expect(state).toEqual(expect.objectContaining({
      isActive: true,
      hasTrack: false,
      message: 'No caption track found'
    }));
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

    track.setActiveCue('<i>Hello from captions.</i>', 4, 5.25);
    track.fireCueChange();
    await flushPromises();

    const exported = translator.exportSubtitles();

    expect(exported.cueCount).toBe(2);
    expect(exported.filename).toBe('Sample-Video-lexibridge.srt');
    expect(exported.content).toContain('1');
    expect(exported.content).toContain('00:00:01,234 --> 00:00:03,500');
    expect(exported.content).toContain('00:00:04,000 --> 00:00:05,250');
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

  it('records a stable DOM caption only once across repeated scans', async () => {
    jest.useFakeTimers();
    document.body.innerHTML = [
      '<video></video>',
      '<div class="ytp-caption-window-container">',
      '<span class="ytp-caption-segment">One stable caption.</span>',
      '</div>'
    ].join('');
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { value: 8, configurable: true });
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    try {
      translator.enable(translateText);
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(1600);
      await Promise.resolve();
      await Promise.resolve();

      expect(translateText).toHaveBeenCalledTimes(1);
      expect(translator.exportSubtitles().cueCount).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('waits for a YouTube Live DOM cue to settle before translating its final text', async () => {
    jest.useFakeTimers();
    jest.spyOn(videoSiteRegistry, 'resolveVideoSiteContext').mockReturnValue(createYouTubeLiveContext());
    document.body.innerHTML = [
      '<div id="movie_player">',
      '<video></video>',
      '<div class="ytp-caption-window-container">',
      '<span class="ytp-caption-segment">Hello</span>',
      '</div>',
      '</div>'
    ].join('');
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { value: 10, configurable: true });
    const segment = document.querySelector('.ytp-caption-segment') as HTMLElement;
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    try {
      translator.enable(translateText);
      expect(translateText).not.toHaveBeenCalled();

      segment.textContent = 'Hello world';
      (translator as any).scanForSubtitleSource();
      jest.advanceTimersByTime(699);
      expect(translateText).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();

      expect(translateText).toHaveBeenCalledTimes(1);
      expect(translateText).toHaveBeenCalledWith('Hello world', expect.any(Object));
      expect(translator.exportSubtitles().content).toContain('Translated: Hello world');
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels a pending YouTube Live cue immediately when subtitle translation stops', async () => {
    jest.useFakeTimers();
    jest.spyOn(videoSiteRegistry, 'resolveVideoSiteContext').mockReturnValue(createYouTubeLiveContext());
    document.body.innerHTML = [
      '<div id="movie_player"><video></video>',
      '<div class="ytp-caption-window-container">',
      '<span class="ytp-caption-segment">This cue must not be sent.</span>',
      '</div></div>'
    ].join('');
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    try {
      translator.enable(translateText);
      translator.disable();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(translateText).not.toHaveBeenCalled();
      expect(document.getElementById('lexibridge-video-subtitle-overlay')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('aborts an in-flight YouTube Live translation when the cue grows', async () => {
    jest.useFakeTimers();
    jest.spyOn(videoSiteRegistry, 'resolveVideoSiteContext').mockReturnValue(createYouTubeLiveContext());
    document.body.innerHTML = [
      '<div id="movie_player"><video></video>',
      '<div class="ytp-caption-window-container">',
      '<span class="ytp-caption-segment">Breaking</span>',
      '</div></div>'
    ].join('');
    const segment = document.querySelector('.ytp-caption-segment') as HTMLElement;
    let resolveFirst!: (value: string) => void;
    const firstResult = new Promise<string>(resolve => { resolveFirst = resolve; });
    const translateText = jest.fn()
      .mockImplementationOnce(() => firstResult)
      .mockResolvedValueOnce('Translated final live cue');

    try {
      translator.enable(translateText);
      jest.advanceTimersByTime(700);
      await Promise.resolve();
      expect(translateText).toHaveBeenCalledTimes(1);

      const firstSignal = translateText.mock.calls[0]![1].signal as AbortSignal;
      segment.textContent = 'Breaking news';
      (translator as any).scanForSubtitleSource();
      expect(firstSignal.aborted).toBe(true);

      jest.advanceTimersByTime(700);
      await Promise.resolve();
      await Promise.resolve();
      resolveFirst('Stale partial translation');
      await Promise.resolve();
      await Promise.resolve();

      const exported = translator.exportSubtitles();
      expect(translateText).toHaveBeenCalledTimes(2);
      expect(exported.cueCount).toBe(1);
      expect(exported.content).toContain('Translated final live cue');
      expect(exported.content).not.toContain('Stale partial translation');
    } finally {
      jest.useRealTimers();
    }
  });

  it('coalesces translated YouTube Live cue growth into one exported cue', async () => {
    jest.useFakeTimers();
    jest.spyOn(videoSiteRegistry, 'resolveVideoSiteContext').mockReturnValue(createYouTubeLiveContext());
    document.body.innerHTML = [
      '<div id="movie_player"><video></video>',
      '<div class="ytp-caption-window-container">',
      '<span class="ytp-caption-segment">Live</span>',
      '</div></div>'
    ].join('');
    const video = document.querySelector('video') as HTMLVideoElement;
    let currentTime = 20;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime
    });
    const segment = document.querySelector('.ytp-caption-segment') as HTMLElement;
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    try {
      translator.enable(translateText);
      jest.advanceTimersByTime(700);
      await Promise.resolve();
      await Promise.resolve();

      currentTime = 20.5;
      segment.textContent = 'Live update';
      (translator as any).scanForSubtitleSource();
      jest.advanceTimersByTime(700);
      await Promise.resolve();
      await Promise.resolve();

      const exported = translator.exportSubtitles();
      expect(translateText).toHaveBeenCalledTimes(2);
      expect(exported.cueCount).toBe(1);
      expect(exported.content).toContain('00:00:20,000 --> 00:00:22,500');
      expect(exported.content).toContain('Live update');
      expect(exported.content).toContain('Translated: Live update');
      expect(exported.content).not.toContain('\nLive\nTranslated: Live\n');
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a stale translation after Stop and a new Start', async () => {
    const track = createTextTrack('showing');
    mockVideoTracks([track]);
    let resolveFirst!: (value: string) => void;
    const firstResult = new Promise<string>(resolve => {
      resolveFirst = resolve;
    });
    const translateText = jest.fn()
      .mockImplementationOnce(() => firstResult)
      .mockResolvedValueOnce('New session translation');

    translator.enable(translateText);
    track.setActiveText('Session caption');
    track.fireCueChange();
    await Promise.resolve();

    translator.disable();
    expect(translateText.mock.calls[0]![1].signal.aborted).toBe(true);
    track.setActiveText('');
    translator.enable(translateText);
    track.setActiveText('Session caption');
    track.fireCueChange();
    await flushPromises();
    resolveFirst('Stale translation');
    await flushPromises();

    const exported = translator.exportSubtitles();
    expect(exported.cueCount).toBe(1);
    expect(exported.content).toContain('New session translation');
    expect(exported.content).not.toContain('Stale translation');
  });

  it('prefers the active Shorts video when multiple players are present', async () => {
    document.body.innerHTML = [
      '<video id="preloaded"></video>',
      '<ytd-reel-video-renderer is-active><video id="active"></video></ytd-reel-video-renderer>'
    ].join('');
    const preloadedTrack = createTextTrack('showing');
    const activeTrack = createTextTrack('showing');
    const preloadedVideo = document.getElementById('preloaded') as HTMLVideoElement;
    const activeVideo = document.getElementById('active') as HTMLVideoElement;
    Object.defineProperty(preloadedVideo, 'textTracks', { value: [preloadedTrack], configurable: true });
    Object.defineProperty(activeVideo, 'textTracks', { value: [activeTrack], configurable: true });
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    preloadedTrack.setActiveText('Wrong preloaded short');
    preloadedTrack.fireCueChange();
    activeTrack.setActiveText('Active short');
    activeTrack.fireCueChange();
    await flushPromises();

    expect(activeTrack.addEventListener).toHaveBeenCalledWith('cuechange', expect.any(Function));
    expect(preloadedTrack.addEventListener).not.toHaveBeenCalled();
    expect(translateText).toHaveBeenCalledWith('Active short', expect.any(Object));
  });

  it('reads the most specific DOM segments without parent-child duplication', async () => {
    document.body.innerHTML = [
      '<video></video>',
      '<div class="ytp-caption-window-container">',
      '<div><span class="ytp-caption-segment"><span>Hello</span> <span>world</span></span></div>',
      '</div>'
    ].join('');
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    await flushPromises();

    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translateText).toHaveBeenCalledWith('Hello world', expect.any(Object));
  });

  it('reads DOM captions only from the active YouTube Shorts player', async () => {
    const shortsContext = {
      adapterId: 'youtube', adapterVersion: 1, siteLabel: 'YouTube', pageType: 'shorts' as const,
      navigationKey: 'youtube:short-1', videoSelectors: ['ytd-reel-video-renderer[is-active] video', 'video'],
      playerSelectors: ['ytd-reel-video-renderer[is-active] #movie_player', '#movie_player'],
      captionRootSelectors: ['.ytp-caption-window-container'],
      captionSegmentSelectors: ['.ytp-caption-segment'], canGenerateFromTab: true
    };
    jest.spyOn(videoSiteRegistry, 'resolveVideoSiteContext').mockReturnValue(shortsContext);
    document.body.innerHTML = [
      '<ytd-reel-video-renderer aria-hidden="true"><div id="movie_player">',
      '<video></video><div class="ytp-caption-window-container"><span class="ytp-caption-segment">Inactive short</span></div>',
      '</div></ytd-reel-video-renderer>',
      '<ytd-reel-video-renderer is-active><div id="movie_player">',
      '<video></video><div class="ytp-caption-window-container"><span class="ytp-caption-segment">Active short</span></div>',
      '</div></ytd-reel-video-renderer>'
    ].join('');
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    translator.enable(translateText);
    await flushPromises();

    expect(translateText).toHaveBeenCalledTimes(1);
    expect(translateText).toHaveBeenCalledWith('Active short', expect.any(Object));
  });

  it('does not read dedicated-site caption-like text outside the active player', async () => {
    jest.spyOn(videoSiteRegistry, 'resolveVideoSiteContext').mockReturnValue({
      adapterId: 'netflix', adapterVersion: 1, siteLabel: 'Netflix', pageType: 'standard' as const,
      navigationKey: 'netflix:watch:80100172', videoSelectors: ['.watch-video video', 'video'],
      playerSelectors: ['.watch-video'], captionRootSelectors: ['.player-timedtext'],
      captionSegmentSelectors: ['.player-timedtext-text-container'], canGenerateFromTab: true
    });
    document.body.innerHTML = [
      '<div class="player-timedtext">',
      '<span class="player-timedtext-text-container">Unrelated page text</span>',
      '</div>',
      '<div class="watch-video"><video></video></div>'
    ].join('');
    const translateText = jest.fn(async (text: string) => `Translated: ${text}`);

    const state = translator.enable(translateText);
    await flushPromises();

    expect(state.hasTrack).toBe(false);
    expect(translateText).not.toHaveBeenCalled();
    expect(document.getElementById('lexibridge-video-subtitle-overlay')?.textContent)
      .toBe('No caption track found');
  });

  it('aborts an old track request before attaching a newly active track', async () => {
    document.body.innerHTML = '<video id="first"></video><video id="second"></video>';
    const firstVideo = document.getElementById('first') as HTMLVideoElement;
    const secondVideo = document.getElementById('second') as HTMLVideoElement;
    const firstTrack = createTextTrack('showing');
    const secondTrack = createTextTrack('showing');
    Object.defineProperty(firstVideo, 'textTracks', { value: [firstTrack], configurable: true });
    Object.defineProperty(secondVideo, 'textTracks', { value: [secondTrack], configurable: true });
    Object.defineProperty(firstVideo, 'paused', { value: false, configurable: true });
    Object.defineProperty(secondVideo, 'paused', { value: true, configurable: true });
    let resolveFirst!: (value: string) => void;
    const firstResult = new Promise<string>(resolve => { resolveFirst = resolve; });
    const translateText = jest.fn()
      .mockImplementationOnce(() => firstResult)
      .mockResolvedValueOnce('New track translation');

    translator.enable(translateText);
    firstTrack.setActiveCue('Repeated line', 1, 2);
    firstTrack.fireCueChange();
    await Promise.resolve();
    const firstSignal = translateText.mock.calls[0]![1].signal as AbortSignal;

    Object.defineProperty(firstVideo, 'paused', { value: true, configurable: true });
    Object.defineProperty(secondVideo, 'paused', { value: false, configurable: true });
    (translator as any).scanForSubtitleSource();
    expect(firstSignal.aborted).toBe(true);

    secondTrack.setActiveCue('Repeated line', 3, 4);
    secondTrack.fireCueChange();
    await flushPromises();
    resolveFirst('Stale track translation');
    await flushPromises();

    const exported = translator.exportSubtitles();
    expect(exported.cueCount).toBe(1);
    expect(exported.content).toContain('New track translation');
    expect(exported.content).not.toContain('Stale track translation');
  });

  it('stops before translating a cue from a new YouTube SPA video', async () => {
    translator.cleanup();
    const contexts = [
      {
        adapterId: 'youtube', adapterVersion: 1, siteLabel: 'YouTube', pageType: 'standard' as const,
        navigationKey: 'youtube:first', videoSelectors: ['video'], playerSelectors: [],
        captionRootSelectors: [], captionSegmentSelectors: [], canGenerateFromTab: true
      },
      {
        adapterId: 'youtube', adapterVersion: 1, siteLabel: 'YouTube', pageType: 'shorts' as const,
        navigationKey: 'youtube:second', videoSelectors: ['video'], playerSelectors: [],
        captionRootSelectors: [], captionSegmentSelectors: [], canGenerateFromTab: true
      }
    ];
    const resolveContext = jest.spyOn(videoSiteRegistry, 'resolveVideoSiteContext');
    resolveContext.mockReturnValue(contexts[0]);
    translator = new VideoSubtitleTranslator();
    const track = createTextTrack('showing');
    mockVideoTracks([track]);
    const translateText = jest.fn(async (text: string) => text);
    translator.enable(translateText);

    resolveContext.mockReturnValue(contexts[1]);
    track.setActiveCue('Cue from the next video', 1, 2);
    track.fireCueChange();
    await flushPromises();

    expect(translator.getStatus()).toEqual(expect.objectContaining({
      isActive: false,
      message: 'Video changed; start video subtitles again'
    }));
    expect(translateText).not.toHaveBeenCalled();
    expect(document.getElementById('lexibridge-video-subtitle-overlay')).toBeNull();
  });
});
