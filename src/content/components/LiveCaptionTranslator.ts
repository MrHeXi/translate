export interface LiveCaptionTranslatorState {
  isActive: boolean;
  hasCaption: boolean;
  message: string;
}

type TranslateText = (text: string) => Promise<string>;

const LIVE_CAPTION_SELECTORS = [
  '[data-lexibridge-live-caption-source]',
  '[aria-live="polite"]',
  '[aria-live="assertive"]',
  '[role="log"]',
  '[role="status"]',
  '.iTTPOb',
  '.a4cQT',
  '.TBMuR',
  '.closed-caption',
  '.captions-text',
  '.caption-window',
  '.caption-text',
  '.live-caption',
  '.subtitle',
  '[class*="caption"]',
  '[class*="Caption"]',
  '[class*="subtitle"]',
  '[class*="Subtitle"]',
  '[data-testid*="caption"]',
  '[data-testid*="subtitle"]'
];

export class LiveCaptionTranslator {
  private isActive = false;
  private translateText: TranslateText | null = null;
  private overlayElement: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private scanTimer: number | null = null;
  private lastCaptionText = '';
  private translationCache: Map<string, string> = new Map();

  async toggle(translateText: TranslateText): Promise<LiveCaptionTranslatorState> {
    if (this.isActive) {
      this.disable();
      return {
        isActive: false,
        hasCaption: false,
        message: 'Live caption translation stopped'
      };
    }

    return this.enable(translateText);
  }

  enable(translateText: TranslateText): LiveCaptionTranslatorState {
    this.isActive = true;
    this.translateText = translateText;
    this.createOverlay();
    this.startWatching();

    const captionText = this.findCaptionText();
    this.showStatus(captionText ? 'Translating live captions...' : 'Waiting for live captions...');
    void this.handleCaptionChange();

    return {
      isActive: true,
      hasCaption: Boolean(captionText),
      message: captionText ? 'Live caption translation started' : 'Waiting for live captions'
    };
  }

  disable(): void {
    this.isActive = false;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.scanTimer !== null) {
      window.clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    this.overlayElement?.remove();
    this.overlayElement = null;
    this.lastCaptionText = '';
  }

  getStatus(): LiveCaptionTranslatorState {
    return {
      isActive: this.isActive,
      hasCaption: Boolean(this.findCaptionText()),
      message: this.isActive ? 'Live caption translation active' : 'Live caption translation stopped'
    };
  }

  cleanup(): void {
    this.disable();
    this.translationCache.clear();
  }

  private startWatching(): void {
    if (!this.observer) {
      this.observer = new MutationObserver(() => {
        if (this.isActive) {
          void this.handleCaptionChange();
        }
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    if (this.scanTimer === null) {
      this.scanTimer = window.setInterval(() => {
        if (this.isActive) {
          void this.handleCaptionChange();
        }
      }, 1000);
    }
  }

  private async handleCaptionChange(): Promise<void> {
    if (!this.isActive || !this.translateText) return;

    const captionText = this.findCaptionText();
    if (!captionText) {
      this.showStatus('Waiting for live captions...');
      this.lastCaptionText = '';
      return;
    }

    if (captionText === this.lastCaptionText) return;

    this.lastCaptionText = captionText;
    this.renderCaption(captionText, 'Translating...');

    try {
      let translatedText = this.translationCache.get(captionText);
      if (!translatedText) {
        translatedText = await this.translateText(captionText);
        this.translationCache.set(captionText, translatedText);
      }

      if (this.isActive && this.lastCaptionText === captionText) {
        this.renderCaption(captionText, translatedText);
      }
    } catch (error) {
      if (this.isActive && this.lastCaptionText === captionText) {
        this.renderCaption(captionText, 'Live caption translation failed');
      }
    }
  }

  private findCaptionText(): string {
    const candidates = LIVE_CAPTION_SELECTORS
      .flatMap(selector => Array.from(document.querySelectorAll(selector)) as HTMLElement[])
      .filter((element, index, elements) => elements.indexOf(element) === index)
      .filter(element => this.isUsableCaptionElement(element))
      .map(element => this.normalizeCaptionText(element.textContent || ''))
      .filter(text => text.length >= 2 && text.length <= 600);

    if (candidates.length === 0) {
      return '';
    }

    return candidates.reduce((best, current) => current.length >= best.length ? current : best, '');
  }

  private isUsableCaptionElement(element: HTMLElement): boolean {
    if (element.closest('#lexibridge-live-caption-overlay, #lexibridge-video-subtitle-overlay')) {
      return false;
    }

    if (element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(element.tagName)) {
      return false;
    }

    const styles = window.getComputedStyle(element);
    return styles.display !== 'none' && styles.visibility !== 'hidden';
  }

  private normalizeCaptionText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .trim();
  }

  private createOverlay(): void {
    if (this.overlayElement) return;

    const overlay = document.createElement('div');
    overlay.id = 'lexibridge-live-caption-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '50%',
      bottom: '136px',
      transform: 'translateX(-50%)',
      zIndex: '2147482999',
      width: '780px',
      maxWidth: '90vw',
      padding: '10px 14px',
      borderRadius: '8px',
      background: 'rgba(17, 24, 39, 0.9)',
      color: '#ffffff',
      font: '15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineHeight: '1.45',
      textAlign: 'center',
      pointerEvents: 'none',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)'
    });

    document.body.appendChild(overlay);
    this.overlayElement = overlay;
  }

  private showStatus(message: string): void {
    if (!this.overlayElement) return;

    this.overlayElement.textContent = message;
    this.overlayElement.style.opacity = '0.82';
  }

  private renderCaption(originalText: string, translatedText: string): void {
    if (!this.overlayElement) return;

    this.overlayElement.replaceChildren();
    this.overlayElement.style.opacity = '1';

    const original = document.createElement('div');
    original.className = 'lexibridge-live-caption-original';
    original.textContent = originalText;
    original.style.opacity = '0.88';

    const translation = document.createElement('div');
    translation.className = 'lexibridge-live-caption-translation';
    translation.textContent = translatedText;
    translation.style.marginTop = '5px';
    translation.style.fontWeight = '600';

    this.overlayElement.append(original, translation);
  }
}
