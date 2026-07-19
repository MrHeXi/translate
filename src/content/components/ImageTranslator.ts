import {
  BundledOcrLanguageCode,
  BundledOcrSession,
  BundledOcrService,
  bundledOcrService
} from '../../services/BundledOcrService';

export interface ImageTranslatorState {
  isActive: boolean;
  hasImage: boolean;
  message: string;
}

export interface VisibleImageTranslationResult {
  isActive: boolean;
  visibleImageCount: number;
  translatedImageCount: number;
  unreadableImageCount: number;
  failedImageCount: number;
  message: string;
}

type TranslateText = (text: string) => Promise<string>;
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
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface ImageTextBlock {
  text: string;
  viewportRect?: DOMRect;
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
}

type ImageTranslationOutcome = 'translated' | 'failed' | 'cancelled';

declare global {
  interface Window {
    TextDetector?: new () => TextDetectorLike;
  }
}

export class ImageTranslator {
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
    this.isActive = true;
    this.translateText = translateText;
    this.createTranslationCacheKey = createTranslationCacheKey;
    this.ocrLanguage = ocrLanguage;
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
      message: hasImage ? 'Image translation started' : 'No image found'
    };
  }

  disable(): void {
    this.isActive = false;
    this.visibleImageRun += 1;
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
      message: this.isActive ? 'Image translation active' : 'Image translation stopped'
    };
  }

  cleanup(): void {
    this.disable();
    this.translationCache.clear();
    this.pendingTranslationCache.clear();
  }

  async translateVisibleImages(): Promise<VisibleImageTranslationResult> {
    if (!this.isActive || !this.translateText) {
      return {
        isActive: false,
        visibleImageCount: 0,
        translatedImageCount: 0,
        unreadableImageCount: 0,
        failedImageCount: 0,
        message: 'Start image translation first'
      };
    }

    const candidates = this.findVisibleImageCandidates();
    if (candidates.length === 0) {
      return {
        isActive: true,
        visibleImageCount: 0,
        translatedImageCount: 0,
        unreadableImageCount: 0,
        failedImageCount: 0,
        message: 'No visible images found'
      };
    }

    const runId = ++this.visibleImageRun;
    let translatedImageCount = 0;
    let unreadableImageCount = 0;
    let failedImageCount = 0;

    this.targetTranslationRuns = new WeakMap();
    this.removeAllOverlays();

    for (const target of candidates) {
      if (!this.isVisibleImageRunActive(runId)) break;

      const imageBlocks = await this.extractImageTextBlocks(target);
      if (!this.isVisibleImageRunActive(runId)) break;

      if (imageBlocks.length === 0) {
        unreadableImageCount += 1;
        continue;
      }

      const outcome = await this.translateImageBlocks(target, imageBlocks);
      if (outcome === 'translated') {
        translatedImageCount += 1;
      } else if (outcome === 'failed') {
        failedImageCount += 1;
      } else {
        break;
      }
    }

    const isActive = this.isVisibleImageRunActive(runId);

    return {
      isActive: this.isActive,
      visibleImageCount: candidates.length,
      translatedImageCount,
      unreadableImageCount,
      failedImageCount,
      message: isActive
        ? this.getVisibleImageResultMessage(
          candidates.length,
          translatedImageCount,
          unreadableImageCount,
          failedImageCount
        )
        : 'Image translation stopped'
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

    this.renderStatus(target, 'Reading image text...');

    const imageBlocks = await this.extractImageTextBlocks(target);
    if (!this.isActive) return;
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
    if (!this.isActive) return;
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
    this.renderImageBlocks(target, imageBlocks, imageBlocks.map(() => 'Translating...'), region);

    try {
      const translatedBlocks = await Promise.all(
        imageBlocks.map(block => this.translateCachedImageText(block.text))
      );

      if (this.isTargetTranslationRunActive(target, targetRunId)) {
        this.renderImageBlocks(target, imageBlocks, translatedBlocks, region);
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
        pendingTranslation = this.translateText(text)
          .then(result => {
            this.translationCache.set(cacheKey, result);
            return result;
          })
          .finally(() => {
            this.pendingTranslationCache.delete(cacheKey);
          });
        this.pendingTranslationCache.set(cacheKey, pendingTranslation);
      }
      translatedText = await pendingTranslation;
    }

    return translatedText;
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

      const mapping = this.getImageBitmapMapping(element, region);
      const bitmap = region
        ? await this.createRegionBitmap(element, region, mapping)
        : await window.createImageBitmap(element);
      try {
        const detector = new window.TextDetector();
        const detections = await detector.detect(bitmap);

        return detections
          .map(item => ({
            text: this.normalizeText(item.rawValue || ''),
            viewportRect: this.mapDetectedTextBoxToViewport(item.boundingBox, mapping)
          }))
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

      const mapping = this.getImageBitmapMapping(element, region);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(mapping.sourceWidth));
      canvas.height = Math.max(1, Math.ceil(mapping.sourceHeight));
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

      return lines.map(line => ({
        text: this.normalizeText(line.text),
        viewportRect: this.mapDetectedTextBoxToViewport(line.boundingBox, mapping)
      })).filter(block => Boolean(block.text));
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
      Math.max(1, Math.round(mapping.sourceHeight))
    );
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
      return {
        sourceX: Math.max(0, region.x * scaleX),
        sourceY: Math.max(0, region.y * scaleY),
        sourceWidth: Math.max(1, region.width * scaleX),
        sourceHeight: Math.max(1, region.height * scaleY),
        viewportLeft: region.viewportRect.left,
        viewportTop: region.viewportRect.top,
        viewportWidth: region.viewportRect.width,
        viewportHeight: region.viewportRect.height
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
      viewportHeight: rect.height
    };
  }

  private mapDetectedTextBoxToViewport(
    boundingBox: DetectedText['boundingBox'],
    mapping: ImageBitmapMapping
  ): DOMRect | undefined {
    if (!boundingBox) return undefined;

    const boxX = boundingBox.x ?? boundingBox.left ?? 0;
    const boxY = boundingBox.y ?? boundingBox.top ?? 0;
    const boxWidth = boundingBox.width ?? (
      boundingBox.right !== undefined && boundingBox.left !== undefined
        ? boundingBox.right - boundingBox.left
        : 0
    );
    const boxHeight = boundingBox.height ?? (
      boundingBox.bottom !== undefined && boundingBox.top !== undefined
        ? boundingBox.bottom - boundingBox.top
        : 0
    );

    if (boxWidth <= 0 || boxHeight <= 0) return undefined;

    const left = mapping.viewportLeft + (boxX / mapping.sourceWidth) * mapping.viewportWidth;
    const top = mapping.viewportTop + (boxY / mapping.sourceHeight) * mapping.viewportHeight;
    const width = (boxWidth / mapping.sourceWidth) * mapping.viewportWidth;
    const height = (boxHeight / mapping.sourceHeight) * mapping.viewportHeight;

    return this.createDomRectLike(left, top, width, height);
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
      });
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
