import {
  BundledOcrLanguageCode,
  BundledOcrSession,
  BundledOcrService,
  bundledOcrService
} from '../../services/BundledOcrService';
import { createTranslationRequestNamespace } from '../../services/TranslationRequestId';
import {
  COMIC_CHAPTER_LIMITS,
  ComicChapterDiscovery,
  ComicSiteAdapterRegistry,
  comicSiteAdapterRegistry
} from '../../services/ComicSiteAdapterRegistry';
import {
  ComicImageTile,
  ComicImageTilingLimitError,
  MappedComicOcrLine,
  deduplicateOverlappingOcrLines,
  mapTileOcrLinesToSource,
  planComicImageTiles
} from '../../services/ComicImageTiling';
import {
  applyInpaintToImage,
  assessInpaintSafety,
  buildTextMask,
  COMIC_IMAGE_LIMITS,
  detectBubbles,
  detectPanels,
  getTranslationWritingMode,
  groupTextTokens,
  inferOcrTextDirection,
  layoutTranslation,
  OcrToken,
  OcrTokenLevel,
  PixelImage,
  PixelPoint,
  PixelRect,
  RgbaColor,
  TextGroup,
  TypesetPlan
} from '../../services/ComicImageProcessor';

export interface ImageTranslatorState {
  isActive: boolean;
  hasImage: boolean;
  isBatchRunning: boolean;
  operationId: string | null;
  processedImageCount: number;
  totalImageCount: number;
  message: string;
}

export interface VisibleImageTranslationResult {
  isActive: boolean;
  visibleImageCount: number;
  translatedImageCount: number;
  unreadableImageCount: number;
  failedImageCount: number;
  operationId: string | null;
  message: string;
}

export interface SingleImageTranslationResult {
  isActive: boolean;
  translated: boolean;
  message: string;
}

export type ComicChapterPhase =
  | 'idle'
  | 'awaiting-confirmation'
  | 'running'
  | 'completed'
  | 'stale'
  | 'failed';

export interface ComicChapterState {
  phase: ComicChapterPhase;
  isActive: boolean;
  discoveryId: string | null;
  operationId: string | null;
  adapterId: string;
  adapterVersion: number;
  siteLabel: string;
  navigationKey: string;
  candidateCount: number;
  acceptedCount: number;
  processedCount: number;
  translatedCount: number;
  unreadableCount: number;
  failedCount: number;
  staleCount: number;
  limitReached: boolean;
  message: string;
}

export interface ImageTranslationRequest {
  requestId: string;
  signal: AbortSignal;
}

type TranslateText = (text: string, request: ImageTranslationRequest) => Promise<string>;
type CreateTranslationCacheKey = (text: string) => string;

interface DetectedText {
  rawValue?: string;
  cornerPoints?: Array<{ x?: number; y?: number }>;
  boundingBox?: {
    x?: number;
    y?: number;
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    width?: number;
    height?: number;
  };
}

interface TextDetectorLike {
  detect(image: ImageBitmapSource): Promise<DetectedText[]>;
}

interface ImageSelectionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportRect: DOMRect;
  polygon: readonly PixelPoint[];
  isFreeform: boolean;
}

interface ImageSelectionState {
  target: Element;
  interactionEpoch: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  points: PixelPoint[];
}

interface ImageTextBlock {
  text: string;
  viewportRect?: DOMRect;
  sourceRect?: PixelRect;
  sourcePolygon?: readonly PixelPoint[];
  sourceTileRect?: PixelRect;
  sourceTileCoreRect?: PixelRect;
  confidence?: number;
  level?: OcrTokenLevel;
}

interface ImageBitmapMapping {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelWidth: number;
  pixelHeight: number;
}

interface ComicPixelSnapshot {
  image: PixelImage;
  mapping: ImageBitmapMapping;
}

interface PreparedComicGroup {
  plan: TypesetPlan;
  mask: ReturnType<typeof buildTextMask>;
  safety: ReturnType<typeof assessInpaintSafety>;
  textColor: string;
}

type ImageTranslationOutcome = 'translated' | 'failed' | 'cancelled';

const MAX_IMAGE_TEXT_BLOCKS = COMIC_IMAGE_LIMITS.maxBubbles;
const MAX_IMAGE_TRANSLATION_CONCURRENCY = 4;
const MAX_COMIC_RECONSTRUCTION_BLOCKS = 64;
const MAX_COMIC_RECONSTRUCTION_PIXELS = 1_500_000;
const CONTEXT_MENU_TARGET_MAX_AGE_MS = 5_000;
const MAX_SELECTION_POLYGON_POINTS = 64;
const MAX_RAW_SELECTION_POINTS = 512;
const MAX_IMAGE_TEXT_CHARACTERS = 8_000;

declare global {
  interface Window {
    TextDetector?: new () => TextDetectorLike;
  }
}

export class ImageTranslator {
  private readonly requestNamespace = createTranslationRequestNamespace('image-text');
  private readonly batchNamespace = createTranslationRequestNamespace('image-batch');
  private readonly chapterNamespace = createTranslationRequestNamespace('comic-chapter');
  private isActive = false;
  private translateText: TranslateText | null = null;
  private createTranslationCacheKey: CreateTranslationCacheKey = text => text;
  private overlayElements: Map<Element, HTMLElement[]> = new Map();
  private reconstructionPixelCounts: Map<Element, number> = new Map();
  private styleElement: HTMLStyleElement | null = null;
  private selectionElement: HTMLElement | null = null;
  private selectionState: ImageSelectionState | null = null;
  private suppressNextClick = false;
  private translationCache: Map<string, string> = new Map();
  private pendingTranslationCache: Map<string, Promise<string>> = new Map();
  private translationCacheGenerations: Map<string, number> = new Map();
  private targetTranslationRuns: WeakMap<Element, number> = new WeakMap();
  private nextTargetTranslationRun = 0;
  private visibleImageRun = 0;
  private comicChapterRun = 0;
  private nextOverlayId = 0;
  private interactionEpoch = 0;
  private requestSequence = 0;
  private activeRequestControllers = new Set<AbortController>();
  private activeProcessingControllers = new Set<AbortController>();
  private activeBlobCancellations = new Set<() => void>();
  private activeObjectUrls = new Set<string>();
  private activeVisibleImageBatch: {
    operationId: string;
    promise: Promise<VisibleImageTranslationResult>;
  } | null = null;
  private activeComicChapterBatch: {
    operationId: string;
    promise: Promise<ComicChapterState>;
  } | null = null;
  private comicChapterSnapshot: {
    discoveryId: string;
    discovery: ComicChapterDiscovery;
  } | null = null;
  private comicChapterState: ComicChapterState = {
    phase: 'idle',
    isActive: false,
    discoveryId: null,
    operationId: null,
    adapterId: '',
    adapterVersion: 1,
    siteLabel: '',
    navigationKey: '',
    candidateCount: 0,
    acceptedCount: 0,
    processedCount: 0,
    translatedCount: 0,
    unreadableCount: 0,
    failedCount: 0,
    staleCount: 0,
    limitReached: false,
    message: 'No comic chapter scanned'
  };
  private hasImageCandidateSnapshot = false;
  private processedImageCount = 0;
  private totalImageCount = 0;
  private batchSequence = 0;
  private statusMessage = 'Image translation stopped';
  private ocrLanguage: BundledOcrLanguageCode = 'eng';
  private bundledOcrSession: BundledOcrSession | null = null;
  private isInitialized = false;
  private interactionMode: 'off' | 'page' | 'context-once' | 'region-once' = 'off';
  private lastContextMenuTarget: Element | null = null;
  private lastContextMenuCapturedAt = 0;
  private hoveredTarget: Element | null = null;
  private hoverToolbar: HTMLElement | null = null;
  private hoverEntryDismissedForDocument = false;
  private regionSelectionArmedTarget: Element | null = null;
  private resultStates: Map<Element, 'preview' | 'applied'> = new Map();
  private overlayAnchors: Map<Element, {
    left: number;
    top: number;
    scrollX: number;
    scrollY: number;
  }> = new Map();
  private resultSourceIdentities: Map<Element, string> = new Map();
  private resultObserver: MutationObserver | null = null;
  private boundHandleClick = (event: MouseEvent): void => {
    void this.handleImageClick(event);
  };
  private boundHandleMouseDown = (event: MouseEvent): void => {
    this.handleMouseDown(event);
  };
  private boundHandleMouseMove = (event: MouseEvent): void => {
    this.handleMouseMove(event);
  };
  private boundHandleMouseUp = (event: MouseEvent): void => {
    void this.handleMouseUp(event);
  };
  private boundCancelSelectionGesture = (): void => {
    this.cancelSelectionGesture();
  };
  private boundHandleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') this.cancelSelectionGesture();
  };
  private boundHandleContextMenu = (event: MouseEvent): void => {
    const target = this.getImageTarget(event);
    if (target) {
      this.lastContextMenuTarget = target;
      this.lastContextMenuCapturedAt = Date.now();
    }
  };
  private boundHandleMouseOver = (event: MouseEvent): void => {
    this.handleImageHover(event);
  };
  private boundHandleMouseOut = (event: MouseEvent): void => {
    this.handleImageOut(event);
  };
  private boundHandleKeyDown = (event: KeyboardEvent): void => {
    void this.handleImageShortcut(event);
  };
  private boundHandleViewportChange = (): void => {
    this.hideHoverToolbar();
    this.pruneStaleResults();
    this.refreshOverlayPositions();
  };

  constructor(
    private readonly imageOcrService: BundledOcrService = bundledOcrService,
    private readonly comicAdapters: ComicSiteAdapterRegistry = comicSiteAdapterRegistry
  ) {}

  initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    document.addEventListener('contextmenu', this.boundHandleContextMenu, true);
    document.addEventListener('mouseover', this.boundHandleMouseOver, true);
    document.addEventListener('mouseout', this.boundHandleMouseOut, true);
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    document.addEventListener('pointercancel', this.boundCancelSelectionGesture, true);
    document.addEventListener('visibilitychange', this.boundHandleVisibilityChange);
    window.addEventListener('blur', this.boundCancelSelectionGesture);
  }

  configure(
    translateText: TranslateText,
    ocrLanguage: BundledOcrLanguageCode = 'eng',
    createTranslationCacheKey: CreateTranslationCacheKey = text => text
  ): void {
    this.initialize();
    this.translateText = translateText;
    this.createTranslationCacheKey = createTranslationCacheKey;
    this.updateOcrLanguage(ocrLanguage);
  }

  async toggle(
    translateText: TranslateText,
    ocrLanguage: BundledOcrLanguageCode = 'eng',
    createTranslationCacheKey: CreateTranslationCacheKey = text => text
  ): Promise<ImageTranslatorState> {
    if (this.isActive) {
      this.disable();
      return {
        isActive: false,
        hasImage: false,
        isBatchRunning: false,
        operationId: null,
        processedImageCount: 0,
        totalImageCount: 0,
        message: 'Image translation stopped'
      };
    }

    return this.enable(translateText, ocrLanguage, createTranslationCacheKey);
  }

  enable(
    translateText: TranslateText,
    ocrLanguage: BundledOcrLanguageCode = 'eng',
    createTranslationCacheKey: CreateTranslationCacheKey = text => text
  ): ImageTranslatorState {
    this.configure(translateText, ocrLanguage, createTranslationCacheKey);
    if (this.isActive) {
      return this.getStatus();
    }

    this.interactionEpoch += 1;
    this.isActive = true;
    this.interactionMode = 'page';
    this.statusMessage = 'Image translation started';
    this.hoverEntryDismissedForDocument = false;
    this.createStyleElement();
    document.body.classList.add('lexibridge-image-translation-mode');
    document.addEventListener('mousedown', this.boundHandleMouseDown, true);
    document.addEventListener('mousemove', this.boundHandleMouseMove, true);
    document.addEventListener('mouseup', this.boundHandleMouseUp, true);
    document.addEventListener('click', this.boundHandleClick, true);
    window.addEventListener('scroll', this.boundHandleViewportChange, true);
    window.addEventListener('resize', this.boundHandleViewportChange);
    this.ensureResultObserver();

    const hasImage = this.findImageCandidates().length > 0;
    this.hasImageCandidateSnapshot = hasImage;

    return {
      isActive: true,
      hasImage,
      isBatchRunning: false,
      operationId: null,
      processedImageCount: 0,
      totalImageCount: 0,
      message: hasImage ? 'Image translation started' : 'No image found'
    };
  }

  enableContextMode(
    translateText: TranslateText,
    ocrLanguage: BundledOcrLanguageCode = 'eng',
    createTranslationCacheKey: CreateTranslationCacheKey = text => text
  ): ImageTranslatorState {
    this.configure(translateText, ocrLanguage, createTranslationCacheKey);
    if (this.isActive) return this.getStatus();

    this.interactionEpoch += 1;
    this.isActive = true;
    this.interactionMode = 'context-once';
    this.statusMessage = 'Context image translation started';
    this.createStyleElement();
    this.ensureResultObserver();
    window.addEventListener('scroll', this.boundHandleViewportChange, true);
    window.addEventListener('resize', this.boundHandleViewportChange);
    const hasImage = this.findImageCandidates().length > 0;
    this.hasImageCandidateSnapshot = hasImage;
    return {
      isActive: true,
      hasImage,
      isBatchRunning: false,
      operationId: null,
      processedImageCount: 0,
      totalImageCount: 0,
      message: hasImage ? 'Context image translation started' : 'No image found'
    };
  }

  disable(): void {
    this.interactionEpoch += 1;
    this.isActive = false;
    this.interactionMode = 'off';
    this.visibleImageRun += 1;
    this.comicChapterRun += 1;
    this.activeVisibleImageBatch = null;
    this.activeComicChapterBatch = null;
    this.processedImageCount = 0;
    this.totalImageCount = 0;
    this.statusMessage = 'Image translation stopped';
    this.resetComicChapterState('No comic chapter scanned', false);
    this.comicChapterSnapshot = null;
    this.abortActiveRequests();
    this.abortActiveProcessing();
    this.cancelActiveDownloads();
    this.pendingTranslationCache.clear();
    this.translationCache.clear();
    this.translationCacheGenerations.clear();
    document.removeEventListener('mousedown', this.boundHandleMouseDown, true);
    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    document.removeEventListener('mouseup', this.boundHandleMouseUp, true);
    document.removeEventListener('click', this.boundHandleClick, true);
    window.removeEventListener('scroll', this.boundHandleViewportChange, true);
    window.removeEventListener('resize', this.boundHandleViewportChange);
    document.body.classList.remove('lexibridge-image-translation-mode');
    document.body.classList.remove('lexibridge-image-region-armed');
    this.removeAllOverlays();
    this.removeSelectionBox();
    this.selectionState = null;
    this.suppressNextClick = false;
    this.hoveredTarget = null;
    this.hoverEntryDismissedForDocument = false;
    this.regionSelectionArmedTarget = null;
    this.hideHoverToolbar();
    this.resultStates.clear();
    this.overlayAnchors.clear();
    this.resultSourceIdentities.clear();
    this.resultObserver?.disconnect();
    this.resultObserver = null;
    this.styleElement?.remove();
    this.styleElement = null;
    this.targetTranslationRuns = new WeakMap();
    this.hasImageCandidateSnapshot = false;
    void this.terminateBundledOcrSession();
  }

  getStatus(): ImageTranslatorState {
    this.refreshComicChapterStaleness();
    return {
      isActive: this.isActive,
      hasImage: this.hasImageCandidateSnapshot,
      isBatchRunning: Boolean(this.activeVisibleImageBatch || this.activeComicChapterBatch),
      operationId: this.activeVisibleImageBatch?.operationId || this.activeComicChapterBatch?.operationId || null,
      processedImageCount: this.processedImageCount,
      totalImageCount: this.totalImageCount,
      message: this.statusMessage
    };
  }

  updateOcrLanguage(language: BundledOcrLanguageCode): void {
    if (this.ocrLanguage === language) return;
    this.ocrLanguage = language;
    void this.terminateBundledOcrSession();
  }

  clearTranslationCache(): void {
    this.translationCache.clear();
    this.translationCacheGenerations.clear();
  }

  invalidateForSettingsChange(): void {
    this.interactionEpoch += 1;
    this.visibleImageRun += 1;
    this.comicChapterRun += 1;
    this.activeVisibleImageBatch = null;
    this.activeComicChapterBatch = null;
    this.processedImageCount = 0;
    this.totalImageCount = 0;
    this.abortActiveRequests();
    this.abortActiveProcessing();
    this.cancelActiveDownloads();
    this.pendingTranslationCache.clear();
    this.translationCache.clear();
    this.translationCacheGenerations.clear();
    this.targetTranslationRuns = new WeakMap();
    this.removeAllOverlays();
    this.markComicChapterStale('Image settings changed. Scan the chapter again.');
    this.statusMessage = this.isActive ? 'Image translation settings updated' : 'Image translation stopped';
  }

  cleanup(): void {
    this.disable();
    if (this.isInitialized) {
      document.removeEventListener('contextmenu', this.boundHandleContextMenu, true);
      document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
      document.removeEventListener('mouseout', this.boundHandleMouseOut, true);
      document.removeEventListener('keydown', this.boundHandleKeyDown, true);
      document.removeEventListener('pointercancel', this.boundCancelSelectionGesture, true);
      document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);
      window.removeEventListener('blur', this.boundCancelSelectionGesture);
      this.isInitialized = false;
    }
    this.lastContextMenuTarget = null;
    this.lastContextMenuCapturedAt = 0;
    this.translationCache.clear();
    this.pendingTranslationCache.clear();
    this.translationCacheGenerations.clear();
  }

  async translateImageFromSourceUrl(srcUrl: string): Promise<SingleImageTranslationResult> {
    if (!this.isActive || !this.translateText) {
      return { isActive: false, translated: false, message: 'Start image translation first' };
    }

    const target = this.resolveImageTarget(srcUrl);
    if (!target) {
      return { isActive: true, translated: false, message: 'Image is no longer available' };
    }

    const outcome = await this.translateTarget(target, false);
    const translated = outcome === 'translated';
    return {
      isActive: this.isActive,
      translated,
      message: translated
        ? 'Image translated'
        : outcome === 'cancelled' ? 'Image translation stopped' : 'Image translation failed'
    };
  }

  translateVisibleImages(): Promise<VisibleImageTranslationResult> {
    if (this.activeComicChapterBatch) {
      return Promise.resolve({
        isActive: this.isActive,
        visibleImageCount: 0,
        translatedImageCount: 0,
        unreadableImageCount: 0,
        failedImageCount: 0,
        operationId: null,
        message: 'Comic chapter translation is running'
      });
    }
    if (this.activeVisibleImageBatch) return this.activeVisibleImageBatch.promise;

    const operationId = `${this.batchNamespace}:${++this.batchSequence}`;
    const promise = this.runVisibleImageTranslation(operationId).finally(() => {
      if (this.activeVisibleImageBatch?.operationId === operationId) {
        this.activeVisibleImageBatch = null;
      }
    });
    this.activeVisibleImageBatch = { operationId, promise };
    return promise;
  }

  private async runVisibleImageTranslation(operationId: string): Promise<VisibleImageTranslationResult> {
    if (!this.isActive || this.interactionMode !== 'page' || !this.translateText) {
      return {
        isActive: false,
        visibleImageCount: 0,
        translatedImageCount: 0,
        unreadableImageCount: 0,
        failedImageCount: 0,
        operationId: null,
        message: 'Start image translation first'
      };
    }

    const candidates = this.findVisibleImageCandidates();
    if (candidates.length === 0) {
      this.processedImageCount = 0;
      this.totalImageCount = 0;
      this.statusMessage = 'No visible images found';
      return {
        isActive: true,
        visibleImageCount: 0,
        translatedImageCount: 0,
        unreadableImageCount: 0,
        failedImageCount: 0,
        operationId,
        message: 'No visible images found'
      };
    }

    const runId = ++this.visibleImageRun;
    let translatedImageCount = 0;
    let unreadableImageCount = 0;
    let failedImageCount = 0;
    this.processedImageCount = 0;
    this.totalImageCount = candidates.length;
    this.statusMessage = `Translating image 1 of ${candidates.length}`;

    this.targetTranslationRuns = new WeakMap();
    this.removeAllOverlays();

    for (const target of candidates) {
      if (!this.isVisibleImageRunActive(runId)) break;

      const imageBlocks = await this.extractImageTextBlocks(target);
      if (!this.isVisibleImageRunActive(runId)) break;

      if (imageBlocks.length === 0) {
        unreadableImageCount += 1;
      } else {
        const outcome = await this.translateImageBlocks(target, imageBlocks);
        if (outcome === 'translated') {
          translatedImageCount += 1;
        } else if (outcome === 'failed') {
          failedImageCount += 1;
        } else {
          break;
        }
      }

      if (!this.isVisibleImageRunActive(runId)) break;
      this.processedImageCount += 1;
      if (this.processedImageCount < candidates.length) {
        this.statusMessage = `Translating image ${this.processedImageCount + 1} of ${candidates.length}`;
      }
    }

    const isActive = this.isVisibleImageRunActive(runId);

    if (isActive) {
      this.statusMessage = this.getVisibleImageResultMessage(
        candidates.length,
        translatedImageCount,
        unreadableImageCount,
        failedImageCount
      );
    } else if (!this.isActive) {
      this.statusMessage = 'Image translation stopped';
    }
    const message = this.statusMessage;

    return {
      isActive: this.isActive,
      visibleImageCount: candidates.length,
      translatedImageCount,
      unreadableImageCount,
      failedImageCount,
      operationId,
      message
    };
  }

  discoverComicChapter(): ComicChapterState {
    if (!this.isActive || this.interactionMode !== 'page' || !this.translateText) {
      return this.getComicChapterFailure('Start image translation before scanning a comic chapter.');
    }
    if (this.activeVisibleImageBatch || this.activeComicChapterBatch) {
      return { ...this.comicChapterState, message: 'Wait for the current image task to finish.' };
    }

    this.comicChapterSnapshot?.discovery.candidates.forEach(candidate => {
      this.removeTargetOverlays(candidate.element);
    });
    const discovery = this.comicAdapters.discover(document, window.location);
    const discoveryId = `${this.chapterNamespace}:discovery:${++this.batchSequence}`;
    this.comicChapterSnapshot = discovery.candidates.length > 0
      ? { discoveryId, discovery }
      : null;
    this.comicChapterState = {
      phase: discovery.candidates.length > 0 ? 'awaiting-confirmation' : 'failed',
      isActive: this.isActive,
      discoveryId: discovery.candidates.length > 0 ? discoveryId : null,
      operationId: null,
      adapterId: discovery.adapterId,
      adapterVersion: discovery.adapterVersion,
      siteLabel: discovery.siteLabel,
      navigationKey: discovery.navigationKey,
      candidateCount: discovery.candidates.length,
      acceptedCount: discovery.candidates.length,
      processedCount: 0,
      translatedCount: 0,
      unreadableCount: 0,
      failedCount: 0,
      staleCount: 0,
      limitReached: discovery.limitReached,
      message: discovery.candidates.length > 0
        ? `Found ${discovery.candidates.length} chapter images${
          discovery.limitReached ? ' (scan limit reached)' : ''
        }`
        : 'No comic chapter images found'
    };
    return { ...this.comicChapterState };
  }

  getComicChapterState(): ComicChapterState {
    this.refreshComicChapterStaleness();
    return { ...this.comicChapterState, isActive: this.isActive };
  }

  startComicChapterTranslation(discoveryId: unknown): Promise<ComicChapterState> {
    const normalizedDiscoveryId = typeof discoveryId === 'string' ? discoveryId.trim() : '';
    if (this.activeComicChapterBatch) {
      return this.activeComicChapterBatch.promise;
    }
    if (!this.isActive || this.interactionMode !== 'page' || !this.translateText) {
      return Promise.resolve(this.getComicChapterFailure('Start image translation first.'));
    }
    if (this.activeVisibleImageBatch) {
      return Promise.resolve({ ...this.comicChapterState, message: 'Visible image translation is running.' });
    }

    this.refreshComicChapterStaleness();
    const snapshot = this.comicChapterSnapshot;
    if (
      !snapshot ||
      !normalizedDiscoveryId ||
      normalizedDiscoveryId !== snapshot.discoveryId ||
      this.comicChapterState.phase !== 'awaiting-confirmation'
    ) {
      return Promise.resolve(this.getComicChapterFailure('Comic chapter scan is missing or stale. Scan again.'));
    }

    this.abortActiveRequests();
    this.abortActiveProcessing();
    this.pendingTranslationCache.clear();
    this.targetTranslationRuns = new WeakMap();
    this.removeAllOverlays();
    const operationId = `${this.chapterNamespace}:${++this.batchSequence}`;
    const runId = ++this.comicChapterRun;
    this.processedImageCount = 0;
    this.totalImageCount = snapshot.discovery.candidates.length;
    this.comicChapterState = {
      ...this.comicChapterState,
      phase: 'running',
      operationId,
      processedCount: 0,
      translatedCount: 0,
      unreadableCount: 0,
      failedCount: 0,
      staleCount: 0,
      message: `Translating chapter image 1 of ${this.totalImageCount}`
    };
    this.statusMessage = this.comicChapterState.message;

    const promise = this.runComicChapterTranslation(snapshot, runId).finally(() => {
      if (this.activeComicChapterBatch?.operationId === operationId) {
        this.activeComicChapterBatch = null;
      }
    });
    this.activeComicChapterBatch = { operationId, promise };
    return promise;
  }

  stopComicChapterTranslation(): ComicChapterState {
    this.comicChapterRun += 1;
    this.activeComicChapterBatch = null;
    this.abortActiveRequests();
    this.abortActiveProcessing();
    this.cancelActiveDownloads();
    this.pendingTranslationCache.clear();
    this.targetTranslationRuns = new WeakMap();
    this.comicChapterSnapshot?.discovery.candidates.forEach(candidate => {
      this.removeTargetOverlays(candidate.element);
    });
    this.comicChapterSnapshot = null;
    this.processedImageCount = 0;
    this.totalImageCount = 0;
    this.resetComicChapterState('Comic chapter translation stopped', this.isActive);
    this.statusMessage = this.isActive ? 'Comic chapter translation stopped' : 'Image translation stopped';
    void this.terminateBundledOcrSession();
    return { ...this.comicChapterState };
  }

  private async runComicChapterTranslation(
    snapshot: { discoveryId: string; discovery: ComicChapterDiscovery },
    runId: number
  ): Promise<ComicChapterState> {
    let translatedCount = 0;
    let unreadableCount = 0;
    let failedCount = 0;
    let staleCount = 0;
    let textBlockCount = 0;
    let sourceCharacterCount = 0;
    let retainedReconstructionPixels = 0;
    let limitReached = snapshot.discovery.limitReached;

    this.targetTranslationRuns = new WeakMap();
    snapshot.discovery.candidates.forEach(candidate => this.removeTargetOverlays(candidate.element));

    chapterImages: for (const candidate of snapshot.discovery.candidates) {
      if (!this.isComicChapterRunActive(runId)) break;
      if (!this.comicAdapters.isCandidateCurrent(candidate, window.location, snapshot.discovery.navigationKey)) {
        staleCount += 1;
        this.removeTargetOverlays(candidate.element);
      } else {
        let tileLimitFailed = false;
        let imageBlocks: ImageTextBlock[] = [];
        try {
          imageBlocks = await this.extractImageTextBlocks(candidate.element);
        } catch (error) {
          if (!(error instanceof ComicImageTilingLimitError)) throw error;
          tileLimitFailed = true;
          limitReached = true;
          failedCount += 1;
          this.removeTargetOverlays(candidate.element);
        }
        if (!this.isComicChapterRunActive(runId)) break;
        if (!this.comicAdapters.isCandidateCurrent(candidate, window.location, snapshot.discovery.navigationKey)) {
          staleCount += 1;
          this.removeTargetOverlays(candidate.element);
        } else if (tileLimitFailed) {
          // The completed state reports a partial result instead of treating a bounded skip as unreadable OCR.
        } else if (imageBlocks.length === 0) {
          unreadableCount += 1;
        } else {
          const remainingBlocks = COMIC_CHAPTER_LIMITS.maxTextBlocks - textBlockCount;
          if (remainingBlocks <= 0) {
            limitReached = true;
            break;
          }
          const blockCandidates = imageBlocks.slice(0, remainingBlocks);
          const acceptedBlocks: ImageTextBlock[] = [];
          for (const block of blockCandidates) {
            if (sourceCharacterCount + block.text.length > COMIC_CHAPTER_LIMITS.maxSourceCharacters) {
              limitReached = true;
              break;
            }
            acceptedBlocks.push(block);
            sourceCharacterCount += block.text.length;
          }
          if (acceptedBlocks.length < imageBlocks.length) limitReached = true;
          if (acceptedBlocks.length === 0) break chapterImages;
          textBlockCount += acceptedBlocks.length;

          const reconstructionBudget = Math.max(
            0,
            COMIC_CHAPTER_LIMITS.maxRetainedReconstructionPixels - retainedReconstructionPixels
          );

          const outcome = await this.translateImageBlocks(
            candidate.element,
            acceptedBlocks,
            undefined,
            false,
            undefined,
            undefined,
            reconstructionBudget,
            this.chapterNamespace
          );
          if (outcome === 'translated') {
            translatedCount += 1;
            retainedReconstructionPixels += this.reconstructionPixelCounts.get(candidate.element) || 0;
          }
          else if (outcome === 'failed') failedCount += 1;
          else if (!this.isComicChapterRunActive(runId)) break;
          else staleCount += 1;
        }
      }

      if (!this.isComicChapterRunActive(runId)) break;
      this.processedImageCount += 1;
      this.comicChapterState = {
        ...this.comicChapterState,
        processedCount: this.processedImageCount,
        translatedCount,
        unreadableCount,
        failedCount,
        staleCount,
        limitReached,
        message: this.processedImageCount < this.totalImageCount
          ? `Translating chapter image ${this.processedImageCount + 1} of ${this.totalImageCount}`
          : 'Finishing comic chapter translation'
      };
      this.statusMessage = this.comicChapterState.message;
    }

    if (!this.isComicChapterRunActive(runId)) return { ...this.comicChapterState };
    const limitSuffix = limitReached ? ' (partial result: safety limit reached)' : '';
    const completedMessage = translatedCount > 0
      ? `Translated ${translatedCount} of ${snapshot.discovery.candidates.length} chapter images${limitSuffix}`
      : `No comic chapter text could be translated${limitSuffix}`;
    this.comicChapterState = {
      ...this.comicChapterState,
      phase: staleCount === snapshot.discovery.candidates.length ? 'stale' : 'completed',
      operationId: null,
      processedCount: this.processedImageCount,
      translatedCount,
      unreadableCount,
      failedCount,
      staleCount,
      limitReached,
      message: completedMessage
    };
    this.statusMessage = completedMessage;
    return { ...this.comicChapterState };
  }

  private async handleImageClick(event: MouseEvent): Promise<void> {
    if (!this.isActive || !this.translateText || this.activeComicChapterBatch) return;

    if (this.suppressNextClick) {
      event.preventDefault();
      event.stopPropagation();
      this.suppressNextClick = false;
      return;
    }

    const target = this.getImageTarget(event);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    await this.translateTarget(target, false);
  }

  private async translateTarget(
    target: Element,
    forceRefresh: boolean,
    region?: ImageSelectionRegion
  ): Promise<ImageTranslationOutcome> {
    if (!this.isActive || !this.translateText || !target.isConnected || this.activeComicChapterBatch) {
      return 'cancelled';
    }

    const targetRunId = ++this.nextTargetTranslationRun;
    this.targetTranslationRuns.set(target, targetRunId);
    const sourceFingerprint = this.getSourceFingerprint(target, region);
    const interactionEpoch = this.interactionEpoch;
    this.renderStatus(
      target,
      region ? 'Reading selected image area...' : 'Reading image text...',
      region
    );

    let imageBlocks: ImageTextBlock[];
    try {
      imageBlocks = await this.extractImageTextBlocks(target, region);
    } catch (error) {
      if (!(error instanceof ComicImageTilingLimitError)) throw error;
      if (this.isTargetTranslationRunActive(target, targetRunId)) {
        this.renderStatus(target, 'Image exceeds safe tiled OCR limits', region);
      }
      return 'failed';
    }
    if (!this.isInteractionEpochActive(interactionEpoch)) return 'cancelled';
    if (!this.isTargetTranslationRunActive(target, targetRunId)) return 'cancelled';
    if (!this.isSourceFingerprintCurrent(target, sourceFingerprint, region)) {
      this.removeTargetOverlays(target);
      return 'cancelled';
    }
    if (imageBlocks.length === 0) {
      this.renderStatus(
        target,
        region ? 'No readable text found in selection' : 'No readable image text found',
        region
      );
      return 'failed';
    }

    return this.translateImageBlocks(
      target,
      imageBlocks,
      region,
      forceRefresh,
      targetRunId,
      sourceFingerprint
    );
  }

  private handleImageHover(event: MouseEvent): void {
    const target = this.getImageTarget(event);
    if (!target) return;
    this.hoveredTarget = target;
    if (!this.isActive || this.interactionMode !== 'page' || this.hoverEntryDismissedForDocument) return;
    this.showHoverToolbar(target);
  }

  private handleImageOut(event: MouseEvent): void {
    const target = this.getImageTarget(event);
    if (!target || this.hoveredTarget !== target) return;
    const relatedTarget = event.relatedTarget;
    if (
      relatedTarget instanceof Element &&
      (target.contains(relatedTarget) || relatedTarget.closest('.lexibridge-image-hover-toolbar'))
    ) return;
    this.hoveredTarget = null;
    this.hideHoverToolbar();
  }

  private async handleImageShortcut(event: KeyboardEvent): Promise<void> {
    if (event.defaultPrevented || event.isComposing || this.isEditableEvent(event)) return;

    if (event.key === 'Escape' && this.regionSelectionArmedTarget) {
      if (this.interactionMode === 'region-once') {
        this.disable();
      } else {
        this.disarmRegionSelection();
      }
      return;
    }

    if (
      !this.translateText ||
      this.interactionMode === 'context-once' ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey ||
      event.key.toLowerCase() !== 'z' ||
      !this.hoveredTarget?.isConnected
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (!this.isActive) this.enableRegionMode();
    if (this.interactionMode !== 'page' && this.interactionMode !== 'region-once') return;
    this.regionSelectionArmedTarget = this.hoveredTarget;
    document.body.classList.add('lexibridge-image-region-armed');
  }

  private enableRegionMode(): void {
    this.interactionEpoch += 1;
    this.isActive = true;
    this.interactionMode = 'region-once';
    this.statusMessage = 'Image region selection ready';
    this.createStyleElement();
    this.ensureResultObserver();
    window.addEventListener('scroll', this.boundHandleViewportChange, true);
    window.addEventListener('resize', this.boundHandleViewportChange);
    document.addEventListener('mousedown', this.boundHandleMouseDown, true);
    document.addEventListener('mousemove', this.boundHandleMouseMove, true);
    document.addEventListener('mouseup', this.boundHandleMouseUp, true);
  }

  private isEditableEvent(event: KeyboardEvent): boolean {
    return event.composedPath().some(target => {
      if (!(target instanceof Element)) return false;
      if (target instanceof HTMLElement && target.isContentEditable) return true;
      return Boolean(target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
      ));
    });
  }

  private showHoverToolbar(target: Element): void {
    if (
      !this.isActive ||
      this.interactionMode !== 'page' ||
      !target.isConnected ||
      this.hoverEntryDismissedForDocument
    ) return;

    this.hideHoverToolbar();
    const toolbar = document.createElement('div');
    toolbar.className = 'lexibridge-image-hover-toolbar';
    toolbar.setAttribute('data-lexibridge-owned', 'true');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Image translation actions');

    const state = this.resultStates.get(target);
    this.appendToolbarButton(toolbar, state ? 'retranslate' : 'translate', state ? 'Retranslate image' : 'Translate image', state ? 'R' : 'T');
    if (state === 'preview') this.appendToolbarButton(toolbar, 'apply', 'Apply translation', '\u2713');
    if (state) this.appendToolbarButton(toolbar, 'undo', 'Undo translation', '\u21b6');
    if (this.getReconstructedCanvas(target) || this.hasTiledReconstruction(target)) {
      this.appendToolbarButton(toolbar, 'download', 'Download translated PNG', '\u2193');
    }
    this.appendToolbarButton(toolbar, 'close', 'Close image actions', '\u00d7');

    toolbar.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    toolbar.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      void this.handleToolbarAction(target, button.dataset.action || '');
    });

    const rect = target.getBoundingClientRect();
    Object.assign(toolbar.style, {
      left: `${Math.max(8, Math.min(window.innerWidth - 224, rect.right - 216))}px`,
      top: `${Math.max(8, rect.top + 8)}px`
    });
    document.body.appendChild(toolbar);
    this.hoverToolbar = toolbar;
  }

  private appendToolbarButton(
    toolbar: HTMLElement,
    action: string,
    label: string,
    icon: string
  ): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.textContent = icon;
    toolbar.appendChild(button);
  }

  private async handleToolbarAction(target: Element, action: string): Promise<void> {
    if (!this.isActive || !target.isConnected) return;

    if (action === 'close') {
      this.hoverEntryDismissedForDocument = true;
      this.hideHoverToolbar();
      return;
    }
    if (action === 'apply') {
      this.applyTargetTranslation(target);
    } else if (action === 'undo') {
      this.undoTargetTranslation(target);
    } else if (action === 'download') {
      await this.downloadTargetTranslation(target);
    } else if (action === 'translate' || action === 'retranslate') {
      await this.translateTarget(target, action === 'retranslate');
    }

    if (this.isActive && target.isConnected) this.showHoverToolbar(target);
  }

  private applyTargetTranslation(target: Element): void {
    const overlays = this.overlayElements.get(target);
    if (!overlays?.length) return;
    this.resultStates.set(target, 'applied');
    overlays.forEach(overlay => {
      overlay.dataset.lexibridgeImageState = 'applied';
      overlay.classList.add('lexibridge-image-translation-applied');
    });
    this.statusMessage = 'Image translation applied';
  }

  private undoTargetTranslation(target: Element): void {
    this.targetTranslationRuns.set(target, ++this.nextTargetTranslationRun);
    this.removeTargetOverlays(target);
    this.statusMessage = 'Image translation removed';
  }

  private getReconstructedCanvas(target: Element): HTMLCanvasElement | null {
    return this.overlayElements.get(target)?.find(
      overlay => overlay instanceof HTMLCanvasElement &&
        overlay.classList.contains('lexibridge-image-comic-overlay') &&
        overlay.dataset.lexibridgeComposite !== 'tile'
    ) as HTMLCanvasElement | undefined || null;
  }

  private async downloadTargetTranslation(target: Element): Promise<boolean> {
    const canvas = this.getReconstructedCanvas(target) || this.composeTiledDownloadCanvas(target);
    if (!canvas || typeof canvas.toBlob !== 'function' || typeof URL.createObjectURL !== 'function') {
      this.statusMessage = this.hasTiledReconstruction(target)
        ? 'This translated image is too large for safe PNG export'
        : 'PNG download is available for reconstructed images only';
      return false;
    }

    const blob = await this.createCanvasPngBlob(canvas);
    if (!blob || !this.isActive || !target.isConnected) return false;

    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(blob);
      this.activeObjectUrls.add(objectUrl);
    } catch {
      this.statusMessage = 'Could not prepare translated PNG';
      return false;
    }
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `lexibridge-image-translation-${Date.now()}.png`;
    anchor.style.display = 'none';
    try {
      document.body.appendChild(anchor);
      anchor.click();
      this.statusMessage = 'Translated PNG downloaded';
      return true;
    } catch {
      this.statusMessage = 'Could not download translated PNG';
      return false;
    } finally {
      anchor.remove();
      window.setTimeout(() => this.revokeObjectUrl(objectUrl), 0);
    }
  }

  private createCanvasPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (blob: Blob | null): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        this.activeBlobCancellations.delete(cancel);
        resolve(blob);
      };
      const cancel = (): void => finish(null);
      const timeoutId = window.setTimeout(cancel, 5_000);
      this.activeBlobCancellations.add(cancel);
      try {
        canvas.toBlob(blob => finish(blob), 'image/png');
      } catch {
        finish(null);
      }
    });
  }

  private hasTiledReconstruction(target: Element): boolean {
    return Boolean(this.overlayElements.get(target)?.some(
      overlay => overlay instanceof HTMLCanvasElement && overlay.dataset.lexibridgeComposite === 'tile'
    ));
  }

  private composeTiledDownloadCanvas(target: Element): HTMLCanvasElement | null {
    if (!(target instanceof HTMLImageElement)) return null;
    const patches = this.overlayElements.get(target)?.filter(
      (overlay): overlay is HTMLCanvasElement => (
        overlay instanceof HTMLCanvasElement && overlay.dataset.lexibridgeComposite === 'tile'
      )
    ) || [];
    const width = target.naturalWidth || target.width;
    const height = target.naturalHeight || target.height;
    const pixels = width * height;
    if (
      patches.length === 0 ||
      width <= 0 ||
      height <= 0 ||
      width > 16_384 ||
      height > 16_384 ||
      !Number.isSafeInteger(pixels) ||
      pixels > COMIC_IMAGE_LIMITS.maxCompositePixels
    ) {
      return null;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context || typeof context.drawImage !== 'function') return null;
      context.drawImage(target, 0, 0, width, height);
      for (const patch of patches) {
        const x = Number.parseFloat(patch.dataset.lexibridgeSourceX || '');
        const y = Number.parseFloat(patch.dataset.lexibridgeSourceY || '');
        const patchWidth = Number.parseFloat(patch.dataset.lexibridgeSourceWidth || '');
        const patchHeight = Number.parseFloat(patch.dataset.lexibridgeSourceHeight || '');
        if (![x, y, patchWidth, patchHeight].every(Number.isFinite)) return null;
        context.drawImage(patch, x, y, patchWidth, patchHeight);
      }
      return canvas;
    } catch {
      return null;
    }
  }

  private revokeObjectUrl(objectUrl: string): void {
    if (!this.activeObjectUrls.delete(objectUrl)) return;
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // The browser may already have invalidated the URL during teardown.
    }
  }

  private cancelActiveDownloads(): void {
    this.activeBlobCancellations.forEach(cancel => cancel());
    this.activeBlobCancellations.clear();
    this.activeObjectUrls.forEach(url => this.revokeObjectUrl(url));
  }

  private hideHoverToolbar(): void {
    this.hoverToolbar?.remove();
    this.hoverToolbar = null;
  }

  private ensureResultObserver(): void {
    if (this.resultObserver || !document.documentElement) return;
    this.resultObserver = new MutationObserver(() => this.pruneStaleResults());
    this.resultObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'width', 'height', 'viewBox']
    });
  }

  private pruneStaleResults(): void {
    this.resultSourceIdentities.forEach((identity, target) => {
      if (!target.isConnected || this.getResultSourceIdentity(target) !== identity) {
        this.removeTargetOverlays(target);
      }
    });
  }

  private getResultSourceIdentity(target: Element): string {
    const rect = target.getBoundingClientRect();
    const renderedSize = [
      Math.round(rect.width * 100) / 100,
      Math.round(rect.height * 100) / 100
    ];
    if (target instanceof HTMLImageElement) {
      return JSON.stringify([
        'img',
        target.currentSrc,
        target.getAttribute('src'),
        target.getAttribute('srcset'),
        target.naturalWidth,
        target.naturalHeight,
        renderedSize
      ]);
    }
    if (target instanceof HTMLCanvasElement) {
      return JSON.stringify(['canvas', target.width, target.height, renderedSize]);
    }
    return JSON.stringify([
      target.tagName,
      target.getAttribute('viewBox'),
      target.getAttribute('width'),
      target.getAttribute('height'),
      (target.textContent || '').slice(0, 2048),
      renderedSize
    ]);
  }

  private recordOverlayAnchor(target: Element): void {
    const rect = target.getBoundingClientRect();
    this.overlayAnchors.set(target, {
      left: rect.left,
      top: rect.top,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    });
  }

  private refreshOverlayPositions(): void {
    this.overlayElements.forEach((overlays, target) => {
      if (!target.isConnected) {
        this.removeTargetOverlays(target);
        return;
      }

      const previous = this.overlayAnchors.get(target);
      const rect = target.getBoundingClientRect();
      if (!previous) {
        this.recordOverlayAnchor(target);
        return;
      }

      overlays.forEach(overlay => {
        const fixed = overlay.style.position === 'fixed';
        const deltaX = fixed
          ? rect.left - previous.left
          : rect.left + window.scrollX - previous.left - previous.scrollX;
        const deltaY = fixed
          ? rect.top - previous.top
          : rect.top + window.scrollY - previous.top - previous.scrollY;
        const left = Number.parseFloat(overlay.style.left);
        const top = Number.parseFloat(overlay.style.top);
        if (Number.isFinite(left)) overlay.style.left = `${left + deltaX}px`;
        if (Number.isFinite(top)) overlay.style.top = `${top + deltaY}px`;
      });
      this.recordOverlayAnchor(target);
    });
  }

  private disarmRegionSelection(): void {
    this.regionSelectionArmedTarget = null;
    document.body.classList.remove('lexibridge-image-region-armed');
    this.removeSelectionBox();
    this.selectionState = null;
  }

  private handleMouseDown(event: MouseEvent): void {
    if (!this.isActive || event.button !== 0 || this.activeComicChapterBatch) return;

    const target = this.getImageTarget(event);
    if (!target) return;
    if (this.interactionMode === 'region-once' && this.regionSelectionArmedTarget !== target) return;
    if (this.regionSelectionArmedTarget && this.regionSelectionArmedTarget !== target) return;

    this.selectionState = {
      target,
      interactionEpoch: this.interactionEpoch,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      points: [{ x: event.clientX, y: event.clientY }]
    };
    this.updateSelectionBox(this.selectionState);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.selectionState) return;

    this.selectionState.currentX = event.clientX;
    this.selectionState.currentY = event.clientY;
    this.appendSelectionPoint(this.selectionState, event.clientX, event.clientY);
    this.updateSelectionBox(this.selectionState);
  }

  private async handleMouseUp(event: MouseEvent): Promise<void> {
    if (!this.selectionState || !this.translateText) return;

    this.selectionState.currentX = event.clientX;
    this.selectionState.currentY = event.clientY;
    this.appendSelectionPoint(this.selectionState, event.clientX, event.clientY);
    const selectionState = this.selectionState;
    this.selectionState = null;

    const region = this.getSelectionRegion(selectionState);
    this.removeSelectionBox();
    this.disarmRegionSelection();

    if (!region) return;

    event.preventDefault();
    event.stopPropagation();
    this.suppressNextClick = true;

    if (!this.isInteractionEpochActive(selectionState.interactionEpoch)) return;
    await this.translateTarget(selectionState.target, false, region);
  }

  private async translateImageBlocks(
    target: Element,
    imageBlocks: ImageTextBlock[],
    region?: ImageSelectionRegion,
    forceRefresh = false,
    existingTargetRunId?: number,
    existingSourceFingerprint?: string,
    reconstructionPixelBudget: number = COMIC_CHAPTER_LIMITS.maxRetainedReconstructionPixels,
    requestNamespace = this.requestNamespace
  ): Promise<ImageTranslationOutcome> {
    if (!this.translateText || !this.isActive) return 'cancelled';

    const targetRunId = existingTargetRunId ?? ++this.nextTargetTranslationRun;
    if (existingTargetRunId === undefined) this.targetTranslationRuns.set(target, targetRunId);
    const sourceFingerprint = existingSourceFingerprint ?? this.getSourceFingerprint(target, region);
    this.renderImageBlocks(target, imageBlocks, imageBlocks.map(() => 'Translating...'), region);

    try {
      const translatedBlocks = await this.translateImageTextBlocks(imageBlocks, forceRefresh, requestNamespace);

      if (this.isTargetTranslationRunActive(target, targetRunId)) {
        if (!this.isSourceFingerprintCurrent(target, sourceFingerprint, region)) {
          this.removeTargetOverlays(target);
          return 'cancelled';
        }
        const reconstructedPixels = reconstructionPixelBudget > 0 && !region?.isFreeform
          ? await this.tryRenderComicImage(
            target,
            imageBlocks,
            translatedBlocks,
            targetRunId,
            sourceFingerprint,
            region,
            reconstructionPixelBudget
          )
          : 0;
        const renderedComic = reconstructedPixels > 0;
        if (!this.isTargetTranslationRunActive(target, targetRunId)) return 'cancelled';
        if (!this.isSourceFingerprintCurrent(target, sourceFingerprint, region)) {
          this.removeTargetOverlays(target);
          return 'cancelled';
        }
        if (renderedComic) this.reconstructionPixelCounts.set(target, reconstructedPixels);
        else {
          this.reconstructionPixelCounts.delete(target);
          this.renderImageBlocks(target, imageBlocks, translatedBlocks, region);
        }
        this.resultStates.set(target, 'preview');
        this.resultSourceIdentities.set(target, this.getResultSourceIdentity(target));
        this.recordOverlayAnchor(target);
        if (this.hoveredTarget === target) this.showHoverToolbar(target);
        return 'translated';
      }

      return 'cancelled';
    } catch (error) {
      if (this.isTargetTranslationRunActive(target, targetRunId)) {
        this.renderImageBlocks(target, imageBlocks, imageBlocks.map(() => 'Image translation failed'), region);
        return 'failed';
      }

      return 'cancelled';
    }
  }

  private async translateCachedImageText(text: string, requestNamespace = this.requestNamespace): Promise<string> {
    if (!this.translateText) return '';

    const cacheKey = this.createTranslationCacheKey(text);
    const cacheGeneration = this.translationCacheGenerations.get(cacheKey) || 0;
    let translatedText = this.translationCache.get(cacheKey);
    if (translatedText === undefined) {
      let pendingTranslation = this.pendingTranslationCache.get(cacheKey);
      if (!pendingTranslation) {
        const controller = new AbortController();
        const requestId = `${requestNamespace}:${++this.requestSequence}`;
        this.activeRequestControllers.add(controller);
        pendingTranslation = this.translateText(text, {
          requestId,
          signal: controller.signal
        })
          .then(result => {
            if (controller.signal.aborted || !this.isActive) {
              throw new DOMException('Canceled', 'AbortError');
            }
            if ((this.translationCacheGenerations.get(cacheKey) || 0) === cacheGeneration) {
              this.translationCache.set(cacheKey, result);
            }
            return result;
          })
          .finally(() => {
            this.activeRequestControllers.delete(controller);
            if (this.pendingTranslationCache.get(cacheKey) === pendingTranslation) {
              this.pendingTranslationCache.delete(cacheKey);
            }
          });
        this.pendingTranslationCache.set(cacheKey, pendingTranslation);
      }
      translatedText = await pendingTranslation;
    }

    return translatedText;
  }

  private async translateImageTextBlocks(
    blocks: ImageTextBlock[],
    forceRefresh = false,
    requestNamespace = this.requestNamespace
  ): Promise<string[]> {
    if (forceRefresh) this.invalidateTranslationCacheForBlocks(blocks);

    const results = new Array<string>(blocks.length);
    let nextIndex = 0;
    const workerCount = Math.min(MAX_IMAGE_TRANSLATION_CONCURRENCY, blocks.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (this.isActive) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= blocks.length) return;
        results[index] = await this.translateCachedImageText(blocks[index].text, requestNamespace);
      }
      throw new DOMException('Canceled', 'AbortError');
    });
    await Promise.all(workers);
    return results;
  }

  private invalidateTranslationCacheForBlocks(blocks: ImageTextBlock[]): void {
    new Set(blocks.map(block => this.createTranslationCacheKey(block.text))).forEach(cacheKey => {
      this.translationCacheGenerations.set(
        cacheKey,
        (this.translationCacheGenerations.get(cacheKey) || 0) + 1
      );
      this.translationCache.delete(cacheKey);
      this.pendingTranslationCache.delete(cacheKey);
    });
  }

  private abortActiveRequests(): void {
    this.activeRequestControllers.forEach(controller => controller.abort());
    this.activeRequestControllers.clear();
  }

  private abortActiveProcessing(): void {
    this.activeProcessingControllers.forEach(controller => controller.abort());
    this.activeProcessingControllers.clear();
  }

  private getImageTarget(event: MouseEvent): Element | null {
    for (const pathTarget of event.composedPath()) {
      if (!(pathTarget instanceof Element) || this.isExtensionOwnedElement(pathTarget)) continue;
      const imageTarget = pathTarget.matches('img, canvas, svg, picture')
        ? pathTarget
        : pathTarget.closest('img, canvas, svg, picture');
      if (!imageTarget) continue;
      if (imageTarget instanceof HTMLPictureElement) {
        return imageTarget.querySelector('img') || imageTarget;
      }
      return imageTarget;
    }
    return null;
  }

  private resolveImageTarget(srcUrl: string): Element | null {
    const normalizedSourceUrl = this.normalizeImageUrl(srcUrl);
    const rememberedTarget = this.lastContextMenuTarget;
    const rememberedAt = this.lastContextMenuCapturedAt;
    this.lastContextMenuTarget = null;
    this.lastContextMenuCapturedAt = 0;

    if (
      rememberedTarget?.isConnected &&
      Date.now() - rememberedAt <= CONTEXT_MENU_TARGET_MAX_AGE_MS &&
      (!normalizedSourceUrl || this.getImageSourceUrls(rememberedTarget).includes(normalizedSourceUrl))
    ) {
      return rememberedTarget;
    }

    if (!normalizedSourceUrl) return null;
    const matches = this.findImageCandidates().filter(target => (
      this.getImageSourceUrls(target).includes(normalizedSourceUrl)
    ));
    return matches.length === 1 ? matches[0] : null;
  }

  private getImageSourceUrls(target: Element): string[] {
    if (!(target instanceof HTMLImageElement)) return [];
    return [target.currentSrc, target.src, target.getAttribute('src') || '']
      .map(value => this.normalizeImageUrl(value))
      .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  }

  private normalizeImageUrl(value: string): string {
    if (!value) return '';
    try {
      return new URL(value, document.baseURI).href;
    } catch {
      return value;
    }
  }

  private findImageCandidates(): Element[] {
    return Array.from(document.querySelectorAll('img, canvas, svg'))
      .filter(element => !this.isExtensionOwnedElement(element))
      .filter(element => !(element instanceof SVGSVGElement && element.parentElement?.closest('svg')));
  }

  private findVisibleImageCandidates(): Element[] {
    return this.findImageCandidates().filter(element => this.isVisibleImageCandidate(element));
  }

  private isVisibleImageCandidate(element: Element): boolean {
    if (!element.isConnected || this.isElementHidden(element)) return false;

    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return false;
    if (rect.width < 24 || rect.height < 24) return false;

    return rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;
  }

  private isElementHidden(element: Element): boolean {
    let current: Element | null = element;

    while (current && current !== document.documentElement) {
      if ((current instanceof HTMLElement && current.hidden) || current.getAttribute('aria-hidden') === 'true') {
        return true;
      }

      const style = window.getComputedStyle(current);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        Number.parseFloat(style.opacity || '1') === 0
      ) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  private isExtensionOwnedElement(element: Element): boolean {
    let current: Element | null = element;

    while (current && current !== document.body && current !== document.documentElement) {
      if (
        current.id.startsWith('lexibridge-') ||
        Array.from(current.classList).some(className => className.startsWith('lexibridge-')) ||
        current.getAttribute('data-lexibridge-owned') === 'true'
      ) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  private async extractImageTextBlocks(element: Element, region?: ImageSelectionRegion): Promise<ImageTextBlock[]> {
    const controller = new AbortController();
    this.activeProcessingControllers.add(controller);
    try {
      const detectedBlocks = await this.extractWithTextDetector(element, region, controller.signal);
      if (controller.signal.aborted) return [];
      if (detectedBlocks.length > 0) {
        return this.uniqueImageTextBlocks(detectedBlocks);
      }

      const bundledBlocks = await this.extractWithBundledOcr(element, region, controller.signal);
      if (controller.signal.aborted) return [];
      if (bundledBlocks.length > 0) {
        return this.uniqueImageTextBlocks(bundledBlocks);
      }

      const svgText = this.extractSvgText(element);
      const accessibleText = region ? '' : this.extractAccessibleText(element);

      return this.uniqueTextBlocks([svgText, accessibleText])
        .map(text => ({ text }));
    } finally {
      this.activeProcessingControllers.delete(controller);
    }
  }

  private async extractWithTextDetector(
    element: Element,
    region: ImageSelectionRegion | undefined,
    signal: AbortSignal
  ): Promise<ImageTextBlock[]> {
    if (!window.TextDetector || typeof window.createImageBitmap !== 'function') {
      return [];
    }

    if (!(element instanceof HTMLImageElement) && !(element instanceof HTMLCanvasElement)) {
      return [];
    }

    try {
      if (element instanceof HTMLImageElement && !element.complete && typeof element.decode === 'function') {
        await element.decode();
      }
      if (signal.aborted) return [];

      const sourceMapping = this.getImageBitmapMapping(element, region);
      const sourcePixels = sourceMapping.pixelWidth * sourceMapping.pixelHeight;
      if (!region?.isFreeform && Number.isSafeInteger(sourcePixels) && sourcePixels > COMIC_IMAGE_LIMITS.maxAnalysisPixels) {
        return await this.extractTiledWithTextDetector(element, sourceMapping, signal);
      }

      const mapping = this.getBoundedOcrMapping(sourceMapping);
      const bitmap = region
        ? await this.createRegionBitmap(element, region, mapping)
        : await window.createImageBitmap(element, {
          resizeWidth: mapping.pixelWidth,
          resizeHeight: mapping.pixelHeight,
          resizeQuality: 'high'
        });
      try {
        const detector = new window.TextDetector();
        const detections = await detector.detect(bitmap);
        if (signal.aborted) return [];

        return detections
          .map(item => {
            const sourcePolygon = this.mapDetectedPolygonToSource(item.cornerPoints, mapping);
            const sourceRect = sourcePolygon
              ? this.getPolygonBounds(sourcePolygon, mapping)
              : this.mapDetectedTextBoxToSource(item.boundingBox, mapping);
            return {
              text: this.normalizeText(item.rawValue || ''),
              viewportRect: sourceRect ? this.mapSourceRectToViewport(sourceRect, mapping) : undefined,
              sourceRect,
              sourcePolygon,
              confidence: 100,
              level: sourceRect ? this.getOcrTokenLevel(sourceRect, mapping) : 'page-fallback' as OcrTokenLevel
            };
          })
          .filter(block => Boolean(block.text));
      } finally {
        bitmap.close();
      }
    } catch (error) {
      if (error instanceof ComicImageTilingLimitError) throw error;
      return [];
    }
  }

  private async extractWithBundledOcr(
    element: Element,
    region: ImageSelectionRegion | undefined,
    signal: AbortSignal
  ): Promise<ImageTextBlock[]> {
    if (!(element instanceof HTMLImageElement) && !(element instanceof HTMLCanvasElement)) {
      return [];
    }

    try {
      if (element instanceof HTMLImageElement && !element.complete && typeof element.decode === 'function') {
        await element.decode();
      }
      if (signal.aborted) return [];

      const sourceMapping = this.getImageBitmapMapping(element, region);
      const sourcePixels = sourceMapping.pixelWidth * sourceMapping.pixelHeight;
      if (!region?.isFreeform && Number.isSafeInteger(sourcePixels) && sourcePixels > COMIC_IMAGE_LIMITS.maxAnalysisPixels) {
        return await this.extractTiledWithBundledOcr(element, sourceMapping, signal);
      }

      const mapping = this.getBoundedOcrMapping(sourceMapping);
      const canvas = document.createElement('canvas');
      canvas.width = mapping.pixelWidth;
      canvas.height = mapping.pixelHeight;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return [];

      if (!this.drawImageToOcrCanvas(context, element, mapping, region)) return [];
      const session = this.getBundledOcrSession();
      const lines = await session.recognize(canvas, undefined, signal);
      if (signal.aborted) return [];

      return lines.map(line => {
        const sourceRect = this.mapDetectedTextBoxToSource(line.boundingBox, mapping);
        return {
          text: this.normalizeText(line.text),
          viewportRect: this.mapDetectedTextBoxToViewport(line.boundingBox, mapping),
          sourceRect,
          confidence: line.confidence,
          level: sourceRect ? this.getOcrTokenLevel(sourceRect, mapping) : 'page-fallback' as OcrTokenLevel
        };
      }).filter(block => Boolean(block.text));
    } catch (error) {
      if (error instanceof ComicImageTilingLimitError) throw error;
      return [];
    }
  }

  private async extractTiledWithTextDetector(
    element: HTMLImageElement | HTMLCanvasElement,
    sourceMapping: ImageBitmapMapping,
    signal: AbortSignal
  ): Promise<ImageTextBlock[]> {
    const plan = planComicImageTiles({
      width: sourceMapping.pixelWidth,
      height: sourceMapping.pixelHeight
    }, { signal });
    const TextDetectorConstructor = window.TextDetector;
    if (!TextDetectorConstructor) return [];
    const detector = new TextDetectorConstructor();
    const mappedLines: MappedComicOcrLine[] = [];

    for (const tile of plan.tiles) {
      if (signal.aborted) return [];
      const tileMapping = this.getTileMapping(sourceMapping, tile);
      const bitmap = await window.createImageBitmap(
        element,
        Math.round(tileMapping.sourceX),
        Math.round(tileMapping.sourceY),
        Math.max(1, Math.round(tileMapping.sourceWidth)),
        Math.max(1, Math.round(tileMapping.sourceHeight)),
        {
          resizeWidth: tile.sourceRect.width,
          resizeHeight: tile.sourceRect.height,
          resizeQuality: 'high'
        }
      );
      try {
        const detections = await detector.detect(bitmap);
        if (signal.aborted) return [];
        const localLines = detections.flatMap((item, index) => {
          const rect = this.mapDetectedTextBoxToSource(item.boundingBox, tileMapping);
          const text = this.normalizeText(item.rawValue || '');
          if (!rect || !text) return [];
          return [{
            id: `detected-${index + 1}`,
            text,
            confidence: 100,
            rect,
            sourcePolygon: this.mapDetectedPolygonToSource(item.cornerPoints, tileMapping)
          }];
        });
        mappedLines.push(...mapTileOcrLinesToSource(tile, localLines, { signal }));
      } finally {
        bitmap.close();
      }
    }

    return this.mapTiledOcrLinesToBlocks(
      deduplicateOverlappingOcrLines(mappedLines, { signal }),
      sourceMapping
    );
  }

  private async extractTiledWithBundledOcr(
    element: HTMLImageElement | HTMLCanvasElement,
    sourceMapping: ImageBitmapMapping,
    signal: AbortSignal
  ): Promise<ImageTextBlock[]> {
    const plan = planComicImageTiles({
      width: sourceMapping.pixelWidth,
      height: sourceMapping.pixelHeight
    }, { signal });
    const session = this.getBundledOcrSession();
    const mappedLines: MappedComicOcrLine[] = [];

    for (const tile of plan.tiles) {
      if (signal.aborted) return [];
      const tileMapping = this.getTileMapping(sourceMapping, tile);
      const canvas = document.createElement('canvas');
      canvas.width = tile.sourceRect.width;
      canvas.height = tile.sourceRect.height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context || !this.drawImageToOcrCanvas(context, element, tileMapping)) return [];
      const lines = await session.recognize(canvas, undefined, signal);
      if (signal.aborted) return [];
      const localLines = lines.flatMap((line, index) => {
        const rect = this.mapDetectedTextBoxToSource(line.boundingBox, tileMapping);
        const text = this.normalizeText(line.text);
        if (!rect || !text) return [];
        return [{
          id: `line-${index + 1}`,
          text,
          confidence: Math.max(0, Math.min(100, line.confidence || 0)),
          rect
        }];
      });
      mappedLines.push(...mapTileOcrLinesToSource(tile, localLines, { signal }));
      canvas.width = 1;
      canvas.height = 1;
    }

    return this.mapTiledOcrLinesToBlocks(
      deduplicateOverlappingOcrLines(mappedLines, { signal }),
      sourceMapping
    );
  }

  private mapTiledOcrLinesToBlocks(
    lines: readonly MappedComicOcrLine[],
    sourceMapping: ImageBitmapMapping
  ): ImageTextBlock[] {
    return lines.map(line => ({
      text: line.text,
      viewportRect: this.mapSourceRectToViewport(line.rect, sourceMapping),
      sourceRect: line.rect,
      sourcePolygon: line.sourcePolygon,
      sourceTileRect: line.sourceTileRect,
      sourceTileCoreRect: line.sourceTileCoreRect,
      confidence: line.confidence,
      level: this.getOcrTokenLevel(
        {
          x: line.rect.x - line.sourceTileRect.x,
          y: line.rect.y - line.sourceTileRect.y,
          width: line.rect.width,
          height: line.rect.height
        },
        {
          ...sourceMapping,
          pixelWidth: line.sourceTileRect.width,
          pixelHeight: line.sourceTileRect.height
        }
      )
    }));
  }

  private getTileMapping(
    sourceMapping: ImageBitmapMapping,
    tile: ComicImageTile
  ): ImageBitmapMapping {
    const sourceScaleX = sourceMapping.sourceWidth / sourceMapping.pixelWidth;
    const sourceScaleY = sourceMapping.sourceHeight / sourceMapping.pixelHeight;
    const viewportScaleX = sourceMapping.viewportWidth / sourceMapping.pixelWidth;
    const viewportScaleY = sourceMapping.viewportHeight / sourceMapping.pixelHeight;
    return {
      sourceX: sourceMapping.sourceX + tile.sourceRect.x * sourceScaleX,
      sourceY: sourceMapping.sourceY + tile.sourceRect.y * sourceScaleY,
      sourceWidth: tile.sourceRect.width * sourceScaleX,
      sourceHeight: tile.sourceRect.height * sourceScaleY,
      viewportLeft: sourceMapping.viewportLeft + tile.sourceRect.x * viewportScaleX,
      viewportTop: sourceMapping.viewportTop + tile.sourceRect.y * viewportScaleY,
      viewportWidth: tile.sourceRect.width * viewportScaleX,
      viewportHeight: tile.sourceRect.height * viewportScaleY,
      pixelWidth: tile.sourceRect.width,
      pixelHeight: tile.sourceRect.height
    };
  }

  private getBundledOcrSession(): BundledOcrSession {
    if (!this.bundledOcrSession) {
      this.bundledOcrSession = this.imageOcrService.createSession(this.ocrLanguage);
    }
    return this.bundledOcrSession;
  }

  private async terminateBundledOcrSession(): Promise<void> {
    const session = this.bundledOcrSession;
    this.bundledOcrSession = null;
    await session?.terminate();
  }

  private async createRegionBitmap(
    element: HTMLImageElement | HTMLCanvasElement,
    region: ImageSelectionRegion,
    mapping: ImageBitmapMapping
  ): Promise<ImageBitmap> {
    if (region.isFreeform) {
      const canvas = document.createElement('canvas');
      canvas.width = mapping.pixelWidth;
      canvas.height = mapping.pixelHeight;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context || !this.drawImageToOcrCanvas(context, element, mapping, region)) {
        throw new Error('This browser cannot mask the selected image region.');
      }
      return window.createImageBitmap(canvas);
    }

    return window.createImageBitmap(
      element,
      Math.round(mapping.sourceX),
      Math.round(mapping.sourceY),
      Math.max(1, Math.round(mapping.sourceWidth)),
      Math.max(1, Math.round(mapping.sourceHeight)),
      {
        resizeWidth: mapping.pixelWidth,
        resizeHeight: mapping.pixelHeight,
        resizeQuality: 'high'
      }
    );
  }

  private drawImageToOcrCanvas(
    context: CanvasRenderingContext2D,
    element: HTMLImageElement | HTMLCanvasElement,
    mapping: ImageBitmapMapping,
    region?: ImageSelectionRegion
  ): boolean {
    if (region?.isFreeform) {
      if (
        typeof context.fillRect !== 'function' ||
        typeof context.save !== 'function' ||
        typeof context.restore !== 'function' ||
        typeof context.beginPath !== 'function' ||
        typeof context.moveTo !== 'function' ||
        typeof context.lineTo !== 'function' ||
        typeof context.closePath !== 'function' ||
        typeof context.clip !== 'function'
      ) return false;

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, mapping.pixelWidth, mapping.pixelHeight);
      context.save();
      context.beginPath();
      region.polygon.forEach((point, index) => {
        const x = (point.x / Math.max(1, region.width)) * mapping.pixelWidth;
        const y = (point.y / Math.max(1, region.height)) * mapping.pixelHeight;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.clip();
    }

    context.drawImage(
      element,
      mapping.sourceX,
      mapping.sourceY,
      mapping.sourceWidth,
      mapping.sourceHeight,
      0,
      0,
      mapping.pixelWidth,
      mapping.pixelHeight
    );
    if (region?.isFreeform) context.restore();
    return true;
  }

  private getBoundedOcrMapping(mapping: ImageBitmapMapping): ImageBitmapMapping {
    const pixelCount = mapping.pixelWidth * mapping.pixelHeight;
    if (Number.isSafeInteger(pixelCount) && pixelCount <= COMIC_IMAGE_LIMITS.maxAnalysisPixels) {
      return mapping;
    }

    const scale = Math.sqrt(COMIC_IMAGE_LIMITS.maxAnalysisPixels / Math.max(1, pixelCount));
    return {
      ...mapping,
      pixelWidth: Math.max(1, Math.floor(mapping.pixelWidth * scale)),
      pixelHeight: Math.max(1, Math.floor(mapping.pixelHeight * scale))
    };
  }

  private getImageBitmapMapping(element: HTMLImageElement | HTMLCanvasElement, region?: ImageSelectionRegion): ImageBitmapMapping {
    const rect = element.getBoundingClientRect();
    const sourceWidth = element instanceof HTMLImageElement
      ? element.naturalWidth || rect.width
      : element.width || rect.width;
    const sourceHeight = element instanceof HTMLImageElement
      ? element.naturalHeight || rect.height
      : element.height || rect.height;
    const scaleX = sourceWidth / Math.max(rect.width, 1);
    const scaleY = sourceHeight / Math.max(rect.height, 1);

    if (region) {
      const sourceX = Math.max(0, Math.min(sourceWidth - 1, region.x * scaleX));
      const sourceY = Math.max(0, Math.min(sourceHeight - 1, region.y * scaleY));
      const selectedSourceWidth = Math.max(1, Math.min(sourceWidth - sourceX, region.width * scaleX));
      const selectedSourceHeight = Math.max(1, Math.min(sourceHeight - sourceY, region.height * scaleY));
      return {
        sourceX,
        sourceY,
        sourceWidth: selectedSourceWidth,
        sourceHeight: selectedSourceHeight,
        viewportLeft: region.viewportRect.left,
        viewportTop: region.viewportRect.top,
        viewportWidth: region.viewportRect.width,
        viewportHeight: region.viewportRect.height,
        pixelWidth: Math.max(1, Math.round(selectedSourceWidth)),
        pixelHeight: Math.max(1, Math.round(selectedSourceHeight))
      };
    }

    return {
      sourceX: 0,
      sourceY: 0,
      sourceWidth: Math.max(1, sourceWidth),
      sourceHeight: Math.max(1, sourceHeight),
      viewportLeft: rect.left,
      viewportTop: rect.top,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      pixelWidth: Math.max(1, Math.round(sourceWidth)),
      pixelHeight: Math.max(1, Math.round(sourceHeight))
    };
  }

  private mapDetectedTextBoxToViewport(
    boundingBox: DetectedText['boundingBox'],
    mapping: ImageBitmapMapping
  ): DOMRect | undefined {
    const sourceRect = this.mapDetectedTextBoxToSource(boundingBox, mapping);
    if (!sourceRect) return undefined;

    return this.mapSourceRectToViewport(sourceRect, mapping);
  }

  private mapSourceRectToViewport(
    sourceRect: PixelRect,
    mapping: ImageBitmapMapping
  ): DOMRect {

    const left = mapping.viewportLeft + (sourceRect.x / mapping.pixelWidth) * mapping.viewportWidth;
    const top = mapping.viewportTop + (sourceRect.y / mapping.pixelHeight) * mapping.viewportHeight;
    const width = (sourceRect.width / mapping.pixelWidth) * mapping.viewportWidth;
    const height = (sourceRect.height / mapping.pixelHeight) * mapping.viewportHeight;

    return this.createDomRectLike(left, top, width, height);
  }

  private mapDetectedPolygonToSource(
    cornerPoints: DetectedText['cornerPoints'],
    mapping: ImageBitmapMapping
  ): readonly PixelPoint[] | undefined {
    if (!Array.isArray(cornerPoints) || cornerPoints.length < 3 || cornerPoints.length > 8) return undefined;
    const points = cornerPoints.map(point => ({
      x: Math.round(Number(point.x)),
      y: Math.round(Number(point.y))
    }));
    if (points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return undefined;

    const clamped = points.map(point => ({
      x: Math.max(0, Math.min(mapping.pixelWidth, point.x)),
      y: Math.max(0, Math.min(mapping.pixelHeight, point.y))
    })).filter((point, index, values) => (
      values.findIndex(candidate => candidate.x === point.x && candidate.y === point.y) === index
    ));
    if (clamped.length < 3) return undefined;

    let twiceArea = 0;
    for (let index = 0; index < clamped.length; index += 1) {
      const current = clamped[index];
      const next = clamped[(index + 1) % clamped.length];
      twiceArea += current.x * next.y - next.x * current.y;
    }
    return Math.abs(twiceArea) >= 1 ? clamped : undefined;
  }

  private getPolygonBounds(
    polygon: readonly PixelPoint[],
    mapping: ImageBitmapMapping
  ): PixelRect | undefined {
    const left = Math.max(0, Math.min(mapping.pixelWidth - 1, Math.floor(Math.min(...polygon.map(point => point.x)))));
    const top = Math.max(0, Math.min(mapping.pixelHeight - 1, Math.floor(Math.min(...polygon.map(point => point.y)))));
    const right = Math.max(left + 1, Math.min(mapping.pixelWidth, Math.ceil(Math.max(...polygon.map(point => point.x)))));
    const bottom = Math.max(top + 1, Math.min(mapping.pixelHeight, Math.ceil(Math.max(...polygon.map(point => point.y)))));
    return right > left && bottom > top
      ? { x: left, y: top, width: right - left, height: bottom - top }
      : undefined;
  }

  private mapDetectedTextBoxToSource(
    boundingBox: DetectedText['boundingBox'],
    mapping: ImageBitmapMapping
  ): PixelRect | undefined {
    if (!boundingBox) return undefined;

    const x = Math.round(boundingBox.x ?? boundingBox.left ?? 0);
    const y = Math.round(boundingBox.y ?? boundingBox.top ?? 0);
    const width = Math.round(boundingBox.width ?? (
      boundingBox.right !== undefined && boundingBox.left !== undefined
        ? boundingBox.right - boundingBox.left
        : 0
    ));
    const height = Math.round(boundingBox.height ?? (
      boundingBox.bottom !== undefined && boundingBox.top !== undefined
        ? boundingBox.bottom - boundingBox.top
        : 0
    ));
    if (
      width <= 0 ||
      height <= 0 ||
      x >= mapping.pixelWidth ||
      y >= mapping.pixelHeight ||
      x + width <= 0 ||
      y + height <= 0
    ) {
      return undefined;
    }
    const left = Math.max(0, Math.min(mapping.pixelWidth - 1, x));
    const top = Math.max(0, Math.min(mapping.pixelHeight - 1, y));
    const right = Math.max(left + 1, Math.min(mapping.pixelWidth, x + width));
    const bottom = Math.max(top + 1, Math.min(mapping.pixelHeight, y + height));
    if (right <= left || bottom <= top) return undefined;

    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  private getOcrTokenLevel(rect: PixelRect, mapping: ImageBitmapMapping): OcrTokenLevel {
    const marginX = Math.max(2, mapping.pixelWidth * 0.05);
    const marginY = Math.max(2, mapping.pixelHeight * 0.05);
    const coversPage = rect.x <= marginX &&
      rect.y <= marginY &&
      rect.x + rect.width >= mapping.pixelWidth - marginX &&
      rect.y + rect.height >= mapping.pixelHeight - marginY &&
      rect.width * rect.height >= mapping.pixelWidth * mapping.pixelHeight * 0.8;
    return coversPage ? 'page-fallback' : 'line';
  }

  private async tryRenderComicImage(
    target: Element,
    blocks: ImageTextBlock[],
    translatedTexts: string[],
    targetRunId: number,
    sourceFingerprint: string,
    region: ImageSelectionRegion | undefined,
    reconstructionPixelBudget: number
  ): Promise<number> {
    if (
      blocks.length === 0 ||
      blocks.length > MAX_COMIC_RECONSTRUCTION_BLOCKS ||
      blocks.length !== translatedTexts.length ||
      blocks.some(block => !block.sourceRect || block.level === 'page-fallback')
    ) {
      return 0;
    }

    const snapshot = this.captureComicPixels(target, region);
    if (!snapshot) {
      if (!(target instanceof HTMLImageElement)) return 0;
      const sourceMapping = this.getImageBitmapMapping(target, region);
      const sourcePixels = sourceMapping.pixelWidth * sourceMapping.pixelHeight;
      if (!Number.isSafeInteger(sourcePixels) || sourcePixels <= MAX_COMIC_RECONSTRUCTION_PIXELS) {
        return 0;
      }
      return this.tryRenderTiledComicImage(
        target,
        blocks,
        translatedTexts,
        targetRunId,
        sourceFingerprint,
        region,
        reconstructionPixelBudget
      );
    }
    const snapshotPixels = snapshot.image.width * snapshot.image.height;
    if (!Number.isSafeInteger(snapshotPixels) || snapshotPixels > reconstructionPixelBudget) return 0;

    const controller = new AbortController();
    this.activeProcessingControllers.add(controller);
    const { signal } = controller;

    try {
      const tokens: OcrToken[] = blocks.map((block, index) => ({
        id: `block-${index}`,
        text: block.text,
        confidence: Math.max(0, Math.min(100, block.confidence ?? 100)),
        rect: block.sourceRect!,
        sourcePolygon: block.sourcePolygon,
        level: block.level || 'line',
        direction: inferOcrTextDirection(block.text, block.sourceRect!)
      }));
      const panels = detectPanels(snapshot.image, { signal });
      const bubbles = detectBubbles(snapshot.image, tokens, panels, { signal });
      const groups = groupTextTokens(tokens, bubbles, signal);
      if (groups.length === 0) return 0;

      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = snapshot.image.width;
      outputCanvas.height = snapshot.image.height;
      const outputContext = outputCanvas.getContext('2d');
      if (
        !outputContext ||
        typeof outputContext.measureText !== 'function' ||
        typeof outputContext.createImageData !== 'function' ||
        typeof outputContext.putImageData !== 'function' ||
        typeof outputContext.fillText !== 'function' ||
        typeof outputContext.save !== 'function' ||
        typeof outputContext.restore !== 'function' ||
        typeof outputContext.beginPath !== 'function' ||
        typeof outputContext.rect !== 'function' ||
        typeof outputContext.clip !== 'function'
      ) {
        return 0;
      }

      const bubbleById = new Map(bubbles.map(bubble => [bubble.id, bubble]));
      const preparedGroups: PreparedComicGroup[] = [];
      const measure = (text: string, fontSize: number): number => {
        outputContext.font = this.getComicFont(fontSize);
        return outputContext.measureText(text).width;
      };

      for (const group of groups) {
        if (signal.aborted) return 0;
        const bubble = group.bubbleId ? bubbleById.get(group.bubbleId) : undefined;
        if (!bubble) return 0;

        const translatedText = group.tokenIds
          .map(tokenId => translatedTexts[Number.parseInt(tokenId.slice('block-'.length), 10)] || '')
          .filter(Boolean)
          .join('\n')
          .trim();
        if (!translatedText) return 0;

        const writingMode = getTranslationWritingMode(group.direction, translatedText);
        const plan = layoutTranslation(translatedText, bubble.rect, measure, {
          minFontSize: 6,
          maxFontSize: Math.max(8, Math.min(48, Math.floor(
            (writingMode === 'vertical-rl' ? bubble.rect.width : bubble.rect.height) * 0.45
          ))),
          padding: Math.max(2, Math.floor(Math.min(bubble.rect.width, bubble.rect.height) * 0.08)),
          writingMode,
          signal
        });
        if (plan.overflow || plan.lines.length === 0) return 0;

        const mask = buildTextMask(snapshot.image, group, bubble, { signal });
        const safety = assessInpaintSafety(snapshot.image, mask, bubble, signal);
        if (safety.mode === 'skip') return 0;

        preparedGroups.push({
          plan,
          mask,
          safety,
          textColor: this.getComicTextColor(safety.backgroundColor)
        });
      }

      const composite: PixelImage = {
        width: snapshot.image.width,
        height: snapshot.image.height,
        data: new Uint8ClampedArray(snapshot.image.data)
      };
      preparedGroups.forEach(prepared => {
        applyInpaintToImage(composite, prepared.mask, prepared.safety, { signal });
      });

      const imageData = outputContext.createImageData(composite.width, composite.height);
      imageData.data.set(composite.data);
      outputContext.putImageData(imageData, 0, 0);
      preparedGroups.forEach(prepared => {
        outputContext.save();
        outputContext.beginPath();
        outputContext.rect(
          prepared.plan.bounds.x,
          prepared.plan.bounds.y,
          prepared.plan.bounds.width,
          prepared.plan.bounds.height
        );
        outputContext.clip();
        outputContext.fillStyle = prepared.textColor;
        outputContext.direction = prepared.plan.direction;
        outputContext.textBaseline = prepared.plan.writingMode === 'vertical-rl' ? 'middle' : 'alphabetic';
        outputContext.textAlign = prepared.plan.writingMode === 'vertical-rl'
          ? 'center'
          : prepared.plan.direction === 'rtl' ? 'right' : 'left';
        outputContext.font = this.getComicFont(prepared.plan.fontSize);
        prepared.plan.lines.forEach(line => outputContext.fillText(line.text, line.x, line.y));
        outputContext.restore();
      });

      await this.yieldForImageCommit();
      if (
        signal.aborted ||
        !this.isTargetTranslationRunActive(target, targetRunId) ||
        !this.isSourceFingerprintCurrent(target, sourceFingerprint, region)
      ) {
        return 0;
      }

      const rect = region?.viewportRect || target.getBoundingClientRect();
      outputCanvas.className = 'lexibridge-image-comic-overlay';
      outputCanvas.setAttribute('data-lexibridge-owned', 'true');
      Object.assign(outputCanvas.style, {
        position: 'absolute',
        zIndex: '2147482998',
        left: `${rect.left + window.scrollX}px`,
        top: `${rect.top + window.scrollY}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: window.getComputedStyle(target).borderRadius,
        pointerEvents: 'none'
      });
      this.removeTargetOverlays(target);
      document.body.appendChild(outputCanvas);
      this.overlayElements.set(target, [outputCanvas]);
      this.recordOverlayAnchor(target);
      return snapshotPixels;
    } catch {
      return 0;
    } finally {
      this.activeProcessingControllers.delete(controller);
    }
  }

  private async tryRenderTiledComicImage(
    target: Element,
    blocks: ImageTextBlock[],
    translatedTexts: string[],
    targetRunId: number,
    sourceFingerprint: string,
    region: ImageSelectionRegion | undefined,
    reconstructionPixelBudget: number
  ): Promise<number> {
    if (
      !(target instanceof HTMLImageElement) ||
      !this.canReconstructPixelSource(target) ||
      blocks.length === 0 ||
      blocks.length > MAX_COMIC_RECONSTRUCTION_BLOCKS ||
      blocks.length !== translatedTexts.length ||
      blocks.some(block => !block.sourceRect || block.level === 'page-fallback')
    ) {
      return 0;
    }

    const controller = new AbortController();
    this.activeProcessingControllers.add(controller);
    const { signal } = controller;
    try {
      const sourceMapping = this.getImageBitmapMapping(target, region);
      const plan = planComicImageTiles({
        width: sourceMapping.pixelWidth,
        height: sourceMapping.pixelHeight
      }, {
        maxTilePixels: MAX_COMIC_RECONSTRUCTION_PIXELS,
        signal
      });
      const tileAssignments = plan.tiles.map(tile => ({
        tile,
        blockIndices: blocks.flatMap((block, index) => (
          block.sourceRect && this.isRectCenterInside(block.sourceRect, tile.coreRect) ? [index] : []
        ))
      })).filter(assignment => assignment.blockIndices.length > 0);
      if (
        tileAssignments.length === 0 ||
        tileAssignments.reduce((count, assignment) => count + assignment.blockIndices.length, 0) !== blocks.length
      ) {
        return 0;
      }

      const patches: HTMLCanvasElement[] = [];
      let retainedPatchPixels = 0;
      for (const assignment of tileAssignments) {
        await this.yieldForImageCommit();
        if (
          signal.aborted ||
          !this.isTargetTranslationRunActive(target, targetRunId) ||
          !this.isSourceFingerprintCurrent(target, sourceFingerprint, region)
        ) {
          return 0;
        }

        const snapshot = this.captureComicTilePixels(target, sourceMapping, assignment.tile);
        if (!snapshot) return 0;
        const tokens: OcrToken[] = assignment.blockIndices.map(index => {
          const block = blocks[index];
          const sourceRect = block.sourceRect!;
          const rect = {
            x: sourceRect.x - assignment.tile.sourceRect.x,
            y: sourceRect.y - assignment.tile.sourceRect.y,
            width: sourceRect.width,
            height: sourceRect.height
          };
          return {
            id: `block-${index}`,
            text: block.text,
            confidence: Math.max(0, Math.min(100, block.confidence ?? 100)),
            rect,
            sourcePolygon: block.sourcePolygon?.map(point => ({
              x: point.x - assignment.tile.sourceRect.x,
              y: point.y - assignment.tile.sourceRect.y
            })),
            level: block.level || 'line',
            direction: inferOcrTextDirection(block.text, rect)
          };
        });
        const panels = detectPanels(snapshot.image, { signal });
        const bubbles = detectBubbles(snapshot.image, tokens, panels, { signal });
        const groups = groupTextTokens(tokens, bubbles, signal);
        const bubbleById = new Map(bubbles.map(bubble => [bubble.id, bubble]));
        if (
          groups.length === 0 ||
          groups.some(group => {
            const bubble = group.bubbleId ? bubbleById.get(group.bubbleId) : undefined;
            return !bubble || !this.isBubbleSafelyInsideTile(
              bubble.rect,
              assignment.tile,
              sourceMapping
            );
          })
        ) {
          return 0;
        }

        const composite: PixelImage = {
          width: snapshot.image.width,
          height: snapshot.image.height,
          data: new Uint8ClampedArray(snapshot.image.data)
        };
        const prepared = groups.map(group => {
          const bubble = bubbleById.get(group.bubbleId!)!;
          const translatedText = group.tokenIds
            .map(tokenId => translatedTexts[Number.parseInt(tokenId.slice('block-'.length), 10)] || '')
            .filter(Boolean)
            .join('\n')
            .trim();
          if (!translatedText) return null;
          const mask = buildTextMask(snapshot.image, group, bubble, { signal });
          const safety = assessInpaintSafety(snapshot.image, mask, bubble, signal);
          if (safety.mode === 'skip') return null;
          applyInpaintToImage(composite, mask, safety, { signal });
          return { bubble, group, safety, translatedText };
        });
        if (prepared.some(item => !item)) return 0;

        for (const item of prepared) {
          if (!item) return 0;
          const patchPixels = item.bubble.rect.width * item.bubble.rect.height;
          retainedPatchPixels += patchPixels;
          if (
            !Number.isSafeInteger(patchPixels) ||
            retainedPatchPixels > reconstructionPixelBudget
          ) {
            return 0;
          }
          const patch = this.createComicPatchCanvas(
            composite,
            item.bubble.rect,
            item.group.direction,
            item.translatedText,
            item.safety.backgroundColor,
            signal
          );
          if (!patch) return 0;
          this.positionComicPatch(
            patch,
            sourceMapping,
            assignment.tile.sourceRect.x + item.bubble.rect.x,
            assignment.tile.sourceRect.y + item.bubble.rect.y,
            item.bubble.rect.width,
            item.bubble.rect.height
          );
          patches.push(patch);
        }
      }

      await this.yieldForImageCommit();
      if (
        patches.length === 0 ||
        signal.aborted ||
        !this.isTargetTranslationRunActive(target, targetRunId) ||
        !this.isSourceFingerprintCurrent(target, sourceFingerprint, region)
      ) {
        return 0;
      }
      this.removeTargetOverlays(target);
      patches.forEach(patch => document.body.appendChild(patch));
      this.overlayElements.set(target, patches);
      this.recordOverlayAnchor(target);
      return retainedPatchPixels;
    } catch {
      return 0;
    } finally {
      this.activeProcessingControllers.delete(controller);
    }
  }

  private captureComicTilePixels(
    target: HTMLImageElement,
    sourceMapping: ImageBitmapMapping,
    tile: ComicImageTile
  ): ComicPixelSnapshot | null {
    try {
      const mapping = this.getTileMapping(sourceMapping, tile);
      const canvas = document.createElement('canvas');
      canvas.width = tile.sourceRect.width;
      canvas.height = tile.sourceRect.height;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context || typeof context.getImageData !== 'function') return null;
      context.drawImage(
        target,
        mapping.sourceX,
        mapping.sourceY,
        mapping.sourceWidth,
        mapping.sourceHeight,
        0,
        0,
        tile.sourceRect.width,
        tile.sourceRect.height
      );
      const imageData = context.getImageData(0, 0, tile.sourceRect.width, tile.sourceRect.height);
      canvas.width = 1;
      canvas.height = 1;
      return {
        image: {
          width: tile.sourceRect.width,
          height: tile.sourceRect.height,
          data: new Uint8ClampedArray(imageData.data)
        },
        mapping
      };
    } catch {
      return null;
    }
  }

  private createComicPatchCanvas(
    image: PixelImage,
    bubbleRect: PixelRect,
    sourceDirection: TextGroup['direction'],
    translatedText: string,
    backgroundColor: RgbaColor,
    signal: AbortSignal
  ): HTMLCanvasElement | null {
    if (signal.aborted) return null;
    const canvas = document.createElement('canvas');
    canvas.width = bubbleRect.width;
    canvas.height = bubbleRect.height;
    canvas.className = 'lexibridge-image-comic-overlay lexibridge-image-comic-tile-overlay';
    canvas.dataset.lexibridgeOwned = 'true';
    canvas.dataset.lexibridgeComposite = 'tile';
    const context = canvas.getContext('2d');
    if (
      !context ||
      typeof context.createImageData !== 'function' ||
      typeof context.putImageData !== 'function' ||
      typeof context.measureText !== 'function' ||
      typeof context.fillText !== 'function' ||
      typeof context.save !== 'function' ||
      typeof context.restore !== 'function' ||
      typeof context.beginPath !== 'function' ||
      typeof context.rect !== 'function' ||
      typeof context.clip !== 'function'
    ) {
      return null;
    }
    const imageData = context.createImageData(bubbleRect.width, bubbleRect.height);
    for (let row = 0; row < bubbleRect.height; row += 1) {
      if (signal.aborted) return null;
      const sourceStart = ((bubbleRect.y + row) * image.width + bubbleRect.x) * 4;
      const targetStart = row * bubbleRect.width * 4;
      imageData.data.set(
        image.data.subarray(sourceStart, sourceStart + bubbleRect.width * 4),
        targetStart
      );
    }
    context.putImageData(imageData, 0, 0);

    const writingMode = getTranslationWritingMode(sourceDirection, translatedText);
    const measure = (text: string, fontSize: number): number => {
      context.font = this.getComicFont(fontSize);
      return context.measureText(text).width;
    };
    const plan = layoutTranslation(
      translatedText,
      { x: 0, y: 0, width: bubbleRect.width, height: bubbleRect.height },
      measure,
      {
        minFontSize: 6,
        maxFontSize: Math.max(8, Math.min(48, Math.floor(
          (writingMode === 'vertical-rl' ? bubbleRect.width : bubbleRect.height) * 0.45
        ))),
        padding: Math.max(2, Math.floor(Math.min(bubbleRect.width, bubbleRect.height) * 0.08)),
        writingMode,
        signal
      }
    );
    if (plan.overflow || plan.lines.length === 0) return null;
    context.save();
    context.beginPath();
    context.rect(0, 0, bubbleRect.width, bubbleRect.height);
    context.clip();
    context.fillStyle = this.getComicTextColor(backgroundColor);
    context.direction = plan.direction;
    context.textBaseline = plan.writingMode === 'vertical-rl' ? 'middle' : 'alphabetic';
    context.textAlign = plan.writingMode === 'vertical-rl'
      ? 'center'
      : plan.direction === 'rtl' ? 'right' : 'left';
    context.font = this.getComicFont(plan.fontSize);
    plan.lines.forEach(line => context.fillText(line.text, line.x, line.y));
    context.restore();
    return canvas;
  }

  private positionComicPatch(
    patch: HTMLCanvasElement,
    sourceMapping: ImageBitmapMapping,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number
  ): void {
    const viewportScaleX = sourceMapping.viewportWidth / sourceMapping.pixelWidth;
    const viewportScaleY = sourceMapping.viewportHeight / sourceMapping.pixelHeight;
    const sourceScaleX = sourceMapping.sourceWidth / sourceMapping.pixelWidth;
    const sourceScaleY = sourceMapping.sourceHeight / sourceMapping.pixelHeight;
    patch.dataset.lexibridgeSourceX = String(sourceMapping.sourceX + sourceX * sourceScaleX);
    patch.dataset.lexibridgeSourceY = String(sourceMapping.sourceY + sourceY * sourceScaleY);
    patch.dataset.lexibridgeSourceWidth = String(sourceWidth * sourceScaleX);
    patch.dataset.lexibridgeSourceHeight = String(sourceHeight * sourceScaleY);
    Object.assign(patch.style, {
      position: 'absolute',
      zIndex: '2147482998',
      left: `${sourceMapping.viewportLeft + window.scrollX + sourceX * viewportScaleX}px`,
      top: `${sourceMapping.viewportTop + window.scrollY + sourceY * viewportScaleY}px`,
      width: `${sourceWidth * viewportScaleX}px`,
      height: `${sourceHeight * viewportScaleY}px`,
      borderRadius: '0',
      pointerEvents: 'none'
    });
  }

  private isRectCenterInside(rect: PixelRect, owner: PixelRect): boolean {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    return centerX >= owner.x && centerX < owner.x + owner.width &&
      centerY >= owner.y && centerY < owner.y + owner.height;
  }

  private isBubbleSafelyInsideTile(
    bubble: PixelRect,
    tile: ComicImageTile,
    sourceMapping: ImageBitmapMapping
  ): boolean {
    const margin = Math.max(4, Math.min(32, Math.floor(Math.min(bubble.width, bubble.height) * 0.25)));
    const internalLeft = tile.sourceRect.x > 0;
    const internalTop = tile.sourceRect.y > 0;
    const internalRight = tile.sourceRect.x + tile.sourceRect.width < sourceMapping.pixelWidth;
    const internalBottom = tile.sourceRect.y + tile.sourceRect.height < sourceMapping.pixelHeight;
    return (!internalLeft || bubble.x >= margin) &&
      (!internalTop || bubble.y >= margin) &&
      (!internalRight || bubble.x + bubble.width <= tile.sourceRect.width - margin) &&
      (!internalBottom || bubble.y + bubble.height <= tile.sourceRect.height - margin);
  }

  private captureComicPixels(target: Element, region?: ImageSelectionRegion): ComicPixelSnapshot | null {
    if (!(target instanceof HTMLImageElement)) return null;
    if (!this.canReconstructPixelSource(target)) return null;

    try {
      const mapping = this.getImageBitmapMapping(target, region);
      const pixelCount = mapping.pixelWidth * mapping.pixelHeight;
      if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_COMIC_RECONSTRUCTION_PIXELS) return null;

      const canvas = document.createElement('canvas');
      canvas.width = mapping.pixelWidth;
      canvas.height = mapping.pixelHeight;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context || typeof context.getImageData !== 'function') return null;
      context.drawImage(
        target,
        mapping.sourceX,
        mapping.sourceY,
        mapping.sourceWidth,
        mapping.sourceHeight,
        0,
        0,
        mapping.pixelWidth,
        mapping.pixelHeight
      );
      const imageData = context.getImageData(0, 0, mapping.pixelWidth, mapping.pixelHeight);
      return {
        image: {
          width: mapping.pixelWidth,
          height: mapping.pixelHeight,
          data: new Uint8ClampedArray(imageData.data)
        },
        mapping
      };
    } catch {
      // Cross-origin images taint canvas pixel reads. Keep the non-destructive DOM overlay fallback.
      return null;
    }
  }

  private canReconstructPixelSource(target: HTMLImageElement): boolean {
    const style = window.getComputedStyle(target);
    let current: Element | null = target;
    while (current && current !== document.body && current !== document.documentElement) {
      const currentStyle = window.getComputedStyle(current);
      if (
        (currentStyle.transform && currentStyle.transform !== 'none') ||
        (currentStyle.filter && currentStyle.filter !== 'none') ||
        (currentStyle.perspective && currentStyle.perspective !== 'none') ||
        (currentStyle.clipPath && currentStyle.clipPath !== 'none') ||
        (currentStyle.opacity && Number.parseFloat(currentStyle.opacity) !== 1)
      ) {
        return false;
      }
      current = current.parentElement;
    }
    if (style.objectFit && style.objectFit !== 'fill') return false;

    const frameValues = [
      style.borderLeftWidth,
      style.borderRightWidth,
      style.borderTopWidth,
      style.borderBottomWidth,
      style.paddingLeft,
      style.paddingRight,
      style.paddingTop,
      style.paddingBottom
    ];
    return frameValues.every(value => !Number.isFinite(Number.parseFloat(value)) || Number.parseFloat(value) === 0);
  }

  private getSourceFingerprint(target: Element, region?: ImageSelectionRegion): string {
    const rect = target.getBoundingClientRect();
    const geometry = [rect.left, rect.top, rect.width, rect.height].map(value => Math.round(value * 100) / 100);
    const selection = region
      ? [
        ...[region.x, region.y, region.width, region.height].map(value => Math.round(value * 100) / 100),
        ...region.polygon.flatMap(point => [
          Math.round(point.x * 100) / 100,
          Math.round(point.y * 100) / 100
        ])
      ]
      : [];

    if (target instanceof HTMLImageElement) {
      return JSON.stringify([
        'img',
        target.currentSrc || target.src,
        target.naturalWidth,
        target.naturalHeight,
        target.complete,
        geometry,
        selection
      ]);
    }
    if (target instanceof HTMLCanvasElement) {
      return JSON.stringify(['canvas', target.width, target.height, geometry, selection]);
    }
    return JSON.stringify([target.tagName, geometry, selection]);
  }

  private isSourceFingerprintCurrent(target: Element, fingerprint: string, region?: ImageSelectionRegion): boolean {
    return target.isConnected && this.getSourceFingerprint(target, region) === fingerprint;
  }

  private getComicFont(fontSize: number): string {
    return `600 ${fontSize}px Arial, "Noto Sans", sans-serif`;
  }

  private getComicTextColor(background: RgbaColor): string {
    const luminance = background[0] * 0.2126 + background[1] * 0.7152 + background[2] * 0.0722;
    return luminance >= 145 ? '#111827' : '#ffffff';
  }

  private async yieldForImageCommit(): Promise<void> {
    await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  }

  private extractSvgText(element: Element): string {
    const svg = element instanceof SVGSVGElement ? element : element.querySelector('svg');
    if (!svg) return '';

    const text = Array.from(svg.querySelectorAll('text, tspan'))
      .map(node => node.textContent || '')
      .join('\n');

    return this.normalizeText(text);
  }

  private extractAccessibleText(element: Element): string {
    const textParts: string[] = [];

    if (element instanceof HTMLImageElement) {
      textParts.push(element.alt || '');
    }

    textParts.push(
      element.getAttribute('aria-label') || '',
      element.getAttribute('title') || '',
      element.getAttribute('data-ocr-text') || '',
      element.getAttribute('data-lexibridge-image-text') || ''
    );

    return this.normalizeText(textParts.filter(Boolean).join('\n'));
  }

  private normalizeText(text: string): string {
    return text
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim()
      .slice(0, MAX_IMAGE_TEXT_CHARACTERS);
  }

  private uniqueTextBlocks(textBlocks: string[]): string[] {
    const seen = new Set<string>();

    return textBlocks
      .map(text => this.normalizeText(text))
      .filter(Boolean)
      .filter(text => {
        const key = text.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private uniqueImageTextBlocks(blocks: ImageTextBlock[]): ImageTextBlock[] {
    const seen = new Set<string>();

    return blocks
      .map(block => ({
        ...block,
        text: this.normalizeText(block.text)
      }))
      .filter(block => Boolean(block.text))
      .filter(block => {
        const key = this.getImageBlockKey(block);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_IMAGE_TEXT_BLOCKS);
  }

  private getImageBlockKey(block: ImageTextBlock): string {
    const rect = block.viewportRect;
    const rectKey = rect
      ? [
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height)
      ].join(':')
      : 'no-rect';

    const polygonKey = block.sourcePolygon
      ?.map(point => `${Math.round(point.x)},${Math.round(point.y)}`)
      .join(';') || 'no-polygon';
    return `${block.text.toLowerCase()}|${rectKey}|${polygonKey}`;
  }

  private createStyleElement(): void {
    if (this.styleElement) return;

    const style = document.createElement('style');
    style.id = 'lexibridge-image-translation-style';
    style.textContent = `
      body.lexibridge-image-translation-mode img,
      body.lexibridge-image-translation-mode canvas,
      body.lexibridge-image-translation-mode svg,
      body.lexibridge-image-translation-mode picture {
        cursor: crosshair !important;
      }
      body.lexibridge-image-region-armed img,
      body.lexibridge-image-region-armed canvas,
      body.lexibridge-image-region-armed svg,
      body.lexibridge-image-region-armed picture {
        cursor: crosshair !important;
      }
      body.lexibridge-image-translation-mode img:hover,
      body.lexibridge-image-translation-mode canvas:hover,
      body.lexibridge-image-translation-mode svg:hover,
      body.lexibridge-image-translation-mode picture:hover {
        outline: 2px solid #2563eb !important;
        outline-offset: 2px !important;
      }
      #lexibridge-image-selection-box {
        position: fixed;
        z-index: 2147482997;
        border: 2px solid #2563eb;
        background: rgba(37, 99, 235, 0.16);
        pointer-events: none;
        border-radius: 4px;
      }
      .lexibridge-image-region-translation {
        position: fixed;
        z-index: 2147482998;
        min-width: 96px;
        max-width: min(360px, 90vw);
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.9);
        color: #ffffff;
        font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.4;
        pointer-events: none;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        white-space: pre-wrap;
      }
      .lexibridge-image-hover-toolbar {
        position: fixed;
        z-index: 2147483000;
        display: flex;
        gap: 4px;
        padding: 4px;
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: 6px;
        background: rgba(17, 24, 39, 0.94);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
        pointer-events: auto;
      }
      .lexibridge-image-hover-toolbar button {
        width: 30px;
        height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: #ffffff;
        font: 600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1;
        cursor: pointer;
      }
      .lexibridge-image-hover-toolbar button:hover,
      .lexibridge-image-hover-toolbar button:focus-visible {
        background: rgba(255, 255, 255, 0.16);
        outline: 2px solid #93c5fd;
        outline-offset: -2px;
      }
      .lexibridge-image-translation-applied {
        opacity: 1 !important;
      }
    `;

    document.head.appendChild(style);
    this.styleElement = style;
  }

  private renderStatus(target: Element, message: string, region?: ImageSelectionRegion): void {
    this.removeTargetOverlays(target);
    const overlay = this.createOverlay(target, region);

    overlay.textContent = message;
    overlay.style.opacity = '0.88';
  }

  private renderResult(target: Element, originalText: string, translatedText: string, region?: ImageSelectionRegion): void {
    this.removeTargetOverlays(target);
    const overlay = this.createOverlay(target, region);

    overlay.style.opacity = '1';

    const original = document.createElement('div');
    original.className = 'lexibridge-image-translation-original';
    original.textContent = originalText;
    original.style.opacity = '0.88';

    const translation = document.createElement('div');
    translation.className = 'lexibridge-image-translation-result';
    translation.textContent = translatedText;
    translation.style.marginTop = '6px';
    translation.style.fontWeight = '600';

    overlay.append(original, translation);
  }

  private renderImageBlocks(
    target: Element,
    originalBlocks: ImageTextBlock[],
    translatedTexts: string[],
    region?: ImageSelectionRegion
  ): void {
    const regionalBlocks = originalBlocks.filter(block => block.viewportRect);
    if (regionalBlocks.length === 0) {
      this.renderResult(
        target,
        originalBlocks.map(block => block.text).join('\n'),
        translatedTexts.join('\n'),
        region
      );
      return;
    }

    this.removeTargetOverlays(target);

    const overlays: HTMLElement[] = [];

    originalBlocks.forEach((block, index) => {
      const rect = block.viewportRect || region?.viewportRect || target.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.className = 'lexibridge-image-region-translation';
      Object.assign(overlay.style, {
        left: `${Math.max(8, rect.left)}px`,
        top: `${Math.max(8, rect.top)}px`,
        width: `${Math.max(96, Math.min(rect.width, 360))}px`
      });

      const original = document.createElement('div');
      original.className = 'lexibridge-image-region-original';
      original.textContent = block.text;
      original.style.opacity = '0.86';

      const translation = document.createElement('div');
      translation.className = 'lexibridge-image-region-result';
      translation.textContent = translatedTexts[index] || '';
      translation.style.marginTop = '5px';
      translation.style.fontWeight = '600';

      overlay.append(original, translation);
      document.body.appendChild(overlay);
      overlays.push(overlay);
    });

    this.overlayElements.set(target, overlays);
    this.recordOverlayAnchor(target);
  }

  private createOverlay(target: Element, region?: ImageSelectionRegion): HTMLElement {
    const overlay = document.createElement('div');
    const baseId = 'lexibridge-image-translation-overlay';
    overlay.id = document.getElementById(baseId) ? `${baseId}-${++this.nextOverlayId}` : baseId;
    overlay.className = 'lexibridge-image-translation-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      zIndex: '2147482998',
      width: '360px',
      maxWidth: '90vw',
      padding: '10px 12px',
      borderRadius: '8px',
      background: 'rgba(15, 23, 42, 0.92)',
      color: '#ffffff',
      font: '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineHeight: '1.45',
      pointerEvents: 'none',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
      whiteSpace: 'pre-wrap'
    });

    const rect = region?.viewportRect || target.getBoundingClientRect();
    const left = Math.min(Math.max(rect.left, 16), Math.max(window.innerWidth - 376, 16));
    const preferredTop = rect.bottom + 10;
    const top = preferredTop < window.innerHeight - 80 ? preferredTop : Math.max(rect.top - 120, 16);

    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    document.body.appendChild(overlay);
    this.overlayElements.set(target, [overlay]);
    this.recordOverlayAnchor(target);

    return overlay;
  }

  private updateSelectionBox(selectionState: ImageSelectionState): void {
    if (!this.selectionElement) {
      const box = document.createElement('div');
      box.id = 'lexibridge-image-selection-box';
      document.body.appendChild(box);
      this.selectionElement = box;
    }

    const points = this.getClampedSelectionPoints(selectionState);
    const viewportRect = this.getPointBounds(points);
    const polygon = this.getSelectionPolygon(points, viewportRect);
    const clipPath = viewportRect.width > 0 && viewportRect.height > 0
      ? `polygon(${polygon.map(point => (
        `${(point.x / viewportRect.width) * 100}% ${(point.y / viewportRect.height) * 100}%`
      )).join(', ')})`
      : '';

    Object.assign(this.selectionElement.style, {
      left: `${viewportRect.left}px`,
      top: `${viewportRect.top}px`,
      width: `${viewportRect.width}px`,
      height: `${viewportRect.height}px`,
      clipPath
    });
  }

  private appendSelectionPoint(selectionState: ImageSelectionState, x: number, y: number): void {
    const targetRect = selectionState.target.getBoundingClientRect();
    const point = {
      x: Math.max(targetRect.left, Math.min(targetRect.right, x)),
      y: Math.max(targetRect.top, Math.min(targetRect.bottom, y))
    };
    const previous = selectionState.points[selectionState.points.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 2) {
      if (selectionState.points.length >= MAX_RAW_SELECTION_POINTS) {
        const compacted = this.limitSelectionPolygonPoints(
          selectionState.points,
          Math.floor(MAX_RAW_SELECTION_POINTS / 2)
        );
        selectionState.points.splice(0, selectionState.points.length, ...compacted);
      }
      selectionState.points.push(point);
    }
  }

  private cancelSelectionGesture(): void {
    if (!this.selectionState) return;
    this.selectionState = null;
    this.removeSelectionBox();
    this.suppressNextClick = false;
  }

  private removeSelectionBox(): void {
    this.selectionElement?.remove();
    this.selectionElement = null;
  }

  private removeTargetOverlays(target: Element): void {
    this.overlayElements.get(target)?.forEach(overlay => overlay.remove());
    this.overlayElements.delete(target);
    this.reconstructionPixelCounts.delete(target);
    this.resultStates.delete(target);
    this.overlayAnchors.delete(target);
    this.resultSourceIdentities.delete(target);
  }

  private removeAllOverlays(): void {
    this.overlayElements.forEach(overlays => overlays.forEach(overlay => overlay.remove()));
    this.overlayElements.clear();
    this.reconstructionPixelCounts.clear();
    this.resultStates.clear();
    this.overlayAnchors.clear();
    this.resultSourceIdentities.clear();
  }

  private isTargetTranslationRunActive(target: Element, runId: number): boolean {
    return this.isActive && this.targetTranslationRuns.get(target) === runId;
  }

  private isInteractionEpochActive(epoch: number): boolean {
    return this.isActive && this.interactionEpoch === epoch;
  }

  private isVisibleImageRunActive(runId: number): boolean {
    return this.isActive && this.visibleImageRun === runId;
  }

  private isComicChapterRunActive(runId: number): boolean {
    return this.isActive && this.comicChapterRun === runId;
  }

  private refreshComicChapterStaleness(): void {
    const snapshot = this.comicChapterSnapshot;
    if (!snapshot || this.comicChapterState.phase === 'running') return;
    if (!this.comicAdapters.isDiscoveryCurrent(snapshot.discovery, document, window.location)) {
      const staleCount = snapshot.discovery.candidates.filter(candidate => (
        !this.comicAdapters.isCandidateCurrent(candidate, window.location, snapshot.discovery.navigationKey)
      )).length || 1;
      snapshot.discovery.candidates.forEach(candidate => this.removeTargetOverlays(candidate.element));
      this.comicChapterSnapshot = null;
      this.comicChapterState = {
        ...this.comicChapterState,
        phase: 'stale',
        discoveryId: null,
        operationId: null,
        staleCount,
        message: 'Comic chapter changed. Scan it again.'
      };
    }
  }

  private markComicChapterStale(message: string): void {
    if (!this.comicChapterSnapshot && this.comicChapterState.phase === 'idle') return;
    this.comicChapterRun += 1;
    this.activeComicChapterBatch = null;
    this.comicChapterSnapshot = null;
    this.comicChapterState = {
      ...this.comicChapterState,
      phase: 'stale',
      discoveryId: null,
      operationId: null,
      message
    };
  }

  private getComicChapterFailure(message: string): ComicChapterState {
    this.comicChapterState = {
      ...this.comicChapterState,
      phase: 'failed',
      isActive: this.isActive,
      operationId: null,
      message
    };
    return { ...this.comicChapterState };
  }

  private resetComicChapterState(message: string, isActive: boolean): void {
    this.comicChapterState = {
      phase: 'idle',
      isActive,
      discoveryId: null,
      operationId: null,
      adapterId: '',
      adapterVersion: 1,
      siteLabel: '',
      navigationKey: '',
      candidateCount: 0,
      acceptedCount: 0,
      processedCount: 0,
      translatedCount: 0,
      unreadableCount: 0,
      failedCount: 0,
      staleCount: 0,
      limitReached: false,
      message
    };
  }

  private getVisibleImageResultMessage(
    visibleImageCount: number,
    translatedImageCount: number,
    unreadableImageCount: number,
    failedImageCount: number
  ): string {
    const imageLabel = visibleImageCount === 1 ? 'image' : 'images';

    if (translatedImageCount === visibleImageCount) {
      return `Translated ${translatedImageCount} visible ${imageLabel}`;
    }

    if (translatedImageCount > 0) {
      return `Translated ${translatedImageCount} of ${visibleImageCount} visible ${imageLabel}`;
    }

    if (failedImageCount > 0 && unreadableImageCount > 0) {
      return 'No visible image text could be translated';
    }

    if (failedImageCount > 0) {
      return `Could not translate ${failedImageCount} visible ${failedImageCount === 1 ? 'image' : 'images'}`;
    }

    return 'No readable text found in visible images';
  }

  private getSelectionRegion(selectionState: ImageSelectionState): ImageSelectionRegion | null {
    const points = this.getClampedSelectionPoints(selectionState);
    const viewportRect = this.getPointBounds(points);
    if (viewportRect.width < 8 || viewportRect.height < 8) return null;

    const targetRect = selectionState.target.getBoundingClientRect();
    const simplified = this.limitSelectionPolygonPoints(
      this.simplifySelectionPath(points, 1.5),
      MAX_SELECTION_POLYGON_POINTS
    );
    const freeformArea = this.getPolygonArea(simplified);
    const isFreeform = simplified.length >= 3 && freeformArea >= 64;
    const polygon = isFreeform
      ? simplified.map(point => ({ x: point.x - viewportRect.left, y: point.y - viewportRect.top }))
      : this.getSelectionPolygon(points, viewportRect);

    return {
      x: viewportRect.left - targetRect.left,
      y: viewportRect.top - targetRect.top,
      width: viewportRect.width,
      height: viewportRect.height,
      viewportRect,
      polygon,
      isFreeform
    };
  }

  private getClampedSelectionPoints(selectionState: ImageSelectionState): PixelPoint[] {
    const targetRect = selectionState.target.getBoundingClientRect();
    const sourcePoints = selectionState.points.length >= 2
      ? selectionState.points
      : [
        { x: selectionState.startX, y: selectionState.startY },
        { x: selectionState.currentX, y: selectionState.currentY }
      ];
    return sourcePoints.map(point => ({
      x: Math.max(targetRect.left, Math.min(targetRect.right, point.x)),
      y: Math.max(targetRect.top, Math.min(targetRect.bottom, point.y))
    }));
  }

  private getPointBounds(points: readonly PixelPoint[]): DOMRect {
    if (points.length === 0) return this.createDomRectLike(0, 0, 0, 0);
    const left = Math.min(...points.map(point => point.x));
    const top = Math.min(...points.map(point => point.y));
    const right = Math.max(...points.map(point => point.x));
    const bottom = Math.max(...points.map(point => point.y));
    return this.createDomRectLike(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
  }

  private getSelectionPolygon(
    points: readonly PixelPoint[],
    viewportRect: DOMRect
  ): readonly PixelPoint[] {
    const simplified = this.limitSelectionPolygonPoints(
      this.simplifySelectionPath(points, 1.5),
      MAX_SELECTION_POLYGON_POINTS
    );
    if (simplified.length >= 3 && this.getPolygonArea(simplified) >= 64) {
      return simplified.map(point => ({ x: point.x - viewportRect.left, y: point.y - viewportRect.top }));
    }
    return [
      { x: 0, y: 0 },
      { x: viewportRect.width, y: 0 },
      { x: viewportRect.width, y: viewportRect.height },
      { x: 0, y: viewportRect.height }
    ];
  }

  private simplifySelectionPath(points: readonly PixelPoint[], tolerance: number): PixelPoint[] {
    if (points.length <= 2) return [...points];
    let furthestIndex = 0;
    let furthestDistance = 0;
    const start = points[0];
    const end = points[points.length - 1];
    for (let index = 1; index < points.length - 1; index += 1) {
      const distance = this.getPointToSegmentDistance(points[index], start, end);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestDistance <= tolerance) return [start, end];
    const left = this.simplifySelectionPath(points.slice(0, furthestIndex + 1), tolerance);
    const right = this.simplifySelectionPath(points.slice(furthestIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  private limitSelectionPolygonPoints(points: readonly PixelPoint[], limit: number): PixelPoint[] {
    if (points.length <= limit) return [...points];
    return Array.from({ length: limit }, (_item, index) => (
      points[Math.round((index * (points.length - 1)) / (limit - 1))]
    ));
  }

  private getPointToSegmentDistance(point: PixelPoint, start: PixelPoint, end: PixelPoint): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const ratio = Math.max(0, Math.min(1, (
      (point.x - start.x) * dx + (point.y - start.y) * dy
    ) / (dx * dx + dy * dy)));
    return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
  }

  private getPolygonArea(points: readonly PixelPoint[]): number {
    if (points.length < 3) return 0;
    let twiceArea = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      twiceArea += current.x * next.y - next.x * current.y;
    }
    return Math.abs(twiceArea) / 2;
  }

  private createDomRectLike(left: number, top: number, width: number, height: number): DOMRect {
    const right = left + width;
    const bottom = top + height;

    return {
      x: left,
      y: top,
      left,
      top,
      right,
      bottom,
      width,
      height,
      toJSON: () => ({ x: left, y: top, left, top, right, bottom, width, height })
    } as DOMRect;
  }
}
