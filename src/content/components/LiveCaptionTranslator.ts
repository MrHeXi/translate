import {
  createLiveCaptionTranscriptFilename,
  LiveCaptionTranscriptCue,
  LiveCaptionTranscriptFormat,
  LiveCaptionTranscriptSnapshot,
  renderLiveCaptionTranscript
} from '../../services/LiveCaptionTranscript';

export type {
  LiveCaptionTranscriptCue,
  LiveCaptionTranscriptFormat,
  LiveCaptionTranscriptSnapshot
} from '../../services/LiveCaptionTranscript';

export interface LiveCaptionTranslatorState {
  isActive: boolean;
  hasCaption: boolean;
  cueCount: number;
  message: string;
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

type TranslateText = (text: string, signal?: AbortSignal) => Promise<string>;
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
  parseSpeakerPrefix?: boolean;
  preferLastText?: boolean;
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
  },
  {
    source: 'Slack Huddles',
    priority: 85,
    rootSelectors: [
      '[data-qa="huddle_captions_container"]',
      '[data-qa="huddle_live_captions"]',
      '[data-qa="huddle_caption"]',
      '[data-qa*="huddle"][data-qa*="caption"]'
    ],
    speakerSelectors: [
      '[data-qa="huddle_caption_speaker"]',
      '[data-qa="huddle_caption_speaker_name"]',
      '[data-qa*="caption_speaker"]'
    ],
    textSelectors: [
      '[data-qa="huddle_caption_text"]',
      '[data-qa*="caption_text"]',
      '[class*="captionText"]'
    ],
    parseSpeakerPrefix: true
  },
  {
    source: 'Jitsi Meet',
    priority: 85,
    rootSelectors: [
      '[data-testid="transcription-subtitles"]',
      '[data-testid="subtitles-container"]',
      '[class*="transcriptionSubtitles"]'
    ],
    speakerSelectors: [
      '[data-testid="subtitle-speaker"]',
      '[data-testid*="caption-speaker"]',
      '[class*="speaker"]'
    ],
    textSelectors: [
      '[data-testid="subtitle-text"]',
      '[data-testid*="caption-text"]',
      'span'
    ],
    parseSpeakerPrefix: true,
    preferLastText: true
  },
  {
    source: 'BigBlueButton',
    priority: 85,
    rootSelectors: [
      '[data-test="audio-captions-container"]',
      '[data-test="audio-captions"]',
      '[data-test="closed-captions"]',
      '[class*="audioCaptions"]'
    ],
    speakerSelectors: [
      '[data-test="audio-caption-speaker"]',
      '[data-test*="caption-speaker"]',
      '[class*="captionSpeaker"]'
    ],
    textSelectors: [
      '[data-test="audio-caption-text"]',
      '[data-test*="caption-text"]',
      '[class*="captionText"]'
    ],
    parseSpeakerPrefix: true
  },
  {
    source: 'YouTube Live',
    priority: 80,
    rootSelectors: [
      '.ytp-caption-window-container'
    ],
    speakerSelectors: [],
    textSelectors: [
      '.ytp-caption-segment'
    ]
  }
];

const EXPLICIT_LIVE_CAPTION_SELECTORS = [
  '[data-lexibridge-live-caption-source]',
  '[aria-live]',
  '[role="log"]',
  '[role="status"]',
  '.live-caption',
  '.subtitle',
  '[class*="caption"]',
  '[class*="Caption"]',
  '[class*="subtitle"]',
  '[class*="Subtitle"]',
  '[data-testid*="caption"]',
  '[data-testid*="subtitle"]'
];

const MAX_TRANSCRIPT_CUES = 2000;
const MAX_TRANSLATION_CACHE_ENTRIES = 1000;

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
  private droppedTranscriptCueCount = 0;
  private translationRunId = 0;
  private pendingTranslationControllers = new Set<AbortController>();

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
    this.translationRunId += 1;
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
    this.translationRunId += 1;
    this.isActive = false;
    this.cancelPendingTranslations();
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
    this.translateText = null;
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
    const snapshot = this.getTranscriptSnapshot();

    if (snapshot.cues.length === 0) {
      return {
        format,
        cueCount: 0,
        filename: createLiveCaptionTranscriptFilename(document.title, format),
        content: '',
        message: 'No live caption transcript to export yet'
      };
    }

    return {
      format,
      cueCount: snapshot.cues.length,
      filename: createLiveCaptionTranscriptFilename(document.title, format),
      content: renderLiveCaptionTranscript(snapshot, format),
      message: `Exported ${snapshot.cues.length} live caption cues`
    };
  }

  getTranscriptSnapshot(): LiveCaptionTranscriptSnapshot {
    this.updateActiveTranscriptCueEnd(Date.now());
    const cues = this.transcriptCues.map(cue => ({ ...cue }));

    return {
      sessionStartedAt: this.sessionStartedAt === null ? null : new Date(this.sessionStartedAt).toISOString(),
      capturedAt: new Date().toISOString(),
      cueCount: cues.length,
      truncated: this.droppedTranscriptCueCount > 0,
      droppedCueCount: this.droppedTranscriptCueCount,
      cues
    };
  }

  clearTranscript(): LiveCaptionTranscriptStatus {
    this.transcriptCues = [];
    this.activeTranscriptCue = null;
    this.sessionStartedAt = null;
    this.lastCaptionText = '';
    this.droppedTranscriptCueCount = 0;

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
      const hadCaption = this.lastCaptionText !== '';
      this.finalizeActiveTranscriptCue(Date.now());
      if (hadCaption) this.showStatus('Waiting for live captions...');
      this.lastCaptionText = '';
      return;
    }

    const captionKey = this.formatCaptionForDisplay(caption);
    if (captionKey === this.lastCaptionText) return;

    this.lastCaptionText = captionKey;
    const transcriptCue = this.captureOrUpdateTranscriptCue(caption, Date.now());
    const translationRunId = this.translationRunId;
    this.renderCaption(caption, 'Translating...');

    try {
      const cacheKey = this.createTranslationCacheKey(caption.text);
      let translatedText = this.translationCache.get(cacheKey);
      if (!translatedText) {
        translatedText = await this.translateCaptionText(caption.text);
        if (this.isActive && translationRunId === this.translationRunId) {
          this.cacheTranslation(cacheKey, translatedText);
        }
      }

      if (this.isActive && translationRunId === this.translationRunId && transcriptCue.originalText === caption.text) {
        transcriptCue.translatedText = translatedText;
      }

      if (
        this.isActive
        && translationRunId === this.translationRunId
        && this.lastCaptionText === captionKey
      ) {
        this.renderCaption(caption, translatedText);
      }
    } catch (error) {
      if (
        this.isActive
        && translationRunId === this.translationRunId
        && transcriptCue.originalText === caption.text
      ) {
        transcriptCue.translatedText = '';
      }
      if (
        this.isActive
        && translationRunId === this.translationRunId
        && this.lastCaptionText === captionKey
      ) {
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
    let speaker = this.findFirstText(root, adapter.speakerSelectors);
    const captionText = this.findText(root, adapter.textSelectors, adapter.preferLastText);
    const fallbackText = this.normalizeCaptionText(root.textContent || '');
    let text = captionText || (speaker ? this.removeLeadingSpeaker(fallbackText, speaker) : fallbackText);

    if (!speaker && adapter.parseSpeakerPrefix) {
      const prefixedCaption = this.parseSpeakerPrefixedCaption(text);
      if (prefixedCaption) {
        speaker = prefixedCaption.speaker;
        text = prefixedCaption.text;
      }
    }

    if (!text || text === speaker) return null;

    return {
      speaker: speaker || undefined,
      text,
      source: adapter.source,
      priority: adapter.priority
    };
  }

  private findGenericCaptionCandidates(): LiveCaptionCandidate[] {
    return EXPLICIT_LIVE_CAPTION_SELECTORS
      .flatMap(selector => Array.from(document.querySelectorAll(selector)) as HTMLElement[])
      .filter((element, index, elements) => elements.indexOf(element) === index)
      .filter(element => this.isUsableCaptionElement(element))
      .filter(element => this.isExplicitLiveCaptionElement(element))
      .map(element => ({
        text: this.normalizeCaptionText(element.textContent || ''),
        source: 'Generic live caption',
        priority: 10
      }));
  }

  private isExplicitLiveCaptionElement(element: HTMLElement): boolean {
    if (element.hasAttribute('data-lexibridge-live-caption-source')) return true;

    const accessibleName = [
      element.getAttribute('aria-label'),
      element.getAttribute('aria-roledescription'),
      element.getAttribute('data-testid'),
      element.className
    ]
      .filter((value): value is string => typeof value === 'string' && Boolean(value))
      .join(' ')
      .toLowerCase();

    return /\b(?:live\s+)?captions?\b|\bsubtitles?\b/.test(accessibleName);
  }

  private findFirstText(root: HTMLElement, selectors: string[]): string {
    return this.findText(root, selectors, false);
  }

  private findText(root: HTMLElement, selectors: string[], preferLast = false): string {
    for (const selector of selectors) {
      const elements = Array.from(root.querySelectorAll(selector)) as HTMLElement[];
      const orderedElements = preferLast ? elements.reverse() : elements;

      for (const element of orderedElements) {
        if (!this.isUsableCaptionElement(element)) continue;

        const text = this.normalizeCaptionText(element.textContent || '');
        if (text) return text;
      }
    }

    return '';
  }

  private removeLeadingSpeaker(text: string, speaker: string): string {
    return text
      .replace(new RegExp(`^${this.escapeRegExp(speaker)}\\s*[:：-]?\\s*`), '')
      .trim();
  }

  private parseSpeakerPrefixedCaption(text: string): { speaker: string; text: string } | null {
    const match = text.match(/^(.{1,80}?)\s*[:\uFF1A]\s+(.{2,})$/);
    if (!match) return null;

    const speaker = this.normalizeCaptionText(match[1]);
    const captionText = this.normalizeCaptionText(match[2]);
    if (!speaker || !captionText) return null;

    return { speaker, text: captionText };
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

  private cacheTranslation(cacheKey: string, translatedText: string): void {
    if (!this.translationCache.has(cacheKey) && this.translationCache.size >= MAX_TRANSLATION_CACHE_ENTRIES) {
      const oldestKey = this.translationCache.keys().next().value as string | undefined;
      if (oldestKey !== undefined) this.translationCache.delete(oldestKey);
    }
    this.translationCache.set(cacheKey, translatedText);
  }

  private async translateCaptionText(text: string): Promise<string> {
    if (!this.translateText) throw new Error('Live caption translation is not active');

    const controller = new AbortController();
    this.pendingTranslationControllers.add(controller);

    try {
      return await this.translateText(text, controller.signal);
    } finally {
      this.pendingTranslationControllers.delete(controller);
    }
  }

  private cancelPendingTranslations(): void {
    this.pendingTranslationControllers.forEach(controller => controller.abort());
    this.pendingTranslationControllers.clear();
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
    if (this.transcriptCues.length > MAX_TRANSCRIPT_CUES) {
      const removed = this.transcriptCues.shift();
      if (removed === this.activeTranscriptCue) this.activeTranscriptCue = null;
      this.droppedTranscriptCueCount += removed ? 1 : 0;
    }
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
