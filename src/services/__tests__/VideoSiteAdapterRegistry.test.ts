import {
  createVideoNavigationToken,
  VIDEO_SITE_ADAPTER_SCHEMA_VERSION,
  resolveVideoSiteContext,
} from '../VideoSiteAdapterRegistry';

const GENERIC_SELECTOR_SUFFIXES = {
  videoSelectors: ['video'],
  playerSelectors: [
    '[data-video-player]',
    '.video-player',
    '[class*="video-player"]',
  ],
  captionRootSelectors: [
    '[data-testid="captions-container"]',
    '[aria-live="polite"][class*="caption"]',
    '[class*="subtitle"]',
    '[class*="caption"]',
  ],
  captionSegmentSelectors: [
    '[data-testid="caption-segment"]',
    '[class*="subtitle"] span',
    '[class*="caption"] span',
  ],
} as const;

const DEDICATED_ADAPTER_CASES = [
  {
    adapterId: 'twitch',
    siteLabel: 'Twitch',
    primaryUrl: 'https://twitch.tv/videos/2480012345?t=1h2m#chat',
    subdomainUrl: 'https://www.twitch.tv/videos/2480012345?filter=archives',
    stableUrl: 'https://m.twitch.tv/videos/2480012345?collection=ignored#theatre',
    changedIdentityUrl: 'https://www.twitch.tv/videos/2480098765',
    expectedKey: 'twitch:video:2480012345',
    maliciousUrls: [
      'https://twitch.tv.evil.example/videos/2480012345',
      'https://faketwitch.tv/videos/2480012345',
    ],
  },
  {
    adapterId: 'dailymotion',
    siteLabel: 'Dailymotion',
    primaryUrl: 'https://dailymotion.com/video/x9abcde?playlist=x1#player',
    subdomainUrl: 'https://geo.dailymotion.com/player.html?video=x9abcde&mute=true',
    stableUrl: 'https://www.dailymotion.com/video/x9abcde?autoplay=1#comments',
    changedIdentityUrl: 'https://www.dailymotion.com/video/x8vwxyz',
    expectedKey: 'dailymotion:video:x9abcde',
    maliciousUrls: [
      'https://dailymotion.com.evil.example/video/x9abcde',
      'https://notdailymotion.com/video/x9abcde',
    ],
  },
  {
    adapterId: 'ted',
    siteLabel: 'TED',
    primaryUrl: 'https://ted.com/talks/example_speaker_a_better_future?language=en#video',
    subdomainUrl: 'https://embed.ted.com/talks/example_speaker_a_better_future?autoplay=true',
    stableUrl: 'https://www.ted.com/talks/example_speaker_a_better_future?subtitle=zh#transcript',
    changedIdentityUrl: 'https://www.ted.com/talks/another_speaker_a_different_talk',
    expectedKey: 'ted:video:example_speaker_a_better_future',
    maliciousUrls: [
      'https://ted.com.evil.example/talks/example_speaker_a_better_future',
      'https://notreallyted.com/talks/example_speaker_a_better_future',
    ],
  },
  {
    adapterId: 'prime-video',
    siteLabel: 'Prime Video',
    primaryUrl: 'https://primevideo.com/detail/0ABCDEF123456789?autoplay=1#player',
    subdomainUrl: 'https://www.primevideo.com/detail/0ABCDEF123456789?ref_=atv_dp',
    stableUrl: 'https://www.primevideo.com/region/us/detail/0ABCDEF123456789?language=zh#episodes',
    changedIdentityUrl: 'https://www.primevideo.com/detail/0ZYXWVU987654321',
    expectedKey: 'prime-video:video:0ABCDEF123456789',
    maliciousUrls: [
      'https://primevideo.com.evil.example/detail/0ABCDEF123456789',
      'https://fakeprimevideo.com/detail/0ABCDEF123456789',
    ],
  },
  {
    adapterId: 'netflix',
    siteLabel: 'Netflix',
    primaryUrl: 'https://netflix.com/watch/80100172?trackId=one#player',
    subdomainUrl: 'https://www.netflix.com/watch/80100172?trackId=two',
    stableUrl: 'https://www.netflix.com/watch/80100172?audio=zh#controls',
    changedIdentityUrl: 'https://www.netflix.com/watch/80200273',
    expectedKey: 'netflix:watch:80100172',
    maliciousUrls: [
      'https://netflix.com.evil.example/watch/80100172',
      'https://notnetflix.com/watch/80100172',
    ],
  },
  {
    adapterId: 'vimeo',
    siteLabel: 'Vimeo',
    primaryUrl: 'https://vimeo.com/123456789?autoplay=1#clip',
    subdomainUrl: 'https://player.vimeo.com/video/123456789?quality=auto',
    stableUrl: 'https://vimeo.com/123456789?share=copy#comments',
    changedIdentityUrl: 'https://player.vimeo.com/video/987654321',
    expectedKey: 'vimeo:video:123456789',
    maliciousUrls: [
      'https://vimeo.com.evil.example/123456789',
      'https://fakevimeo.com/123456789',
    ],
  },
  {
    adapterId: 'bilibili',
    siteLabel: 'Bilibili',
    primaryUrl: 'https://bilibili.com/video/BV1Ab411c7De?p=1#reply',
    subdomainUrl: 'https://www.bilibili.com/video/BV1Ab411c7De?p=2',
    stableUrl: 'https://www.bilibili.com/video/BV1Ab411c7De?spm_id_from=333',
    changedIdentityUrl: 'https://www.bilibili.com/video/BV9Xy411c7Fg',
    expectedKey: 'bilibili:video:BV1Ab411c7De',
    maliciousUrls: [
      'https://bilibili.com.evil.example/video/BV1Ab411c7De',
      'https://notbilibili.com/video/BV1Ab411c7De',
    ],
  },
  {
    adapterId: 'udemy',
    siteLabel: 'Udemy',
    primaryUrl: 'https://udemy.com/course/typescript/learn/lecture/101010?start=15#overview',
    subdomainUrl: 'https://www.udemy.com/course/typescript/learn/lecture/101010?start=60',
    stableUrl: 'https://www.udemy.com/course/typescript/learn/lecture/101010?coupon=none#notes',
    changedIdentityUrl: 'https://www.udemy.com/course/typescript/learn/lecture/202020',
    expectedKey: 'udemy:course:typescript:lecture:101010',
    maliciousUrls: [
      'https://udemy.com.evil.example/course/typescript/learn/lecture/101010',
      'https://myudemy.com/course/typescript/learn/lecture/101010',
    ],
  },
  {
    adapterId: 'coursera',
    siteLabel: 'Coursera',
    primaryUrl: 'https://coursera.org/learn/machine-learning/lecture/abc123/topic?utm=one#transcript',
    subdomainUrl: 'https://www.coursera.org/learn/machine-learning/lecture/abc123/topic?utm=two',
    stableUrl: 'https://www.coursera.org/learn/machine-learning/lecture/abc123/topic?subtitle=en#notes',
    changedIdentityUrl: 'https://www.coursera.org/learn/machine-learning/lecture/xyz987/topic',
    expectedKey: 'coursera:course:machine-learning:lecture:abc123',
    maliciousUrls: [
      'https://coursera.org.evil.example/learn/machine-learning/lecture/abc123/topic',
      'https://fakecoursera.org/learn/machine-learning/lecture/abc123/topic',
    ],
  },
  {
    adapterId: 'khan-academy',
    siteLabel: 'Khan Academy',
    primaryUrl: 'https://khanacademy.org/math/algebra/x/v/linear-equations?lang=en#practice',
    subdomainUrl: 'https://www.khanacademy.org/math/algebra/x/v/linear-equations?lang=zh',
    stableUrl: 'https://www.khanacademy.org/math/algebra/x/v/linear-equations?modal=1#transcript',
    changedIdentityUrl: 'https://www.khanacademy.org/math/algebra/x/v/quadratic-equations',
    expectedKey: 'khan-academy:video:linear-equations',
    maliciousUrls: [
      'https://khanacademy.org.evil.example/math/algebra/x/v/linear-equations',
      'https://notkhanacademy.org/math/algebra/x/v/linear-equations',
    ],
  },
  {
    adapterId: 'nebula',
    siteLabel: 'Nebula',
    primaryUrl: 'https://nebula.tv/videos/creator-video-slug?autoplay=1#player',
    subdomainUrl: 'https://www.nebula.tv/videos/creator-video-slug?quality=auto',
    stableUrl: 'https://nebula.tv/videos/creator-video-slug?share=copy#comments',
    changedIdentityUrl: 'https://nebula.tv/videos/another-creator-video',
    expectedKey: 'nebula:video:creator-video-slug',
    maliciousUrls: [
      'https://nebula.tv.evil.example/videos/creator-video-slug',
      'https://notnebula.tv/videos/creator-video-slug',
    ],
  },
  {
    adapterId: 'bloomberg',
    siteLabel: 'Bloomberg',
    primaryUrl: 'https://www.bloomberg.com/news/videos/2026-05-06/example-market-video?srnd=markets#player',
    subdomainUrl: 'https://www.bloomberg.com/news/videos/2026-05-06/example-market-video?utm_source=feed',
    stableUrl: 'https://www.bloomberg.com/news/videos/2026-05-06/example-market-video?cmpid=social#comments',
    changedIdentityUrl: 'https://www.bloomberg.com/news/videos/2026-05-07/another-market-video',
    expectedKey: 'bloomberg:path:news/videos/2026-05-06/example-market-video',
    maliciousUrls: [
      'https://bloomberg.com.evil.example/news/videos/2026-05-06/example-market-video',
      'https://notbloomberg.com/news/videos/2026-05-06/example-market-video',
    ],
  },
] as const;

const SELECTOR_CONTRACT_CASES: Array<[string, string]> = [
  ['YouTube', 'https://www.youtube.com/watch?v=selector-contract'],
  ...DEDICATED_ADAPTER_CASES.map(({ siteLabel, primaryUrl }): [string, string] => (
    [siteLabel, primaryUrl]
  )),
];

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
    expect(createVideoNavigationToken(first.navigationKey))
      .toBe(createVideoNavigationToken(second.navigationKey));
    expect(createVideoNavigationToken(first.navigationKey))
      .not.toBe(createVideoNavigationToken(liveFirst.navigationKey));
    expect(createVideoNavigationToken(first.navigationKey)).toMatch(/^v1:[0-9a-f]{8}:\d+$/);
  });

  it.each(DEDICATED_ADAPTER_CASES)(
    'resolves $siteLabel on the main domain and a true subdomain',
    ({ adapterId, siteLabel, primaryUrl, subdomainUrl, expectedKey }) => {
      const primary = resolveVideoSiteContext(primaryUrl);
      const subdomain = resolveVideoSiteContext(subdomainUrl);

      expect(primary).toMatchObject({
        adapterId,
        adapterVersion: 1,
        siteLabel,
        pageType: 'standard',
        navigationKey: expectedKey,
        canGenerateFromTab: true,
      });
      expect(subdomain).toMatchObject({
        adapterId,
        siteLabel,
        navigationKey: expectedKey,
      });
    },
  );

  it('distinguishes Twitch video, clip, channel, and path navigation identities', () => {
    expect(resolveVideoSiteContext('https://www.twitch.tv/videos/2480012345').navigationKey)
      .toBe('twitch:video:2480012345');
    expect(resolveVideoSiteContext('https://clips.twitch.tv/DistinctClipSlug').navigationKey)
      .toBe('twitch:clip:DistinctClipSlug');
    expect(resolveVideoSiteContext('https://www.twitch.tv/ExampleStreamer').navigationKey)
      .toBe('twitch:channel:examplestreamer');
    expect(resolveVideoSiteContext('https://www.twitch.tv/directory/category/science-tech').navigationKey)
      .toBe('twitch:path:directory/category/science-tech');
  });

  it('distinguishes Dailymotion and TED video, channel, and ordinary paths', () => {
    expect(resolveVideoSiteContext('https://www.dailymotion.com/video/x9abcde').navigationKey)
      .toBe('dailymotion:video:x9abcde');
    expect(resolveVideoSiteContext('https://www.dailymotion.com/user/NewsChannel').navigationKey)
      .toBe('dailymotion:channel:newschannel');
    expect(resolveVideoSiteContext('https://www.dailymotion.com/playlist/x123').navigationKey)
      .toBe('dailymotion:path:playlist/x123');

    expect(resolveVideoSiteContext('https://www.ted.com/talks/example_talk').navigationKey)
      .toBe('ted:video:example_talk');
    expect(resolveVideoSiteContext('https://www.ted.com/speakers/example_speaker').navigationKey)
      .toBe('ted:channel:example_speaker');
    expect(resolveVideoSiteContext('https://www.ted.com/series/example_series').navigationKey)
      .toBe('ted:path:series/example_series');
  });

  it('distinguishes Prime Video detail, storefront, and ordinary path identities', () => {
    expect(resolveVideoSiteContext('https://www.primevideo.com/detail/0ABCDEF123456789').navigationKey)
      .toBe('prime-video:video:0ABCDEF123456789');
    expect(resolveVideoSiteContext('https://www.primevideo.com/storefront/kids').navigationKey)
      .toBe('prime-video:channel:kids');
    expect(resolveVideoSiteContext('https://www.primevideo.com/search/ref=atv_nb_sr?phrase=test').navigationKey)
      .toBe('prime-video:path:search/ref=atv_nb_sr');
  });

  it.each(DEDICATED_ADAPTER_CASES)(
    'keeps $siteLabel keys stable for ordinary URL state and changes them for content identity',
    ({ primaryUrl, stableUrl, changedIdentityUrl }) => {
      const initial = resolveVideoSiteContext(primaryUrl);
      const stable = resolveVideoSiteContext(stableUrl);
      const changed = resolveVideoSiteContext(changedIdentityUrl);

      expect(stable.navigationKey).toBe(initial.navigationKey);
      expect(changed.navigationKey).not.toBe(initial.navigationKey);
      expect(createVideoNavigationToken(stable.navigationKey))
        .toBe(createVideoNavigationToken(initial.navigationKey));
      expect(createVideoNavigationToken(changed.navigationKey))
        .not.toBe(createVideoNavigationToken(initial.navigationKey));
    },
  );

  it.each(DEDICATED_ADAPTER_CASES)(
    'rejects malicious lookalike domains for $siteLabel',
    ({ maliciousUrls }) => {
      maliciousUrls.forEach((url) => {
        expect(resolveVideoSiteContext(url).adapterId).toBe('generic');
      });
    },
  );

  it.each(DEDICATED_ADAPTER_CASES)(
    'resolves $siteLabel without writing to the supplied document',
    ({ adapterId, primaryUrl }) => {
      document.body.innerHTML = '<main data-existing="true"><video></video></main>';
      const before = document.documentElement.outerHTML;
      const appendSpy = jest.spyOn(Node.prototype, 'appendChild');
      const setAttributeSpy = jest.spyOn(Element.prototype, 'setAttribute');
      const removeAttributeSpy = jest.spyOn(Element.prototype, 'removeAttribute');

      try {
        expect(resolveVideoSiteContext(primaryUrl, document).adapterId).toBe(adapterId);
        expect(document.documentElement.outerHTML).toBe(before);
        expect(appendSpy).not.toHaveBeenCalled();
        expect(setAttributeSpy).not.toHaveBeenCalled();
        expect(removeAttributeSpy).not.toHaveBeenCalled();
      } finally {
        appendSpy.mockRestore();
        setAttributeSpy.mockRestore();
        removeAttributeSpy.mockRestore();
      }
    },
  );

  it.each(SELECTOR_CONTRACT_CASES)(
    'keeps valid site-first selectors and generic fallbacks for %s',
    (_siteLabel, url) => {
      const context = resolveVideoSiteContext(url);

      (Object.keys(GENERIC_SELECTOR_SUFFIXES) as Array<keyof typeof GENERIC_SELECTOR_SUFFIXES>)
        .forEach((selectorGroup) => {
          const selectors = context[selectorGroup];
          const expectedSuffix = GENERIC_SELECTOR_SUFFIXES[selectorGroup];

          expect(selectors.length).toBeGreaterThan(expectedSuffix.length);
          expect(selectors.slice(-expectedSuffix.length)).toEqual(expectedSuffix);
          expect(selectors[0]).not.toBe(expectedSuffix[0]);
          selectors.forEach((selector) => {
            expect(() => document.querySelectorAll(selector)).not.toThrow();
          });
        });
    },
  );

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

  it('loads the registry module without DOM listeners or extension runtime actions', () => {
    const listenerSpy = jest.spyOn(EventTarget.prototype, 'addEventListener');
    const observeSpy = jest.spyOn(MutationObserver.prototype, 'observe');
    const sendMessageSpy = jest.spyOn(chrome.runtime, 'sendMessage');

    try {
      jest.isolateModules(() => {
        require('../VideoSiteAdapterRegistry');
      });

      expect(listenerSpy).not.toHaveBeenCalled();
      expect(observeSpy).not.toHaveBeenCalled();
      expect(sendMessageSpy).not.toHaveBeenCalled();
    } finally {
      listenerSpy.mockRestore();
      observeSpy.mockRestore();
      sendMessageSpy.mockRestore();
    }
  });
});
