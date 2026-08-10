export const COMIC_CHAPTER_LIMITS = Object.freeze({
  maxScannedNodes: 2_048,
  maxImages: 48,
  maxTextBlocks: 1_200,
  maxSourceCharacters: 120_000,
  maxRetainedReconstructionPixels: 16_000_000,
  minImageWidth: 160,
  minImageHeight: 160
});

export interface ComicChapterCandidate {
  readonly element: HTMLImageElement;
  readonly sourceUrl: string;
  readonly fingerprint: string;
  readonly order: number;
}

export interface ComicChapterDiscovery {
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly siteLabel: string;
  readonly navigationKey: string;
  readonly candidates: readonly ComicChapterCandidate[];
  readonly scannedNodeCount: number;
  readonly limitReached: boolean;
}

interface ComicSiteAdapterDefinition {
  readonly id: string;
  readonly label: string;
  readonly hostSuffixes: readonly string[];
  readonly rootSelectors: readonly string[];
  readonly imageSelectors: readonly string[];
}

const ADAPTER_VERSION = 1;

const SITE_ADAPTERS: readonly ComicSiteAdapterDefinition[] = [
  {
    id: 'pixiv-v1',
    label: 'Pixiv',
    hostSuffixes: ['pixiv.net'],
    rootSelectors: ['main', '[role="main"]'],
    imageSelectors: ['figure img', 'main img']
  },
  {
    id: 'shueisha-v1',
    label: 'SHUEISHA',
    hostSuffixes: ['mangaplus.shueisha.co.jp', 'zebrack-comic.shueisha.co.jp', 'shonenjumpplus.com'],
    rootSelectors: ['main', '#viewer', '[class*="viewer"]'],
    imageSelectors: ['main img', '[class*="viewer"] img']
  },
  {
    id: 'mangadex-v1',
    label: 'MangaDex',
    hostSuffixes: ['mangadex.org'],
    rootSelectors: ['#chapter-container', '[data-testid="reader-page-wrapper"]', 'main'],
    imageSelectors: ['#chapter-container img', 'main img']
  },
  {
    id: 'japanese-publishers-v1',
    label: 'Japanese comic reader',
    hostSuffixes: [
      'comic-fuz.com',
      'comic-days.com',
      'comic-walker.com',
      'web-ace.jp',
      'comic-action.com',
      'ganganonline.com',
      'palcy.jp'
    ],
    rootSelectors: ['#viewer', '[class*="viewer"]', '[class*="reader"]', 'main'],
    imageSelectors: ['[class*="viewer"] img', '[class*="reader"] img', 'main img']
  },
  {
    id: 'long-scroll-v1',
    label: 'Long-scroll comic reader',
    hostSuffixes: [
      'mangabuddy.com',
      'bato.to',
      'batocomic.com',
      'colamanga.com',
      'manhwaclan.com',
      'manhwatop.com',
      'komiku.id',
      'readcomiconline.li',
      'readcomic.me'
    ],
    rootSelectors: ['[class*="chapter"]', '[class*="reader"]', '[id*="reader"]', 'main'],
    imageSelectors: ['[class*="chapter"] img', '[class*="reader"] img', 'main img']
  },
  {
    id: 'gallery-v1',
    label: 'Comic gallery',
    hostSuffixes: ['e-hentai.org', 'exhentai.org', 'nhentai.net', 'wnacg.com'],
    rootSelectors: ['#content', '#image-container', '#i3', 'main'],
    imageSelectors: ['#image-container img', '#i3 img', 'main img']
  },
  {
    id: 'cn-reader-v1',
    label: 'Chinese comic reader',
    hostSuffixes: ['dmzj.com', 'kuaikanmanhua.com', 'ac.qq.com', 'yamibo.com'],
    rootSelectors: ['[class*="comic"]', '[class*="chapter"]', '[class*="reader"]', 'main'],
    imageSelectors: ['[class*="comic"] img', '[class*="chapter"] img', 'main img']
  }
];

export class ComicSiteAdapterRegistry {
  discover(documentRoot: Document, locationValue: Location | URL): ComicChapterDiscovery {
    const hostname = locationValue.hostname.toLowerCase().replace(/^www\./, '');
    const adapter = SITE_ADAPTERS.find(candidate => (
      candidate.hostSuffixes.some(suffix => hostname === suffix || hostname.endsWith(`.${suffix}`))
    ));
    const navigationKey = `${locationValue.origin}${locationValue.pathname}${locationValue.search}`;
    const selectors = adapter?.imageSelectors || [
      '[class*="chapter"] img',
      '[class*="reader"] img',
      '[id*="reader"] img',
      'main img',
      'article img'
    ];
    const rootSelectors = adapter?.rootSelectors || [
      '[class*="chapter"]',
      '[class*="reader"]',
      '[id*="reader"]',
      'main',
      'article',
      'body'
    ];

    const seenElements = new Set<HTMLImageElement>();
    const seenUrls = new Set<string>();
    const candidates: ComicChapterCandidate[] = [];
    let scannedNodeCount = 0;
    let limitReached = false;

    const traversalRoot = documentRoot.body || documentRoot.documentElement;
    if (!traversalRoot) {
      return this.createDiscovery(adapter, hostname, navigationKey, [], 0, false);
    }
    const showElement = documentRoot.defaultView?.NodeFilter.SHOW_ELEMENT || 1;
    const walker = documentRoot.createTreeWalker(traversalRoot, showElement);
    let node: Node | null = traversalRoot;

    while (node && scannedNodeCount < COMIC_CHAPTER_LIMITS.maxScannedNodes) {
      scannedNodeCount += 1;
      if (node instanceof HTMLImageElement && this.matchesAdapter(node, selectors, rootSelectors)) {
        const image = node;
        if (!seenElements.has(image) && this.isCandidate(image)) {
          seenElements.add(image);
          const sourceUrl = this.getSourceUrl(image);
          if (sourceUrl && !seenUrls.has(sourceUrl)) {
            seenUrls.add(sourceUrl);
            candidates.push({
              element: image,
              sourceUrl,
              fingerprint: this.getFingerprint(image),
              order: candidates.length
            });
            if (candidates.length >= COMIC_CHAPTER_LIMITS.maxImages) {
              limitReached = true;
              break;
            }
          }
        }
      }
      node = walker.nextNode();
    }
    if (node && scannedNodeCount >= COMIC_CHAPTER_LIMITS.maxScannedNodes) limitReached = true;

    return this.createDiscovery(adapter, hostname, navigationKey, candidates, scannedNodeCount, limitReached);
  }

  isDiscoveryCurrent(
    discovery: ComicChapterDiscovery,
    documentRoot: Document,
    locationValue: Location | URL
  ): boolean {
    const current = this.discover(documentRoot, locationValue);
    return current.navigationKey === discovery.navigationKey &&
      current.adapterId === discovery.adapterId &&
      current.candidates.length === discovery.candidates.length &&
      current.candidates.every((candidate, index) => (
        candidate.element === discovery.candidates[index].element &&
        candidate.fingerprint === discovery.candidates[index].fingerprint
      ));
  }

  isCandidateCurrent(candidate: ComicChapterCandidate, locationValue: Location | URL, navigationKey: string): boolean {
    const currentNavigationKey = `${locationValue.origin}${locationValue.pathname}${locationValue.search}`;
    return currentNavigationKey === navigationKey &&
      candidate.element.isConnected &&
      this.getFingerprint(candidate.element) === candidate.fingerprint;
  }

  private matchesAdapter(
    image: HTMLImageElement,
    imageSelectors: readonly string[],
    rootSelectors: readonly string[]
  ): boolean {
    return imageSelectors.some(selector => image.matches(selector)) &&
      rootSelectors.some(selector => Boolean(image.closest(selector)));
  }

  private createDiscovery(
    adapter: ComicSiteAdapterDefinition | undefined,
    hostname: string,
    navigationKey: string,
    candidates: readonly ComicChapterCandidate[],
    scannedNodeCount: number,
    limitReached: boolean
  ): ComicChapterDiscovery {
    return {
      adapterId: adapter?.id || 'generic-dom-v1',
      adapterVersion: ADAPTER_VERSION,
      siteLabel: adapter?.label || hostname || 'Current page',
      navigationKey,
      candidates,
      scannedNodeCount,
      limitReached
    };
  }

  private isCandidate(image: HTMLImageElement): boolean {
    if (!image.isConnected || image.hidden || image.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(image);
    if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') === 0) {
      return false;
    }
    const rect = image.getBoundingClientRect();
    const width = Math.max(rect.width || 0, image.width || 0, image.naturalWidth || 0);
    const height = Math.max(rect.height || 0, image.height || 0, image.naturalHeight || 0);
    return Number.isFinite(width) && Number.isFinite(height) &&
      width >= COMIC_CHAPTER_LIMITS.minImageWidth &&
      height >= COMIC_CHAPTER_LIMITS.minImageHeight;
  }

  private getSourceUrl(image: HTMLImageElement): string {
    const value = image.currentSrc || image.src || image.getAttribute('src') || '';
    if (!value) return '';
    try {
      return new URL(value, image.ownerDocument.baseURI).href;
    } catch {
      return value;
    }
  }

  private getFingerprint(image: HTMLImageElement): string {
    const rect = image.getBoundingClientRect();
    return JSON.stringify([
      this.getSourceUrl(image),
      image.srcset,
      image.width,
      image.height,
      image.naturalWidth,
      image.naturalHeight,
      Math.round(rect.width * 100) / 100,
      Math.round(rect.height * 100) / 100,
      image.className
    ]);
  }
}

export const comicSiteAdapterRegistry = new ComicSiteAdapterRegistry();
