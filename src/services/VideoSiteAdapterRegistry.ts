export type VideoPageType = 'standard' | 'live' | 'shorts' | 'generic';

export interface VideoSiteContext {
  adapterId: string;
  adapterVersion: number;
  siteLabel: string;
  pageType: VideoPageType;
  navigationKey: string;
  videoSelectors: string[];
  playerSelectors: string[];
  captionRootSelectors: string[];
  captionSegmentSelectors: string[];
  canGenerateFromTab: boolean;
}

export const VIDEO_SITE_ADAPTER_SCHEMA_VERSION = 1;

export function createVideoNavigationToken(navigationKey: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < navigationKey.length; index++) {
    const codeUnit = navigationKey.charCodeAt(index);
    hash = Math.imul(hash ^ (codeUnit & 0xff), 0x01000193);
    hash = Math.imul(hash ^ (codeUnit >>> 8), 0x01000193);
  }
  return `v${VIDEO_SITE_ADAPTER_SCHEMA_VERSION}:${(hash >>> 0).toString(16).padStart(8, '0')}:${navigationKey.length}`;
}

const YOUTUBE_ADAPTER_ID = 'youtube';
const GENERIC_ADAPTER_ID = 'generic';
const ADAPTER_VERSION = 1;

const GENERIC_VIDEO_SELECTORS = ['video'];
const GENERIC_PLAYER_SELECTORS = [
  '[data-video-player]',
  '.video-player',
  '[class*="video-player"]',
];
const GENERIC_CAPTION_ROOT_SELECTORS = [
  '[data-testid="captions-container"]',
  '[aria-live="polite"][class*="caption"]',
  '[class*="subtitle"]',
  '[class*="caption"]',
];
const GENERIC_CAPTION_SEGMENT_SELECTORS = [
  '[data-testid="caption-segment"]',
  '[class*="subtitle"] span',
  '[class*="caption"] span',
];

function withGenericFallback(siteSelectors: string[], fallbackSelectors: string[]): string[] {
  const fallbackSet = new Set(fallbackSelectors);
  return [
    ...siteSelectors.filter((selector) => !fallbackSet.has(selector)),
    ...fallbackSelectors,
  ];
}

const YOUTUBE_VIDEO_SELECTORS = withGenericFallback([
  'ytd-reel-video-renderer[is-active] #movie_player video.html5-main-video',
  'ytd-reel-video-renderer[is-active] #movie_player video',
  'ytd-reel-video-renderer[is-active] video',
  '#movie_player video.html5-main-video',
  '#movie_player video',
  'video.html5-main-video',
], GENERIC_VIDEO_SELECTORS);

const YOUTUBE_PLAYER_SELECTORS = withGenericFallback([
  'ytd-reel-video-renderer[is-active] #movie_player',
  'ytd-reel-video-renderer[is-active]',
  '#movie_player',
  '.html5-video-player',
], GENERIC_PLAYER_SELECTORS);

const YOUTUBE_CAPTION_ROOT_SELECTORS = withGenericFallback([
  'ytd-reel-video-renderer[is-active] #movie_player .ytp-caption-window-container',
  'ytd-reel-video-renderer[is-active] .ytp-caption-window-container',
  '#movie_player .ytp-caption-window-container',
  '.ytp-caption-window-container',
], GENERIC_CAPTION_ROOT_SELECTORS);

const YOUTUBE_CAPTION_SEGMENT_SELECTORS = withGenericFallback([
  'ytd-reel-video-renderer[is-active] #movie_player .ytp-caption-segment',
  'ytd-reel-video-renderer[is-active] .ytp-caption-segment',
  '#movie_player .ytp-caption-segment',
  '.ytp-caption-segment',
], GENERIC_CAPTION_SEGMENT_SELECTORS);

interface DedicatedVideoSiteAdapter {
  adapterId: string;
  siteLabel: string;
  domains: string[];
  resolveIdentity: (url: URL) => string;
  videoSelectors: string[];
  playerSelectors: string[];
  captionRootSelectors: string[];
  captionSegmentSelectors: string[];
}

function pathSegments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function pathIdentity(adapterId: string, url: URL): string {
  const path = pathSegments(url).join('/');
  return `${adapterId}:path:${path || 'home'}`;
}

function segmentAfter(segments: string[], marker: string): string {
  const markerIndex = segments.findIndex((segment) => segment.toLowerCase() === marker);
  return markerIndex >= 0 ? segments[markerIndex + 1] || '' : '';
}

function resolveNetflixIdentity(url: URL): string {
  const segments = pathSegments(url);
  if (segments[0]?.toLowerCase() === 'watch' && segments[1]) {
    return `netflix:watch:${segments[1]}`;
  }
  return pathIdentity('netflix', url);
}

function resolveVimeoIdentity(url: URL): string {
  const segments = pathSegments(url);
  const videoId = segments[0]?.toLowerCase() === 'video'
    ? segments[1]
    : (/^\d+$/.test(segments[0] || '') ? segments[0] : '');
  return videoId ? `vimeo:video:${videoId}` : pathIdentity('vimeo', url);
}

function resolveBilibiliIdentity(url: URL): string {
  const segments = pathSegments(url);
  if (segments[0]?.toLowerCase() === 'video' && segments[1]) {
    return `bilibili:video:${segments[1]}`;
  }
  if (
    segments[0]?.toLowerCase() === 'bangumi'
    && segments[1]?.toLowerCase() === 'play'
    && segments[2]
  ) {
    return `bilibili:bangumi:${segments[2]}`;
  }
  return pathIdentity('bilibili', url);
}

function resolveUdemyIdentity(url: URL): string {
  const segments = pathSegments(url);
  const courseId = segmentAfter(segments, 'course');
  const lectureId = segmentAfter(segments, 'lecture');
  if (courseId && lectureId) {
    return `udemy:course:${courseId}:lecture:${lectureId}`;
  }
  if (courseId) {
    return `udemy:course:${courseId}`;
  }
  return pathIdentity('udemy', url);
}

function resolveCourseraIdentity(url: URL): string {
  const segments = pathSegments(url);
  const courseId = segmentAfter(segments, 'learn');
  const lectureId = segmentAfter(segments, 'lecture');
  if (courseId && lectureId) {
    return `coursera:course:${courseId}:lecture:${lectureId}`;
  }
  if (courseId) {
    return `coursera:course:${courseId}`;
  }
  return pathIdentity('coursera', url);
}

function resolveKhanAcademyIdentity(url: URL): string {
  const segments = pathSegments(url);
  const videoId = segmentAfter(segments, 'v');
  return videoId
    ? `khan-academy:video:${videoId}`
    : pathIdentity('khan-academy', url);
}

function resolveNebulaIdentity(url: URL): string {
  const segments = pathSegments(url);
  if (segments[0]?.toLowerCase() === 'videos' && segments[1]) {
    return `nebula:video:${segments[1]}`;
  }
  return pathIdentity('nebula', url);
}

function resolveBloombergIdentity(url: URL): string {
  return pathIdentity('bloomberg', url);
}

const DEDICATED_VIDEO_SITE_ADAPTERS: DedicatedVideoSiteAdapter[] = [
  {
    adapterId: 'netflix',
    siteLabel: 'Netflix',
    domains: ['netflix.com'],
    resolveIdentity: resolveNetflixIdentity,
    videoSelectors: withGenericFallback([
      '.watch-video video',
      '.VideoContainer video',
      '[data-uia="video-canvas"] video',
      'video[data-uia="video-canvas"]',
    ], GENERIC_VIDEO_SELECTORS),
    playerSelectors: withGenericFallback([
      '#appMountPoint .watch-video',
      '.watch-video',
      '[data-uia="video-player"]',
    ], GENERIC_PLAYER_SELECTORS),
    captionRootSelectors: withGenericFallback([
      '.player-timedtext',
      '[data-uia="player-subtitle"]',
    ], GENERIC_CAPTION_ROOT_SELECTORS),
    captionSegmentSelectors: withGenericFallback([
      '.player-timedtext-text-container',
      '.player-timedtext-text-container span',
      '[data-uia="player-subtitle"] span',
    ], GENERIC_CAPTION_SEGMENT_SELECTORS),
  },
  {
    adapterId: 'vimeo',
    siteLabel: 'Vimeo',
    domains: ['vimeo.com'],
    resolveIdentity: resolveVimeoIdentity,
    videoSelectors: withGenericFallback([
      '#player video',
      '.vp-video video',
      '[data-testid="video-player"] video',
    ], GENERIC_VIDEO_SELECTORS),
    playerSelectors: withGenericFallback([
      '#player',
      '.vp-player',
      '[data-testid="video-player"]',
    ], GENERIC_PLAYER_SELECTORS),
    captionRootSelectors: withGenericFallback([
      '.vp-captions',
      '[data-testid="captions"]',
      '.captions',
    ], GENERIC_CAPTION_ROOT_SELECTORS),
    captionSegmentSelectors: withGenericFallback([
      '.vp-captions span',
      '[data-testid="captions"] span',
      '.captions span',
    ], GENERIC_CAPTION_SEGMENT_SELECTORS),
  },
  {
    adapterId: 'bilibili',
    siteLabel: 'Bilibili',
    domains: ['bilibili.com'],
    resolveIdentity: resolveBilibiliIdentity,
    videoSelectors: withGenericFallback([
      '.bpx-player-video-wrap video',
      '.bilibili-player-video video',
      '[class*="bpx-player-video"] video',
    ], GENERIC_VIDEO_SELECTORS),
    playerSelectors: withGenericFallback([
      '.bpx-player-container',
      '.bilibili-player',
      '[class*="bpx-player-container"]',
    ], GENERIC_PLAYER_SELECTORS),
    captionRootSelectors: withGenericFallback([
      '.bpx-player-subtitle',
      '.bpx-player-subtitle-panel',
      '.bilibili-player-video-subtitle',
    ], GENERIC_CAPTION_ROOT_SELECTORS),
    captionSegmentSelectors: withGenericFallback([
      '.bpx-player-subtitle-panel-text',
      '.bpx-player-subtitle span',
      '.bilibili-player-video-subtitle span',
    ], GENERIC_CAPTION_SEGMENT_SELECTORS),
  },
  {
    adapterId: 'udemy',
    siteLabel: 'Udemy',
    domains: ['udemy.com'],
    resolveIdentity: resolveUdemyIdentity,
    videoSelectors: withGenericFallback([
      '[data-purpose="video-player"] video',
      '[data-purpose="video-player-container"] video',
    ], GENERIC_VIDEO_SELECTORS),
    playerSelectors: withGenericFallback([
      '[data-purpose="video-player"]',
      '[data-purpose="video-player-container"]',
    ], GENERIC_PLAYER_SELECTORS),
    captionRootSelectors: withGenericFallback([
      '[data-purpose="captions-display"]',
      '[data-purpose="captions-cue"]',
    ], GENERIC_CAPTION_ROOT_SELECTORS),
    captionSegmentSelectors: withGenericFallback([
      '[data-purpose="captions-cue-text"]',
      '[data-purpose="captions-display"] span',
    ], GENERIC_CAPTION_SEGMENT_SELECTORS),
  },
  {
    adapterId: 'coursera',
    siteLabel: 'Coursera',
    domains: ['coursera.org'],
    resolveIdentity: resolveCourseraIdentity,
    videoSelectors: withGenericFallback([
      '[data-testid="video-player"] video',
      '.rc-VideoPlayer video',
      '[data-e2e="video-player"] video',
    ], GENERIC_VIDEO_SELECTORS),
    playerSelectors: withGenericFallback([
      '[data-testid="video-player"]',
      '.rc-VideoPlayer',
      '[data-e2e="video-player"]',
    ], GENERIC_PLAYER_SELECTORS),
    captionRootSelectors: withGenericFallback([
      '[data-testid="video-captions"]',
      '.rc-VideoCaptions',
      '[data-e2e="video-captions"]',
    ], GENERIC_CAPTION_ROOT_SELECTORS),
    captionSegmentSelectors: withGenericFallback([
      '[data-testid="video-captions"] span',
      '.rc-VideoCaptions span',
      '[data-e2e="video-captions"] span',
    ], GENERIC_CAPTION_SEGMENT_SELECTORS),
  },
  {
    adapterId: 'khan-academy',
    siteLabel: 'Khan Academy',
    domains: ['khanacademy.org'],
    resolveIdentity: resolveKhanAcademyIdentity,
    videoSelectors: withGenericFallback([
      '[data-testid="video-player"] video',
      '[data-test-id="video-player"] video',
      '.perseus-video-container video',
    ], GENERIC_VIDEO_SELECTORS),
    playerSelectors: withGenericFallback([
      '[data-testid="video-player"]',
      '[data-test-id="video-player"]',
      '.perseus-video-container',
    ], GENERIC_PLAYER_SELECTORS),
    captionRootSelectors: withGenericFallback([
      '[data-testid="captions"]',
      '[data-test-id="captions"]',
      '.vjs-text-track-display',
    ], GENERIC_CAPTION_ROOT_SELECTORS),
    captionSegmentSelectors: withGenericFallback([
      '[data-testid="captions"] span',
      '[data-test-id="captions"] span',
      '.vjs-text-track-cue',
    ], GENERIC_CAPTION_SEGMENT_SELECTORS),
  },
  {
    adapterId: 'nebula',
    siteLabel: 'Nebula',
    domains: ['nebula.tv'],
    resolveIdentity: resolveNebulaIdentity,
    videoSelectors: withGenericFallback([
      'main video',
    ], GENERIC_VIDEO_SELECTORS),
    playerSelectors: withGenericFallback([
      'main [data-video-player]',
      'main [class*="video-player"]',
    ], GENERIC_PLAYER_SELECTORS),
    captionRootSelectors: withGenericFallback([
      'main [data-testid*="caption"]',
      'main [class*="caption"][aria-live]',
      'main [class*="subtitle"][aria-live]',
    ], GENERIC_CAPTION_ROOT_SELECTORS),
    captionSegmentSelectors: withGenericFallback([
      'main [data-testid*="caption"] span',
      'main [class*="caption"][aria-live] span',
      'main [class*="subtitle"][aria-live] span',
    ], GENERIC_CAPTION_SEGMENT_SELECTORS),
  },
  {
    adapterId: 'bloomberg',
    siteLabel: 'Bloomberg',
    domains: ['bloomberg.com'],
    resolveIdentity: resolveBloombergIdentity,
    videoSelectors: withGenericFallback([
      'main video',
    ], GENERIC_VIDEO_SELECTORS),
    playerSelectors: withGenericFallback([
      'main [data-video-player]',
      'main [class*="video-player"]',
    ], GENERIC_PLAYER_SELECTORS),
    captionRootSelectors: withGenericFallback([
      'main [data-testid*="caption"]',
      'main [class*="caption"][aria-live]',
      'main [class*="subtitle"][aria-live]',
    ], GENERIC_CAPTION_ROOT_SELECTORS),
    captionSegmentSelectors: withGenericFallback([
      'main [data-testid*="caption"] span',
      'main [class*="caption"][aria-live] span',
      'main [class*="subtitle"][aria-live] span',
    ], GENERIC_CAPTION_SEGMENT_SELECTORS),
  },
];

function parseUrl(urlLike: string | URL): URL | null {
  try {
    return urlLike instanceof URL ? new URL(urlLike.href) : new URL(urlLike);
  } catch {
    return null;
  }
}

function isYouTubeHost(hostname: string): boolean {
  return isDomainOrSubdomain(hostname, 'youtube.com')
    || isDomainOrSubdomain(hostname, 'youtu.be');
}

function isShortYouTubeHost(hostname: string): boolean {
  return isDomainOrSubdomain(hostname, 'youtu.be');
}

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedDomain = domain.toLowerCase();
  return normalizedHostname === normalizedDomain
    || normalizedHostname.endsWith(`.${normalizedDomain}`);
}

function firstPathSegment(pathname: string, prefix = ''): string {
  const pathWithoutPrefix = prefix && pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname;
  return pathWithoutPrefix.split('/').filter(Boolean)[0] || '';
}

function isElementVisible(element: Element, documentRef: Document): boolean {
  let current: Element | null = element;
  const view = documentRef.defaultView;

  while (current) {
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    const style = view?.getComputedStyle(current);
    if (style && (
      style.display === 'none'
      || style.visibility === 'hidden'
      || style.visibility === 'collapse'
      || style.opacity === '0'
    )) {
      return false;
    }

    current = current.parentElement;
  }

  return true;
}

function hasYouTubeLiveMarker(documentRef?: Document): boolean {
  if (!documentRef) {
    return false;
  }

  if (documentRef.querySelector('[data-lexibridge-youtube-live="true"]')) {
    return true;
  }

  return Array.from(documentRef.querySelectorAll('.ytp-live-badge'))
    .some((element) => isElementVisible(element, documentRef));
}

function resolveYouTubeIdentity(url: URL): {
  pageType: Exclude<VideoPageType, 'generic'>;
  videoId: string;
} {
  if (isShortYouTubeHost(url.hostname)) {
    return {
      pageType: 'standard',
      videoId: firstPathSegment(url.pathname),
    };
  }

  if (url.pathname === '/watch' || url.pathname === '/watch/') {
    return {
      pageType: 'standard',
      videoId: url.searchParams.get('v') || 'watch',
    };
  }

  if (url.pathname.startsWith('/live/')) {
    return {
      pageType: 'live',
      videoId: firstPathSegment(url.pathname, '/live/'),
    };
  }

  if (url.pathname.startsWith('/shorts/')) {
    return {
      pageType: 'shorts',
      videoId: firstPathSegment(url.pathname, '/shorts/'),
    };
  }

  return {
    pageType: 'standard',
    videoId: firstPathSegment(url.pathname) || 'home',
  };
}

function createYouTubeContext(url: URL, documentRef?: Document): VideoSiteContext {
  const identity = resolveYouTubeIdentity(url);
  const pageType = identity.pageType === 'standard' && hasYouTubeLiveMarker(documentRef)
    ? 'live'
    : identity.pageType;

  return {
    adapterId: YOUTUBE_ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    siteLabel: 'YouTube',
    pageType,
    navigationKey: `youtube:${identity.videoId}`,
    videoSelectors: [...YOUTUBE_VIDEO_SELECTORS],
    playerSelectors: [...YOUTUBE_PLAYER_SELECTORS],
    captionRootSelectors: [...YOUTUBE_CAPTION_ROOT_SELECTORS],
    captionSegmentSelectors: [...YOUTUBE_CAPTION_SEGMENT_SELECTORS],
    canGenerateFromTab: true,
  };
}

function createDedicatedContext(
  adapter: DedicatedVideoSiteAdapter,
  url: URL,
): VideoSiteContext {
  return {
    adapterId: adapter.adapterId,
    adapterVersion: ADAPTER_VERSION,
    siteLabel: adapter.siteLabel,
    pageType: 'standard',
    navigationKey: adapter.resolveIdentity(url),
    videoSelectors: [...adapter.videoSelectors],
    playerSelectors: [...adapter.playerSelectors],
    captionRootSelectors: [...adapter.captionRootSelectors],
    captionSegmentSelectors: [...adapter.captionSegmentSelectors],
    canGenerateFromTab: true,
  };
}

function createGenericContext(url: URL | null): VideoSiteContext {
  const identity = url
    ? `${url.hostname.toLowerCase()}${url.pathname || '/'}`
    : 'invalid-url';

  return {
    adapterId: GENERIC_ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    siteLabel: 'Generic video',
    pageType: 'generic',
    navigationKey: `generic:${identity}`,
    videoSelectors: [...GENERIC_VIDEO_SELECTORS],
    playerSelectors: [...GENERIC_PLAYER_SELECTORS],
    captionRootSelectors: [...GENERIC_CAPTION_ROOT_SELECTORS],
    captionSegmentSelectors: [...GENERIC_CAPTION_SEGMENT_SELECTORS],
    canGenerateFromTab: true,
  };
}

export function resolveVideoSiteContext(
  urlLike: string | URL,
  documentRef?: Document,
): VideoSiteContext {
  const url = parseUrl(urlLike);
  if (url && isYouTubeHost(url.hostname)) {
    return createYouTubeContext(url, documentRef);
  }

  if (url) {
    const adapter = DEDICATED_VIDEO_SITE_ADAPTERS.find((candidate) => (
      candidate.domains.some((domain) => isDomainOrSubdomain(url.hostname, domain))
    ));
    if (adapter) {
      return createDedicatedContext(adapter, url);
    }
  }

  return createGenericContext(url);
}
