export interface LiveCaptionTranslatorState {
  isActive: boolean;
  hasCaption: boolean;
  cueCount: number;
  message: string;
}

export type LiveCaptionTranscriptFormat = 'txt' | 'srt' | 'vtt' | 'json';

export interface LiveCaptionTranscriptCue {
  id: number;
  startTimeMs: number;
  endTimeMs: number;
  source: string;
  speaker?: string;
  originalText: string;
  translatedText: string;
}

export interface LiveCaptionTranscriptStatus {
  isActive: boolean;
  cueCount: number;
  sessionStartedAt: string | null;
  message: string;
}

export interface LiveCaptionTranscriptExport {
  format: LiveCaptionTranscriptFormat;
  cueCount: number;
  filename: string;
  content: string;
  message: string;
}

type TranslateText = (text: string) => Promise<string>;
type CreateTranslationCacheKey = (text: string) => string;

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
  },
  {
    source: 'Webex',
    priority: 85,
    rootSelectors: [
      '[data-lexibridge-live-caption-source="webex"]',
      '[data-test*="closed-caption"]',
      '.closed-caption-content',
      '[class*="closedCaptionContent"]'
    ],
    speakerSelectors: [
      '[data-lexibridge-caption-speaker]',
      '[data-test*="speaker"]',
      '.speaker-name',
      '[class*="speakerName"]'
    ],
    textSelectors: [
      '[data-lexibridge-caption-text]',
      '[data-test*="caption-text"]',
      '.caption-content',
      '[class*="captionText"]'
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
  private createTranslationCacheKey: CreateTranslationCacheKey = text => text;
  private overlayElement: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private scanTimer: number | null = null;
  private lastCaptionText = '';
  private translationCache: Map<string, string> = new Map();
  private transcriptCues: LiveCaptionTranscriptCue[] = [];
  private activeTranscriptCue: LiveCaptionTranscriptCue | null = null;
  private sessionStartedAt: number | null = null;

  async toggle(
    translateText: TranslateText,
    createTranslationCacheKey: CreateTranslationCacheKey = text => text
  ): Promise<LiveCaptionTranslatorState> {
    if (this.isActive) {
      this.disable();
      return {
        isActive: false,
        hasCaption: false,
        cueCount: this.transcriptCues.length,
        message: 'Live caption translation stopped'
      };
    }

    return this.enable(translateText, createTranslationCacheKey);
  }

  enable(
    translateText: TranslateText,
    createTranslationCacheKey: CreateTranslationCacheKey = text => text
  ): LiveCaptionTranslatorState {
    this.isActive = true;
    this.translateText = translateText;
    this.createTranslationCacheKey = createTranslationCacheKey;
    this.createOverlay();
    this.startWatching();

    const caption = this.findCaptionCandidate();
    this.showStatus(caption ? 'Translating live captions...' : 'Waiting for live captions...');
    void this.handleCaptionChange();

    return {
      isActive: true,
      hasCaption: Boolean(caption),
      cueCount: this.transcriptCues.length,
      message: caption ? 'Live caption translation started' : 'Waiting for live captions'
    };
  }

  disable(): void {
    this.isActive = false;
    this.finalizeActiveTranscriptCue(Date.now());

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
      cueCount: this.transcriptCues.length,
      message: this.isActive ? 'Live caption translation active' : 'Live caption translation stopped'
    };
  }

  getTranscriptStatus(): LiveCaptionTranscriptStatus {
    return {
      isActive: this.isActive,
      cueCount: this.transcriptCues.length,
      sessionStartedAt: this.sessionStartedAt === null ? null : new Date(this.sessionStartedAt).toISOString(),
      message: this.transcriptCues.length > 0
        ? `${this.transcriptCues.length} live caption cues captured`
        : 'No live caption transcript yet'
    };
  }

  exportTranscript(format: LiveCaptionTranscriptFormat = 'txt'): LiveCaptionTranscriptExport {
    this.updateActiveTranscriptCueEnd(Date.now());
    const cues = this.transcriptCues.map(cue => ({ ...cue }));

    if (cues.length === 0) {
      return {
        format,
        cueCount: 0,
        filename: this.createTranscriptFilename(format),
        content: '',
        message: 'No live caption transcript to export yet'
      };
    }

    return {
      format,
      cueCount: cues.length,
      filename: this.createTranscriptFilename(format),
      content: this.renderTranscript(cues, format),
      message: `Exported ${cues.length} live caption cues`
    };
  }

  clearTranscript(): LiveCaptionTranscriptStatus {
    this.transcriptCues = [];
    this.activeTranscriptCue = null;
    this.sessionStartedAt = null;

    return {
      isActive: this.isActive,
      cueCount: 0,
      sessionStartedAt: null,
      message: 'Live caption transcript cleared'
    };
  }

  cleanup(): void {
    this.disable();
    this.translationCache.clear();
    this.clearTranscript();
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
      this.finalizeActiveTranscriptCue(Date.now());
      this.showStatus('Waiting for live captions...');
      this.lastCaptionText = '';
      return;
    }

    const captionKey = this.formatCaptionForDisplay(caption);
    if (captionKey === this.lastCaptionText) return;

    this.lastCaptionText = captionKey;
    const transcriptCue = this.captureOrUpdateTranscriptCue(caption, Date.now());
    this.renderCaption(caption, 'Translating...');

    try {
      const cacheKey = this.createTranslationCacheKey(caption.text);
      let translatedText = this.translationCache.get(cacheKey);
      if (!translatedText) {
        translatedText = await this.translateText(caption.text);
        this.translationCache.set(cacheKey, translatedText);
      }

      if (transcriptCue.originalText === caption.text) {
        transcriptCue.translatedText = translatedText;
      }

      if (this.isActive && this.lastCaptionText === captionKey) {
        this.renderCaption(caption, translatedText);
      }
    } catch (error) {
      if (transcriptCue.originalText === caption.text) {
        transcriptCue.translatedText = '';
      }
      if (this.isActive && this.lastCaptionText === captionKey) {
        this.renderCaption(caption, 'Live caption translation failed');
      }
    }
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

  private captureOrUpdateTranscriptCue(caption: LiveCaptionCandidate, capturedAt: number): LiveCaptionTranscriptCue {
    if (this.sessionStartedAt === null) {
      this.sessionStartedAt = capturedAt;
    }

    if (this.shouldMergeIntoActiveCue(caption, capturedAt)) {
      this.activeTranscriptCue!.originalText = caption.text;
      this.activeTranscriptCue!.translatedText = '';
      this.updateActiveTranscriptCueEnd(capturedAt);
      return this.activeTranscriptCue!;
    }

    this.finalizeActiveTranscriptCue(capturedAt);
    const startTimeMs = Math.max(0, capturedAt - this.sessionStartedAt);
    const cue: LiveCaptionTranscriptCue = {
      id: this.transcriptCues.length + 1,
      startTimeMs,
      endTimeMs: startTimeMs + 1,
      source: caption.source,
      originalText: caption.text,
      translatedText: ''
    };

    if (caption.speaker) cue.speaker = caption.speaker;

    this.transcriptCues.push(cue);
    this.activeTranscriptCue = cue;
    return cue;
  }

  private shouldMergeIntoActiveCue(caption: LiveCaptionCandidate, capturedAt: number): boolean {
    if (!this.activeTranscriptCue || this.sessionStartedAt === null) return false;
    if (this.activeTranscriptCue.source !== caption.source) return false;
    if ((this.activeTranscriptCue.speaker || '') !== (caption.speaker || '')) return false;

    const cueAge = capturedAt - this.sessionStartedAt - this.activeTranscriptCue.startTimeMs;
    if (cueAge > 15000) return false;

    const currentText = this.activeTranscriptCue.originalText.toLowerCase();
    const nextText = caption.text.toLowerCase();
    if (currentText.startsWith(nextText) || nextText.startsWith(currentText)) return true;

    const shorterLength = Math.min(currentText.length, nextText.length);
    if (shorterLength < 8) return false;

    let commonPrefixLength = 0;
    while (
      commonPrefixLength < shorterLength &&
      currentText[commonPrefixLength] === nextText[commonPrefixLength]
    ) {
      commonPrefixLength += 1;
    }

    return commonPrefixLength / shorterLength >= 0.7;
  }

  private finalizeActiveTranscriptCue(capturedAt: number): void {
    this.updateActiveTranscriptCueEnd(capturedAt);
    this.activeTranscriptCue = null;
  }

  private updateActiveTranscriptCueEnd(capturedAt: number): void {
    if (!this.activeTranscriptCue || this.sessionStartedAt === null) return;

    this.activeTranscriptCue.endTimeMs = Math.max(
      this.activeTranscriptCue.startTimeMs + 1,
      capturedAt - this.sessionStartedAt
    );
  }

  private renderTranscript(cues: LiveCaptionTranscriptCue[], format: LiveCaptionTranscriptFormat): string {
    if (format === 'json') {
      return JSON.stringify({
        sessionStartedAt: this.sessionStartedAt === null ? null : new Date(this.sessionStartedAt).toISOString(),
        exportedAt: new Date().toISOString(),
        cueCount: cues.length,
        cues
      }, null, 2);
    }

    if (format === 'srt' || format === 'vtt') {
      const cueText = cues.map((cue, index) => [
        format === 'srt' ? String(index + 1) : undefined,
        `${this.formatTranscriptTime(cue.startTimeMs, format)} --> ${this.formatTranscriptTime(cue.endTimeMs, format)}`,
        this.formatTranscriptSpeakerLine(cue.speaker, cue.originalText),
        cue.translatedText ? this.formatTranscriptSpeakerLine(cue.speaker, cue.translatedText) : undefined
      ].filter(Boolean).join('\n')).join('\n\n');

      return format === 'vtt' ? `WEBVTT\n\n${cueText}\n` : `${cueText}\n`;
    }

    const header = [
      'LexiBridge live caption transcript',
      `Started: ${this.sessionStartedAt === null ? 'Unknown' : new Date(this.sessionStartedAt).toISOString()}`,
      `Cues: ${cues.length}`
    ].join('\n');
    const cueText = cues.map(cue => [
      `[${this.formatTranscriptTime(cue.startTimeMs, 'vtt')}] ${cue.speaker || 'Unknown speaker'} (${cue.source})`,
      `Original: ${cue.originalText}`,
      cue.translatedText ? `Translation: ${cue.translatedText}` : 'Translation: unavailable'
    ].join('\n')).join('\n\n');

    return `${header}\n\n${cueText}\n`;
  }

  private formatTranscriptSpeakerLine(speaker: string | undefined, text: string): string {
    return speaker ? `${speaker}: ${text}` : text;
  }

  private formatTranscriptTime(timeMs: number, format: 'srt' | 'vtt'): string {
    const safeTimeMs = Math.max(0, Math.round(timeMs));
    const hours = Math.floor(safeTimeMs / 3600000);
    const minutes = Math.floor((safeTimeMs % 3600000) / 60000);
    const seconds = Math.floor((safeTimeMs % 60000) / 1000);
    const milliseconds = safeTimeMs % 1000;
    const separator = format === 'srt' ? ',' : '.';

    return [hours, minutes, seconds]
      .map(value => String(value).padStart(2, '0'))
      .join(':') + `${separator}${String(milliseconds).padStart(3, '0')}`;
  }

  private createTranscriptFilename(format: LiveCaptionTranscriptFormat): string {
    const baseName = (document.title || 'meeting')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'meeting';

    return `${baseName}-lexibridge-live-captions.${format}`;
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
