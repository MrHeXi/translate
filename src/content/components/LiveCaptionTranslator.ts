export interface LiveCaptionTranslatorState {
  isActive: boolean;
  hasCaption: boolean;
  message: string;
}

type TranslateText = (text: string) => Promise<string>;

interface LiveCaptionCandidate {
  speaker?: string;
  text: string;
  source: string;
  priority: number;
}

interface MeetingCaptionAdapter {
  source: string;
  priority: number;
  rootSelectors: string[];
  speakerSelectors: string[];
  textSelectors: string[];
}

const MEETING_CAPTION_ADAPTERS: MeetingCaptionAdapter[] = [
  {
    source: 'Google Meet',
    priority: 100,
    rootSelectors: [
      '[data-lexibridge-live-caption-source="google-meet"]',
      '.a4cQT',
      '[class*="a4cQT"]'
    ],
    speakerSelectors: [
      '[data-lexibridge-caption-speaker]',
      '.iTTPOb',
      '[class*="speaker"]',
      '[class*="Speaker"]'
    ],
    textSelectors: [
      '[data-lexibridge-caption-text]',
      '.TBMuR',
      '[class*="caption-text"]',
      '[class*="CaptionText"]'
    ]
  },
  {
    source: 'Zoom',
    priority: 90,
    rootSelectors: [
      '[data-lexibridge-live-caption-source="zoom"]',
      '.closed-caption',
      '.caption-window',
      '[class*="closed-caption"]'
    ],
    speakerSelectors: [
      '[data-lexibridge-caption-speaker]',
      '.caption-name',
      '.speaker-name',
      '[class*="speaker"]',
      '[class*="name"]'
    ],
    textSelectors: [
      '[data-lexibridge-caption-text]',
      '.caption-text',
      '.captions-text',
      '[class*="caption-text"]',
      '[class*="CaptionText"]'
    ]
  },
  {
    source: 'Microsoft Teams',
    priority: 90,
    rootSelectors: [
      '[data-lexibridge-live-caption-source="teams"]',
      '[data-tid*="closed-caption"]',
      '[data-tid*="caption"]',
      '[class*="closedCaption"]'
    ],
    speakerSelectors: [
      '[data-lexibridge-caption-speaker]',
      '[data-tid*="speaker"]',
      '[class*="speaker"]',
      '[class*="Speaker"]'
    ],
    textSelectors: [
      '[data-lexibridge-caption-text]',
      '[data-tid*="caption-text"]',
      '[data-tid*="closed-caption-text"]',
      '[class*="captionText"]',
      '[class*="CaptionText"]'
    ]
  }
];

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

    const caption = this.findCaptionCandidate();
    this.showStatus(caption ? 'Translating live captions...' : 'Waiting for live captions...');
    void this.handleCaptionChange();

    return {
      isActive: true,
      hasCaption: Boolean(caption),
      message: caption ? 'Live caption translation started' : 'Waiting for live captions'
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
      hasCaption: Boolean(this.findCaptionCandidate()),
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

    const caption = this.findCaptionCandidate();
    if (!caption) {
      this.showStatus('Waiting for live captions...');
      this.lastCaptionText = '';
      return;
    }

    const captionKey = this.formatCaptionForDisplay(caption);
    if (captionKey === this.lastCaptionText) return;

    this.lastCaptionText = captionKey;
    this.renderCaption(caption, 'Translating...');

    try {
      let translatedText = this.translationCache.get(caption.text);
      if (!translatedText) {
        translatedText = await this.translateText(caption.text);
        this.translationCache.set(caption.text, translatedText);
      }

      if (this.isActive && this.lastCaptionText === captionKey) {
        this.renderCaption(caption, translatedText);
      }
    } catch (error) {
      if (this.isActive && this.lastCaptionText === captionKey) {
        this.renderCaption(caption, 'Live caption translation failed');
      }
    }
  }

  private findCaptionText(): string {
    return this.findCaptionCandidate()?.text || '';
  }

  private findCaptionCandidate(): LiveCaptionCandidate | null {
    const candidates = [
      ...this.findMeetingCaptionCandidates(),
      ...this.findGenericCaptionCandidates()
    ].filter(candidate => candidate.text.length >= 2 && candidate.text.length <= 600);

    if (candidates.length === 0) {
      return null;
    }

    return candidates.reduce((best, current) => {
      if (current.priority !== best.priority) return current.priority > best.priority ? current : best;
      if (Boolean(current.speaker) !== Boolean(best.speaker)) return current.speaker ? current : best;
      return current.text.length >= best.text.length ? current : best;
    });
  }

  private findMeetingCaptionCandidates(): LiveCaptionCandidate[] {
    return MEETING_CAPTION_ADAPTERS.flatMap(adapter => {
      const roots = adapter.rootSelectors
        .flatMap(selector => Array.from(document.querySelectorAll(selector)) as HTMLElement[])
        .filter((element, index, elements) => elements.indexOf(element) === index)
        .filter(element => this.isUsableCaptionElement(element));

      return roots
        .map(root => this.extractMeetingCaptionCandidate(root, adapter))
        .filter((candidate): candidate is LiveCaptionCandidate => Boolean(candidate));
    });
  }

  private extractMeetingCaptionCandidate(root: HTMLElement, adapter: MeetingCaptionAdapter): LiveCaptionCandidate | null {
    const speaker = this.findFirstText(root, adapter.speakerSelectors);
    const captionText = this.findFirstText(root, adapter.textSelectors);
    const fallbackText = this.normalizeCaptionText(root.textContent || '');
    const text = captionText || (speaker ? this.removeLeadingSpeaker(fallbackText, speaker) : fallbackText);

    if (!text || text === speaker) return null;

    return {
      speaker: speaker || undefined,
      text,
      source: adapter.source,
      priority: adapter.priority
    };
  }

  private findGenericCaptionCandidates(): LiveCaptionCandidate[] {
    return LIVE_CAPTION_SELECTORS
      .flatMap(selector => Array.from(document.querySelectorAll(selector)) as HTMLElement[])
      .filter((element, index, elements) => elements.indexOf(element) === index)
      .filter(element => this.isUsableCaptionElement(element))
      .map(element => ({
        text: this.normalizeCaptionText(element.textContent || ''),
        source: 'Generic live caption',
        priority: 10
      }));
  }

  private findFirstText(root: HTMLElement, selectors: string[]): string {
    for (const selector of selectors) {
      const element = root.querySelector(selector) as HTMLElement | null;
      if (!element || !this.isUsableCaptionElement(element)) continue;

      const text = this.normalizeCaptionText(element.textContent || '');
      if (text) return text;
    }

    return '';
  }

  private removeLeadingSpeaker(text: string, speaker: string): string {
    return text
      .replace(new RegExp(`^${this.escapeRegExp(speaker)}\\s*[:：-]?\\s*`), '')
      .trim();
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

  private formatCaptionForDisplay(caption: LiveCaptionCandidate, translatedText?: string): string {
    const text = translatedText || caption.text;
    return caption.speaker ? `${caption.speaker}: ${text}` : text;
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  private renderCaption(caption: LiveCaptionCandidate, translatedText: string): void {
    if (!this.overlayElement) return;

    this.overlayElement.replaceChildren();
    this.overlayElement.style.opacity = '1';

    const original = document.createElement('div');
    original.className = 'lexibridge-live-caption-original';
    original.textContent = this.formatCaptionForDisplay(caption);
    original.style.opacity = '0.88';

    const translation = document.createElement('div');
    translation.className = 'lexibridge-live-caption-translation';
    translation.textContent = this.formatCaptionForDisplay(caption, translatedText);
    translation.style.marginTop = '5px';
    translation.style.fontWeight = '600';

    this.overlayElement.append(original, translation);
  }
}
