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

const YOUTUBE_ADAPTER_ID = 'youtube';
const GENERIC_ADAPTER_ID = 'generic';
const ADAPTER_VERSION = 1;

const YOUTUBE_VIDEO_SELECTORS = [
  'ytd-reel-video-renderer[is-active] #movie_player video.html5-main-video',
  'ytd-reel-video-renderer[is-active] #movie_player video',
  'ytd-reel-video-renderer[is-active] video',
  '#movie_player video.html5-main-video',
  '#movie_player video',
  'video.html5-main-video',
  'video',
];

const YOUTUBE_PLAYER_SELECTORS = [
  'ytd-reel-video-renderer[is-active] #movie_player',
  'ytd-reel-video-renderer[is-active]',
  '#movie_player',
  '.html5-video-player',
];

const YOUTUBE_CAPTION_ROOT_SELECTORS = [
  'ytd-reel-video-renderer[is-active] #movie_player .ytp-caption-window-container',
  'ytd-reel-video-renderer[is-active] .ytp-caption-window-container',
  '#movie_player .ytp-caption-window-container',
  '.ytp-caption-window-container',
];

const YOUTUBE_CAPTION_SEGMENT_SELECTORS = [
  'ytd-reel-video-renderer[is-active] #movie_player .ytp-caption-segment',
  'ytd-reel-video-renderer[is-active] .ytp-caption-segment',
  '#movie_player .ytp-caption-segment',
  '.ytp-caption-segment',
];

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

function parseUrl(urlLike: string | URL): URL | null {
  try {
    return urlLike instanceof URL ? new URL(urlLike.href) : new URL(urlLike);
  } catch {
    return null;
  }
}

function isYouTubeHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return normalizedHostname === 'youtube.com'
    || normalizedHostname.endsWith('.youtube.com')
    || normalizedHostname === 'youtu.be'
    || normalizedHostname.endsWith('.youtu.be');
}

function isShortYouTubeHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return normalizedHostname === 'youtu.be' || normalizedHostname.endsWith('.youtu.be');
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

  return createGenericContext(url);
}
