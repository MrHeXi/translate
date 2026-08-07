import {
  BundledOcrLanguageCode,
  BundledOcrSession,
  BundledOcrService,
  bundledOcrService
} from '../../services/BundledOcrService';
import { createTranslationRequestNamespace } from '../../services/TranslationRequestId';
import {
  applyInpaintToImage,
  assessInpaintSafety,
  buildTextMask,
  COMIC_IMAGE_LIMITS,
  detectBubbles,
  detectPanels,
  groupTextTokens,
  layoutTranslation,
  OcrToken,
  OcrTokenLevel,
  PixelImage,
  PixelRect,
  RgbaColor,
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

export interface ImageTranslationRequest {
  requestId: string;
  signal: AbortSignal;
}

type TranslateText = (text: string, request: ImageTranslationRequest) => Promise<string>;
type CreateTranslationCacheKey = (text: string) => string;

interface DetectedText {
  rawValue?: string;
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
}

interface ImageSelectionState {
  target: Element;
  interactionEpoch: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface ImageTextBlock {
  text: string;
  viewportRect?: DOMRect;
  sourceRect?: PixelRect;
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

declare global {
  interface Window {
    TextDetector?: new () => TextDetectorLike;
  }
}

export class ImageTranslator {
  private readonly requestNamespace = createTranslationRequestNamespace('image-text');
  private readonly batchNamespace = createTranslationRequestNamespace('image-batch');
  private isActive = false;
  private translateText: TranslateText | null = null;
  private createTranslationCacheKey: CreateTranslationCacheKey = text => text;
  private overlayElements: Map<Element, HTMLElement[]> = new Map();
  private styleElement: HTMLStyleElement | null = null;
  private selectionElement: HTMLElement | null = null;
  private selectionState: ImageSelectionState | null = null;
  private suppressNextClick = false;
  private translationCache: Map<string, string> = new Map();
  private pendingTranslationCache: Map<string, Promise<string>> = new Map();
  private targetTranslationRuns: WeakMap<Element, number> = new WeakMap();
  private nextTargetTranslationRun = 0;
  private visibleImageRun = 0;
  private nextOverlayId = 0;
  private interactionEpoch = 0;
  private requestSequence = 0;
  private activeRequestControllers = new Set<AbortController>();
  private activeProcessingControllers = new Set<AbortController>();
  private activeVisibleImageBatch: {
    operationId: string;
    promise: Promise<VisibleImageTranslationResult>;
  } | null = null;
  private processedImageCount = 0;
  private totalImageCount = 0;
  private batchSequence = 0;
  private statusMessage = 'Image translation stopped';
  private ocrLanguage: BundledOcrLanguageCode = 'eng';
  private bundledOcrSession: BundledOcrSession | null = null;
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

  constructor(private readonly imageOcrService: BundledOcrService = bundledOcrService) {}

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
    this.interactionEpoch += 1;
    this.isActive = true;
    this.translateText = translateText;
    this.createTranslationCacheKey = createTranslationCacheKey;
    this.ocrLanguage = ocrLanguage;
    this.statusMessage = 'Image translation started';
    this.createStyleElement();
    document.body.classList.add('lexibridge-image-translation-mode');
    document.addEventListener('mousedown', this.boundHandleMouseDown, true);
    document.addEventListener('mousemove', this.boundHandleMouseMove, true);
    document.addEventListener('mouseup', this.boundHandleMouseUp, true);
    document.addEventListener('click', this.boundHandleClick, true);

    const hasImage = this.findImageCandidates().length > 0;

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

  disable(): void {
    this.interactionEpoch += 1;
    this.isActive = false;
    this.visibleImageRun += 1;
    this.activeVisibleImageBatch = null;
    this.processedImageCount = 0;
    this.totalImageCount = 0;
    this.statusMessage = 'Image translation stopped';
    this.abortActiveRequests();
    this.abortActiveProcessing();
    this.pendingTranslationCache.clear();
    this.translationCache.clear();
    document.removeEventListener('mousedown', this.boundHandleMouseDown, true);
    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    document.removeEventListener('mouseup', this.boundHandleMouseUp, true);
    document.removeEventListener('click', this.boundHandleClick, true);
    document.body.classList.remove('lexibridge-image-translation-mode');
    this.removeAllOverlays();
    this.removeSelectionBox();
    this.selectionState = null;
    this.suppressNextClick = false;
    this.styleElement?.remove();
    this.styleElement = null;
    this.targetTranslationRuns = new WeakMap();
    void this.terminateBundledOcrSession();
  }

  getStatus(): ImageTranslatorState {
    return {
      isActive: this.isActive,
      hasImage: this.findImageCandidates().length > 0,
      isBatchRunning: Boolean(this.activeVisibleImageBatch),
      operationId: this.activeVisibleImageBatch?.operationId || null,
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
  }

  invalidateForSettingsChange(): void {
    this.interactionEpoch += 1;
    this.visibleImageRun += 1;
    this.activeVisibleImageBatch = null;
    this.processedImageCount = 0;
    this.totalImageCount = 0;
    this.abortActiveRequests();
    this.abortActiveProcessing();
    this.pendingTranslationCache.clear();
    this.translationCache.clear();
    this.targetTranslationRuns = new WeakMap();
    this.removeAllOverlays();
    this.statusMessage = this.isActive ? 'Image translation settings updated' : 'Image translation stopped';
  }

  cleanup(): void {
    this.disable();
    this.translationCache.clear();
    this.pendingTranslationCache.clear();
  }

  translateVisibleImages(): Promise<VisibleImageTranslationResult> {
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
    if (!this.isActive || !this.translateText) {
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

  private async handleImageClick(event: MouseEvent): Promise<void> {
    if (!this.isActive || !this.translateText) return;

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
    const interactionEpoch = this.interactionEpoch;

    this.renderStatus(target, 'Reading image text...');

    const imageBlocks = await this.extractImageTextBlocks(target);
    if (!this.isInteractionEpochActive(interactionEpoch)) return;
    if (imageBlocks.length === 0) {
      this.renderStatus(target, 'No readable image text found');
      return;
    }

    await this.translateImageBlocks(target, imageBlocks);
  }

  private handleMouseDown(event: MouseEvent): void {
    if (!this.isActive || event.button !== 0) return;

    const target = this.getImageTarget(event);
    if (!target) return;

    this.selectionState = {
      target,
      interactionEpoch: this.interactionEpoch,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY
    };
    this.updateSelectionBox(this.selectionState);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.selectionState) return;

    this.selectionState.currentX = event.clientX;
    this.selectionState.currentY = event.clientY;
    this.updateSelectionBox(this.selectionState);
  }

  private async handleMouseUp(event: MouseEvent): Promise<void> {
    if (!this.selectionState || !this.translateText) return;

    this.selectionState.currentX = event.clientX;
    this.selectionState.currentY = event.clientY;
    const selectionState = this.selectionState;
    this.selectionState = null;

    const region = this.getSelectionRegion(selectionState);
    this.removeSelectionBox();

    if (!region) return;

    event.preventDefault();
    event.stopPropagation();
    this.suppressNextClick = true;

    this.renderStatus(selectionState.target, 'Reading selected image area...', region);

    const imageBlocks = await this.extractImageTextBlocks(selectionState.target, region);
    if (!this.isInteractionEpochActive(selectionState.interactionEpoch)) return;
    if (imageBlocks.length === 0) {
      this.renderStatus(selectionState.target, 'No readable text found in selection', region);
      return;
    }

    await this.translateImageBlocks(selectionState.target, imageBlocks, region);
  }

  private async translateImageBlocks(
    target: Element,
    imageBlocks: ImageTextBlock[],
    region?: ImageSelectionRegion
  ): Promise<ImageTranslationOutcome> {
    if (!this.translateText || !this.isActive) return 'cancelled';

    const targetRunId = ++this.nextTargetTranslationRun;
    this.targetTranslationRuns.set(target, targetRunId);
    const sourceFingerprint = this.getSourceFingerprint(target, region);
    this.renderImageBlocks(target, imageBlocks, imageBlocks.map(() => 'Translating...'), region);

    try {
      const translatedBlocks = await this.translateImageTextBlocks(imageBlocks);

      if (this.isTargetTranslationRunActive(target, targetRunId)) {
        const renderedComic = await this.tryRenderComicImage(
          target,
          imageBlocks,
          translatedBlocks,
          targetRunId,
          sourceFingerprint,
          region
        );
        if (!this.isTargetTranslationRunActive(target, targetRunId)) return 'cancelled';
        if (!renderedComic) this.renderImageBlocks(target, imageBlocks, translatedBlocks, region);
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

  private async translateCachedImageText(text: string): Promise<string> {
    if (!this.translateText) return '';

    const cacheKey = this.createTranslationCacheKey(text);
    let translatedText = this.translationCache.get(cacheKey);
    if (translatedText === undefined) {
      let pendingTranslation = this.pendingTranslationCache.get(cacheKey);
      if (!pendingTranslation) {
        const controller = new AbortController();
        const requestId = `${this.requestNamespace}:${++this.requestSequence}`;
        this.activeRequestControllers.add(controller);
        pendingTranslation = this.translateText(text, {
          requestId,
          signal: controller.signal
        })
          .then(result => {
            if (controller.signal.aborted || !this.isActive) {
              throw new DOMException('Canceled', 'AbortError');
            }
            this.translationCache.set(cacheKey, result);
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

  private async translateImageTextBlocks(blocks: ImageTextBlock[]): Promise<string[]> {
    const results = new Array<string>(blocks.length);
    let nextIndex = 0;
    const workerCount = Math.min(MAX_IMAGE_TRANSLATION_CONCURRENCY, blocks.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (this.isActive) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= blocks.length) return;
        results[index] = await this.translateCachedImageText(blocks[index].text);
      }
      throw new DOMException('Canceled', 'AbortError');
    });
    await Promise.all(workers);
    return results;
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
    const target = event.target as Element | null;
    if (!target || this.isExtensionOwnedElement(target)) {
      return null;
    }

    const imageTarget = target.closest('img, canvas, svg, picture');
    if (imageTarget instanceof HTMLPictureElement) {
      return imageTarget.querySelector('img') || imageTarget;
    }

    return imageTarget;
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
    const detectedBlocks = await this.extractWithTextDetector(element, region);
    if (detectedBlocks.length > 0) {
      return this.uniqueImageTextBlocks(detectedBlocks);
    }

    const bundledBlocks = await this.extractWithBundledOcr(element, region);
    if (bundledBlocks.length > 0) {
      return this.uniqueImageTextBlocks(bundledBlocks);
    }

    const svgText = this.extractSvgText(element);
    const accessibleText = region ? '' : this.extractAccessibleText(element);

    return this.uniqueTextBlocks([svgText, accessibleText])
      .map(text => ({ text }));
  }

  private async extractWithTextDetector(element: Element, region?: ImageSelectionRegion): Promise<ImageTextBlock[]> {
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

      const mapping = this.getBoundedOcrMapping(this.getImageBitmapMapping(element, region));
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

        return detections
          .map(item => {
            const sourceRect = this.mapDetectedTextBoxToSource(item.boundingBox, mapping);
            return {
              text: this.normalizeText(item.rawValue || ''),
              viewportRect: this.mapDetectedTextBoxToViewport(item.boundingBox, mapping),
              sourceRect,
              confidence: 100,
              level: sourceRect ? this.getOcrTokenLevel(sourceRect, mapping) : 'page-fallback' as OcrTokenLevel
            };
          })
          .filter(block => Boolean(block.text));
      } finally {
        bitmap.close();
      }
    } catch (error) {
      return [];
    }
  }

  private async extractWithBundledOcr(
    element: Element,
    region?: ImageSelectionRegion
  ): Promise<ImageTextBlock[]> {
    if (!(element instanceof HTMLImageElement) && !(element instanceof HTMLCanvasElement)) {
      return [];
    }

    try {
      if (element instanceof HTMLImageElement && !element.complete && typeof element.decode === 'function') {
        await element.decode();
      }

      const mapping = this.getBoundedOcrMapping(this.getImageBitmapMapping(element, region));
      const canvas = document.createElement('canvas');
      canvas.width = mapping.pixelWidth;
      canvas.height = mapping.pixelHeight;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return [];

      context.drawImage(
        element,
        mapping.sourceX,
        mapping.sourceY,
        mapping.sourceWidth,
        mapping.sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const session = this.getBundledOcrSession();
      const lines = await session.recognize(canvas);

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
    } catch {
      return [];
    }
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
    _region: ImageSelectionRegion,
    mapping: ImageBitmapMapping
  ): Promise<ImageBitmap> {
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

    const left = mapping.viewportLeft + (sourceRect.x / mapping.pixelWidth) * mapping.viewportWidth;
    const top = mapping.viewportTop + (sourceRect.y / mapping.pixelHeight) * mapping.viewportHeight;
    const width = (sourceRect.width / mapping.pixelWidth) * mapping.viewportWidth;
    const height = (sourceRect.height / mapping.pixelHeight) * mapping.viewportHeight;

    return this.createDomRectLike(left, top, width, height);
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
    region?: ImageSelectionRegion
  ): Promise<boolean> {
    if (
      blocks.length === 0 ||
      blocks.length > MAX_COMIC_RECONSTRUCTION_BLOCKS ||
      blocks.length !== translatedTexts.length ||
      blocks.some(block => !block.sourceRect || block.level === 'page-fallback')
    ) {
      return false;
    }

    const snapshot = this.captureComicPixels(target, region);
    if (!snapshot) return false;

    const controller = new AbortController();
    this.activeProcessingControllers.add(controller);
    const { signal } = controller;

    try {
      const tokens: OcrToken[] = blocks.map((block, index) => ({
        id: `block-${index}`,
        text: block.text,
        confidence: Math.max(0, Math.min(100, block.confidence ?? 100)),
        rect: block.sourceRect!,
        level: block.level || 'line',
        direction: 'unknown'
      }));
      const panels = detectPanels(snapshot.image, { signal });
      const bubbles = detectBubbles(snapshot.image, tokens, panels, { signal });
      const groups = groupTextTokens(tokens, bubbles, signal);
      if (groups.length === 0) return false;

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
        return false;
      }

      const bubbleById = new Map(bubbles.map(bubble => [bubble.id, bubble]));
      const preparedGroups: PreparedComicGroup[] = [];
      const measure = (text: string, fontSize: number): number => {
        outputContext.font = this.getComicFont(fontSize);
        return outputContext.measureText(text).width;
      };

      for (const group of groups) {
        if (signal.aborted) return false;
        const bubble = group.bubbleId ? bubbleById.get(group.bubbleId) : undefined;
        if (!bubble) return false;

        const translatedText = group.tokenIds
          .map(tokenId => translatedTexts[Number.parseInt(tokenId.slice('block-'.length), 10)] || '')
          .filter(Boolean)
          .join('\n')
          .trim();
        if (!translatedText) return false;

        const plan = layoutTranslation(translatedText, bubble.rect, measure, {
          minFontSize: 6,
          maxFontSize: Math.max(8, Math.min(48, Math.floor(bubble.rect.height * 0.45))),
          padding: Math.max(2, Math.floor(Math.min(bubble.rect.width, bubble.rect.height) * 0.08)),
          signal
        });
        if (plan.overflow || plan.lines.length === 0) return false;

        const mask = buildTextMask(snapshot.image, group, bubble, { signal });
        const safety = assessInpaintSafety(snapshot.image, mask, bubble, signal);
        if (safety.mode === 'skip') return false;

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
      outputContext.textBaseline = 'alphabetic';

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
        outputContext.textAlign = prepared.plan.direction === 'rtl' ? 'right' : 'left';
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
        return false;
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
      return true;
    } catch {
      return false;
    } finally {
      this.activeProcessingControllers.delete(controller);
    }
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
      ? [region.x, region.y, region.width, region.height].map(value => Math.round(value * 100) / 100)
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
      .trim();
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

    return `${block.text.toLowerCase()}|${rectKey}`;
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

    return overlay;
  }

  private updateSelectionBox(selectionState: ImageSelectionState): void {
    if (!this.selectionElement) {
      const box = document.createElement('div');
      box.id = 'lexibridge-image-selection-box';
      document.body.appendChild(box);
      this.selectionElement = box;
    }

    const left = Math.min(selectionState.startX, selectionState.currentX);
    const top = Math.min(selectionState.startY, selectionState.currentY);
    const width = Math.abs(selectionState.currentX - selectionState.startX);
    const height = Math.abs(selectionState.currentY - selectionState.startY);

    Object.assign(this.selectionElement.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`
    });
  }

  private removeSelectionBox(): void {
    this.selectionElement?.remove();
    this.selectionElement = null;
  }

  private removeTargetOverlays(target: Element): void {
    this.overlayElements.get(target)?.forEach(overlay => overlay.remove());
    this.overlayElements.delete(target);
  }

  private removeAllOverlays(): void {
    this.overlayElements.forEach(overlays => overlays.forEach(overlay => overlay.remove()));
    this.overlayElements.clear();
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
    const viewportRect = this.getClampedViewportRect(selectionState);
    if (viewportRect.width < 8 || viewportRect.height < 8) return null;

    const targetRect = selectionState.target.getBoundingClientRect();

    return {
      x: viewportRect.left - targetRect.left,
      y: viewportRect.top - targetRect.top,
      width: viewportRect.width,
      height: viewportRect.height,
      viewportRect
    };
  }

  private getClampedViewportRect(selectionState: ImageSelectionState): DOMRect {
    const targetRect = selectionState.target.getBoundingClientRect();
    const left = Math.max(
      targetRect.left,
      Math.min(selectionState.startX, selectionState.currentX)
    );
    const top = Math.max(
      targetRect.top,
      Math.min(selectionState.startY, selectionState.currentY)
    );
    const right = Math.min(
      targetRect.right,
      Math.max(selectionState.startX, selectionState.currentX)
    );
    const bottom = Math.min(
      targetRect.bottom,
      Math.max(selectionState.startY, selectionState.currentY)
    );

    return this.createDomRectLike(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
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
