import {
  createVideoNavigationToken,
  VideoPageType,
  VideoSiteContext,
  resolveVideoSiteContext
} from '../../services/VideoSiteAdapterRegistry';
import { createTranslationRequestNamespace } from '../../services/TranslationRequestId';

export interface VideoSubtitleTranslatorState {
  isActive: boolean;
  hasTrack: boolean;
  message: string;
  adapterId: string;
  adapterVersion: number;
  siteLabel: string;
  pageType: VideoPageType;
  canGenerateFromTab: boolean;
}

export interface VideoSubtitleExport {
  cueCount: number;
  filename: string;
  content: string;
  message: string;
}

export interface VideoSubtitleTranslationRequest {
  requestId: string;
  signal: AbortSignal;
}

export interface VideoPlaybackPosition {
  currentTime: number;
  duration: number | null;
  paused: boolean;
  adapterId: string;
  adapterVersion: number;
  siteLabel: string;
  pageType: VideoPageType;
}

export interface GeneratedVideoSubtitleCue {
  start: number;
  end: number;
  originalText: string;
  translatedText: string;
}

export interface GeneratedVideoSubtitleResult {
  success: boolean;
  cueCount: number;
  message: string;
}

type TranslateText = (text: string, request: VideoSubtitleTranslationRequest) => Promise<string>;
type CreateTranslationCacheKey = (text: string) => string;

interface ActiveSubtitleCue {
  text: string;
  startTime?: number;
  endTime?: number;
}

interface TranslatedSubtitleCue {
  originalText: string;
  translatedText: string;
  startTime: number;
  endTime: number;
}

export class VideoSubtitleTranslator {
  private static readonly MAX_EXPORTED_CUES = 5000;
  private static readonly LIVE_DOM_CUE_SETTLE_MS = 700;
  private static readonly MAX_GENERATED_CUES = 5000;
  private static readonly MAX_GENERATED_CUE_TEXT_CODE_POINTS = 4000;
  private static readonly MAX_GENERATED_TOTAL_TEXT_CODE_POINTS = 200000;
  private static readonly MAX_GENERATED_CUE_TIME_SECONDS = 359999.999;
  private readonly requestNamespace = createTranslationRequestNamespace('video-subtitle');
  private isActive = false;
  private translateText: TranslateText | null = null;
  private createTranslationCacheKey: CreateTranslationCacheKey = text => text;
  private overlayElement: HTMLElement | null = null;
  private generatedOverlayElement: HTMLElement | null = null;
  private currentTrack: TextTrack | null = null;
  private currentVideo: HTMLVideoElement | null = null;
  private generatedVideo: HTMLVideoElement | null = null;
  private generatedCues: GeneratedVideoSubtitleCue[] = [];
  private generatedNavigationKey: string | null = null;
  private generatedVideoSource = '';
  private generatedCleanupTimer: number | null = null;
  private generatedBindingId = 0;
  private generatedVideoEventHandler: ((event: Event) => void) | null = null;
  private previousTrackMode: TextTrackMode | null = null;
  private scanTimer: number | null = null;
  private liveDomCueTimer: number | null = null;
  private lastCueText = '';
  private lastCueIdentity = '';
  private hasDomSubtitleSource = false;
  private translationCache: Map<string, string> = new Map();
  private translatedCues: TranslatedSubtitleCue[] = [];
  private translatedCueKeys: Set<string> = new Set();
  private siteContext: VideoSiteContext = resolveVideoSiteContext(window.location.href, document);
  private enabledNavigationKey: string | null = null;
  private runId = 0;
  private requestSequence = 0;
  private activeRequestControllers = new Set<AbortController>();
  private statusMessage = 'Video subtitle translation stopped';
  private boundHandleCueChange = (): void => {
    void this.handleCueChange();
  };

  async toggle(
    translateText: TranslateText,
    createTranslationCacheKey: CreateTranslationCacheKey = text => text
  ): Promise<VideoSubtitleTranslatorState> {
    if (this.isActive) {
      this.disable();
      return this.getStatus();
    }

    return this.enable(translateText, createTranslationCacheKey);
  }

  enable(
    translateText: TranslateText,
    createTranslationCacheKey: CreateTranslationCacheKey = text => text
  ): VideoSubtitleTranslatorState {
    this.clearGeneratedVideoSubtitles();
    this.cancelPendingLiveDomCue();
    this.abortActiveRequests();
    this.runId++;
    this.translationCache.clear();
    this.translatedCues = [];
    this.translatedCueKeys.clear();
    this.lastCueText = '';
    this.lastCueIdentity = '';
    this.siteContext = resolveVideoSiteContext(window.location.href, document);
    this.enabledNavigationKey = this.siteContext.navigationKey;
    this.isActive = true;
    this.translateText = translateText;
    this.createTranslationCacheKey = createTranslationCacheKey;
    this.createOverlay();
    const hasTrack = this.scanForSubtitleSource();
    this.statusMessage = hasTrack ? 'Video subtitle translation started' : 'No caption track found';

    if (!this.scanTimer) {
      this.scanTimer = window.setInterval(() => {
        if (this.isActive) {
          this.scanForSubtitleSource();
        }
      }, 500);
    }

    return this.createState(hasTrack);
  }

  disable(message: string = 'Video subtitle translation stopped'): void {
    this.runId++;
    this.isActive = false;
    this.statusMessage = message;
    this.cancelPendingLiveDomCue();
    this.abortActiveRequests();
    this.detachTrack();

    if (this.scanTimer !== null) {
      window.clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    this.overlayElement?.remove();
    this.overlayElement = null;
    this.currentVideo = null;
    this.lastCueText = '';
    this.lastCueIdentity = '';
    this.hasDomSubtitleSource = false;
    this.enabledNavigationKey = null;
    this.translateText = null;
  }

  getStatus(): VideoSubtitleTranslatorState {
    this.refreshGeneratedSubtitleBinding();
    this.siteContext = resolveVideoSiteContext(window.location.href, document);
    return this.createState(Boolean(this.currentTrack) || this.hasDomSubtitleSource);
  }

  cleanup(): void {
    this.clearGeneratedVideoSubtitles();
    this.disable();
    this.translationCache.clear();
    this.translatedCues = [];
    this.translatedCueKeys.clear();
  }

  getPlaybackPosition(): VideoPlaybackPosition | null {
    this.refreshGeneratedSubtitleBinding();
    this.siteContext = resolveVideoSiteContext(window.location.href, document);
    const video = this.currentVideo || this.getRankedVideos()[0];
    if (!video || !Number.isFinite(video.currentTime)) return null;

    return {
      currentTime: Math.max(0, video.currentTime),
      duration: Number.isFinite(video.duration) ? Math.max(0, video.duration) : null,
      paused: video.paused,
      adapterId: this.siteContext.adapterId,
      adapterVersion: this.siteContext.adapterVersion,
      siteLabel: this.siteContext.siteLabel,
      pageType: this.siteContext.pageType
    };
  }

  private createState(hasTrack: boolean): VideoSubtitleTranslatorState {
    return {
      isActive: this.isActive,
      hasTrack,
      message: this.statusMessage,
      adapterId: this.siteContext.adapterId,
      adapterVersion: this.siteContext.adapterVersion,
      siteLabel: this.siteContext.siteLabel,
      pageType: this.siteContext.pageType,
      canGenerateFromTab: this.siteContext.canGenerateFromTab
    };
  }

  exportSubtitles(): VideoSubtitleExport {
    if (this.translatedCues.length === 0) {
      return {
        cueCount: 0,
        filename: this.createExportFilename(),
        content: '',
        message: 'No translated subtitles to export yet'
      };
    }

    return {
      cueCount: this.translatedCues.length,
      filename: this.createExportFilename(),
      content: this.renderSrt(this.translatedCues),
      message: `Exported ${this.translatedCues.length} subtitle cues`
    };
  }

  applyGeneratedVideoSubtitles(
    cues: unknown,
    expectedNavigationToken?: unknown
  ): GeneratedVideoSubtitleResult {
    const normalizedCues = this.normalizeGeneratedVideoSubtitleCues(cues);
    if (!normalizedCues) {
      return {
        success: false,
        cueCount: 0,
        message: 'Generated subtitles are invalid or empty'
      };
    }

    this.siteContext = resolveVideoSiteContext(window.location.href, document);
    if (expectedNavigationToken !== undefined) {
      if (typeof expectedNavigationToken !== 'string' || !expectedNavigationToken) {
        return {
          success: false,
          cueCount: 0,
          message: 'Source video identity is invalid'
        };
      }
      if (createVideoNavigationToken(this.siteContext.navigationKey) !== expectedNavigationToken) {
        return {
          success: false,
          cueCount: 0,
          message: 'Source video changed; generate captions again'
        };
      }
    }
    const video = this.getRankedVideos()[0];
    if (!video) {
      return {
        success: false,
        cueCount: 0,
        message: 'No video found for generated subtitles'
      };
    }

    this.clearGeneratedVideoSubtitles();
    if (this.isActive) this.disable('Video subtitle translation stopped');

    this.generatedCues = normalizedCues;
    this.generatedVideo = video;
    this.generatedNavigationKey = this.siteContext.navigationKey;
    this.generatedVideoSource = this.getVideoSourceFingerprint(video);
    this.generatedBindingId++;
    const bindingId = this.generatedBindingId;
    const boundVideo = video;
    this.generatedVideoEventHandler = (event: Event): void => {
      if (
        bindingId !== this.generatedBindingId
        || this.generatedVideo !== boundVideo
        || (event.currentTarget && event.currentTarget !== boundVideo)
      ) {
        return;
      }
      this.refreshGeneratedSubtitleBinding();
      if (bindingId === this.generatedBindingId && this.generatedVideo === boundVideo) {
        this.renderGeneratedSubtitleForCurrentTime();
      }
    };
    ['timeupdate', 'seeking', 'loadedmetadata', 'ended'].forEach(type => {
      video.addEventListener(type, this.generatedVideoEventHandler!);
    });

    this.createGeneratedOverlay();
    this.renderGeneratedSubtitleForCurrentTime();
    this.generatedCleanupTimer = window.setInterval(() => {
      if (bindingId === this.generatedBindingId) {
        this.refreshGeneratedSubtitleBinding();
      }
    }, 500);

    return {
      success: true,
      cueCount: normalizedCues.length,
      message: `Applied ${normalizedCues.length} generated subtitle cue${normalizedCues.length === 1 ? '' : 's'}`
    };
  }

  clearGeneratedVideoSubtitles(
    message = 'Generated video subtitles cleared'
  ): GeneratedVideoSubtitleResult {
    const hadGeneratedSubtitles = this.generatedCues.length > 0 || Boolean(this.generatedVideo);
    this.generatedBindingId++;

    if (this.generatedCleanupTimer !== null) {
      window.clearInterval(this.generatedCleanupTimer);
      this.generatedCleanupTimer = null;
    }

    if (this.generatedVideo && this.generatedVideoEventHandler) {
      ['timeupdate', 'seeking', 'loadedmetadata', 'ended'].forEach(type => {
        this.generatedVideo!.removeEventListener(type, this.generatedVideoEventHandler!);
      });
    }
    this.generatedVideoEventHandler = null;
    this.generatedVideo = null;
    this.generatedCues = [];
    this.generatedNavigationKey = null;
    this.generatedVideoSource = '';
    this.generatedOverlayElement?.remove();
    this.generatedOverlayElement = null;

    return {
      success: true,
      cueCount: 0,
      message: hadGeneratedSubtitles
        ? message
        : 'No generated video subtitles to clear'
    };
  }

  private attachToBestTrack(): boolean {
    const trackInfo = this.findBestTrack();
    if (!trackInfo) {
      if (this.currentTrack) {
        this.invalidateCurrentSource();
        this.detachTrack();
      }
      return false;
    }

    if (trackInfo.track === this.currentTrack) {
      return true;
    }

    if (this.currentTrack || this.hasDomSubtitleSource) {
      this.invalidateCurrentSource();
    }
    this.detachTrack();
    this.currentVideo = trackInfo.video;
    this.currentTrack = trackInfo.track;
    this.previousTrackMode = this.currentTrack.mode;
    this.currentTrack.mode = 'hidden';
    this.currentTrack.addEventListener('cuechange', this.boundHandleCueChange);
    void this.handleCueChange();
    return true;
  }

  private scanForSubtitleSource(): boolean {
    if (!this.refreshSiteContext()) return false;

    const hasTrack = this.attachToBestTrack();
    if (hasTrack) {
      this.cancelPendingLiveDomCue();
      this.hasDomSubtitleSource = false;
      return true;
    }

    this.hasDomSubtitleSource = this.hasDomSubtitleRoot();
    if (this.hasDomSubtitleSource) {
      void this.handleDomCueChange();
      return true;
    }

    this.lastCueText = '';
    this.lastCueIdentity = '';
    this.cancelPendingLiveDomCue();
    this.showStatus('No caption track found');
    return false;
  }

  private detachTrack(): void {
    if (this.currentTrack) {
      this.currentTrack.removeEventListener('cuechange', this.boundHandleCueChange);
      if (this.previousTrackMode) {
        this.currentTrack.mode = this.previousTrackMode;
      }
    }
    this.currentTrack = null;
    this.currentVideo = null;
    this.previousTrackMode = null;
    this.lastCueText = '';
    this.lastCueIdentity = '';
  }

  private refreshSiteContext(): boolean {
    const nextContext = resolveVideoSiteContext(window.location.href, document);
    if (
      this.isActive
      && this.enabledNavigationKey
      && this.siteContext.adapterId !== 'generic'
      && nextContext.navigationKey !== this.enabledNavigationKey
    ) {
      this.disable('Video changed; start video subtitles again');
      return false;
    }

    this.siteContext = nextContext;
    this.applyOverlayContext();
    this.refreshGeneratedSubtitleBinding();
    return true;
  }

  private normalizeGeneratedVideoSubtitleCues(input: unknown): GeneratedVideoSubtitleCue[] | null {
    if (!Array.isArray(input) || input.length === 0 || input.length > VideoSubtitleTranslator.MAX_GENERATED_CUES) {
      return null;
    }

    const normalized: GeneratedVideoSubtitleCue[] = [];
    let totalTextCodePoints = 0;
    for (const candidate of input) {
      if (!candidate || typeof candidate !== 'object') return null;
      const cue = candidate as Record<string, unknown>;
      const start = cue.start;
      const end = cue.end;
      const originalText = cue.originalText;
      const translatedText = cue.translatedText;
      if (
        typeof start !== 'number'
        || typeof end !== 'number'
        || !Number.isFinite(start)
        || !Number.isFinite(end)
        || start < 0
        || end < 0
        || end <= start
        || start > VideoSubtitleTranslator.MAX_GENERATED_CUE_TIME_SECONDS
        || end > VideoSubtitleTranslator.MAX_GENERATED_CUE_TIME_SECONDS
        || typeof originalText !== 'string'
        || typeof translatedText !== 'string'
      ) {
        return null;
      }

      const normalizedOriginalText = originalText.trim();
      const normalizedTranslatedText = translatedText.trim();
      const originalTextLength = Array.from(normalizedOriginalText).length;
      const translatedTextLength = Array.from(normalizedTranslatedText).length;
      totalTextCodePoints += originalTextLength + translatedTextLength;
      if (
        !normalizedOriginalText
        || originalTextLength > VideoSubtitleTranslator.MAX_GENERATED_CUE_TEXT_CODE_POINTS
        || translatedTextLength > VideoSubtitleTranslator.MAX_GENERATED_CUE_TEXT_CODE_POINTS
        || totalTextCodePoints > VideoSubtitleTranslator.MAX_GENERATED_TOTAL_TEXT_CODE_POINTS
      ) {
        return null;
      }

      normalized.push({
        start,
        end,
        originalText: normalizedOriginalText,
        translatedText: normalizedTranslatedText
      });
    }

    return normalized.sort((first, second) => first.start - second.start || first.end - second.end);
  }

  private refreshGeneratedSubtitleBinding(): void {
    if (!this.generatedVideo || this.generatedCues.length === 0) return;

    const nextContext = resolveVideoSiteContext(window.location.href, document);
    const bestVideo = this.getRankedVideos();
    const currentVideoSource = this.getVideoSourceFingerprint(this.generatedVideo);
    const sourceChanged = currentVideoSource !== this.generatedVideoSource;
    if (
      !document.documentElement.contains(this.generatedVideo)
      || nextContext.navigationKey !== this.generatedNavigationKey
      || bestVideo[0] !== this.generatedVideo
      || sourceChanged
    ) {
      this.clearGeneratedVideoSubtitles('Video changed; generated subtitles cleared');
    }
  }

  private getVideoSourceFingerprint(video: HTMLVideoElement): string {
    const source = video.currentSrc || video.getAttribute('src') || '';
    if (!source) return '';
    try {
      return new URL(source, window.location.href).href;
    } catch {
      return source;
    }
  }

  private createGeneratedOverlay(): void {
    const overlay = document.createElement('div');
    overlay.id = 'lexibridge-generated-video-subtitle-overlay';
    overlay.setAttribute('aria-live', 'off');
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '50%',
      bottom: '132px',
      transform: 'translateX(-50%)',
      zIndex: '2147482999',
      width: '760px',
      maxWidth: '90vw',
      padding: '10px 14px',
      borderRadius: '8px',
      background: 'rgba(10, 14, 24, 0.88)',
      color: '#ffffff',
      font: '15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineHeight: '1.45',
      textAlign: 'center',
      pointerEvents: 'none',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
      display: 'none'
    });
    document.body.appendChild(overlay);
    this.generatedOverlayElement = overlay;
  }

  private renderGeneratedSubtitleForCurrentTime(): void {
    this.refreshGeneratedSubtitleBinding();
    if (!this.generatedOverlayElement || !this.generatedVideo) return;

    const currentTime = this.generatedVideo.currentTime;
    if (!Number.isFinite(currentTime) || currentTime < 0) {
      this.clearGeneratedOverlayContent();
      return;
    }

    const activeCues = this.generatedCues.filter(cue => currentTime >= cue.start && currentTime < cue.end);
    if (activeCues.length === 0) {
      this.clearGeneratedOverlayContent();
      return;
    }

    this.generatedOverlayElement.replaceChildren();
    activeCues.forEach((cue, index) => {
      if (index > 0) {
        const separator = document.createElement('div');
        separator.className = 'lexibridge-generated-video-subtitle-separator';
        separator.textContent = '';
        separator.style.height = '6px';
        this.generatedOverlayElement!.appendChild(separator);
      }

      const original = document.createElement('div');
      original.className = 'lexibridge-generated-video-subtitle-original';
      original.textContent = cue.originalText;
      original.style.opacity = '0.88';

      const translation = document.createElement('div');
      translation.className = 'lexibridge-generated-video-subtitle-translation';
      translation.textContent = cue.translatedText;
      translation.style.marginTop = '5px';
      translation.style.fontWeight = '600';
      this.generatedOverlayElement!.append(original, translation);
    });
    this.generatedOverlayElement.style.display = 'block';
  }

  private clearGeneratedOverlayContent(): void {
    if (!this.generatedOverlayElement) return;
    this.generatedOverlayElement.replaceChildren();
    this.generatedOverlayElement.style.display = 'none';
  }

  private invalidateCurrentSource(): void {
    this.runId++;
    this.cancelPendingLiveDomCue();
    this.abortActiveRequests();
    this.lastCueText = '';
    this.lastCueIdentity = '';
  }

  private findBestTrack(): { video: HTMLVideoElement; track: TextTrack } | null {
    for (const video of this.getRankedVideos()) {
      const tracks = Array.from(video.textTracks || []);
      const showingTrack = tracks.find(track => this.isCaptionTrack(track) && track.mode === 'showing');
      const hiddenTrack = tracks.find(track => this.isCaptionTrack(track) && track.mode === 'hidden');
      const disabledTrack = tracks.find(track => this.isCaptionTrack(track));
      const track = showingTrack || hiddenTrack || disabledTrack;

      if (track) {
        return { video, track };
      }
    }

    return null;
  }

  private getRankedVideos(): HTMLVideoElement[] {
    const videos: HTMLVideoElement[] = [];
    const seen = new Set<HTMLVideoElement>();
    const selectors = [...this.siteContext.videoSelectors, 'video'];

    for (const selector of selectors) {
      document.querySelectorAll<HTMLVideoElement>(selector).forEach(video => {
        if (seen.has(video)) return;
        seen.add(video);
        videos.push(video);
      });
    }

    return videos
      .map((video, index) => ({ video, index, score: this.scoreVideo(video) }))
      .sort((first, second) => second.score - first.score || first.index - second.index)
      .map(item => item.video);
  }

  private scoreVideo(video: HTMLVideoElement): number {
    let score = 0;
    if (video === this.currentVideo) score += 200;
    if (!video.paused && !video.ended) score += 1000;
    if (document.pictureInPictureElement === video) score += 1500;
    if (typeof video.closest === 'function'
      && video.closest('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]')) {
      score += 1200;
    }
    if (!video.hidden && (typeof video.getAttribute !== 'function' || video.getAttribute('aria-hidden') !== 'true')) {
      score += 100;
    }

    try {
      const style = window.getComputedStyle(video);
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') score += 100;
    } catch {
      // Lightweight test doubles may not be DOM Elements.
    }
    if (typeof video.getBoundingClientRect === 'function') {
      const bounds = video.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        score += Math.min(500, (bounds.width * bounds.height) / 1000);
      }
    }
    return score;
  }

  private isCaptionTrack(track: TextTrack): boolean {
    return track.kind === 'subtitles' || track.kind === 'captions';
  }

  private async handleCueChange(): Promise<void> {
    if (!this.isActive || !this.currentTrack || !this.translateText) return;
    if (!this.refreshSiteContext()) return;
    const runId = this.runId;

    const activeCue = this.getActiveCue(this.currentTrack);
    if (!activeCue) {
      this.showStatus('Waiting for subtitles...');
      this.lastCueText = '';
      this.lastCueIdentity = '';
      return;
    }

    const cueText = activeCue.text;
    const cueIdentity = this.createCueIdentity(activeCue);
    if (cueIdentity === this.lastCueIdentity) return;

    this.lastCueText = cueText;
    this.lastCueIdentity = cueIdentity;
    this.renderSubtitle(cueText, 'Translating...');

    try {
      const translatedText = await this.translateCueText(cueText, runId);

      if (
        this.isCurrentRun(runId)
        && this.refreshSiteContext()
        && this.lastCueIdentity === cueIdentity
      ) {
        this.recordTranslatedCue(activeCue, translatedText);
        this.renderSubtitle(cueText, translatedText);
      }
    } catch {
      if (this.isCurrentRun(runId) && this.lastCueIdentity === cueIdentity) {
        this.renderSubtitle(cueText, 'Subtitle translation failed');
      }
    }
  }

  private async handleDomCueChange(): Promise<void> {
    if (!this.isActive || this.currentTrack || !this.translateText) return;
    if (!this.refreshSiteContext()) return;
    const runId = this.runId;

    const activeCue = this.getActiveDomCue();
    if (!activeCue) {
      this.cancelPendingLiveDomCue();
      this.showStatus('Waiting for subtitles...');
      this.lastCueText = '';
      this.lastCueIdentity = '';
      return;
    }

    const cueText = activeCue.text;
    const cueIdentity = cueText;
    if (cueIdentity === this.lastCueIdentity) return;

    this.lastCueText = cueText;
    this.lastCueIdentity = cueIdentity;
    if (this.shouldSettleLiveDomCue()) {
      this.abortActiveRequests();
      this.scheduleLiveDomCueTranslation(activeCue, cueIdentity, runId);
      return;
    }

    this.renderSubtitle(cueText, 'Translating...');
    await this.translateDomCue(activeCue, cueIdentity, runId);
  }

  private shouldSettleLiveDomCue(): boolean {
    return this.siteContext.adapterId === 'youtube' && this.siteContext.pageType === 'live';
  }

  private scheduleLiveDomCueTranslation(
    activeCue: ActiveSubtitleCue,
    cueIdentity: string,
    runId: number
  ): void {
    if (this.liveDomCueTimer !== null) {
      window.clearTimeout(this.liveDomCueTimer);
    }
    this.renderSubtitle(activeCue.text, 'Preparing live subtitle...');
    this.liveDomCueTimer = window.setTimeout(() => {
      this.liveDomCueTimer = null;
      if (
        !this.isCurrentRun(runId)
        || this.currentTrack
        || this.lastCueIdentity !== cueIdentity
        || !this.refreshSiteContext()
      ) {
        return;
      }
      this.renderSubtitle(activeCue.text, 'Translating...');
      void this.translateDomCue(activeCue, cueIdentity, runId);
    }, VideoSubtitleTranslator.LIVE_DOM_CUE_SETTLE_MS);
  }

  private cancelPendingLiveDomCue(): void {
    if (this.liveDomCueTimer !== null) {
      window.clearTimeout(this.liveDomCueTimer);
      this.liveDomCueTimer = null;
    }
  }

  private async translateDomCue(
    activeCue: ActiveSubtitleCue,
    cueIdentity: string,
    runId: number
  ): Promise<void> {
    const cueText = activeCue.text;

    try {
      const translatedText = await this.translateCueText(cueText, runId);

      if (
        this.isCurrentRun(runId)
        && this.refreshSiteContext()
        && !this.currentTrack
        && this.lastCueIdentity === cueIdentity
      ) {
        this.recordTranslatedCue(activeCue, translatedText);
        this.renderSubtitle(cueText, translatedText);
      }
    } catch {
      if (this.isCurrentRun(runId) && !this.currentTrack && this.lastCueIdentity === cueIdentity) {
        this.renderSubtitle(cueText, 'Subtitle translation failed');
      }
    }
  }

  private async translateCueText(cueText: string, runId: number): Promise<string> {
    const cacheKey = this.createTranslationCacheKey(cueText);
    const cached = this.translationCache.get(cacheKey);
    if (cached) return cached;
    if (!this.translateText || !this.isCurrentRun(runId)) throw new DOMException('Canceled', 'AbortError');

    const controller = new AbortController();
    const requestId = `${this.requestNamespace}:${runId}:${++this.requestSequence}`;
    this.activeRequestControllers.add(controller);

    try {
      const translatedText = await this.translateText(cueText, {
        requestId,
        signal: controller.signal
      });
      if (controller.signal.aborted || !this.isCurrentRun(runId)) {
        throw new DOMException('Canceled', 'AbortError');
      }
      this.translationCache.set(cacheKey, translatedText);
      return translatedText;
    } finally {
      this.activeRequestControllers.delete(controller);
    }
  }

  private isCurrentRun(runId: number): boolean {
    return this.isActive && this.runId === runId;
  }

  private abortActiveRequests(): void {
    this.activeRequestControllers.forEach(controller => controller.abort());
    this.activeRequestControllers.clear();
  }

  private getActiveCue(track: TextTrack): ActiveSubtitleCue | null {
    const activeCues = Array.from(track.activeCues || []) as Array<TextTrackCue & { text?: string }>;
    const text = activeCues
      .map(cue => (cue.text || '').replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!text) return null;

    const timedCues = activeCues.filter(cue => Number.isFinite(cue.startTime) && Number.isFinite(cue.endTime));
    const startTime = timedCues.length > 0
      ? Math.min(...timedCues.map(cue => cue.startTime))
      : undefined;
    const endTime = timedCues.length > 0
      ? Math.max(...timedCues.map(cue => cue.endTime))
      : undefined;

    return { text, startTime, endTime };
  }

  private createCueIdentity(cue: ActiveSubtitleCue): string {
    const start = Number.isFinite(cue.startTime) ? Math.round(cue.startTime! * 1000) : '';
    const end = Number.isFinite(cue.endTime) ? Math.round(cue.endTime! * 1000) : '';
    return [cue.text, start, end].join('|');
  }

  private getActiveDomCue(): ActiveSubtitleCue | null {
    const text = this.getDomSubtitleText();
    if (!text) return null;

    const videoTime = this.getActiveVideoTime();
    return {
      text,
      startTime: videoTime,
      endTime: Number.isFinite(videoTime) ? videoTime! + 2 : undefined
    };
  }

  private hasDomSubtitleRoot(): boolean {
    return this.getDomSubtitleRoots().length > 0;
  }

  private getDomSubtitleText(): string {
    const roots = this.getDomSubtitleRoots();

    for (const root of roots) {
      const text = this.readDomSubtitleText(root);
      if (text) return text;
    }

    return '';
  }

  private getDomSubtitleRoots(): HTMLElement[] {
    if (document.querySelectorAll('video').length === 0) return [];

    const selectors = [
      '.ytp-caption-window-container',
      '.player-timedtext',
      '.player-timedtext-text-container',
      '[data-testid="captions-container"]',
      ...this.siteContext.captionRootSelectors,
      '[aria-live="polite"][class*="caption"]',
      '[aria-live="assertive"][class*="caption"]',
      '[class*="subtitle"], [class*="Subtitle"], [class*="caption"], [class*="Caption"]'
    ];
    const roots: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    for (const selector of selectors) {
      document.querySelectorAll<HTMLElement>(selector).forEach(element => {
        if (!(element instanceof HTMLElement)) return;
        if (seen.has(element) || this.isExtensionNode(element) || !this.isPotentialCaptionElement(element)) return;

        seen.add(element);
        roots.push(element);
      });
    }

    const activeVideo = this.getRankedVideos()[0];
    const activePlayer = activeVideo ? this.getPlayerContainer(activeVideo) : null;
    if (activePlayer) {
      const scopedRoots = roots.filter(root => activePlayer.contains(root));
      if (scopedRoots.length > 0 || this.siteContext.adapterId !== 'generic') {
        return scopedRoots;
      }
    }

    return roots;
  }

  private getPlayerContainer(video: HTMLVideoElement): Element | null {
    for (const selector of this.siteContext.playerSelectors) {
      try {
        const player = video.closest(selector);
        if (player) return player;
      } catch {
        // Ignore a stale or site-supplied selector and continue with the next one.
      }
    }
    return null;
  }

  private readDomSubtitleText(root: HTMLElement): string {
    const segmentSelectors = [
      '.ytp-caption-segment',
      '.caption-visual-line',
      '[data-testid="caption-segment"]',
      ...this.siteContext.captionSegmentSelectors,
      'span',
      'div'
    ];
    for (const selector of segmentSelectors) {
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(selector))
        .filter(element => !this.isExtensionNode(element) && this.isPotentialCaptionElement(element));
      const leaves = candidates.filter(element => !candidates.some(
        other => other !== element && element.contains(other)
      ));
      const text = this.joinUniqueSubtitleText(leaves);
      if (text) return text;
    }

    return this.joinUniqueSubtitleText([root]);
  }

  private joinUniqueSubtitleText(elements: HTMLElement[]): string {
    return elements
      .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((text, index, allText) => allText.indexOf(text) === index)
      .join('\n')
      .trim();
  }

  private isPotentialCaptionElement(element: HTMLElement): boolean {
    if (element.closest('#lexibridge-video-subtitle-overlay')) return false;
    let current: HTMLElement | null = element;
    while (current) {
      if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  }

  private isExtensionNode(element: Element): boolean {
    const id = element.id || '';
    const classList = element.classList ? Array.from(element.classList) : [];
    const closestExtensionNode = typeof element.closest === 'function'
      ? element.closest('[id^="lexibridge-"], [class*="lexibridge-"]')
      : null;

    return id.startsWith('lexibridge-') ||
      classList.some(className => className.startsWith('lexibridge-')) ||
      Boolean(closestExtensionNode);
  }

  private getActiveVideoTime(): number | undefined {
    const videos = this.getRankedVideos();
    const activeVideo = (this.currentVideo && Number.isFinite(this.currentVideo.currentTime)
      ? this.currentVideo
      : null)
      || videos.find(video => !video.paused && Number.isFinite(video.currentTime))
      || videos.find(video => Number.isFinite(video.currentTime));

    return activeVideo ? activeVideo.currentTime : undefined;
  }

  private createOverlay(): void {
    if (this.overlayElement) return;

    const overlay = document.createElement('div');
    overlay.id = 'lexibridge-video-subtitle-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '50%',
      bottom: '72px',
      transform: 'translateX(-50%)',
      zIndex: '2147483000',
      width: '760px',
      maxWidth: '90vw',
      padding: '10px 14px',
      borderRadius: '8px',
      background: 'rgba(10, 14, 24, 0.88)',
      color: '#ffffff',
      font: '15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineHeight: '1.45',
      textAlign: 'center',
      pointerEvents: 'none',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)'
    });

    document.body.appendChild(overlay);
    this.overlayElement = overlay;
    this.applyOverlayContext();
  }

  private applyOverlayContext(): void {
    if (!this.overlayElement) return;
    this.overlayElement.dataset.videoAdapter = this.siteContext.adapterId;
    this.overlayElement.dataset.videoAdapterVersion = String(this.siteContext.adapterVersion);
    this.overlayElement.dataset.videoPageType = this.siteContext.pageType;
    this.overlayElement.style.width = this.siteContext.pageType === 'shorts' ? '420px' : '760px';
    this.overlayElement.style.bottom = this.siteContext.pageType === 'shorts' ? '96px' : '72px';
  }

  private showStatus(message: string): void {
    if (!this.overlayElement) return;

    this.overlayElement.textContent = message;
    this.overlayElement.style.opacity = '0.82';
  }

  private renderSubtitle(originalText: string, translatedText: string): void {
    if (!this.overlayElement) return;

    this.overlayElement.replaceChildren();
    this.overlayElement.style.opacity = '1';

    const original = document.createElement('div');
    original.className = 'lexibridge-video-subtitle-original';
    original.textContent = originalText;
    original.style.opacity = '0.88';

    const translation = document.createElement('div');
    translation.className = 'lexibridge-video-subtitle-translation';
    translation.textContent = translatedText;
    translation.style.marginTop = '5px';
    translation.style.fontWeight = '600';

    this.overlayElement.append(original, translation);
  }

  private recordTranslatedCue(activeCue: ActiveSubtitleCue, translatedText: string): void {
    const fallbackStartTime = this.translatedCues.length * 2;
    const startTime = Number.isFinite(activeCue.startTime) ? activeCue.startTime! : fallbackStartTime;
    const rawEndTime = Number.isFinite(activeCue.endTime) ? activeCue.endTime! : startTime + 2;
    const endTime = rawEndTime > startTime ? rawEndTime : startTime + 2;
    const nextCue: TranslatedSubtitleCue = {
      originalText: activeCue.text,
      translatedText,
      startTime,
      endTime
    };
    if (this.mergeIncrementalLiveCue(nextCue)) return;

    const key = this.createTranslatedCueKey(activeCue.text, translatedText, startTime, endTime);

    if (this.translatedCueKeys.has(key)) return;

    if (this.translatedCues.length >= VideoSubtitleTranslator.MAX_EXPORTED_CUES) {
      const removed = this.translatedCues.shift();
      if (removed) {
        this.translatedCueKeys.delete(this.createTranslatedCueKey(
          removed.originalText,
          removed.translatedText,
          removed.startTime,
          removed.endTime
        ));
      }
    }
    this.translatedCueKeys.add(key);
    this.translatedCues.push(nextCue);
  }

  private mergeIncrementalLiveCue(nextCue: TranslatedSubtitleCue): boolean {
    if (this.siteContext.adapterId !== 'youtube' || this.siteContext.pageType !== 'live') {
      return false;
    }

    const previousCue = this.translatedCues[this.translatedCues.length - 1];
    if (!previousCue) return false;

    const previousText = previousCue.originalText.replace(/\s+/g, ' ').trim();
    const nextText = nextCue.originalText.replace(/\s+/g, ' ').trim();
    const textIsIncremental = previousText === nextText
      || nextText.startsWith(previousText);
    const timingOverlaps = nextCue.startTime <= previousCue.endTime + 0.5
      && nextCue.endTime >= previousCue.startTime;
    if (!textIsIncremental || !timingOverlaps) return false;

    this.translatedCueKeys.delete(this.createTranslatedCueKey(
      previousCue.originalText,
      previousCue.translatedText,
      previousCue.startTime,
      previousCue.endTime
    ));
    previousCue.originalText = nextCue.originalText;
    previousCue.translatedText = nextCue.translatedText;
    previousCue.startTime = Math.min(previousCue.startTime, nextCue.startTime);
    previousCue.endTime = Math.max(previousCue.endTime, nextCue.endTime);
    this.translatedCueKeys.add(this.createTranslatedCueKey(
      previousCue.originalText,
      previousCue.translatedText,
      previousCue.startTime,
      previousCue.endTime
    ));
    return true;
  }

  private createTranslatedCueKey(
    originalText: string,
    translatedText: string,
    startTime: number,
    endTime: number
  ): string {
    return [
      originalText,
      translatedText,
      Math.round(startTime * 1000),
      Math.round(endTime * 1000)
    ].join('|');
  }

  private renderSrt(cues: TranslatedSubtitleCue[]): string {
    return cues
      .map((cue, index) => [
        String(index + 1),
        `${this.formatSrtTime(cue.startTime)} --> ${this.formatSrtTime(cue.endTime)}`,
        cue.originalText,
        cue.translatedText
      ].join('\n'))
      .join('\n\n');
  }

  private formatSrtTime(timeInSeconds: number): string {
    const safeTime = Math.max(0, timeInSeconds);
    const totalMilliseconds = Math.round(safeTime * 1000);
    const milliseconds = totalMilliseconds % 1000;
    const totalSeconds = Math.floor(totalMilliseconds / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    return [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0')
    ].join(':') + `,${String(milliseconds).padStart(3, '0')}`;
  }

  private createExportFilename(): string {
    const safeTitle = (document.title || 'video-subtitles')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'video-subtitles';

    return `${safeTitle}-lexibridge.srt`;
  }
}
