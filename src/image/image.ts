import {
  BUNDLED_OCR_LANGUAGES,
  BundledOcrLanguageCode
} from '../services/BundledOcrService';
import {
  AVAILABLE_TRANSLATION_PROVIDERS,
  getProviderTargetLanguages
} from '../services/TranslationProviderRegistry';
import {
  LOCAL_IMAGE_LIMITS,
  LocalImageTranslationEngine,
  LocalImageTranslationProgress,
  LocalImageTranslationResult,
  localImageTranslationService,
  validateLocalImageDimensions,
  validateLocalImageFile,
  validateLocalImageQueuePixels
} from '../services/LocalImageTranslationService';

type ImageAssetStatus = 'loading' | 'ready' | 'running' | 'completed' | 'error';
type QualityRating = 'good' | 'poor';

interface ImageWorkspaceSettings {
  defaultTargetLanguage?: string;
  translationProvider?: string;
  documentOcrLanguage?: BundledOcrLanguageCode;
}

interface WorkspaceImageAsset {
  id: string;
  file: File;
  objectUrl: string;
  image: HTMLImageElement;
  width: number;
  height: number;
  sourceCanvas: HTMLCanvasElement | null;
  result: LocalImageTranslationResult | null;
  status: ImageAssetStatus;
  statusMessage: string;
  runId: number;
  showTranslated: boolean;
  feedback: QualityRating | null;
  cancelDecode: (() => void) | null;
  resultSettings: {
    provider: string;
    targetLanguage: string;
    ocrLanguage: BundledOcrLanguageCode;
  } | null;
  feedbackStorageKey: string | null;
}

interface QualityFeedbackEntry {
  schemaVersion: 1;
  rating: QualityRating;
  createdAt: string;
  width: number;
  height: number;
  provider: string;
  targetLanguage: string;
  ocrLanguage: BundledOcrLanguageCode;
  blockCount: number;
  reconstructedBlockCount: number;
  overlayBlockCount: number;
}

const QUALITY_FEEDBACK_STORAGE_PREFIX = 'imageQualityFeedbackV1:';
const MAX_QUALITY_FEEDBACK_ENTRIES = 100;

export class ImageWorkspaceController {
  private readonly assets: WorkspaceImageAsset[] = [];
  private selectedAssetId: string | null = null;
  private assetSequence = 0;
  private batchSequence = 0;
  private activeController: AbortController | null = null;
  private activeBatchId = 0;
  private readonly activeBlobCancellations = new Set<() => void>();
  private readonly activeDownloadUrls = new Set<string>();
  private fileLoadQueue: Promise<void> = Promise.resolve();
  private fileLoadGeneration = 0;
  private feedbackWriteQueue: Promise<void> = Promise.resolve();
  private isDisposed = false;

  private fileInput: HTMLInputElement | null = null;
  private dropZone: HTMLElement | null = null;
  private targetLanguage: HTMLSelectElement | null = null;
  private provider: HTMLSelectElement | null = null;
  private ocrLanguage: HTMLSelectElement | null = null;
  private translateAllButton: HTMLButtonElement | null = null;
  private clearButton: HTMLButtonElement | null = null;
  private workspaceStatus: HTMLElement | null = null;
  private queueCount: HTMLElement | null = null;
  private queue: HTMLElement | null = null;
  private emptyStage: HTMLElement | null = null;
  private activeStage: HTMLElement | null = null;
  private activeImageName: HTMLElement | null = null;
  private activeImageMeta: HTMLElement | null = null;
  private sourcePreview: HTMLImageElement | null = null;
  private translatedPreview: HTMLElement | null = null;
  private showOriginalButton: HTMLButtonElement | null = null;
  private showTranslationButton: HTMLButtonElement | null = null;
  private translateImageButton: HTMLButtonElement | null = null;
  private applyButton: HTMLButtonElement | null = null;
  private undoButton: HTMLButtonElement | null = null;
  private downloadButton: HTMLButtonElement | null = null;
  private imageStatus: HTMLElement | null = null;
  private qualityGoodButton: HTMLButtonElement | null = null;
  private qualityPoorButton: HTMLButtonElement | null = null;

  constructor(
    private readonly translationEngine: LocalImageTranslationEngine = localImageTranslationService
  ) {}

  async initialize(): Promise<void> {
    this.captureElements();
    this.populateControls();
    this.bindEvents();
    this.render();
    await this.loadSettings();
  }

  private captureElements(): void {
    this.fileInput = document.getElementById('imageFiles') as HTMLInputElement | null;
    this.dropZone = document.getElementById('imageDropZone');
    this.targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement | null;
    this.provider = document.getElementById('translationProvider') as HTMLSelectElement | null;
    this.ocrLanguage = document.getElementById('ocrLanguage') as HTMLSelectElement | null;
    this.translateAllButton = document.getElementById('translateAllImages') as HTMLButtonElement | null;
    this.clearButton = document.getElementById('clearImages') as HTMLButtonElement | null;
    this.workspaceStatus = document.getElementById('workspaceStatus');
    this.queueCount = document.getElementById('queueCount');
    this.queue = document.getElementById('imageQueue');
    this.emptyStage = document.getElementById('emptyStage');
    this.activeStage = document.getElementById('activeStage');
    this.activeImageName = document.getElementById('activeImageName');
    this.activeImageMeta = document.getElementById('activeImageMeta');
    this.sourcePreview = document.getElementById('sourcePreview') as HTMLImageElement | null;
    this.translatedPreview = document.getElementById('translatedPreview');
    this.showOriginalButton = document.getElementById('showOriginal') as HTMLButtonElement | null;
    this.showTranslationButton = document.getElementById('showTranslation') as HTMLButtonElement | null;
    this.translateImageButton = document.getElementById('translateImage') as HTMLButtonElement | null;
    this.applyButton = document.getElementById('applyTranslation') as HTMLButtonElement | null;
    this.undoButton = document.getElementById('undoTranslation') as HTMLButtonElement | null;
    this.downloadButton = document.getElementById('downloadTranslation') as HTMLButtonElement | null;
    this.imageStatus = document.getElementById('imageStatus');
    this.qualityGoodButton = document.getElementById('qualityGood') as HTMLButtonElement | null;
    this.qualityPoorButton = document.getElementById('qualityPoor') as HTMLButtonElement | null;
  }

  private populateControls(): void {
    if (this.provider) {
      this.provider.replaceChildren(...AVAILABLE_TRANSLATION_PROVIDERS.map(definition => {
        const option = document.createElement('option');
        option.value = definition.id;
        option.textContent = definition.label;
        return option;
      }));
    }
    if (this.ocrLanguage) {
      this.ocrLanguage.replaceChildren(...BUNDLED_OCR_LANGUAGES.map(definition => {
        const option = document.createElement('option');
        option.value = definition.code;
        option.textContent = definition.label;
        return option;
      }));
    }
    this.updateTargetLanguages('zh-CN');
  }

  private bindEvents(): void {
    this.fileInput?.addEventListener('change', () => {
      const files = Array.from(this.fileInput?.files || []);
      if (this.fileInput) this.fileInput.value = '';
      void this.addFiles(files);
    });
    this.dropZone?.addEventListener('dragenter', event => this.handleDragEnter(event));
    this.dropZone?.addEventListener('dragover', event => this.handleDragEnter(event));
    this.dropZone?.addEventListener('dragleave', () => this.dropZone?.classList.remove('is-dragging'));
    this.dropZone?.addEventListener('drop', event => this.handleDrop(event));
    document.addEventListener('paste', event => this.handlePaste(event));
    this.translateAllButton?.addEventListener('click', () => void this.toggleBatchTranslation());
    this.clearButton?.addEventListener('click', () => this.clear());
    this.queue?.addEventListener('click', event => this.handleQueueClick(event));
    this.provider?.addEventListener('change', () => this.updateTargetLanguages(this.targetLanguage?.value));
    this.showOriginalButton?.addEventListener('click', () => this.setPreviewMode(false));
    this.showTranslationButton?.addEventListener('click', () => this.setPreviewMode(true));
    this.translateImageButton?.addEventListener('click', () => void this.translateSelectedImage());
    this.applyButton?.addEventListener('click', () => this.setPreviewMode(true));
    this.undoButton?.addEventListener('click', () => this.setPreviewMode(false));
    this.downloadButton?.addEventListener('click', () => void this.downloadSelectedImage());
    this.qualityGoodButton?.addEventListener('click', () => void this.recordQuality('good'));
    this.qualityPoorButton?.addEventListener('click', () => void this.recordQuality('poor'));
    document.getElementById('openOptions')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
    window.addEventListener('pagehide', () => this.dispose(), { once: true });
  }

  private async loadSettings(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getSettings' });
      const settings = response?.success ? response.data as ImageWorkspaceSettings : {};
      if (this.provider) this.provider.value = settings.translationProvider || 'google';
      this.updateTargetLanguages(settings.defaultTargetLanguage || 'zh-CN');
      if (this.ocrLanguage) this.ocrLanguage.value = settings.documentOcrLanguage || 'eng';
    } catch {
      this.setWorkspaceStatus('Could not load settings. Using defaults.', true);
    }
  }

  private updateTargetLanguages(preferredLanguage = 'zh-CN'): void {
    if (!this.targetLanguage) return;
    const languages = getProviderTargetLanguages(this.provider?.value || 'google');
    const previous = preferredLanguage || this.targetLanguage.value;
    this.targetLanguage.replaceChildren(...languages.map(definition => {
      const option = document.createElement('option');
      option.value = definition.code;
      option.textContent = definition.label;
      return option;
    }));
    this.targetLanguage.value = languages.some(item => item.code === previous)
      ? previous
      : languages[0]?.code || 'zh-CN';
  }

  private handleDragEnter(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dropZone?.classList.add('is-dragging');
  }

  private handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.dropZone?.classList.remove('is-dragging');
    void this.addFiles(Array.from(event.dataTransfer?.files || []));
  }

  private handlePaste(event: ClipboardEvent): void {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      (activeElement instanceof HTMLElement && activeElement.isContentEditable)
    ) {
      return;
    }
    const files = Array.from(event.clipboardData?.items || [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length === 0) return;
    event.preventDefault();
    void this.addFiles(files);
  }

  addFiles(files: File[]): Promise<void> {
    if (this.isDisposed || files.length === 0) return Promise.resolve();
    const generation = this.fileLoadGeneration;
    const operation = this.fileLoadQueue.then(async () => {
      if (this.isDisposed || generation !== this.fileLoadGeneration) return;
      await this.addFilesNow(files);
    });
    this.fileLoadQueue = operation.catch(() => undefined);
    return operation;
  }

  private async addFilesNow(files: File[]): Promise<void> {
    const availableSlots = Math.max(0, LOCAL_IMAGE_LIMITS.maxFiles - this.assets.length);
    if (availableSlots === 0) {
      this.setWorkspaceStatus(`A maximum of ${LOCAL_IMAGE_LIMITS.maxFiles} images can be queued.`, true);
      return;
    }

    const accepted = files.slice(0, availableSlots);
    const currentBytes = this.assets.reduce((total, asset) => total + asset.file.size, 0);
    let acceptedBytes = currentBytes;
    let addedCount = 0;
    for (const file of accepted) {
      try {
        validateLocalImageFile(file);
        if (acceptedBytes + file.size > LOCAL_IMAGE_LIMITS.maxTotalBytes) {
          throw new Error('The image queue must be 100 MB or smaller.');
        }
        const nextBytes = acceptedBytes + file.size;
        await this.loadFile(file);
        acceptedBytes = nextBytes;
        addedCount += 1;
      } catch (error) {
        if (this.isDisposed || error instanceof DOMException && error.name === 'AbortError') return;
        this.setWorkspaceStatus(error instanceof Error ? error.message : 'Could not load image.', true);
      }
    }
    if (files.length > accepted.length) {
      this.setWorkspaceStatus(`Only the first ${availableSlots} images were added.`, true);
    } else if (addedCount > 0) {
      this.setWorkspaceStatus(`${addedCount} image${addedCount === 1 ? '' : 's'} ready`);
    }
    this.render();
  }

  private async loadFile(file: File): Promise<void> {
    const objectUrl = URL.createObjectURL(file);
    const asset: WorkspaceImageAsset = {
      id: `image-${Date.now().toString(36)}-${++this.assetSequence}`,
      file,
      objectUrl,
      image: new Image(),
      width: 0,
      height: 0,
      sourceCanvas: null,
      result: null,
      status: 'loading',
      statusMessage: 'Loading',
      runId: 0,
      showTranslated: false,
      feedback: null,
      cancelDecode: null,
      resultSettings: null,
      feedbackStorageKey: null
    };
    this.assets.push(asset);
    this.selectedAssetId = asset.id;
    this.render();

    try {
      await this.decodeImage(asset, objectUrl);
      if (this.isDisposed || !this.assets.includes(asset)) return;
      asset.width = asset.image.naturalWidth || asset.image.width;
      asset.height = asset.image.naturalHeight || asset.image.height;
      validateLocalImageDimensions(asset.width, asset.height);
      const currentPixels = this.assets
        .filter(item => item !== asset)
        .reduce((total, item) => total + item.width * item.height, 0);
      validateLocalImageQueuePixels(currentPixels, asset.width, asset.height);
      asset.sourceCanvas = this.createSourceCanvas(asset.image, asset.width, asset.height);
      asset.status = 'ready';
      asset.statusMessage = 'Ready';
    } catch (error) {
      this.removeAsset(asset);
      throw error instanceof Error ? error : new Error('Could not decode image.');
    }
    this.render();
  }

  private decodeImage(asset: WorkspaceImageAsset, objectUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const image = asset.image;
      const cleanup = (): void => {
        image.onload = null;
        image.onerror = null;
        asset.cancelDecode = null;
      };
      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('Could not decode this image.'));
      };
      asset.cancelDecode = () => {
        cleanup();
        reject(new DOMException('Canceled', 'AbortError'));
      };
      image.decoding = 'async';
      image.src = objectUrl;
    });
  }

  private createSourceCanvas(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context || typeof context.drawImage !== 'function') {
      throw new Error('This browser cannot prepare the selected image.');
    }
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  }

  private async toggleBatchTranslation(): Promise<void> {
    if (this.activeController) {
      this.stopTranslation();
      return;
    }
    const readyAssets = this.assets.filter(asset => asset.sourceCanvas && asset.status !== 'loading');
    if (readyAssets.length === 0) return;
    await this.runAssets(readyAssets);
  }

  private async translateSelectedImage(): Promise<void> {
    if (this.activeController) {
      this.stopTranslation();
      return;
    }
    const asset = this.getSelectedAsset();
    if (!asset?.sourceCanvas || asset.status === 'loading') return;
    await this.runAssets([asset]);
  }

  private async runAssets(assets: WorkspaceImageAsset[]): Promise<void> {
    this.cancelActiveBlobs();
    const controller = new AbortController();
    const batchId = ++this.batchSequence;
    this.activeController = controller;
    this.activeBatchId = batchId;
    this.setControlsBusy(true);
    this.render();
    const settings = {
      provider: this.provider?.value || 'google',
      targetLanguage: this.targetLanguage?.value || 'zh-CN',
      ocrLanguage: (this.ocrLanguage?.value || 'eng') as BundledOcrLanguageCode
    };
    let completed = 0;
    let failed = 0;

    try {
      for (const asset of assets) {
        if (controller.signal.aborted || this.activeBatchId !== batchId) break;
        try {
          await this.runAsset(asset, settings, controller.signal);
          completed += 1;
        } catch {
          if (controller.signal.aborted || this.activeBatchId !== batchId) break;
          failed += 1;
        }
      }
      if (!controller.signal.aborted && this.activeBatchId === batchId) {
        this.setWorkspaceStatus(
          failed > 0
            ? `${completed} translated; ${failed} failed`
            : `${completed} image${completed === 1 ? '' : 's'} translated`,
          failed > 0
        );
      }
    } catch (error) {
      if (!controller.signal.aborted && this.activeBatchId === batchId) {
        this.setWorkspaceStatus(error instanceof Error ? error.message : 'Image translation failed.', true);
      }
    } finally {
      if (this.activeBatchId === batchId) {
        this.activeController = null;
        this.setControlsBusy(false);
        this.render();
      }
    }
  }

  private async runAsset(
    asset: WorkspaceImageAsset,
    settings: { provider: string; targetLanguage: string; ocrLanguage: BundledOcrLanguageCode },
    signal: AbortSignal
  ): Promise<void> {
    const sourceCanvas = asset.sourceCanvas;
    if (!sourceCanvas) return;
    const runId = ++asset.runId;
    asset.status = 'running';
    asset.statusMessage = 'Recognizing image text';
    asset.feedback = null;
    this.selectedAssetId = asset.id;
    this.render();

    try {
      const result = await this.translationEngine.translate(sourceCanvas, {
        ocrLanguage: settings.ocrLanguage,
        signal,
        translateText: (text, request) => this.requestTranslation(
          text,
          settings.provider,
          settings.targetLanguage,
          request.requestId,
          request.signal
        ),
        onProgress: progress => this.updateAssetProgress(asset, runId, progress)
      });
      if (signal.aborted || asset.runId !== runId || this.isDisposed) return;
      asset.result?.canvas.remove();
      asset.result = result;
      asset.resultSettings = { ...settings };
      asset.status = 'completed';
      asset.statusMessage = `${result.translatedTexts.length} text block${result.translatedTexts.length === 1 ? '' : 's'} translated`;
      asset.showTranslated = false;
      this.render();
    } catch (error) {
      if (signal.aborted || asset.runId !== runId || this.isDisposed) return;
      asset.status = asset.result ? 'completed' : 'error';
      asset.statusMessage = error instanceof Error ? error.message : 'Image translation failed.';
      this.render();
      throw error;
    }
  }

  private updateAssetProgress(
    asset: WorkspaceImageAsset,
    runId: number,
    progress: LocalImageTranslationProgress
  ): void {
    if (asset.runId !== runId || asset.status !== 'running') return;
    asset.statusMessage = progress.message;
    this.renderQueue();
    if (this.selectedAssetId === asset.id) this.renderSelectedAsset();
  }

  private async requestTranslation(
    text: string,
    provider: string,
    targetLanguage: string,
    requestId: string,
    signal: AbortSignal
  ): Promise<string> {
    const cancel = (): void => {
      void this.sendMessage({
        action: 'cancelTranslationRequest',
        data: { requestId }
      }).catch(() => undefined);
    };
    if (signal.aborted) {
      cancel();
      throw new DOMException('Canceled', 'AbortError');
    }
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const response = await this.sendMessage({
        action: 'translate',
        data: { text, provider, targetLang: targetLanguage, requestId }
      });
      if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
      if (!response?.success) throw new Error(response?.error || 'Image text translation failed.');
      const translatedText = String(response.data?.translatedText || '').trim();
      if (!translatedText) throw new Error('The translation provider returned an empty result.');
      return translatedText;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }

  private stopTranslation(): void {
    this.cancelActiveBlobs();
    const controller = this.activeController;
    if (!controller) return;
    this.activeBatchId = ++this.batchSequence;
    this.activeController = null;
    controller.abort();
    this.assets.forEach(asset => {
      if (asset.status !== 'running') return;
      asset.runId += 1;
      asset.status = asset.result ? 'completed' : 'ready';
      asset.statusMessage = asset.result ? 'Previous translation restored' : 'Stopped';
    });
    this.setControlsBusy(false);
    this.setWorkspaceStatus('Translation stopped');
    this.render();
  }

  private setPreviewMode(showTranslated: boolean): void {
    const asset = this.getSelectedAsset();
    if (!asset?.result && showTranslated) return;
    if (!asset) return;
    asset.showTranslated = showTranslated;
    this.renderSelectedAsset();
  }

  private async downloadSelectedImage(): Promise<void> {
    const asset = this.getSelectedAsset();
    if (!asset?.result || this.activeController) return;
    const blob = await this.createPngBlob(asset.result.canvas);
    if (!blob || this.isDisposed || !this.assets.includes(asset)) return;

    const objectUrl = URL.createObjectURL(blob);
    this.activeDownloadUrls.add(objectUrl);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = this.getDownloadName(asset.file.name);
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    try {
      anchor.click();
      asset.statusMessage = 'Translated PNG downloaded';
      this.renderSelectedAsset();
    } finally {
      anchor.remove();
      window.setTimeout(() => this.revokeDownloadUrl(objectUrl), 0);
    }
  }

  private createPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (blob: Blob | null): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        this.activeBlobCancellations.delete(cancel);
        resolve(blob);
      };
      const cancel = (): void => finish(null);
      const timer = window.setTimeout(cancel, 10_000);
      this.activeBlobCancellations.add(cancel);
      try {
        canvas.toBlob(blob => finish(blob), 'image/png');
      } catch {
        finish(null);
      }
    });
  }

  private getDownloadName(fileName: string): string {
    const base = fileName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'image';
    return `${base}-translated.png`;
  }

  private async recordQuality(rating: QualityRating): Promise<void> {
    const asset = this.getSelectedAsset();
    if (!asset?.result || !asset.resultSettings) return;
    asset.feedback = rating;
    this.renderSelectedAsset();
    const entry: QualityFeedbackEntry = {
      schemaVersion: 1,
      rating,
      createdAt: new Date().toISOString(),
      width: asset.width,
      height: asset.height,
      provider: asset.resultSettings.provider,
      targetLanguage: asset.resultSettings.targetLanguage,
      ocrLanguage: asset.resultSettings.ocrLanguage,
      blockCount: asset.result.translatedTexts.length,
      reconstructedBlockCount: asset.result.reconstructedBlockCount,
      overlayBlockCount: asset.result.overlayBlockCount
    };
    const storageKey = asset.feedbackStorageKey || this.createFeedbackStorageKey(asset.id);
    asset.feedbackStorageKey = storageKey;
    const write = this.feedbackWriteQueue.then(async () => {
      await this.setLocalStorage({ [storageKey]: entry });
      await this.pruneQualityFeedback();
    });
    this.feedbackWriteQueue = write.catch(() => undefined);
    try {
      await write;
      asset.statusMessage = rating === 'good' ? 'Good result saved locally' : 'Poor result saved locally';
    } catch {
      asset.statusMessage = 'Could not save quality feedback';
    }
    this.renderSelectedAsset();
  }

  private handleQueueClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-image-id]') : null;
    if (!target?.dataset.imageId) return;
    this.selectedAssetId = target.dataset.imageId;
    this.render();
  }

  private clear(): void {
    this.fileLoadGeneration += 1;
    this.stopTranslation();
    this.assets.splice(0).forEach(asset => this.releaseAsset(asset));
    this.selectedAssetId = null;
    this.cancelActiveBlobs();
    this.setWorkspaceStatus('No images selected');
    this.render();
  }

  private removeAsset(asset: WorkspaceImageAsset): void {
    const index = this.assets.indexOf(asset);
    if (index < 0) return;
    this.assets.splice(index, 1);
    this.releaseAsset(asset);
    if (this.selectedAssetId === asset.id) this.selectedAssetId = this.assets[0]?.id || null;
  }

  private releaseAsset(asset: WorkspaceImageAsset): void {
    asset.runId += 1;
    asset.cancelDecode?.();
    asset.cancelDecode = null;
    asset.image.onload = null;
    asset.image.onerror = null;
    asset.image.removeAttribute('src');
    asset.sourceCanvas?.remove();
    asset.result?.canvas.remove();
    URL.revokeObjectURL(asset.objectUrl);
  }

  private dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.fileLoadGeneration += 1;
    this.stopTranslation();
    this.assets.splice(0).forEach(asset => this.releaseAsset(asset));
    this.cancelActiveBlobs();
  }

  private cancelActiveBlobs(): void {
    Array.from(this.activeBlobCancellations).forEach(cancel => cancel());
    Array.from(this.activeDownloadUrls).forEach(url => this.revokeDownloadUrl(url));
  }

  private revokeDownloadUrl(url: string): void {
    if (!this.activeDownloadUrls.delete(url)) return;
    URL.revokeObjectURL(url);
  }

  private render(): void {
    this.renderQueue();
    this.renderSelectedAsset();
    const hasReadyAsset = this.assets.some(asset => asset.sourceCanvas && asset.status !== 'loading');
    if (this.translateAllButton) {
      this.translateAllButton.disabled = !hasReadyAsset;
      this.translateAllButton.textContent = this.activeController ? 'Stop' : 'Translate all';
    }
    if (this.clearButton) this.clearButton.disabled = this.assets.length === 0;
  }

  private renderQueue(): void {
    if (this.queueCount) this.queueCount.textContent = String(this.assets.length);
    if (!this.queue) return;
    this.queue.replaceChildren(...this.assets.map(asset => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `queue-item${asset.id === this.selectedAssetId ? ' is-selected' : ''}`;
      button.dataset.imageId = asset.id;
      button.setAttribute('aria-pressed', String(asset.id === this.selectedAssetId));

      const thumbnail = document.createElement('img');
      thumbnail.src = asset.objectUrl;
      thumbnail.alt = '';
      const copy = document.createElement('span');
      copy.className = 'queue-item-copy';
      const name = document.createElement('span');
      name.className = 'queue-item-name';
      name.textContent = asset.file.name;
      const status = document.createElement('span');
      status.className = 'queue-item-status';
      status.textContent = asset.statusMessage;
      copy.append(name, status);
      button.append(thumbnail, copy);
      return button;
    }));
  }

  private renderSelectedAsset(): void {
    const asset = this.getSelectedAsset();
    if (this.emptyStage) this.emptyStage.hidden = Boolean(asset);
    if (this.activeStage) this.activeStage.hidden = !asset;
    if (!asset) {
      this.sourcePreview?.removeAttribute('src');
      this.translatedPreview?.replaceChildren();
      return;
    }

    if (this.activeImageName) this.activeImageName.textContent = asset.file.name;
    if (this.activeImageMeta) {
      this.activeImageMeta.textContent = asset.width > 0
        ? `${asset.width} x ${asset.height} - ${this.formatBytes(asset.file.size)}`
        : this.formatBytes(asset.file.size);
    }
    if (this.sourcePreview) {
      this.sourcePreview.src = asset.objectUrl;
      this.sourcePreview.hidden = asset.showTranslated;
    }
    if (this.translatedPreview) {
      this.translatedPreview.hidden = !asset.showTranslated;
      this.translatedPreview.replaceChildren();
      if (asset.result) this.translatedPreview.appendChild(asset.result.canvas);
    }

    const hasResult = Boolean(asset.result);
    if (this.showOriginalButton) {
      this.showOriginalButton.classList.toggle('is-active', !asset.showTranslated);
      this.showOriginalButton.setAttribute('aria-pressed', String(!asset.showTranslated));
    }
    if (this.showTranslationButton) {
      this.showTranslationButton.disabled = !hasResult;
      this.showTranslationButton.classList.toggle('is-active', asset.showTranslated);
      this.showTranslationButton.setAttribute('aria-pressed', String(asset.showTranslated));
    }
    if (this.translateImageButton) {
      this.translateImageButton.disabled = asset.status === 'loading' || asset.status === 'running' && !this.activeController;
      this.translateImageButton.textContent = this.activeController
        ? 'Stop'
        : hasResult ? 'Retranslate' : 'Translate image';
    }
    if (this.applyButton) this.applyButton.disabled = !hasResult || asset.showTranslated || Boolean(this.activeController);
    if (this.undoButton) this.undoButton.disabled = !hasResult || !asset.showTranslated || Boolean(this.activeController);
    if (this.downloadButton) this.downloadButton.disabled = !hasResult || Boolean(this.activeController);
    if (this.imageStatus) {
      this.imageStatus.textContent = asset.statusMessage;
      this.imageStatus.classList.toggle('is-error', asset.status === 'error');
    }
    [this.qualityGoodButton, this.qualityPoorButton].forEach(button => {
      if (button) button.disabled = !hasResult || Boolean(this.activeController);
    });
    this.qualityGoodButton?.classList.toggle('is-selected', asset.feedback === 'good');
    this.qualityPoorButton?.classList.toggle('is-selected', asset.feedback === 'poor');
  }

  private setControlsBusy(isBusy: boolean): void {
    if (this.provider) this.provider.disabled = isBusy;
    if (this.targetLanguage) this.targetLanguage.disabled = isBusy;
    if (this.ocrLanguage) this.ocrLanguage.disabled = isBusy;
  }

  private setWorkspaceStatus(message: string, isError = false): void {
    if (!this.workspaceStatus) return;
    this.workspaceStatus.textContent = message;
    this.workspaceStatus.classList.toggle('is-error', isError);
  }

  private getSelectedAsset(): WorkspaceImageAsset | null {
    return this.assets.find(asset => asset.id === this.selectedAssetId) || null;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private sendMessage(message: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    });
  }

  private getLocalStorage(key: string | null): Promise<unknown> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, result => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(key === null ? result : result?.[key]);
      });
    });
  }

  private setLocalStorage(value: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(value, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }

  private removeLocalStorage(keys: string[]): Promise<void> {
    if (keys.length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }

  private createFeedbackStorageKey(assetId: string): string {
    const random = new Uint32Array(2);
    globalThis.crypto?.getRandomValues?.(random);
    return `${QUALITY_FEEDBACK_STORAGE_PREFIX}${Date.now().toString(36)}:${random[0].toString(36)}${random[1].toString(36)}:${assetId}`;
  }

  private async pruneQualityFeedback(): Promise<void> {
    const stored = await this.getLocalStorage(null) as Record<string, QualityFeedbackEntry> | undefined;
    const entries = Object.entries(stored || {})
      .filter(([key, value]) => (
        key.startsWith(QUALITY_FEEDBACK_STORAGE_PREFIX)
        && value?.schemaVersion === 1
        && typeof value.createdAt === 'string'
      ))
      .sort((left, right) => left[1].createdAt.localeCompare(right[1].createdAt));
    const excess = entries.length - MAX_QUALITY_FEEDBACK_ENTRIES;
    if (excess > 0) {
      await this.removeLocalStorage(entries.slice(0, excess).map(([key]) => key));
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new ImageWorkspaceController();
  void controller.initialize();
}, { once: true });
