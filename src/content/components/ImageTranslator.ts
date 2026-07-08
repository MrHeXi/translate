export interface ImageTranslatorState {
  isActive: boolean;
  hasImage: boolean;
  message: string;
}

type TranslateText = (text: string) => Promise<string>;

interface DetectedText {
  rawValue?: string;
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

declare global {
  interface Window {
    TextDetector?: new () => TextDetectorLike;
  }
}

export class ImageTranslator {
  private isActive = false;
  private translateText: TranslateText | null = null;
  private overlayElement: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private selectionElement: HTMLElement | null = null;
  private selectionState: ImageSelectionState | null = null;
  private suppressNextClick = false;
  private lastImageText = '';
  private translationCache: Map<string, string> = new Map();
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

  async toggle(translateText: TranslateText): Promise<ImageTranslatorState> {
    if (this.isActive) {
      this.disable();
      return {
        isActive: false,
        hasImage: false,
        message: 'Image translation stopped'
      };
    }

    return this.enable(translateText);
  }

  enable(translateText: TranslateText): ImageTranslatorState {
    this.isActive = true;
    this.translateText = translateText;
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
    document.removeEventListener('mousedown', this.boundHandleMouseDown, true);
    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    document.removeEventListener('mouseup', this.boundHandleMouseUp, true);
    document.removeEventListener('click', this.boundHandleClick, true);
    document.body.classList.remove('lexibridge-image-translation-mode');
    this.overlayElement?.remove();
    this.overlayElement = null;
    this.removeSelectionBox();
    this.selectionState = null;
    this.suppressNextClick = false;
    this.styleElement?.remove();
    this.styleElement = null;
    this.lastImageText = '';
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

    const imageText = await this.extractImageText(target);
    if (!imageText) {
      this.lastImageText = '';
      this.renderStatus(target, 'No readable image text found');
      return;
    }

    if (imageText === this.lastImageText) return;

    this.lastImageText = imageText;
    this.renderResult(target, imageText, 'Translating...');

    try {
      let translatedText = this.translationCache.get(imageText);
      if (!translatedText) {
        translatedText = await this.translateText(imageText);
        this.translationCache.set(imageText, translatedText);
      }

      if (this.isActive && this.lastImageText === imageText) {
        this.renderResult(target, imageText, translatedText);
      }
    } catch (error) {
      if (this.isActive && this.lastImageText === imageText) {
        this.renderResult(target, imageText, 'Image translation failed');
      }
    }
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

    const imageText = await this.extractImageText(selectionState.target, region);
    if (!imageText) {
      this.lastImageText = '';
      this.renderStatus(selectionState.target, 'No readable text found in selection', region);
      return;
    }

    if (imageText === this.lastImageText) return;

    this.lastImageText = imageText;
    this.renderResult(selectionState.target, imageText, 'Translating...', region);

    try {
      let translatedText = this.translationCache.get(imageText);
      if (!translatedText) {
        translatedText = await this.translateText(imageText);
        this.translationCache.set(imageText, translatedText);
      }

      if (this.isActive && this.lastImageText === imageText) {
        this.renderResult(selectionState.target, imageText, translatedText, region);
      }
    } catch (error) {
      if (this.isActive && this.lastImageText === imageText) {
        this.renderResult(selectionState.target, imageText, 'Image translation failed', region);
      }
    }
  }

  private getImageTarget(event: MouseEvent): Element | null {
    const target = event.target as Element | null;
    if (!target || target.closest('#lexibridge-image-translation-overlay')) {
      return null;
    }

    const imageTarget = target.closest('img, canvas, svg, picture');
    if (imageTarget instanceof HTMLPictureElement) {
      return imageTarget.querySelector('img') || imageTarget;
    }

    return imageTarget;
  }

  private findImageCandidates(): Element[] {
    return Array.from(document.querySelectorAll('img, canvas, svg, picture'));
  }

  private async extractImageText(element: Element, region?: ImageSelectionRegion): Promise<string> {
    const detectedText = await this.extractWithTextDetector(element, region);
    const svgText = this.extractSvgText(element);
    const accessibleText = region ? '' : this.extractAccessibleText(element);

    return this.uniqueTextBlocks([detectedText, svgText, accessibleText]).join('\n').trim();
  }

  private async extractWithTextDetector(element: Element, region?: ImageSelectionRegion): Promise<string> {
    if (!window.TextDetector || typeof window.createImageBitmap !== 'function') {
      return '';
    }

    if (!(element instanceof HTMLImageElement) && !(element instanceof HTMLCanvasElement)) {
      return '';
    }

    try {
      if (element instanceof HTMLImageElement && !element.complete && typeof element.decode === 'function') {
        await element.decode();
      }

      const bitmap = region
        ? await this.createRegionBitmap(element, region)
        : await window.createImageBitmap(element);
      try {
        const detector = new window.TextDetector();
        const detections = await detector.detect(bitmap);

        return this.normalizeText(
          detections
            .map(item => item.rawValue || '')
            .filter(Boolean)
            .join('\n')
        );
      } finally {
        bitmap.close();
      }
    } catch (error) {
      return '';
    }
  }

  private async createRegionBitmap(element: HTMLImageElement | HTMLCanvasElement, region: ImageSelectionRegion): Promise<ImageBitmap> {
    const rect = element.getBoundingClientRect();
    const sourceWidth = element instanceof HTMLImageElement
      ? element.naturalWidth || rect.width
      : element.width || rect.width;
    const sourceHeight = element instanceof HTMLImageElement
      ? element.naturalHeight || rect.height
      : element.height || rect.height;
    const scaleX = sourceWidth / Math.max(rect.width, 1);
    const scaleY = sourceHeight / Math.max(rect.height, 1);
    const sx = Math.max(0, Math.round(region.x * scaleX));
    const sy = Math.max(0, Math.round(region.y * scaleY));
    const sw = Math.max(1, Math.round(region.width * scaleX));
    const sh = Math.max(1, Math.round(region.height * scaleY));

    return window.createImageBitmap(element, sx, sy, sw, sh);
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
    `;

    document.head.appendChild(style);
    this.styleElement = style;
  }

  private renderStatus(target: Element, message: string, region?: ImageSelectionRegion): void {
    this.createOverlay(target, region);
    if (!this.overlayElement) return;

    this.overlayElement.replaceChildren();
    this.overlayElement.textContent = message;
    this.overlayElement.style.opacity = '0.88';
  }

  private renderResult(target: Element, originalText: string, translatedText: string, region?: ImageSelectionRegion): void {
    this.createOverlay(target, region);
    if (!this.overlayElement) return;

    this.overlayElement.replaceChildren();
    this.overlayElement.style.opacity = '1';

    const original = document.createElement('div');
    original.className = 'lexibridge-image-translation-original';
    original.textContent = originalText;
    original.style.opacity = '0.88';

    const translation = document.createElement('div');
    translation.className = 'lexibridge-image-translation-result';
    translation.textContent = translatedText;
    translation.style.marginTop = '6px';
    translation.style.fontWeight = '600';

    this.overlayElement.append(original, translation);
  }

  private createOverlay(target: Element, region?: ImageSelectionRegion): void {
    if (!this.overlayElement) {
      const overlay = document.createElement('div');
      overlay.id = 'lexibridge-image-translation-overlay';
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

      document.body.appendChild(overlay);
      this.overlayElement = overlay;
    }

    const rect = region?.viewportRect || target.getBoundingClientRect();
    const left = Math.min(Math.max(rect.left, 16), Math.max(window.innerWidth - 376, 16));
    const preferredTop = rect.bottom + 10;
    const top = preferredTop < window.innerHeight - 80 ? preferredTop : Math.max(rect.top - 120, 16);

    this.overlayElement.style.left = `${left}px`;
    this.overlayElement.style.top = `${top}px`;
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

    return {
      x: left,
      y: top,
      left,
      top,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
      toJSON: () => ({ x: left, y: top, left, top, right, bottom })
    } as DOMRect;
  }
}
