import {
  AVAILABLE_TRANSLATION_PROVIDERS,
  getProviderTargetLanguages,
  getTranslationProvider,
  TRANSLATION_LANGUAGES
} from '../services/TranslationProviderRegistry';
import {
  MEDIA_TRANSCRIPTION_CHUNK_BYTES,
  MEDIA_TRANSCRIPTION_MAX_BYTES,
  MEDIA_TRANSCRIPTION_PROVIDERS,
  MediaTranscriptionResult,
  MediaTranscriptionSegment,
  isSupportedMediaTranscriptionFile
} from '../services/MediaTranscriptionService';

interface SubtitleGeneratorSettings {
  defaultTargetLanguage?: string;
  translationProvider?: string;
}

interface ProviderConfigSummary {
  providerId: string;
  configured: boolean;
}

interface GeneratedCue {
  id: number;
  start: number;
  end: number;
  originalText: string;
  translatedText: string;
}

type TabCapturePhase = 'idle' | 'starting' | 'recording' | 'stopping';

class SubtitleGeneratorController {
  private fileInput: HTMLInputElement | null = null;
  private transcriptionProvider: HTMLSelectElement | null = null;
  private sourceLanguage: HTMLSelectElement | null = null;
  private transcriptionPrompt: HTMLInputElement | null = null;
  private translateCaptions: HTMLInputElement | null = null;
  private translationProvider: HTMLSelectElement | null = null;
  private targetLanguage: HTMLSelectElement | null = null;
  private generateButton: HTMLButtonElement | null = null;
  private cancelButton: HTMLButtonElement | null = null;
  private tabCaptureButton: HTMLButtonElement | null = null;
  private cancelTabCaptureButton: HTMLButtonElement | null = null;
  private progress: HTMLProgressElement | null = null;
  private progressText: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private resultSection: HTMLElement | null = null;
  private resultSummary: HTMLElement | null = null;
  private cueList: HTMLElement | null = null;
  private configuredProviderIds = new Set<string>();
  private port: chrome.runtime.Port | null = null;
  private selectedFile: File | null = null;
  private selectedFileIsTabCapture = false;
  private resultFileBaseName = 'generated-subtitles';
  private uploadOffset = 0;
  private uploadChunkIndex = 0;
  private runId = 0;
  private isWorking = false;
  private cues: GeneratedCue[] = [];
  private sourceTabId: number | null = null;
  private tabCapturePhase: TabCapturePhase = 'idle';
  private tabCaptureRunId = 0;
  private tabCaptureStream: MediaStream | null = null;
  private tabCaptureRecorder: MediaRecorder | null = null;
  private tabCaptureAudioContext: AudioContext | null = null;
  private tabCapturePlaybackSource: MediaStreamAudioSourceNode | null = null;
  private tabCaptureChunks: Blob[] = [];
  private tabCaptureBytes = 0;
  private tabCaptureStartedAt = 0;
  private tabCaptureTimer: number | null = null;
  private tabCaptureStopFallbackTimer: number | null = null;
  private tabCaptureShouldGenerate = false;
  private tabCaptureLimitExceeded = false;
  private tabCaptureFailureMessage: string | null = null;

  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    this.fileInput = document.getElementById('mediaFile') as HTMLInputElement | null;
    this.transcriptionProvider = document.getElementById('transcriptionProvider') as HTMLSelectElement | null;
    this.sourceLanguage = document.getElementById('sourceLanguage') as HTMLSelectElement | null;
    this.transcriptionPrompt = document.getElementById('transcriptionPrompt') as HTMLInputElement | null;
    this.translateCaptions = document.getElementById('translateCaptions') as HTMLInputElement | null;
    this.translationProvider = document.getElementById('translationProvider') as HTMLSelectElement | null;
    this.targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement | null;
    this.generateButton = document.getElementById('generateSubtitles') as HTMLButtonElement | null;
    this.cancelButton = document.getElementById('cancelGeneration') as HTMLButtonElement | null;
    this.tabCaptureButton = document.getElementById('toggleTabCapture') as HTMLButtonElement | null;
    this.cancelTabCaptureButton = document.getElementById('cancelTabCapture') as HTMLButtonElement | null;
    this.progress = document.getElementById('generationProgress') as HTMLProgressElement | null;
    this.progressText = document.getElementById('progressText');
    this.status = document.getElementById('generationStatus');
    this.resultSection = document.getElementById('resultSection');
    this.resultSummary = document.getElementById('resultSummary');
    this.cueList = document.getElementById('cueList');
    this.sourceTabId = this.readSourceTabId();

    this.populateControls();
    this.bindEvents();
    await this.loadProviderConfigurations();
    await this.loadSettings();
    this.updateTranslationControls();
    this.updateGenerateAvailability();
  }

  private populateControls(): void {
    if (this.transcriptionProvider) {
      this.transcriptionProvider.replaceChildren(...MEDIA_TRANSCRIPTION_PROVIDERS.map(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.label;
        return option;
      }));
    }

    if (this.sourceLanguage) {
      const automatic = document.createElement('option');
      automatic.value = 'auto';
      automatic.textContent = 'Detect automatically';
      this.sourceLanguage.replaceChildren(automatic, ...TRANSLATION_LANGUAGES.map(language => {
        const option = document.createElement('option');
        option.value = language.code;
        option.textContent = language.label;
        return option;
      }));
    }

    if (this.translationProvider) {
      this.translationProvider.replaceChildren(...AVAILABLE_TRANSLATION_PROVIDERS.map(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.label;
        return option;
      }));
    }

    if (this.targetLanguage) {
      this.targetLanguage.replaceChildren(...TRANSLATION_LANGUAGES.map(language => {
        const option = document.createElement('option');
        option.value = language.code;
        option.textContent = language.label;
        return option;
      }));
      this.targetLanguage.value = 'zh-CN';
    }
  }

  private bindEvents(): void {
    this.fileInput?.addEventListener('change', () => this.handleFileSelection());
    this.transcriptionProvider?.addEventListener('change', () => this.updateGenerateAvailability());
    this.translationProvider?.addEventListener('change', () => this.updateTargetLanguageAvailability());
    this.translateCaptions?.addEventListener('change', () => this.updateTranslationControls());
    this.generateButton?.addEventListener('click', () => void this.startGeneration());
    this.cancelButton?.addEventListener('click', () => this.cancelGeneration());
    this.tabCaptureButton?.addEventListener('click', () => {
      if (this.tabCapturePhase === 'recording') this.stopTabCapture(true);
      else void this.startTabCapture();
    });
    this.cancelTabCaptureButton?.addEventListener('click', () => this.stopTabCapture(false));
    document.getElementById('exportSrt')?.addEventListener('click', () => this.exportCaptions('srt'));
    document.getElementById('exportVtt')?.addEventListener('click', () => this.exportCaptions('vtt'));
    document.getElementById('clearResult')?.addEventListener('click', () => this.clearResult());
    document.getElementById('openSettings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
    window.addEventListener('pagehide', () => this.releaseTabCaptureForPageClose(), { once: true });
  }

  private async loadProviderConfigurations(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getTranslationProviderConfigs' });
      const summaries = response?.success && Array.isArray(response.data)
        ? response.data as ProviderConfigSummary[]
        : [];
      this.configuredProviderIds = new Set(
        summaries.filter(summary => summary.configured).map(summary => summary.providerId)
      );
    } catch {
      this.configuredProviderIds.clear();
      this.showStatus('Could not load provider configurations.', true);
    }

    this.updateProviderAvailability();
  }

  private updateProviderAvailability(): void {
    if (this.transcriptionProvider) {
      Array.from(this.transcriptionProvider.options).forEach(option => {
        const definition = MEDIA_TRANSCRIPTION_PROVIDERS.find(provider => provider.id === option.value)!;
        const configured = this.configuredProviderIds.has(option.value);
        option.disabled = !configured;
        option.textContent = `${definition.label}${configured ? '' : ' (configure in Settings)'}`;
      });
      const selected = this.transcriptionProvider.selectedOptions[0];
      if (!selected || selected.disabled) {
        const firstEnabled = Array.from(this.transcriptionProvider.options).find(option => !option.disabled);
        if (firstEnabled) this.transcriptionProvider.value = firstEnabled.value;
        else this.transcriptionProvider.selectedIndex = -1;
      }
      if (!this.transcriptionProvider.value) {
        this.showStatus('Configure OpenAI or Groq in Settings.', true);
      }
    }

    if (this.translationProvider) {
      Array.from(this.translationProvider.options).forEach(option => {
        const provider = getTranslationProvider(option.value);
        const requiresConfiguration = Boolean(provider?.configFields?.length);
        const configured = !requiresConfiguration || this.configuredProviderIds.has(option.value);
        option.disabled = !configured;
        option.textContent = provider
          ? `${provider.label}${configured ? '' : ' (configure in Settings)'}`
          : option.value;
      });
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getSettings' });
      const settings = response?.success ? response.data as SubtitleGeneratorSettings : {};
      if (this.translationProvider) {
        const requested = settings.translationProvider || 'google';
        const option = Array.from(this.translationProvider.options).find(
          item => item.value === requested && !item.disabled
        );
        this.translationProvider.value = option?.value || 'google';
      }
      if (this.targetLanguage) {
        this.targetLanguage.value = settings.defaultTargetLanguage || 'zh-CN';
      }
    } catch {
      if (this.translationProvider) this.translationProvider.value = 'google';
      if (this.targetLanguage) this.targetLanguage.value = 'zh-CN';
      this.showStatus('Could not load translation settings.', true);
    }
    this.updateTargetLanguageAvailability();
  }

  private handleFileSelection(): void {
    this.selectedFile = this.fileInput?.files?.[0] || null;
    this.selectedFileIsTabCapture = false;
    this.clearResult();
    this.setProgress(0);
    const name = document.getElementById('fileName');
    const details = document.getElementById('fileDetails');
    if (!this.selectedFile) {
      if (name) name.textContent = 'No media selected';
      if (details) details.textContent = 'Local audio/video or current tab, up to 25 MB';
      this.showStatus('Ready');
      this.updateGenerateAvailability();
      return;
    }

    if (name) name.textContent = this.selectedFile.name;
    if (details) {
      details.textContent = `${this.formatFileSize(this.selectedFile.size)} · ${this.selectedFile.type || 'media file'}`;
    }
    const error = this.validateFile(this.selectedFile);
    this.showStatus(error || 'Ready', Boolean(error));
    this.updateGenerateAvailability();
  }

  private updateTranslationControls(): void {
    const enabled = Boolean(this.translateCaptions?.checked)
      && !this.isWorking
      && this.tabCapturePhase === 'idle';
    if (this.translationProvider) this.translationProvider.disabled = !enabled;
    if (this.targetLanguage) this.targetLanguage.disabled = !enabled;
    this.updateGenerateAvailability();
  }

  private updateTargetLanguageAvailability(): void {
    if (!this.translationProvider || !this.targetLanguage) return;
    const supported = new Set(
      getProviderTargetLanguages(this.translationProvider.value).map(language => language.code)
    );
    Array.from(this.targetLanguage.options).forEach(option => {
      option.disabled = !supported.has(option.value);
    });
    if (!supported.has(this.targetLanguage.value)) {
      const fallback = supported.has('zh-CN')
        ? 'zh-CN'
        : Array.from(this.targetLanguage.options).find(option => !option.disabled)?.value;
      if (fallback) this.targetLanguage.value = fallback;
    }
  }

  private updateGenerateAvailability(): void {
    const fileReady = Boolean(this.selectedFile && !this.validateFile(this.selectedFile));
    const transcriptionReady = Boolean(this.transcriptionProvider?.value);
    const translationReady = !this.translateCaptions?.checked || Boolean(this.translationProvider?.value);
    const captureIdle = this.tabCapturePhase === 'idle';
    if (this.generateButton) {
      this.generateButton.disabled = this.isWorking
        || !captureIdle
        || !fileReady
        || !transcriptionReady
        || !translationReady;
    }
    this.updateTabCaptureControls();
  }

  private readSourceTabId(): number | null {
    const value = Number(new URL(window.location.href).searchParams.get('sourceTabId'));
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  private async startTabCapture(): Promise<void> {
    if (this.isWorking || this.tabCapturePhase !== 'idle') return;
    if (!this.sourceTabId) {
      this.showStatus('Open this generator from the popup on a regular media page.', true);
      return;
    }
    if (!this.transcriptionProvider?.value) {
      this.showStatus('Configure OpenAI or Groq in Settings.', true);
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.showStatus('This Chrome version cannot record tab audio.', true);
      return;
    }

    const captureRunId = ++this.tabCaptureRunId;
    this.releaseCapturedFile();
    this.tabCapturePhase = 'starting';
    this.tabCaptureChunks = [];
    this.tabCaptureBytes = 0;
    this.tabCaptureShouldGenerate = false;
    this.tabCaptureLimitExceeded = false;
    this.tabCaptureFailureMessage = null;
    this.clearResult();
    this.setProgress(0);
    this.showStatus('Opening tab audio');
    this.updateTranslationControls();

    try {
      const audioContext = new AudioContext();
      this.tabCaptureAudioContext = audioContext;
      let audioContextResumeError: unknown;
      const audioContextResume = audioContext.resume().catch(error => {
        audioContextResumeError = error;
      });
      const response = await this.sendMessage({
        action: 'getTabAudioCaptureStreamId',
        data: { targetTabId: this.sourceTabId }
      });
      if (!response?.success || typeof response.data?.streamId !== 'string') {
        throw new Error(response?.error || 'Could not open the current tab audio stream.');
      }
      if (captureRunId !== this.tabCaptureRunId || this.tabCapturePhase !== 'starting') return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: response.data.streamId
          }
        } as unknown as MediaTrackConstraints,
        video: false
      });
      if (captureRunId !== this.tabCaptureRunId || this.tabCapturePhase !== 'starting') {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      this.tabCaptureStream = stream;
      const playbackSource = audioContext.createMediaStreamSource(stream);
      this.tabCapturePlaybackSource = playbackSource;
      playbackSource.connect(audioContext.destination);
      await audioContextResume;
      if (audioContextResumeError) {
        throw new Error('Chrome could not preserve source-tab audio playback.');
      }
      if (captureRunId !== this.tabCaptureRunId || this.tabCapturePhase !== 'starting') return;

      const mimeType = this.chooseTabCaptureMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000
      });
      this.tabCaptureRecorder = recorder;
      this.tabCaptureStartedAt = Date.now();
      recorder.ondataavailable = event => this.handleTabCaptureData(event, captureRunId);
      recorder.onerror = event => {
        if (captureRunId !== this.tabCaptureRunId) return;
        const message = (event as Event & { error?: { message?: string } }).error?.message;
        this.tabCaptureShouldGenerate = false;
        this.tabCaptureFailureMessage = message || 'Tab audio recording failed.';
        this.tabCapturePhase = 'stopping';
        this.showStatus(this.tabCaptureFailureMessage, true);
        this.updateTranslationControls();
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch {
            // The stop fallback below still releases tracks and buffered data.
          }
        }
        this.scheduleTabCaptureFinish(captureRunId);
      };
      recorder.onstop = () => void this.finishTabCapture(captureRunId);
      recorder.start(1000);
      this.tabCapturePhase = 'recording';
      this.tabCaptureTimer = window.setInterval(() => this.updateTabCaptureStatus(), 500);
      this.updateTabCaptureStatus();
      this.updateTranslationControls();
    } catch (error) {
      if (captureRunId !== this.tabCaptureRunId) return;
      this.releaseTabCaptureResources();
      this.tabCapturePhase = 'idle';
      this.showStatus(error instanceof Error ? error.message : 'Could not capture tab audio.', true);
      this.updateTranslationControls();
    }
  }

  private stopTabCapture(generate: boolean): void {
    if (this.tabCapturePhase === 'idle' || this.tabCapturePhase === 'stopping') return;
    if (this.tabCapturePhase === 'starting') {
      this.tabCaptureRunId++;
      this.tabCapturePhase = 'idle';
      this.tabCaptureShouldGenerate = false;
      this.releaseTabCaptureResources();
      this.showStatus('Tab capture canceled');
      this.setProgress(0);
      this.updateTranslationControls();
      return;
    }

    this.tabCaptureShouldGenerate = generate;
    this.tabCapturePhase = 'stopping';
    this.showStatus(generate ? 'Stopping capture' : 'Canceling capture');
    this.updateTranslationControls();
    const recorder = this.tabCaptureRecorder;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      this.scheduleTabCaptureFinish(this.tabCaptureRunId);
    } else {
      void this.finishTabCapture(this.tabCaptureRunId);
    }
  }

  private handleTabCaptureData(event: BlobEvent, captureRunId: number): void {
    if (
      captureRunId !== this.tabCaptureRunId
      || this.tabCapturePhase === 'idle'
      || event.data.size <= 0
    ) return;
    if (this.tabCaptureBytes + event.data.size > MEDIA_TRANSCRIPTION_MAX_BYTES) {
      this.tabCaptureLimitExceeded = true;
      this.tabCaptureShouldGenerate = false;
      this.tabCapturePhase = 'stopping';
      this.showStatus('Tab audio reached the 25 MB limit.', true);
      this.updateTranslationControls();
      if (this.tabCaptureRecorder?.state !== 'inactive') this.tabCaptureRecorder?.stop();
      this.scheduleTabCaptureFinish(captureRunId);
      return;
    }
    this.tabCaptureChunks.push(event.data);
    this.tabCaptureBytes += event.data.size;
    this.updateTabCaptureStatus();
  }

  private async finishTabCapture(captureRunId: number): Promise<void> {
    if (captureRunId !== this.tabCaptureRunId || this.tabCapturePhase === 'idle') return;
    const shouldGenerate = this.tabCaptureShouldGenerate;
    const limitExceeded = this.tabCaptureLimitExceeded;
    const failureMessage = this.tabCaptureFailureMessage;
    const chunks = this.tabCaptureChunks.splice(0, this.tabCaptureChunks.length);
    const mimeType = this.tabCaptureRecorder?.mimeType || 'audio/webm';
    const duration = Math.max(0, (Date.now() - this.tabCaptureStartedAt) / 1000);
    this.releaseTabCaptureResources();
    this.tabCapturePhase = 'idle';
    this.tabCaptureShouldGenerate = false;
    this.tabCaptureFailureMessage = null;
    this.updateTranslationControls();

    if (failureMessage) {
      this.setProgress(0);
      this.showStatus(failureMessage, true);
      return;
    }
    if (limitExceeded) {
      this.setProgress(0);
      this.showStatus('Tab audio exceeded 25 MB and was discarded.', true);
      return;
    }
    if (!shouldGenerate) {
      this.setProgress(0);
      this.showStatus('Tab capture canceled');
      return;
    }
    if (chunks.length === 0 || this.tabCaptureBytes === 0) {
      this.setProgress(0);
      this.showStatus('No tab audio was captured.', true);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.selectedFile = new File(chunks, `tab-audio-${timestamp}.webm`, { type: mimeType });
    this.selectedFileIsTabCapture = true;
    const name = document.getElementById('fileName');
    const details = document.getElementById('fileDetails');
    if (name) name.textContent = 'Current tab audio';
    if (details) {
      details.textContent = `${this.formatClock(duration)} · ${this.formatFileSize(this.selectedFile.size)}`;
    }
    this.showStatus('Preparing captured audio');
    await this.startGeneration();
  }

  private updateTabCaptureStatus(): void {
    if (this.tabCapturePhase !== 'recording') return;
    const elapsed = Math.max(0, (Date.now() - this.tabCaptureStartedAt) / 1000);
    this.showStatus(`Capturing current tab · ${this.formatClock(elapsed)} · ${this.formatFileSize(this.tabCaptureBytes)}`);
    this.setProgress((this.tabCaptureBytes / MEDIA_TRANSCRIPTION_MAX_BYTES) * 65);
  }

  private scheduleTabCaptureFinish(captureRunId: number): void {
    if (this.tabCaptureStopFallbackTimer !== null) {
      window.clearTimeout(this.tabCaptureStopFallbackTimer);
    }
    this.tabCaptureStopFallbackTimer = window.setTimeout(() => {
      this.tabCaptureStopFallbackTimer = null;
      void this.finishTabCapture(captureRunId);
    }, 250);
  }

  private chooseTabCaptureMimeType(): string {
    return ['audio/webm;codecs=opus', 'audio/webm']
      .find(mimeType => MediaRecorder.isTypeSupported(mimeType)) || '';
  }

  private updateTabCaptureControls(): void {
    const phase = this.tabCapturePhase;
    if (this.tabCaptureButton) {
      const labels: Record<TabCapturePhase, string> = {
        idle: 'Capture current tab',
        starting: 'Starting capture',
        recording: 'Stop and generate',
        stopping: 'Stopping capture'
      };
      this.tabCaptureButton.textContent = labels[phase];
      this.tabCaptureButton.disabled = this.isWorking
        || !this.sourceTabId
        || !this.transcriptionProvider?.value
        || phase === 'starting'
        || phase === 'stopping';
      this.tabCaptureButton.classList.toggle('recording', phase === 'recording');
      this.tabCaptureButton.title = this.sourceTabId
        ? 'Capture audio from the page that opened this generator'
        : 'Open this generator from the popup on a regular media page';
    }
    if (this.cancelTabCaptureButton) {
      this.cancelTabCaptureButton.hidden = phase !== 'starting' && phase !== 'recording';
    }
    const fileBusy = this.isWorking || phase !== 'idle';
    if (this.fileInput) this.fileInput.disabled = fileBusy;
    if (this.transcriptionProvider) this.transcriptionProvider.disabled = fileBusy;
    if (this.sourceLanguage) this.sourceLanguage.disabled = fileBusy;
    if (this.transcriptionPrompt) this.transcriptionPrompt.disabled = fileBusy;
    if (this.translateCaptions) this.translateCaptions.disabled = fileBusy;
    document.querySelector('.file-picker')?.classList.toggle('disabled', fileBusy);
  }

  private releaseTabCaptureResources(): void {
    if (this.tabCaptureTimer !== null) {
      window.clearInterval(this.tabCaptureTimer);
      this.tabCaptureTimer = null;
    }
    if (this.tabCaptureStopFallbackTimer !== null) {
      window.clearTimeout(this.tabCaptureStopFallbackTimer);
      this.tabCaptureStopFallbackTimer = null;
    }
    this.tabCaptureStream?.getTracks().forEach(track => track.stop());
    this.tabCaptureStream = null;
    try {
      this.tabCapturePlaybackSource?.disconnect();
    } catch {
      // The media graph may already be disconnected after the source tab closes.
    }
    this.tabCapturePlaybackSource = null;
    if (this.tabCaptureAudioContext) void this.tabCaptureAudioContext.close();
    this.tabCaptureAudioContext = null;
    if (this.tabCaptureRecorder) {
      this.tabCaptureRecorder.ondataavailable = null;
      this.tabCaptureRecorder.onerror = null;
      this.tabCaptureRecorder.onstop = null;
    }
    this.tabCaptureRecorder = null;
  }

  private releaseTabCaptureForPageClose(): void {
    this.tabCaptureRunId++;
    this.tabCaptureShouldGenerate = false;
    try {
      if (this.tabCaptureRecorder?.state !== 'inactive') this.tabCaptureRecorder?.stop();
    } catch {
      // Closing the extension page also terminates its media stream.
    }
    this.releaseTabCaptureResources();
    this.tabCaptureChunks = [];
    this.tabCaptureBytes = 0;
    this.tabCapturePhase = 'idle';
    this.releaseCapturedFile();
  }

  private async startGeneration(): Promise<void> {
    if (
      this.isWorking
      || this.tabCapturePhase !== 'idle'
      || !this.selectedFile
      || !this.transcriptionProvider?.value
    ) return;
    const fileError = this.validateFile(this.selectedFile);
    if (fileError) {
      this.showStatus(fileError, true);
      this.releaseCapturedFile();
      return;
    }

    this.resultFileBaseName = this.createResultFileBaseName(this.selectedFile.name);
    const currentRun = ++this.runId;
    this.clearResult();
    this.uploadOffset = 0;
    this.uploadChunkIndex = 0;
    this.setWorking(true);
    this.setProgress(0);
    this.showStatus('Preparing media');

    try {
      const port = chrome.runtime.connect({ name: 'lexibridge-media-transcription' });
      this.port = port;
      port.onMessage.addListener(message => this.handlePortMessage(port, message, currentRun));
      port.onDisconnect.addListener(() => {
        if (this.port !== port) return;
        this.port = null;
        if (this.isWorking && currentRun === this.runId) {
          this.failGeneration(chrome.runtime.lastError?.message || 'The transcription connection closed.');
        }
      });
      port.postMessage({
        type: 'initialize',
        metadata: {
          providerId: this.transcriptionProvider.value,
          fileName: this.selectedFile.name,
          mimeType: this.selectedFile.type || 'application/octet-stream',
          totalBytes: this.selectedFile.size,
          language: this.sourceLanguage?.value || 'auto',
          prompt: this.transcriptionPrompt?.value || ''
        }
      });
    } catch (error) {
      this.failGeneration(error instanceof Error ? error.message : 'Could not start transcription.');
    }
  }

  private handlePortMessage(port: chrome.runtime.Port, message: any, runId: number): void {
    if (this.port !== port || runId !== this.runId) return;
    switch (message?.type) {
      case 'ready':
        this.showStatus('Uploading media');
        void this.sendNextChunk(port, runId);
        break;
      case 'chunk-accepted':
        this.uploadOffset = Number(message.receivedBytes) || this.uploadOffset;
        this.uploadChunkIndex++;
        this.setProgress(Math.min(65, (this.uploadOffset / (this.selectedFile?.size || 1)) * 65));
        void this.sendNextChunk(port, runId);
        break;
      case 'transcribing':
        this.releaseCapturedFile();
        this.setProgress(68);
        this.showStatus('Generating timed transcript');
        break;
      case 'transcription-complete':
        this.port = null;
        port.disconnect();
        void this.finishTranscription(message.result as MediaTranscriptionResult, runId);
        break;
      case 'canceled':
        this.port = null;
        port.disconnect();
        this.finishCanceled();
        break;
      case 'error':
        this.port = null;
        port.disconnect();
        this.failGeneration(message.error || 'Media transcription failed.');
        break;
    }
  }

  private async sendNextChunk(port: chrome.runtime.Port, runId: number): Promise<void> {
    const file = this.selectedFile;
    if (!file || this.port !== port || runId !== this.runId) return;
    if (this.uploadOffset >= file.size) {
      port.postMessage({ type: 'complete' });
      return;
    }

    const end = Math.min(file.size, this.uploadOffset + MEDIA_TRANSCRIPTION_CHUNK_BYTES);
    try {
      const bytes = new Uint8Array(await file.slice(this.uploadOffset, end).arrayBuffer());
      if (this.port !== port || runId !== this.runId) return;
      port.postMessage({
        type: 'chunk',
        index: this.uploadChunkIndex,
        data: this.encodeBase64(bytes)
      });
    } catch (error) {
      this.failGeneration(error instanceof Error ? error.message : 'Could not read the media file.');
    }
  }

  private async finishTranscription(result: MediaTranscriptionResult, runId: number): Promise<void> {
    try {
      const normalizedSegments = this.mergeSegments(result.segments || []);
      if (normalizedSegments.length === 0) throw new Error('The speech service returned no timed captions.');
      this.cues = normalizedSegments.map((segment, index) => ({
        id: index + 1,
        start: segment.start,
        end: segment.end,
        originalText: segment.text,
        translatedText: ''
      }));

      if (this.translateCaptions?.checked) {
        this.showStatus('Translating captions');
        for (let index = 0; index < this.cues.length; index++) {
          if (runId !== this.runId) return;
          const cue = this.cues[index]!;
          const context = this.cues
            .slice(Math.max(0, index - 1), Math.min(this.cues.length, index + 2))
            .map(item => item.originalText)
            .join('\n');
          const response = await this.sendMessage({
            action: 'translate',
            data: {
              text: cue.originalText,
              context,
              sourceLang: result.language || 'auto',
              targetLang: this.targetLanguage?.value || 'zh-CN',
              provider: this.translationProvider?.value || 'google'
            }
          });
          if (!response?.success) {
            throw new Error(response?.error || `Could not translate caption ${index + 1}.`);
          }
          cue.translatedText = response.data.translatedText;
          this.setProgress(70 + ((index + 1) / this.cues.length) * 30);
          if (index < this.cues.length - 1) await this.delay(500);
        }
      }

      if (runId !== this.runId) return;
      this.renderCues(result.duration);
      this.setProgress(100);
      this.showStatus(`Generated ${this.cues.length} captions`);
      this.setWorking(false);
    } catch (error) {
      if (this.cues.length > 0) this.renderCues(result.duration);
      this.failGeneration(error instanceof Error ? error.message : 'Could not prepare captions.');
    }
  }

  private mergeSegments(segments: MediaTranscriptionSegment[]): MediaTranscriptionSegment[] {
    const ordered = segments
      .filter(segment => segment.text?.trim() && Number.isFinite(segment.start) && Number.isFinite(segment.end))
      .sort((first, second) => first.start - second.start);
    const merged: MediaTranscriptionSegment[] = [];

    for (const segment of ordered) {
      const text = segment.text.replace(/\s+/g, ' ').trim();
      const current = merged[merged.length - 1];
      const canMerge = current
        && segment.start - current.end <= 0.8
        && segment.end - current.start <= 8
        && current.text.length + text.length + 1 <= 220;
      if (canMerge && current) {
        current.end = Math.max(current.end, segment.end);
        current.text = `${current.text} ${text}`;
      } else {
        merged.push({
          id: merged.length + 1,
          start: Math.max(0, segment.start),
          end: Math.max(segment.start + 0.05, segment.end),
          text
        });
      }
    }
    return merged;
  }

  private renderCues(duration: number): void {
    if (!this.cueList || !this.resultSection) return;
    this.cueList.replaceChildren(...this.cues.map(cue => {
      const row = document.createElement('article');
      row.className = 'cue-row';
      const time = document.createElement('time');
      time.className = 'cue-time';
      time.textContent = `${this.formatClock(cue.start)} – ${this.formatClock(cue.end)}`;
      const original = document.createElement('div');
      original.className = 'cue-original';
      original.textContent = cue.originalText;
      const translation = document.createElement('div');
      translation.className = 'cue-translation';
      translation.textContent = cue.translatedText;
      if (!cue.translatedText) translation.hidden = true;
      row.append(time, original, translation);
      return row;
    }));
    if (this.resultSummary) {
      this.resultSummary.textContent = `${this.cues.length} captions · ${this.formatClock(duration)}`;
    }
    this.resultSection.hidden = false;
  }

  private cancelGeneration(): void {
    if (!this.isWorking) return;
    this.runId++;
    const port = this.port;
    this.port = null;
    if (port) {
      try {
        port.postMessage({ type: 'cancel' });
      } finally {
        port.disconnect();
      }
    }
    this.finishCanceled();
  }

  private finishCanceled(): void {
    this.releaseCapturedFile();
    this.setWorking(false);
    this.setProgress(0);
    this.showStatus('Canceled');
  }

  private failGeneration(message: string): void {
    const port = this.port;
    this.port = null;
    if (port) {
      try {
        port.postMessage({ type: 'cancel' });
      } catch {
        // Disconnection still releases any background upload buffer.
      }
      try {
        port.disconnect();
      } catch {
        // The port may already be closed by the background service worker.
      }
    }
    this.releaseCapturedFile();
    this.setWorking(false);
    this.showStatus(message, true);
  }

  private clearResult(): void {
    this.cues = [];
    this.cueList?.replaceChildren();
    if (this.resultSection) this.resultSection.hidden = true;
    if (this.resultSummary) this.resultSummary.textContent = '';
  }

  private exportCaptions(format: 'srt' | 'vtt'): void {
    if (this.cues.length === 0) return;
    const content = format === 'srt' ? this.createSrt() : this.createVtt();
    const baseName = this.resultFileBaseName;
    this.downloadTextFile(
      content,
      `${baseName}.generated.${format}`,
      format === 'srt' ? 'application/x-subrip;charset=utf-8' : 'text/vtt;charset=utf-8'
    );
  }

  private createResultFileBaseName(fileName: string): string {
    return fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'generated-subtitles';
  }

  private releaseCapturedFile(): void {
    if (!this.selectedFileIsTabCapture) return;
    this.selectedFile = null;
    this.selectedFileIsTabCapture = false;
  }

  private createSrt(): string {
    return this.cues.map((cue, index) => [
      String(index + 1),
      `${this.formatTimestamp(cue.start, ',')} --> ${this.formatTimestamp(cue.end, ',')}`,
      cue.originalText,
      ...(cue.translatedText ? [cue.translatedText] : [])
    ].join('\n')).join('\n\n');
  }

  private createVtt(): string {
    const cues = this.cues.map(cue => [
      `${this.formatTimestamp(cue.start, '.')} --> ${this.formatTimestamp(cue.end, '.')}`,
      cue.originalText,
      ...(cue.translatedText ? [cue.translatedText] : [])
    ].join('\n')).join('\n\n');
    return `WEBVTT\n\n${cues}`;
  }

  private setWorking(working: boolean): void {
    this.isWorking = working;
    if (this.transcriptionProvider) this.transcriptionProvider.disabled = working;
    if (this.sourceLanguage) this.sourceLanguage.disabled = working;
    if (this.transcriptionPrompt) this.transcriptionPrompt.disabled = working;
    if (this.translateCaptions) this.translateCaptions.disabled = working;
    if (this.cancelButton) this.cancelButton.hidden = !working;
    this.updateTranslationControls();
    this.updateGenerateAvailability();
  }

  private setProgress(value: number): void {
    const normalized = Math.max(0, Math.min(100, value));
    if (this.progress) this.progress.value = normalized;
    if (this.progressText) this.progressText.textContent = `${Math.round(normalized)}%`;
  }

  private showStatus(message: string, error: boolean = false): void {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.classList.toggle('error', error);
  }

  private validateFile(file: File): string {
    if (file.size <= 0) return 'The selected media file is empty.';
    if (file.size > MEDIA_TRANSCRIPTION_MAX_BYTES) return 'The selected media file exceeds 25 MB.';
    return isSupportedMediaTranscriptionFile(file.name, file.type)
      ? ''
      : 'Choose a supported audio or video file.';
  }

  private encodeBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
    }
    return btoa(binary);
  }

  private formatTimestamp(secondsValue: number, separator: ',' | '.'): string {
    const totalMilliseconds = Math.max(0, Math.round(secondsValue * 1000));
    const milliseconds = totalMilliseconds % 1000;
    const totalSeconds = Math.floor(totalMilliseconds / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    return `${this.pad(hours, 2)}:${this.pad(minutes, 2)}:${this.pad(seconds, 2)}${separator}${this.pad(milliseconds, 3)}`;
  }

  private formatClock(secondsValue: number): string {
    const totalSeconds = Math.max(0, Math.round(secondsValue));
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    return hours > 0
      ? `${this.pad(hours, 2)}:${this.pad(minutes, 2)}:${this.pad(seconds, 2)}`
      : `${this.pad(minutes, 2)}:${this.pad(seconds, 2)}`;
  }

  private pad(value: number, width: number): string {
    return String(value).padStart(width, '0');
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  private downloadTextFile(content: string, filename: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private sendMessage(message: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new SubtitleGeneratorController(), { once: true });
