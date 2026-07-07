export interface VideoSubtitleTranslatorState {
  isActive: boolean;
  hasTrack: boolean;
  message: string;
}

type TranslateText = (text: string) => Promise<string>;

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

    const cueText = this.getActiveCueText(this.currentTrack);
    if (!cueText) {
      this.showStatus('Waiting for subtitles...');
      this.lastCueText = '';
      return;
    }

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
        this.renderSubtitle(cueText, translatedText);
      }
    } catch (error) {
      if (this.isActive && this.lastCueText === cueText) {
        this.renderSubtitle(cueText, 'Subtitle translation failed');
      }
    }
  }

  private getActiveCueText(track: TextTrack): string {
    const activeCues = Array.from(track.activeCues || []) as Array<TextTrackCue & { text?: string }>;

    return activeCues
      .map(cue => (cue.text || '').replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
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
}
