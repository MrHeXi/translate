export interface VideoSubtitleTranslatorState {
  isActive: boolean;
  hasTrack: boolean;
  message: string;
}

export interface VideoSubtitleExport {
  cueCount: number;
  filename: string;
  content: string;
  message: string;
}

type TranslateText = (text: string) => Promise<string>;

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
  private isActive = false;
  private translateText: TranslateText | null = null;
  private overlayElement: HTMLElement | null = null;
  private currentTrack: TextTrack | null = null;
  private currentVideo: HTMLVideoElement | null = null;
  private previousTrackMode: TextTrackMode | null = null;
  private scanTimer: number | null = null;
  private lastCueText = '';
  private translationCache: Map<string, string> = new Map();
  private translatedCues: TranslatedSubtitleCue[] = [];
  private translatedCueKeys: Set<string> = new Set();
  private boundHandleCueChange = (): void => {
    void this.handleCueChange();
  };

  async toggle(translateText: TranslateText): Promise<VideoSubtitleTranslatorState> {
    if (this.isActive) {
      this.disable();
      return {
        isActive: false,
        hasTrack: false,
        message: 'Video subtitle translation stopped'
      };
    }

    return this.enable(translateText);
  }

  enable(translateText: TranslateText): VideoSubtitleTranslatorState {
    this.isActive = true;
    this.translateText = translateText;
    this.createOverlay();
    const hasTrack = this.attachToBestTrack();

    if (!this.scanTimer) {
      this.scanTimer = window.setInterval(() => {
        if (this.isActive) {
          this.attachToBestTrack();
        }
      }, 1000);
    }

    this.showStatus(hasTrack ? 'Waiting for subtitles...' : 'No caption track found');

    return {
      isActive: true,
      hasTrack,
      message: hasTrack ? 'Video subtitle translation started' : 'No caption track found'
    };
  }

  disable(): void {
    this.isActive = false;
    this.detachTrack();

    if (this.scanTimer !== null) {
      window.clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    this.overlayElement?.remove();
    this.overlayElement = null;
    this.currentVideo = null;
    this.lastCueText = '';
  }

  getStatus(): VideoSubtitleTranslatorState {
    return {
      isActive: this.isActive,
      hasTrack: Boolean(this.currentTrack),
      message: this.isActive ? 'Video subtitle translation active' : 'Video subtitle translation stopped'
    };
  }

  cleanup(): void {
    this.disable();
    this.translationCache.clear();
    this.translatedCues = [];
    this.translatedCueKeys.clear();
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

  private attachToBestTrack(): boolean {
    const trackInfo = this.findBestTrack();
    if (!trackInfo) {
      this.detachTrack();
      this.showStatus('No caption track found');
      return false;
    }

    if (trackInfo.track === this.currentTrack) {
      return true;
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
  }

  private findBestTrack(): { video: HTMLVideoElement; track: TextTrack } | null {
    const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];

    for (const video of videos) {
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

  private isCaptionTrack(track: TextTrack): boolean {
    return track.kind === 'subtitles' || track.kind === 'captions';
  }

  private async handleCueChange(): Promise<void> {
    if (!this.isActive || !this.currentTrack || !this.translateText) return;

    const activeCue = this.getActiveCue(this.currentTrack);
    if (!activeCue) {
      this.showStatus('Waiting for subtitles...');
      this.lastCueText = '';
      return;
    }

    const cueText = activeCue.text;
    if (cueText === this.lastCueText) return;

    this.lastCueText = cueText;
    this.renderSubtitle(cueText, 'Translating...');

    try {
      let translatedText = this.translationCache.get(cueText);
      if (!translatedText) {
        translatedText = await this.translateText(cueText);
        this.translationCache.set(cueText, translatedText);
      }

      if (this.isActive && this.lastCueText === cueText) {
        this.recordTranslatedCue(activeCue, translatedText);
        this.renderSubtitle(cueText, translatedText);
      }
    } catch (error) {
      if (this.isActive && this.lastCueText === cueText) {
        this.renderSubtitle(cueText, 'Subtitle translation failed');
      }
    }
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
    const key = [
      activeCue.text,
      translatedText,
      Math.round(startTime * 1000),
      Math.round(endTime * 1000)
    ].join('|');

    if (this.translatedCueKeys.has(key)) return;

    this.translatedCueKeys.add(key);
    this.translatedCues.push({
      originalText: activeCue.text,
      translatedText,
      startTime,
      endTime
    });
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
