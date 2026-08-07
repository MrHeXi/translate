import {
  VIDEO_SITE_ADAPTER_SCHEMA_VERSION,
  resolveVideoSiteContext,
} from '../VideoSiteAdapterRegistry';

describe('VideoSiteAdapterRegistry', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  it('resolves a standard YouTube watch URL with Adapter@1 metadata', () => {
    const context = resolveVideoSiteContext('https://www.youtube.com/watch?v=video-123&t=90&list=queue');

    expect(VIDEO_SITE_ADAPTER_SCHEMA_VERSION).toBe(1);
    expect(context).toMatchObject({
      adapterId: 'youtube',
      adapterVersion: 1,
      siteLabel: 'YouTube',
      pageType: 'standard',
      navigationKey: 'youtube:video-123',
      canGenerateFromTab: true,
    });
  });

  it('resolves explicit and marked YouTube live pages', () => {
    expect(resolveVideoSiteContext('https://youtube.com/live/live-456?feature=share').pageType)
      .toBe('live');

    document.body.innerHTML = '<div id="movie_player"><span class="ytp-live-badge"></span></div>';
    expect(resolveVideoSiteContext('https://youtube.com/watch?v=live-watch', document)).toMatchObject({
      pageType: 'live',
      navigationKey: 'youtube:live-watch',
    });

    document.body.innerHTML = '<span class="ytp-live-badge" hidden></span>'
      + '<main data-lexibridge-youtube-live="true"></main>';
    expect(resolveVideoSiteContext('https://youtube.com/watch?v=marked-live', document).pageType)
      .toBe('live');
  });

  it('does not treat a hidden YouTube live badge as live', () => {
    document.body.innerHTML = '<div style="display: none"><span class="ytp-live-badge"></span></div>';

    expect(resolveVideoSiteContext('https://youtube.com/watch?v=recording', document).pageType)
      .toBe('standard');
  });

  it('resolves YouTube Shorts and prioritizes active Shorts selectors', () => {
    const context = resolveVideoSiteContext('https://www.youtube.com/shorts/short-789?si=ignored');

    expect(context).toMatchObject({
      adapterId: 'youtube',
      adapterVersion: 1,
      pageType: 'shorts',
      navigationKey: 'youtube:short-789',
    });
    expect(context.videoSelectors[0]).toContain('ytd-reel-video-renderer[is-active]');
    expect(context.videoSelectors[0]).toContain('#movie_player');
    expect(context.playerSelectors[0]).toBe('ytd-reel-video-renderer[is-active] #movie_player');
    expect(context.captionRootSelectors[0]).toContain('ytd-reel-video-renderer[is-active]');
    expect(context.captionSegmentSelectors[0]).toContain('ytd-reel-video-renderer[is-active]');
    expect(context.playerSelectors.indexOf('#movie_player')).toBeGreaterThan(0);
  });

  it('resolves youtu.be links to the same stable video identity', () => {
    const shortUrl = resolveVideoSiteContext('https://youtu.be/shared-id?t=12');
    const watchUrl = resolveVideoSiteContext('https://youtube.com/watch?v=shared-id&feature=share');

    expect(shortUrl).toMatchObject({
      adapterId: 'youtube',
      adapterVersion: 1,
      pageType: 'standard',
      navigationKey: 'youtube:shared-id',
    });
    expect(shortUrl.navigationKey).toBe(watchUrl.navigationKey);
  });

  it('keeps navigation keys stable across ordinary query and hash changes', () => {
    const first = resolveVideoSiteContext('https://youtube.com/watch?v=stable-id&t=1#one');
    const second = resolveVideoSiteContext('https://youtube.com/watch?list=abc&v=stable-id&t=999#two');
    const liveFirst = resolveVideoSiteContext('https://youtube.com/live/live-id?feature=share');
    const liveSecond = resolveVideoSiteContext('https://youtube.com/live/live-id?si=other#chat');

    expect(first.navigationKey).toBe(second.navigationKey);
    expect(liveFirst.navigationKey).toBe(liveSecond.navigationKey);
  });

  it('returns Generic Adapter@1 for non-YouTube URLs', () => {
    const context = resolveVideoSiteContext(new URL('https://media.example/video/episode-1?autoplay=1#player'));
    const changedQuery = resolveVideoSiteContext('https://media.example/video/episode-1?quality=high');

    expect(context).toMatchObject({
      adapterId: 'generic',
      adapterVersion: 1,
      siteLabel: 'Generic video',
      pageType: 'generic',
      navigationKey: 'generic:media.example/video/episode-1',
      canGenerateFromTab: true,
    });
    expect(context.videoSelectors).toContain('video');
    expect(context.playerSelectors.length).toBeGreaterThan(0);
    expect(context.captionRootSelectors.length).toBeGreaterThan(0);
    expect(context.captionSegmentSelectors.length).toBeGreaterThan(0);
    expect(changedQuery.navigationKey).toBe(context.navigationKey);
  });

  it('parses site context without writing to the supplied document', () => {
    document.body.innerHTML = '<div id="movie_player"><span class="ytp-live-badge"></span></div>';
    const before = document.documentElement.outerHTML;
    const appendSpy = jest.spyOn(Node.prototype, 'appendChild');
    const setAttributeSpy = jest.spyOn(Element.prototype, 'setAttribute');
    const removeAttributeSpy = jest.spyOn(Element.prototype, 'removeAttribute');

    const context = resolveVideoSiteContext('https://youtube.com/watch?v=no-write', document);

    expect(context.pageType).toBe('live');
    expect(document.documentElement.outerHTML).toBe(before);
    expect(appendSpy).not.toHaveBeenCalled();
    expect(setAttributeSpy).not.toHaveBeenCalled();
    expect(removeAttributeSpy).not.toHaveBeenCalled();

    appendSpy.mockRestore();
    setAttributeSpy.mockRestore();
    removeAttributeSpy.mockRestore();
  });
});
