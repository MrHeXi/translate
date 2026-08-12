import { DocumentBlock, DocumentTextExtractor } from '../services/DocumentTextExtractor';
import { createAcademicDocumentHandoff } from '../services/AcademicDocumentHandoff';
import { createBabelDocWorkflow } from '../services/BabelDocWorkflow';
import {
  BUNDLED_OCR_LANGUAGES,
  BundledOcrLanguageCode
} from '../services/BundledOcrService';
import {
  PdfDocumentAnalysis,
  PdfDocumentSession,
  PdfOcrProgress,
  PdfPageSummary,
  pdfDocumentService
} from '../services/PdfDocumentService';
import {
  AVAILABLE_TRANSLATION_PROVIDERS,
  getProviderTargetLanguages,
  TRANSLATION_LANGUAGES
} from '../services/TranslationProviderRegistry';
import {
  DocumentHistoryEntry,
  DocumentHistoryRetention,
  DocumentHistorySourceKind,
  DOCUMENT_HISTORY_SCHEMA_VERSION,
  documentHistoryService
} from '../services/DocumentHistoryService';
import {
  createDocumentBatchArchive,
  DOCUMENT_BATCH_ARCHIVE_MAX_FILES,
  DOCUMENT_BATCH_ARCHIVE_MAX_TOTAL_BYTES
} from '../services/DocumentBatchArchive';
import {
  DocumentBatchService,
  DocumentBatchSnapshot
} from '../services/DocumentBatchService';
import {
  DocumentBatchTranslationOutput,
  DocumentBatchTranslationProgress,
  documentBatchTranslator,
  DOCUMENT_BATCH_MAX_SOURCE_BYTES
} from '../services/DocumentBatchTranslator';

type DisplayMode = 'bilingual' | 'translation-only' | 'original-only';

interface TranslationResult {
  block: DocumentBlock;
  translatedText: string;
  preservedOriginal?: boolean;
}

interface UserSettings {
  defaultTargetLanguage?: string;
  translationProvider?: string;
  pageTranslationDisplayMode?: DisplayMode;
  documentOcrLanguage?: BundledOcrLanguageCode;
}

interface ProviderConfigSummary {
  providerId: string;
  supportedTargetLanguages?: string[];
}

interface PdfPageView {
  summary: PdfPageSummary;
  row: HTMLElement;
  originalPanel: HTMLElement;
  translatedPanel: HTMLElement;
  originalCanvas: HTMLCanvasElement;
  translatedCanvas: HTMLCanvasElement;
  translationLayer: HTMLElement;
}

interface BatchDocumentInput {
  id: string;
  file: File;
}

interface BatchTranslationSettings {
  provider: string;
  targetLanguage: string;
  ocrLanguage: BundledOcrLanguageCode;
  runId: string;
}

class DocumentTranslatorController {
  private sourceText: HTMLTextAreaElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private translateButton: HTMLButtonElement | null = null;
  private exportSubtitleButton: HTMLButtonElement | null = null;
  private exportJsonButton: HTMLButtonElement | null = null;
  private exportDocxButton: HTMLButtonElement | null = null;
  private exportEpubButton: HTMLButtonElement | null = null;
  private exportPdfButton: HTMLButtonElement | null = null;
  private exportTextButton: HTMLButtonElement | null = null;
  private exportResearchNoteButton: HTMLButtonElement | null = null;
  private exportBabelDocGuideButton: HTMLButtonElement | null = null;
  private saveHistoryButton: HTMLButtonElement | null = null;
  private clearButton: HTMLButtonElement | null = null;
  private historyRetention: HTMLSelectElement | null = null;
  private clearHistoryButton: HTMLButtonElement | null = null;
  private historyList: HTMLElement | null = null;
  private targetLanguage: HTMLSelectElement | null = null;
  private translationProvider: HTMLSelectElement | null = null;
  private displayMode: HTMLSelectElement | null = null;
  private ocrLanguage: HTMLSelectElement | null = null;
  private message: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private progressText: HTMLElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private pdfViewer: HTMLElement | null = null;
  private batchFileInput: HTMLInputElement | null = null;
  private batchConcurrency: HTMLSelectElement | null = null;
  private batchStartButton: HTMLButtonElement | null = null;
  private batchCancelButton: HTMLButtonElement | null = null;
  private batchRetryButton: HTMLButtonElement | null = null;
  private batchDownloadButton: HTMLButtonElement | null = null;
  private batchClearButton: HTMLButtonElement | null = null;
  private batchSummary: HTMLElement | null = null;
  private batchMessage: HTMLElement | null = null;
  private batchQueue: HTMLElement | null = null;
  private loadedDocumentBlocks: DocumentBlock[] | null = null;
  private loadedSourceText = '';
  private loadedRawFileText = '';
  private loadedRawFileBytes: Uint8Array | null = null;
  private loadedFileName = '';
  private loadedSourceKind: DocumentHistorySourceKind = 'manual';
  private loadedSourceUrl = '';
  private hasExplicitlyLoadedPdf = false;
  private currentResults: TranslationResult[] = [];
  private pdfSession: PdfDocumentSession | null = null;
  private pdfAnalysis: PdfDocumentAnalysis | null = null;
  private readonly pdfPageViews = new Map<number, PdfPageView>();
  private historyEntries: DocumentHistoryEntry[] = [];
  private isBusy = false;
  private batchInputs: BatchDocumentInput[] = [];
  private batchService: DocumentBatchService<BatchDocumentInput, DocumentBatchTranslationOutput> | null = null;
  private unsubscribeBatch: (() => void) | null = null;
  private activeBatchSettings: BatchTranslationSettings | null = null;
  private readonly batchProgress = new Map<string, DocumentBatchTranslationProgress>();
  private batchFileSequence = 1;
  private batchRunSequence = 1;
  private batchIsRunning = false;
  private providerTargetLanguages = new Map<string, string[]>();

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    this.sourceText = document.getElementById('sourceText') as HTMLTextAreaElement | null;
    this.fileInput = document.getElementById('documentFile') as HTMLInputElement | null;
    this.translateButton = document.getElementById('translateDocument') as HTMLButtonElement | null;
    this.exportSubtitleButton = document.getElementById('exportSubtitleFile') as HTMLButtonElement | null;
    this.exportJsonButton = document.getElementById('exportJsonFile') as HTMLButtonElement | null;
    this.exportDocxButton = document.getElementById('exportDocxFile') as HTMLButtonElement | null;
    this.exportEpubButton = document.getElementById('exportEpubFile') as HTMLButtonElement | null;
    this.exportPdfButton = document.getElementById('exportPdfFile') as HTMLButtonElement | null;
    this.exportTextButton = document.getElementById('exportTextFile') as HTMLButtonElement | null;
    this.exportResearchNoteButton = document.getElementById('exportResearchNote') as HTMLButtonElement | null;
    this.exportBabelDocGuideButton = document.getElementById('exportBabelDocGuide') as HTMLButtonElement | null;
    this.saveHistoryButton = document.getElementById('saveDocumentHistory') as HTMLButtonElement | null;
    this.clearButton = document.getElementById('clearDocument') as HTMLButtonElement | null;
    this.historyRetention = document.getElementById('historyRetention') as HTMLSelectElement | null;
    this.clearHistoryButton = document.getElementById('clearDocumentHistory') as HTMLButtonElement | null;
    this.historyList = document.getElementById('documentHistoryList');
    this.targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement | null;
    this.translationProvider = document.getElementById('translationProvider') as HTMLSelectElement | null;
    this.displayMode = document.getElementById('displayMode') as HTMLSelectElement | null;
    this.ocrLanguage = document.getElementById('ocrLanguage') as HTMLSelectElement | null;
    this.message = document.getElementById('documentMessage');
    this.progressBar = document.getElementById('progressBar');
    this.progressText = document.getElementById('progressText');
    this.resultsContainer = document.getElementById('translationResults');
    this.pdfViewer = document.getElementById('pdfViewer');
    this.batchFileInput = document.getElementById('batchDocumentFiles') as HTMLInputElement | null;
    this.batchConcurrency = document.getElementById('batchConcurrency') as HTMLSelectElement | null;
    this.batchStartButton = document.getElementById('startDocumentBatch') as HTMLButtonElement | null;
    this.batchCancelButton = document.getElementById('cancelDocumentBatch') as HTMLButtonElement | null;
    this.batchRetryButton = document.getElementById('retryDocumentBatch') as HTMLButtonElement | null;
    this.batchDownloadButton = document.getElementById('downloadDocumentBatch') as HTMLButtonElement | null;
    this.batchClearButton = document.getElementById('clearDocumentBatch') as HTMLButtonElement | null;
    this.batchSummary = document.getElementById('batchDocumentSummary');
    this.batchMessage = document.getElementById('batchDocumentMessage');
    this.batchQueue = document.getElementById('batchDocumentQueue');

    this.populateControls();
    await this.loadProviderConfigurations();
    await this.loadSettings();
    this.applySourceUrl();
    this.bindEvents();
    this.renderResults([]);
    this.updateExportButtons();
    this.renderBatchQueue(null);
    await this.loadDocumentHistory();
  }

  private populateControls(): void {
    if (this.targetLanguage) {
      this.targetLanguage.replaceChildren(
        ...TRANSLATION_LANGUAGES.map(language => {
          const option = document.createElement('option');
          option.value = language.code;
          option.textContent = language.label;
          return option;
        })
      );
    }

    if (this.translationProvider) {
      this.translationProvider.replaceChildren(
        ...AVAILABLE_TRANSLATION_PROVIDERS.map(provider => {
          const option = document.createElement('option');
          option.value = provider.id;
          option.textContent = provider.label;
          return option;
        })
      );
    }

    if (this.ocrLanguage) {
      this.ocrLanguage.replaceChildren(
        ...BUNDLED_OCR_LANGUAGES.map(language => {
          const option = document.createElement('option');
          option.value = language.code;
          option.textContent = language.label;
          return option;
        })
      );
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getSettings' });
      const settings = response?.success ? response.data as UserSettings : {};

      if (this.targetLanguage) {
        this.targetLanguage.value = settings.defaultTargetLanguage || 'zh-CN';
      }

      if (this.translationProvider) {
        this.translationProvider.value = settings.translationProvider || 'google';
      }

      if (this.displayMode) {
        this.displayMode.value = settings.pageTranslationDisplayMode || 'bilingual';
      }

      if (this.ocrLanguage) {
        this.ocrLanguage.value = settings.documentOcrLanguage || 'eng';
      }
      this.updateTargetLanguageAvailability();
    } catch (error) {
      this.showMessage('Could not load settings. Using defaults.', 'error');
    }
  }

  private async loadProviderConfigurations(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getTranslationProviderConfigs' });
      const summaries = response?.success && Array.isArray(response.data)
        ? response.data as ProviderConfigSummary[]
        : [];
      this.providerTargetLanguages = new Map(
        summaries
          .filter(summary => Array.isArray(summary.supportedTargetLanguages))
          .map(summary => [summary.providerId, summary.supportedTargetLanguages!])
      );
    } catch {
      this.providerTargetLanguages.clear();
    }
  }

  private applySourceUrl(): void {
    const sourceUrl = new URLSearchParams(window.location.search).get('sourceUrl') || '';
    this.loadedSourceUrl = sourceUrl;
    this.setSourceUrlInfo(sourceUrl);
  }

  private setSourceUrlInfo(sourceUrl: string): void {
    const sourceUrlInfo = document.getElementById('sourceUrlInfo');
    if (!sourceUrlInfo) return;

    sourceUrlInfo.hidden = !sourceUrl;
    sourceUrlInfo.textContent = sourceUrl;
  }

  private bindEvents(): void {
    this.fileInput?.addEventListener('change', () => this.loadSelectedFile());
    this.translateButton?.addEventListener('click', () => this.translateDocument());
    this.exportSubtitleButton?.addEventListener('click', () => this.exportTranslatedSubtitles());
    this.exportJsonButton?.addEventListener('click', () => this.exportTranslatedJson());
    this.exportDocxButton?.addEventListener('click', () => void this.exportTranslatedDocx());
    this.exportEpubButton?.addEventListener('click', () => void this.exportTranslatedEpub());
    this.exportPdfButton?.addEventListener('click', () => void this.exportTranslatedPdf());
    this.exportTextButton?.addEventListener('click', () => this.exportTranslatedText());
    this.exportResearchNoteButton?.addEventListener('click', () => this.exportResearchNote());
    this.exportBabelDocGuideButton?.addEventListener('click', () => this.exportBabelDocGuide());
    this.saveHistoryButton?.addEventListener('click', () => void this.saveDocumentHistory());
    this.clearButton?.addEventListener('click', () => this.clearDocument());
    this.historyRetention?.addEventListener('change', () => void this.changeHistoryRetention());
    this.clearHistoryButton?.addEventListener('click', () => void this.clearDocumentHistory());
    this.historyList?.addEventListener('click', event => void this.handleHistoryAction(event));
    this.displayMode?.addEventListener('change', () => this.applyDisplayMode());
    this.ocrLanguage?.addEventListener('change', () => void this.handleOcrLanguageChange());
    this.translationProvider?.addEventListener('change', () => this.updateTargetLanguageAvailability());
    this.batchFileInput?.addEventListener('change', () => this.loadBatchFiles());
    this.batchConcurrency?.addEventListener('change', () => this.rebuildPendingBatch());
    this.batchStartButton?.addEventListener('click', () => void this.startDocumentBatch());
    this.batchCancelButton?.addEventListener('click', () => this.cancelDocumentBatch());
    this.batchRetryButton?.addEventListener('click', () => this.retryFailedBatchFiles());
    this.batchDownloadButton?.addEventListener('click', () => this.downloadDocumentBatch());
    this.batchClearButton?.addEventListener('click', () => this.clearDocumentBatch());

    const openOptions = document.getElementById('openOptions');
    openOptions?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  private async loadSelectedFile(): Promise<void> {
    const file = this.fileInput?.files?.[0];
    if (!file || !this.sourceText) return;

    try {
      this.setBusy(true);
      this.hasExplicitlyLoadedPdf = false;
      this.updateBabelDocGuideExportButton(true);
      await this.disposePdfSession();
      this.applySourceUrl();
      const isJsonDocument = this.isJsonDocumentFile(file);
      const isDocxDocument = this.isDocxDocumentFile(file);
      const isEpubDocument = this.isEpubDocumentFile(file);
      const isMobiDocument = this.isMobiDocumentFile(file);
      const isPdfDocument = this.isPdfDocumentFile(file);
      const rawText = isDocxDocument || isEpubDocument || isMobiDocument || isPdfDocument
        ? ''
        : await file.text();
      const rawBytes = isDocxDocument || isEpubDocument || isMobiDocument || isPdfDocument
        ? new Uint8Array(await file.arrayBuffer())
        : null;
      let blocks: DocumentBlock[];
      let usedPdfFallback = false;

      if (isPdfDocument && rawBytes) {
        try {
          this.pdfSession = await pdfDocumentService.open(rawBytes, {
            ocrLanguage: this.getOcrLanguage(),
            onOcrProgress: progress => this.showOcrProgress(file.name, progress)
          });
          this.pdfAnalysis = await this.pdfSession.analyze();
          blocks = this.pdfAnalysis.blocks;
          await this.renderPdfPreview();
        } catch {
          await this.disposePdfSession();
          blocks = await DocumentTextExtractor.extractBlocksFromFile(file);
          usedPdfFallback = true;
        }
      } else if (isJsonDocument) {
        blocks = DocumentTextExtractor.extractBlocksFromJson(rawText);
      } else if (isDocxDocument) {
        blocks = await DocumentTextExtractor.extractBlocksFromDocxBytes(rawBytes!);
      } else if (isEpubDocument) {
        blocks = await DocumentTextExtractor.extractBlocksFromEpubBytes(rawBytes!);
      } else if (isMobiDocument) {
        blocks = await DocumentTextExtractor.extractBlocksFromMobiBytes(
          rawBytes!,
          file.name.toLowerCase().endsWith('.azw3') ? 'kf8' : 'mobi'
        );
      } else {
        blocks = await DocumentTextExtractor.extractBlocksFromFile(file);
      }

      const text = blocks.map(block => block.originalText).join('\n\n');

      if (!text.trim()) {
        this.loadedDocumentBlocks = blocks;
        this.loadedSourceText = '';
        this.loadedRawFileText = '';
        this.loadedRawFileBytes = rawBytes;
        this.loadedFileName = file.name;
        this.loadedSourceKind = this.getDocumentHistorySourceKind(file.name);
        this.hasExplicitlyLoadedPdf = isPdfDocument && Boolean(rawBytes);
        this.currentResults = [];
        this.sourceText.value = '';
        this.renderResults([]);
        this.updateExportButtons();
        this.showMessage(
          this.pdfAnalysis
            ? this.createPdfLoadedMessage(file.name, this.pdfAnalysis)
            : 'No selectable text was found in this document.',
          'error'
        );
        return;
      }

      this.loadedDocumentBlocks = blocks;
      this.loadedSourceText = text;
      this.loadedRawFileText = rawText;
      this.loadedRawFileBytes = rawBytes;
      this.loadedFileName = file.name;
      this.loadedSourceKind = this.getDocumentHistorySourceKind(file.name);
      this.hasExplicitlyLoadedPdf = isPdfDocument && Boolean(rawBytes);
      this.currentResults = [];
      this.sourceText.value = text;
      const hasLayout = blocks.some(block => block.layout);
      this.showMessage(
        this.pdfAnalysis
          ? this.createPdfLoadedMessage(file.name, this.pdfAnalysis)
          : `${file.name} loaded${hasLayout ? ` with PDF layout blocks${usedPdfFallback ? ' (compatibility mode)' : ''}` : ''}`
      );
      this.updateProgress(0, 0);
      this.renderResults([]);
      this.updateExportButtons();
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not load the document.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  private async translateDocument(): Promise<void> {
    const text = this.sourceText?.value.trim() || '';
    if (!text) {
      this.showMessage('Add document text first.', 'error');
      return;
    }

    const blocks = this.getCurrentDocumentBlocks(text);
    if (blocks.length === 0) {
      this.showMessage('No translatable document blocks found.', 'error');
      return;
    }

    const results: TranslationResult[] = [];
    this.currentResults = results;
    this.renderResults(results);
    this.renderPdfTranslationOverlays();
    this.updateExportButtons();
    this.setBusy(true);
    this.updateProgress(0, blocks.length);
    this.showMessage(`Translating ${blocks.length} blocks`);

    try {
      for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        const block = blocks[blockIndex]!;
        if (block.layout?.contentKind === 'formula') {
          results.push({
            block,
            translatedText: block.originalText,
            preservedOriginal: true
          });
        } else {
          const translatedText = await this.translateBlock(
            block.originalText,
            this.createDocumentContext(blocks, blockIndex)
          );
          results.push({ block, translatedText });
        }
        this.currentResults = results;
        this.renderResults(results);
        this.renderPdfTranslationOverlays();
        this.updateExportButtons();
        this.updateProgress(results.length, blocks.length);
      }

      const preservedFormulaCount = results.filter(result => result.preservedOriginal).length;
      const translatedBlockCount = results.length - preservedFormulaCount;
      this.showMessage(
        preservedFormulaCount > 0
          ? `Translated ${translatedBlockCount} blocks and preserved ${preservedFormulaCount} formulas`
          : `Translated ${translatedBlockCount} blocks`
      );
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Document translation failed.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  private async translateBlock(text: string, context?: string): Promise<string> {
    const response = await this.sendMessage({
      action: 'translate',
      data: {
        text,
        context,
        targetLang: this.targetLanguage?.value || 'zh-CN',
        provider: this.translationProvider?.value || 'google'
      }
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Document translation failed.');
    }

    return response.data.translatedText;
  }

  private loadBatchFiles(): void {
    if (this.isBusy) return;
    if (this.batchService?.getSnapshot().isDraining) {
      this.showBatchMessage('Wait for cancelled file cleanup before replacing the queue.', 'error');
      return;
    }
    const files = Array.from(this.batchFileInput?.files || []);
    if (files.length === 0) return;

    try {
      if (files.length > DOCUMENT_BATCH_ARCHIVE_MAX_FILES) {
        throw new RangeError(`Choose no more than ${DOCUMENT_BATCH_ARCHIVE_MAX_FILES} files.`);
      }

      let totalBytes = 0;
      files.forEach(file => {
        if (!this.isSupportedDocumentFile(file)) {
          throw new Error(`${file.name} is not a supported document type.`);
        }
        if (file.size > DOCUMENT_BATCH_MAX_SOURCE_BYTES) {
          throw new RangeError(`${file.name} exceeds the 64 MiB per-file limit.`);
        }
        totalBytes += file.size;
      });
      if (totalBytes > DOCUMENT_BATCH_ARCHIVE_MAX_TOTAL_BYTES) {
        throw new RangeError('The selected files exceed the 128 MiB batch limit.');
      }

      this.batchInputs = files.map(file => {
        const input = { id: `batch-file-${this.batchFileSequence}`, file };
        this.batchFileSequence += 1;
        return input;
      });
      this.batchProgress.clear();
      this.resetBatchService();
      this.showBatchMessage(`${files.length} files queued. Start the batch when ready.`);
    } catch (error) {
      if (this.batchFileInput) this.batchFileInput.value = '';
      this.showBatchMessage(
        error instanceof Error ? error.message : 'Could not create the document queue.',
        'error'
      );
    }
  }

  private rebuildPendingBatch(): void {
    if (this.isBusy || this.batchInputs.length === 0) return;
    const snapshot = this.batchService?.getSnapshot();
    if (snapshot?.tasks.some(task => task.status !== 'pending')) {
      if (this.batchConcurrency) this.batchConcurrency.value = String(snapshot.concurrency);
      return;
    }
    this.resetBatchService();
  }

  private resetBatchService(): void {
    this.unsubscribeBatch?.();
    this.unsubscribeBatch = null;
    this.batchService = null;

    if (this.batchInputs.length === 0) {
      this.renderBatchQueue(null);
      return;
    }

    const service = new DocumentBatchService<BatchDocumentInput, DocumentBatchTranslationOutput>(
      (input, signal) => this.translateBatchFile(input, signal),
      {
        concurrency: this.getBatchConcurrency(),
        initialInputs: this.batchInputs
      }
    );
    this.batchService = service;
    this.unsubscribeBatch = service.subscribe(snapshot => this.renderBatchQueue(snapshot));
  }

  private async startDocumentBatch(): Promise<void> {
    const service = this.batchService;
    if (this.isBusy || !service) return;
    const before = service.getSnapshot();
    if (before.pendingCount === 0) {
      this.showBatchMessage('Queue files or requeue failed files before starting.', 'error');
      return;
    }

    this.activeBatchSettings = {
      provider: this.translationProvider?.value || 'google',
      targetLanguage: this.targetLanguage?.value || 'zh-CN',
      ocrLanguage: this.getOcrLanguage(),
      runId: `${Date.now()}-${this.batchRunSequence}`
    };
    this.batchRunSequence += 1;
    this.batchIsRunning = true;
    this.setBusy(true);
    this.showBatchMessage(`Translating ${before.pendingCount} queued files`);

    try {
      const finalSnapshot = await service.start();
      if (finalSnapshot.cancelledCount > 0) {
        this.showBatchMessage(
          finalSnapshot.isDraining
            ? `Batch cancelled. Waiting for ${finalSnapshot.drainingCount} active files to finish cleanup.`
            : 'Batch cancelled. Running requests were stopped.'
        );
      } else if (finalSnapshot.failedCount > 0) {
        this.showBatchMessage(
          `${finalSnapshot.completedCount} files completed; ${finalSnapshot.failedCount} failed.`,
          'error'
        );
      } else {
        this.showBatchMessage(`${finalSnapshot.completedCount} files translated.`);
      }
    } finally {
      this.batchIsRunning = false;
      this.activeBatchSettings = null;
      this.setBusy(false);
      this.renderBatchQueue(service.getSnapshot());
    }
  }

  private cancelDocumentBatch(): void {
    if (!this.batchIsRunning || !this.batchService) return;
    this.batchService.cancel();
    this.showBatchMessage('Cancelling active document translations');
  }

  private retryFailedBatchFiles(): void {
    if (this.isBusy || !this.batchService) return;
    const failedIds = this.batchService.getSnapshot().tasks
      .filter(task => task.status === 'failed')
      .map(task => task.input.id);
    if (failedIds.length === 0) return;

    failedIds.forEach(id => this.batchProgress.delete(id));
    const snapshot = this.batchService.retryFailed();
    this.renderBatchQueue(snapshot);
    this.showBatchMessage(`${failedIds.length} failed files requeued. Start the batch when ready.`);
  }

  private downloadDocumentBatch(): void {
    if (this.isBusy || !this.batchService) return;
    const snapshot = this.batchService.getSnapshot();
    if (
      snapshot.cancelledCount > 0
      || snapshot.failedCount > 0
      || snapshot.pendingCount > 0
      || snapshot.runningCount > 0
      || snapshot.isDraining
    ) {
      this.showBatchMessage('Finish or clear the current queue before downloading.', 'error');
      return;
    }

    const files = snapshot.tasks.flatMap(task => (
      task.status === 'completed' && task.output
        ? [{ fileName: task.output.fileName, bytes: task.output.bytes }]
        : []
    ));
    if (files.length === 0) {
      this.showBatchMessage('No completed files are available to download.', 'error');
      return;
    }

    try {
      const archive = createDocumentBatchArchive(files);
      this.downloadBinaryFile(archive, 'translated-documents.zip', 'application/zip');
      this.showBatchMessage(`Downloaded ${files.length} translated files.`);
    } catch (error) {
      this.showBatchMessage(
        error instanceof Error ? error.message : 'Could not create the translated document archive.',
        'error'
      );
    }
  }

  private clearDocumentBatch(): void {
    if (this.isBusy) return;
    if (this.batchService?.getSnapshot().isDraining) {
      this.showBatchMessage('Wait for cancelled file cleanup before clearing the queue.', 'error');
      return;
    }
    this.unsubscribeBatch?.();
    this.unsubscribeBatch = null;
    this.batchService = null;
    this.batchInputs = [];
    this.batchProgress.clear();
    if (this.batchFileInput) this.batchFileInput.value = '';
    this.renderBatchQueue(null);
    this.showBatchMessage('');
  }

  private async translateBatchFile(
    input: BatchDocumentInput,
    signal: AbortSignal
  ): Promise<DocumentBatchTranslationOutput> {
    const settings = this.activeBatchSettings;
    if (!settings) throw new Error('Batch translation settings are unavailable.');

    return documentBatchTranslator.translateFile(input.file, {
      provider: settings.provider,
      targetLanguage: settings.targetLanguage,
      ocrLanguage: settings.ocrLanguage,
      requestIdPrefix: `document-batch:${settings.runId}:${input.id}`,
      signal,
      translateText: (text, context, requestId, requestSignal) => this.translateBatchBlock(
        text,
        context,
        requestId,
        requestSignal,
        settings
      ),
      onProgress: progress => {
        this.batchProgress.set(input.id, progress);
        this.renderBatchQueue(this.batchService?.getSnapshot() || null);
      }
    });
  }

  private async translateBatchBlock(
    text: string,
    context: string,
    requestId: string,
    signal: AbortSignal,
    settings: BatchTranslationSettings
  ): Promise<string> {
    this.throwIfBatchAborted(signal);
    const cancelRequest = (): void => {
      void this.sendMessage({
        action: 'cancelTranslationRequest',
        data: { requestId }
      }).catch(() => undefined);
    };
    signal.addEventListener('abort', cancelRequest, { once: true });

    try {
      const response = await this.sendMessage({
        action: 'translate',
        data: {
          text,
          context,
          targetLang: settings.targetLanguage,
          provider: settings.provider,
          requestId
        }
      });
      this.throwIfBatchAborted(signal);
      if (!response?.success) {
        throw new Error(response?.error || 'Document translation failed.');
      }
      return response.data.translatedText;
    } finally {
      signal.removeEventListener('abort', cancelRequest);
    }
  }

  private renderBatchQueue(
    snapshot: DocumentBatchSnapshot<BatchDocumentInput, DocumentBatchTranslationOutput> | null
  ): void {
    if (this.batchQueue) {
      this.batchQueue.replaceChildren();
      for (const task of snapshot?.tasks || []) {
        const item = document.createElement('article');
        item.className = `batch-item batch-item--${task.status}`;

        const name = document.createElement('p');
        name.className = 'batch-item-name';
        name.textContent = task.input.file.name;

        const status = document.createElement('span');
        status.className = 'batch-item-status';
        status.textContent = this.getBatchStatusLabel(task.status);

        const detail = document.createElement('p');
        detail.className = 'batch-item-detail';
        const progress = this.batchProgress.get(task.input.id);
        detail.textContent = progress
          ? this.formatBatchProgress(progress)
          : this.formatFileSize(task.input.file.size);

        item.append(name, status, detail);
        if (task.status === 'failed') {
          const error = document.createElement('p');
          error.className = 'batch-item-error';
          error.textContent = task.error instanceof Error
            ? task.error.message
            : 'Translation failed.';
          item.appendChild(error);
        }
        this.batchQueue.appendChild(item);
      }
    }

    if (this.batchSummary) {
      this.batchSummary.textContent = snapshot
        ? `${snapshot.tasks.length} files: ${snapshot.pendingCount} waiting, ${snapshot.runningCount} running, ${snapshot.completedCount} completed, ${snapshot.failedCount} failed, ${snapshot.cancelledCount} cancelled${snapshot.drainingCount > 0 ? `, ${snapshot.drainingCount} cleaning up` : ''}`
        : 'No files queued';
    }
    this.updateBatchControls(snapshot);
  }

  private updateBatchControls(
    snapshot: DocumentBatchSnapshot<BatchDocumentInput, DocumentBatchTranslationOutput> | null = (
      this.batchService?.getSnapshot() || null
    )
  ): void {
    const taskCount = snapshot?.tasks.length || 0;
    const canDownload = Boolean(
      snapshot
      && snapshot.completedCount > 0
      && snapshot.pendingCount === 0
      && snapshot.runningCount === 0
      && snapshot.failedCount === 0
      && snapshot.cancelledCount === 0
      && !snapshot.isDraining
    );
    const isDraining = Boolean(snapshot?.isDraining);
    if (this.batchFileInput) this.batchFileInput.disabled = this.isBusy || isDraining;
    if (this.batchConcurrency) {
      const hasSettledTasks = Boolean(snapshot?.tasks.some(task => task.status !== 'pending'));
      this.batchConcurrency.disabled = this.isBusy || isDraining || hasSettledTasks;
    }
    if (this.batchStartButton) {
      this.batchStartButton.disabled = this.isBusy
        || isDraining
        || !snapshot
        || snapshot.pendingCount === 0;
    }
    if (this.batchCancelButton) this.batchCancelButton.disabled = !this.batchIsRunning;
    if (this.batchRetryButton) {
      this.batchRetryButton.disabled = this.isBusy
        || isDraining
        || !snapshot
        || snapshot.failedCount === 0;
    }
    if (this.batchDownloadButton) this.batchDownloadButton.disabled = this.isBusy || !canDownload;
    if (this.batchClearButton) {
      this.batchClearButton.disabled = this.isBusy || isDraining || taskCount === 0;
    }
  }

  private getBatchConcurrency(): number {
    const concurrency = Number(this.batchConcurrency?.value || 2);
    return concurrency === 1 || concurrency === 3 ? concurrency : 2;
  }

  private getBatchStatusLabel(status: string): string {
    switch (status) {
      case 'pending': return 'Waiting';
      case 'running': return 'Translating';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  }

  private formatBatchProgress(progress: DocumentBatchTranslationProgress): string {
    if (progress.ocr) {
      const percent = Math.round(Math.max(0, Math.min(1, progress.ocr.progress)) * 100);
      return `OCR page ${progress.ocr.pageNumber}: ${progress.ocr.status} ${percent}%`;
    }
    return progress.totalBlocks > 0
      ? `${progress.completedBlocks}/${progress.totalBlocks} blocks`
      : 'Preparing document';
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  private showBatchMessage(message: string, type: 'info' | 'error' = 'info'): void {
    if (!this.batchMessage) return;
    this.batchMessage.textContent = message;
    this.batchMessage.classList.toggle('error', type === 'error');
  }

  private throwIfBatchAborted(signal: AbortSignal): void {
    if (!signal.aborted) return;
    if (typeof DOMException !== 'undefined') {
      throw new DOMException('Document batch translation was cancelled', 'AbortError');
    }
    const error = new Error('Document batch translation was cancelled');
    error.name = 'AbortError';
    throw error;
  }

  private createDocumentContext(blocks: DocumentBlock[], blockIndex: number): string {
    return blocks
      .slice(Math.max(0, blockIndex - 2), Math.min(blocks.length, blockIndex + 3))
      .filter(block => block.layout?.contentKind !== 'formula')
      .map(block => block.originalText.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000);
  }

  private renderResults(results: TranslationResult[]): void {
    if (!this.resultsContainer) return;

    this.resultsContainer.replaceChildren();

    if (results.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'result-empty';
      empty.textContent = 'No translated document blocks yet.';
      this.resultsContainer.appendChild(empty);
      return;
    }

    for (const result of results) {
      const block = document.createElement('article');
      block.className = 'document-result-block';
      if (result.block.layout) {
        block.classList.add('document-result-block--layout');
        block.dataset['page'] = String(result.block.layout.pageNumber);
      }
      if (result.preservedOriginal) {
        block.classList.add('document-result-block--formula');
      }

      const index = document.createElement('div');
      index.className = 'block-index';
      index.textContent = this.getBlockLabel(result.block);

      const original = document.createElement('div');
      original.className = 'document-original';
      original.textContent = result.block.originalText;

      const translation = document.createElement('div');
      translation.className = 'document-translation';
      translation.textContent = result.translatedText;
      translation.setAttribute('role', 'textbox');
      translation.setAttribute('aria-label', `Translation for ${this.getBlockLabel(result.block)}`);
      translation.contentEditable = result.preservedOriginal ? 'false' : 'plaintext-only';
      translation.spellcheck = false;
      if (!result.preservedOriginal) {
        translation.addEventListener('input', () => {
          result.translatedText = this.readEditableTranslation(translation);
          this.renderPdfTranslationOverlays();
          this.updateExportButtons();
        });
      }

      block.append(index, original, translation);
      this.resultsContainer.appendChild(block);
    }

    this.applyDisplayMode();
  }

  private readEditableTranslation(element: HTMLElement): string {
    const text = typeof element.innerText === 'string'
      ? element.innerText
      : element.textContent || '';
    return text.replace(/\r\n?/g, '\n');
  }

  private exportTranslatedSubtitles(): void {
    const subtitleResults = this.currentResults.filter(result => (
      (result.block.subtitle || result.block.ass) && result.translatedText.trim()
    ));
    if (subtitleResults.length === 0) {
      this.showMessage('Translate a subtitle file before exporting.', 'error');
      return;
    }

    const firstBlock = subtitleResults[0]!.block;
    const assFormat = firstBlock.ass?.format;
    const format = assFormat || firstBlock.subtitle!.format;
    if (assFormat && !this.loadedRawFileText) {
      this.showMessage('The original ASS/SSA script is unavailable for export.', 'error');
      return;
    }

    const content = assFormat
      ? DocumentTextExtractor.rewriteAssWithTranslations(this.loadedRawFileText, subtitleResults)
      : this.loadedRawFileText
        ? DocumentTextExtractor.rewriteTimedSubtitleWithTranslations(
          this.loadedRawFileText,
          subtitleResults
        )
        : this.renderTranslatedSubtitleFile(subtitleResults, format as 'srt' | 'vtt');
    const extension = format;
    const filename = this.createSubtitleExportFilename(extension);

    this.downloadTextFile(content, filename, `text/${format === 'vtt' ? 'vtt' : 'plain'};charset=utf-8`);
    this.showMessage(`Exported ${subtitleResults.length} translated subtitle cues`);
  }

  private exportTranslatedJson(): void {
    const jsonResults = this.currentResults.filter(result => result.block.json && result.translatedText.trim());
    if (!this.loadedRawFileText || jsonResults.length === 0) {
      this.showMessage('Translate a JSON file before exporting.', 'error');
      return;
    }

    try {
      const content = DocumentTextExtractor.rewriteJsonWithTranslations(this.loadedRawFileText, jsonResults);
      this.downloadTextFile(content, this.createJsonExportFilename(), 'application/json;charset=utf-8');
      this.showMessage(`Exported translated JSON with ${jsonResults.length} string values`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not export translated JSON.', 'error');
    }
  }

  private async exportTranslatedDocx(): Promise<void> {
    const docxResults = this.currentResults.filter(result => result.block.docx && result.translatedText.trim());
    if (!this.loadedRawFileBytes || docxResults.length === 0) {
      this.showMessage('Translate a DOCX file before exporting.', 'error');
      return;
    }

    try {
      const content = await DocumentTextExtractor.rewriteDocxWithTranslations(this.loadedRawFileBytes, docxResults);
      this.downloadBinaryFile(
        content,
        this.createDocxExportFilename(),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      this.showMessage(`Exported translated DOCX with ${docxResults.length} paragraphs`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not export translated DOCX.', 'error');
    }
  }

  private async exportTranslatedEpub(): Promise<void> {
    const epubResults = this.currentResults.filter(result => result.block.epub && result.translatedText.trim());
    if (!this.loadedRawFileBytes || epubResults.length === 0) {
      this.showMessage('Translate an EPUB file before exporting.', 'error');
      return;
    }

    try {
      const content = await DocumentTextExtractor.rewriteEpubWithTranslations(this.loadedRawFileBytes, epubResults);
      this.downloadBinaryFile(content, this.createEpubExportFilename(), 'application/epub+zip');
      this.showMessage(`Exported translated EPUB with ${epubResults.length} blocks`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not export translated EPUB.', 'error');
    }
  }

  private async exportTranslatedPdf(): Promise<void> {
    const hasUnpositionedPdfText = this.currentResults.some(result => (
      !result.block.layout && result.translatedText.trim()
    ));
    const pdfResults = this.currentResults.filter(result => (
      result.block.layout
      && result.block.layout.contentKind !== 'formula'
      && result.translatedText.trim()
    ));
    if (hasUnpositionedPdfText) {
      this.showMessage('PDF export is unavailable after adding text without source geometry.', 'error');
      return;
    }
    if (!this.pdfSession || pdfResults.length === 0) {
      this.showMessage('Translate a PDF before exporting.', 'error');
      return;
    }

    try {
      this.setBusy(true);
      this.showMessage('Rendering translated PDF pages');
      const content = await this.pdfSession.exportTranslatedPdf(pdfResults);
      this.downloadBinaryFile(content, this.createPdfExportFilename(), 'application/pdf');
      this.showMessage(`Exported translated PDF with ${pdfResults.length} positioned blocks`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not export translated PDF.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  private exportTranslatedText(): void {
    const results = this.currentResults.filter(result => result.translatedText.trim());
    if (results.length === 0) {
      this.showMessage('Translate document text before exporting.', 'error');
      return;
    }

    const content = `${results.map(result => result.translatedText.trim()).join('\n\n')}\n`;
    this.downloadTextFile(
      content,
      this.createTextExportFilename(),
      'text/plain;charset=utf-8'
    );
    this.showMessage(`Exported ${results.length} translated text blocks`);
  }

  private exportResearchNote(): void {
    const results = this.currentResults.filter(result => (
      result.block.originalText.trim() || result.translatedText.trim()
    ));
    if (results.length === 0) {
      this.showMessage('Translate document text before exporting a research note.', 'error');
      return;
    }

    try {
      const handoff = createAcademicDocumentHandoff({
        title: this.loadedFileName || 'Bilingual research note',
        sourceName: this.loadedFileName || 'Pasted document',
        sourceUrl: this.loadedSourceUrl,
        provider: this.translationProvider?.value || 'google',
        targetLanguage: this.targetLanguage?.value || 'zh-CN',
        exportedAt: new Date().toISOString(),
        blocks: results.map(result => ({
          label: this.getBlockLabel(result.block),
          originalText: result.block.originalText,
          translatedText: result.translatedText
        }))
      });
      this.downloadTextFile(handoff.content, handoff.filename, 'text/markdown;charset=utf-8');
      this.showMessage(`Exported a bilingual research note with ${handoff.blockCount} blocks`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not export the research note.', 'error');
    }
  }

  private exportBabelDocGuide(): void {
    if (
      !this.hasExplicitlyLoadedPdf
      || !this.loadedRawFileBytes
      || !this.isPdfFileName(this.loadedFileName)
    ) {
      this.showMessage('Load a PDF before exporting a BabelDOC guide.', 'error');
      return;
    }

    try {
      const workflow = createBabelDocWorkflow({
        sourceFileName: this.loadedFileName,
        sourceLanguage: 'auto',
        targetLanguage: this.targetLanguage?.value || 'zh-CN'
      });
      this.downloadTextFile(workflow.content, workflow.filename, 'text/markdown;charset=utf-8');
      this.showMessage(`Exported a local BabelDOC guide for ${workflow.sourceFileName}`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not export the BabelDOC guide.', 'error');
    }
  }

  private renderTranslatedSubtitleFile(results: TranslationResult[], format: 'srt' | 'vtt'): string {
    const cues = results.map((result, index) => {
      const cue = result.block.subtitle!;
      const translatedText = result.translatedText.trim();

      if (format === 'vtt') {
        return [
          cue.identifier,
          cue.timing,
          translatedText
        ].filter(Boolean).join('\n');
      }

      return [
        cue.index || String(index + 1),
        cue.timing,
        translatedText
      ].join('\n');
    });

    return format === 'vtt'
      ? `WEBVTT\n\n${cues.join('\n\n')}\n`
      : `${cues.join('\n\n')}\n`;
  }

  private createSubtitleExportFilename(extension: 'srt' | 'vtt' | 'ass' | 'ssa'): string {
    const baseName = (this.loadedFileName || 'translated-subtitles')
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'translated-subtitles';

    return `${baseName}.translated.${extension}`;
  }

  private createJsonExportFilename(): string {
    const baseName = (this.loadedFileName || 'translated-document')
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'translated-document';

    return `${baseName}.translated.json`;
  }

  private createDocxExportFilename(): string {
    const baseName = (this.loadedFileName || 'translated-document')
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'translated-document';

    return `${baseName}.translated.docx`;
  }

  private createEpubExportFilename(): string {
    const baseName = (this.loadedFileName || 'translated-document')
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'translated-document';

    return `${baseName}.translated.epub`;
  }

  private createPdfExportFilename(): string {
    const baseName = (this.loadedFileName || 'translated-document')
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'translated-document';

    return `${baseName}.translated.pdf`;
  }

  private createTextExportFilename(): string {
    const baseName = (this.loadedFileName || 'translated-document')
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'translated-document';
    return `${baseName}.translated.txt`;
  }

  private async renderPdfPreview(): Promise<void> {
    if (!this.pdfViewer || !this.pdfSession || !this.pdfAnalysis) return;

    this.pdfViewer.replaceChildren();
    this.pdfPageViews.clear();
    this.pdfViewer.hidden = false;

    for (const summary of this.pdfAnalysis.pages) {
      const row = document.createElement('article');
      row.className = 'pdf-page-row';
      row.dataset['page'] = String(summary.pageNumber);

      const originalPanel = this.createPdfPagePanel(`Page ${summary.pageNumber} original`);
      const translatedPanel = this.createPdfPagePanel(`Page ${summary.pageNumber} translated`);
      const originalCanvas = originalPanel.querySelector('canvas') as HTMLCanvasElement;
      const translatedCanvas = translatedPanel.querySelector('canvas') as HTMLCanvasElement;
      const translationLayer = translatedPanel.querySelector('.pdf-translation-layer') as HTMLElement;

      row.append(originalPanel, translatedPanel);
      this.pdfViewer.appendChild(row);
      await this.pdfSession.renderPage(summary.pageNumber, originalCanvas);
      translatedCanvas.width = originalCanvas.width;
      translatedCanvas.height = originalCanvas.height;
      const translatedContext = typeof CanvasRenderingContext2D !== 'undefined'
        ? translatedCanvas.getContext('2d', { alpha: false })
        : null;
      if (translatedContext) {
        translatedContext.drawImage(originalCanvas, 0, 0);
      } else {
        await this.pdfSession.renderPage(summary.pageNumber, translatedCanvas);
      }

      this.pdfPageViews.set(summary.pageNumber, {
        summary,
        row,
        originalPanel,
        translatedPanel,
        originalCanvas,
        translatedCanvas,
        translationLayer
      });
    }

    this.renderPdfTranslationOverlays();
    this.applyDisplayMode();
  }

  private createPdfPagePanel(labelText: string): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'pdf-page-panel';

    const label = document.createElement('span');
    label.className = 'pdf-page-label';
    label.textContent = labelText;

    const surface = document.createElement('div');
    surface.className = 'pdf-page-surface';
    const canvas = document.createElement('canvas');
    const translationLayer = document.createElement('div');
    translationLayer.className = 'pdf-translation-layer';
    surface.append(canvas, translationLayer);
    panel.append(label, surface);
    return panel;
  }

  private renderPdfTranslationOverlays(): void {
    for (const view of this.pdfPageViews.values()) {
      view.translationLayer.replaceChildren();
      const pageResults = this.currentResults.filter(result => (
        result.block.layout?.pageNumber === view.summary.pageNumber
        && result.block.layout.contentKind !== 'formula'
        && result.translatedText.trim()
      ));

      for (const result of pageResults) {
        const layout = result.block.layout!;
        const pageWidth = layout.pageWidth || view.summary.width;
        const pageHeight = layout.pageHeight || view.summary.height;
        const left = Math.max(0, Math.min(99, (layout.x / pageWidth) * 100));
        const top = Math.max(0, Math.min(99, (layout.y / pageHeight) * 100));
        const sourceWidth = Math.max(4, (layout.width / pageWidth) * 100);
        const regionRight = Math.min(
          pageWidth,
          (layout.regionX ?? 0) + (layout.regionWidth ?? pageWidth)
        );
        const isColumnLayout = (layout.columnCount || 1) > 1;
        const regionAvailableWidth = Math.max(1, ((regionRight - layout.x) / pageWidth) * 100);
        const availableWidth = isColumnLayout
          ? regionAvailableWidth
          : Math.max(sourceWidth, regionAvailableWidth);
        const preferredWidth = isColumnLayout
          ? availableWidth
          : Math.max(sourceWidth, Math.min(52, 100 - left));
        const width = Math.min(100 - left, availableWidth, preferredWidth);
        const minimumHeight = Math.max(1.4, (layout.height / pageHeight) * 100);
        const overlay = document.createElement('div');
        overlay.className = 'pdf-translation-overlay';
        overlay.dataset['source'] = layout.source;
        overlay.textContent = result.translatedText.trim();
        overlay.style.left = `${left}%`;
        if (top > 86) {
          overlay.style.top = `${Math.min(99, top + minimumHeight)}%`;
          overlay.style.transform = 'translateY(-100%)';
        } else {
          overlay.style.top = `${top}%`;
        }
        overlay.style.width = `${width}%`;
        overlay.style.minHeight = `${minimumHeight}%`;
        view.translationLayer.appendChild(overlay);
      }
    }

    this.applyPdfDisplayMode();
  }

  private getOcrLanguage(): BundledOcrLanguageCode {
    const selected = this.ocrLanguage?.value;
    return BUNDLED_OCR_LANGUAGES.some(language => language.code === selected)
      ? selected as BundledOcrLanguageCode
      : 'eng';
  }

  private updateTargetLanguageAvailability(): void {
    if (!this.targetLanguage) return;
    const providerId = this.translationProvider?.value || 'google';
    const supportedCodes = new Set(
      getProviderTargetLanguages(
        providerId,
        this.providerTargetLanguages.get(providerId)
      ).map(language => language.code)
    );
    Array.from(this.targetLanguage.options).forEach(option => {
      option.disabled = !supportedCodes.has(option.value);
    });
    if (!supportedCodes.has(this.targetLanguage.value)) {
      const fallback = supportedCodes.has('zh-CN')
        ? 'zh-CN'
        : Array.from(this.targetLanguage.options).find(option => !option.disabled)?.value;
      if (fallback) this.targetLanguage.value = fallback;
    }
  }

  private showOcrProgress(fileName: string, progress: PdfOcrProgress): void {
    const percent = Math.round(Math.max(0, Math.min(1, progress.progress)) * 100);
    const status = progress.status
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase());
    this.showMessage(`${fileName}: OCR page ${progress.pageNumber}, ${status} ${percent}%`);
  }

  private async handleOcrLanguageChange(): Promise<void> {
    const language = this.getOcrLanguage();
    try {
      await this.sendMessage({
        action: 'updateSettings',
        data: { documentOcrLanguage: language }
      });
    } catch {
      this.showMessage('Could not save the PDF OCR language.', 'error');
    }

    if (!this.loadedRawFileBytes || !this.isPdfFileName(this.loadedFileName)) return;

    const bytes = this.loadedRawFileBytes;
    const fileName = this.loadedFileName;
    try {
      this.setBusy(true);
      await this.disposePdfSession();
      this.pdfSession = await pdfDocumentService.open(bytes, {
        ocrLanguage: language,
        onOcrProgress: progress => this.showOcrProgress(fileName, progress)
      });
      this.pdfAnalysis = await this.pdfSession.analyze();
      const blocks = this.pdfAnalysis.blocks;
      const text = blocks.map(block => block.originalText).join('\n\n');
      this.loadedDocumentBlocks = blocks;
      this.loadedSourceText = text;
      this.currentResults = [];
      if (this.sourceText) this.sourceText.value = text;
      await this.renderPdfPreview();
      this.renderResults([]);
      this.updateProgress(0, 0);
      this.updateExportButtons();
      this.showMessage(
        this.createPdfLoadedMessage(fileName, this.pdfAnalysis),
        text.trim() ? 'info' : 'error'
      );
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not rerun PDF OCR.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  private createPdfLoadedMessage(fileName: string, analysis: PdfDocumentAnalysis): string {
    const parts = [
      `${fileName} loaded`,
      `${analysis.pages.length} page${analysis.pages.length === 1 ? '' : 's'}`,
      `${analysis.blocks.length} positioned block${analysis.blocks.length === 1 ? '' : 's'}`
    ];
    if (analysis.formulaBlockCount > 0) {
      parts.push(
        `${analysis.formulaBlockCount} preserved formula${analysis.formulaBlockCount === 1 ? '' : 's'}`
      );
    }
    if (analysis.multiColumnPageCount > 0) {
      parts.push(
        `${analysis.multiColumnPageCount} multi-column page${analysis.multiColumnPageCount === 1 ? '' : 's'}`
      );
    }
    const bundledOcrPageCount = analysis.bundledOcrPageCount || 0;
    const browserOcrPageCount = Math.max(0, analysis.ocrPageCount - bundledOcrPageCount);
    if (browserOcrPageCount > 0) {
      parts.push(`${browserOcrPageCount} browser OCR page${browserOcrPageCount === 1 ? '' : 's'}`);
    }
    if (bundledOcrPageCount > 0) {
      parts.push(`${bundledOcrPageCount} bundled OCR page${bundledOcrPageCount === 1 ? '' : 's'}`);
    }
    if (analysis.unreadablePageCount > 0) {
      parts.push(
        `${analysis.unreadablePageCount} page${analysis.unreadablePageCount === 1 ? '' : 's'} without detected text`
      );
    }
    return parts.join(', ');
  }

  private applyPdfDisplayMode(): void {
    const mode = (this.displayMode?.value || 'bilingual') as DisplayMode;

    for (const view of this.pdfPageViews.values()) {
      const hasTranslations = view.translationLayer.childElementCount > 0;
      const showOriginal = mode !== 'translation-only';
      const showTranslated = mode !== 'original-only' && (mode === 'translation-only' || hasTranslations);
      view.originalPanel.style.display = showOriginal ? 'block' : 'none';
      view.translatedPanel.style.display = showTranslated ? 'block' : 'none';
      view.row.classList.toggle('pdf-page-row--single', !showOriginal || !showTranslated);
    }
  }

  private async disposePdfSession(): Promise<void> {
    const session = this.pdfSession;
    this.pdfSession = null;
    this.pdfAnalysis = null;
    this.pdfPageViews.clear();
    if (this.pdfViewer) {
      this.pdfViewer.replaceChildren();
      this.pdfViewer.hidden = true;
    }

    if (session) {
      try {
        await session.destroy();
      } catch {
        // The document UI is already cleared even if PDF.js cleanup fails.
      }
    }
  }

  private applyDisplayMode(): void {
    const mode = (this.displayMode?.value || 'bilingual') as DisplayMode;
    const originals = document.querySelectorAll<HTMLElement>('.document-original');
    const translations = document.querySelectorAll<HTMLElement>('.document-translation');

    originals.forEach(original => {
      original.style.display = mode === 'translation-only' ? 'none' : 'block';
    });

    translations.forEach(translation => {
      translation.style.display = mode === 'original-only' ? 'none' : 'block';
      translation.style.marginTop = mode === 'translation-only' ? '0' : '8px';
      translation.style.paddingTop = mode === 'translation-only' ? '0' : '8px';
      translation.style.borderTop = mode === 'translation-only' ? 'none' : '1px solid #e5ebf4';
    });

    document.querySelectorAll<HTMLElement>('.document-result-block--formula').forEach(block => {
      const original = block.querySelector<HTMLElement>('.document-original');
      const preserved = block.querySelector<HTMLElement>('.document-translation');
      if (original) original.style.display = mode === 'translation-only' ? 'none' : 'block';
      if (preserved) {
        preserved.style.display = mode === 'translation-only' ? 'block' : 'none';
        preserved.style.marginTop = '0';
        preserved.style.paddingTop = '0';
        preserved.style.borderTop = 'none';
      }
    });

    this.applyPdfDisplayMode();
  }

  private getCurrentDocumentBlocks(text: string): DocumentBlock[] {
    if (this.loadedDocumentBlocks && text === this.loadedSourceText) {
      return this.loadedDocumentBlocks;
    }

    const editedBlocks = DocumentTextExtractor.splitIntoBlocks(text);
    if (
      !this.loadedDocumentBlocks
      || !this.isPdfFileName(this.loadedFileName)
      || !this.loadedDocumentBlocks.some(block => block.layout)
    ) {
      return editedBlocks;
    }

    return this.mapEditedPdfBlocks(editedBlocks, this.loadedDocumentBlocks);
  }

  private mapEditedPdfBlocks(
    editedBlocks: DocumentBlock[],
    loadedBlocks: DocumentBlock[]
  ): DocumentBlock[] {
    if (editedBlocks.length === 0 || loadedBlocks.length === 0) return [];

    const unpositionedInsertions: Array<{ beforeLoadedIndex: number; text: string }> = [];
    const anchors: Array<{ loadedIndex: number; editedIndex: number }> = [];
    let nextEditedIndex = 0;

    for (let loadedIndex = 0; loadedIndex < loadedBlocks.length; loadedIndex++) {
      const editedIndex = editedBlocks.findIndex((editedBlock, index) => (
        index >= nextEditedIndex
        && editedBlock.originalText === loadedBlocks[loadedIndex]!.originalText
      ));
      if (editedIndex < 0) continue;

      anchors.push({ loadedIndex, editedIndex });
      nextEditedIndex = editedIndex + 1;
    }

    const mappedTexts = new Map<number, string>();
    anchors.forEach(anchor => {
      mappedTexts.set(anchor.loadedIndex, editedBlocks[anchor.editedIndex]!.originalText);
    });

    let loadedStart = 0;
    let editedStart = 0;
    const boundaries = [
      ...anchors,
      { loadedIndex: loadedBlocks.length, editedIndex: editedBlocks.length }
    ];

    for (const boundary of boundaries) {
      const loadedCount = boundary.loadedIndex - loadedStart;
      const editedCount = boundary.editedIndex - editedStart;

      if (loadedCount > 0) {
        const mappedCount = Math.min(loadedCount, editedCount);
        for (let index = 0; index < mappedCount; index++) {
          mappedTexts.set(
            loadedStart + index,
            editedBlocks[editedStart + index]!.originalText
          );
        }

        // New PDF blocks can share only adjacent prose geometry. Formula geometry is never reused.
        if (editedCount > loadedCount) {
          const overflowText = editedBlocks
            .slice(editedStart + loadedCount, boundary.editedIndex)
            .map(block => block.originalText)
            .join('\n\n');
          if (!this.attachInsertedPdfText(mappedTexts, loadedBlocks, boundary.loadedIndex, overflowText)) {
            unpositionedInsertions.push({
              beforeLoadedIndex: boundary.loadedIndex,
              text: overflowText
            });
          }
        }
      } else if (editedCount > 0) {
        const insertedText = editedBlocks
          .slice(editedStart, boundary.editedIndex)
          .map(block => block.originalText)
          .join('\n\n');
        if (!this.attachInsertedPdfText(
          mappedTexts,
          loadedBlocks,
          boundary.loadedIndex,
          insertedText
        )) {
          unpositionedInsertions.push({
            beforeLoadedIndex: boundary.loadedIndex,
            text: insertedText
          });
        }
      }

      loadedStart = boundary.loadedIndex + 1;
      editedStart = boundary.editedIndex + 1;
    }

    const insertionMap = new Map<number, string[]>();
    unpositionedInsertions.forEach(insertion => {
      const texts = insertionMap.get(insertion.beforeLoadedIndex) || [];
      texts.push(insertion.text);
      insertionMap.set(insertion.beforeLoadedIndex, texts);
    });
    let nextBlockId = loadedBlocks.reduce((maximum, block) => Math.max(maximum, block.id), 0) + 1;
    const mappedBlocks: DocumentBlock[] = [];

    for (let index = 0; index <= loadedBlocks.length; index++) {
      for (const insertion of insertionMap.get(index) || []) {
        const insertedBlocks = DocumentTextExtractor.splitIntoBlocks(insertion);
        insertedBlocks.forEach(block => {
          mappedBlocks.push({ ...block, id: nextBlockId++ });
        });
      }

      const loadedBlock = loadedBlocks[index];
      const mappedText = mappedTexts.get(index);
      if (loadedBlock && mappedText !== undefined) {
        mappedBlocks.push({ ...loadedBlock, originalText: mappedText });
      }
    }

    return mappedBlocks;
  }

  private attachInsertedPdfText(
    mappedTexts: Map<number, string>,
    loadedBlocks: DocumentBlock[],
    nextLoadedIndex: number,
    insertedText: string
  ): boolean {
    if (!insertedText.trim()) return true;

    const previousLoadedIndex = nextLoadedIndex - 1;
    const previousBlock = loadedBlocks[previousLoadedIndex];
    const nextBlock = loadedBlocks[nextLoadedIndex];
    const previousIsProse = Boolean(
      previousBlock && previousBlock.layout?.contentKind !== 'formula'
    );
    const nextIsProse = Boolean(nextBlock && nextBlock.layout?.contentKind !== 'formula');

    if (previousIsProse) {
      const previousText = mappedTexts.get(previousLoadedIndex);
      mappedTexts.set(
        previousLoadedIndex,
        previousText ? `${previousText}\n\n${insertedText}` : insertedText
      );
      return true;
    }
    if (nextIsProse) {
      const nextText = mappedTexts.get(nextLoadedIndex);
      mappedTexts.set(
        nextLoadedIndex,
        nextText ? `${insertedText}\n\n${nextText}` : insertedText
      );
      return true;
    }

    return false;
  }

  private getBlockLabel(block: DocumentBlock): string {
    if (!block.layout) return `Block ${block.id}`;

    return [
      `Page ${block.layout.pageNumber}`,
      `Block ${block.id}`,
      ...(block.layout.contentKind === 'formula' ? ['Formula'] : []),
      ...((block.layout.columnCount || 1) > 1 ? [`Column ${block.layout.columnIndex}`] : []),
      `x ${block.layout.x}`,
      `y ${block.layout.y}`
    ].join(' · ');
  }

  private async loadDocumentHistory(): Promise<void> {
    if (!this.historyList && !this.historyRetention && !this.clearHistoryButton) return;

    try {
      const [retention, entries] = await Promise.all([
        documentHistoryService.getRetention(),
        documentHistoryService.list()
      ]);
      if (this.historyRetention) this.historyRetention.value = String(retention);
      this.historyEntries = entries;
      this.renderDocumentHistory();
    } catch {
      this.historyEntries = [];
      this.renderDocumentHistory();
      this.showMessage('Could not load local document history.', 'error');
    }
  }

  private renderDocumentHistory(): void {
    if (this.clearHistoryButton) {
      this.clearHistoryButton.disabled = this.historyEntries.length === 0;
    }
    if (!this.historyList) return;

    this.historyList.replaceChildren();
    if (this.historyEntries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'No saved documents.';
      this.historyList.appendChild(empty);
      return;
    }

    for (const entry of this.historyEntries) {
      const item = document.createElement('article');
      item.className = 'history-item';
      item.dataset['historyId'] = entry.id;

      const title = document.createElement('h3');
      title.className = 'history-item-title';
      title.textContent = entry.fileName || 'Pasted document';
      title.title = title.textContent;

      const metadata = document.createElement('p');
      metadata.className = 'history-item-meta';
      metadata.textContent = [
        new Date(entry.createdAt).toLocaleString(),
        entry.sourceKind.toUpperCase(),
        entry.provider,
        entry.targetLanguage,
        `${entry.results.length} blocks`,
        entry.complete ? 'Complete' : 'Partial'
      ].join(' | ');

      const actions = document.createElement('div');
      actions.className = 'history-item-actions';
      actions.append(
        this.createHistoryActionButton('Open', 'open', entry.id),
        this.createHistoryActionButton('Export', 'export', entry.id),
        this.createHistoryActionButton('Delete', 'delete', entry.id)
      );
      item.append(title, metadata, actions);
      this.historyList.appendChild(item);
    }
  }

  private createHistoryActionButton(
    label: string,
    action: 'open' | 'export' | 'delete',
    historyId: string
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = this.isBusy;
    button.dataset['historyAction'] = action;
    button.dataset['historyId'] = historyId;
    return button;
  }

  private async handleHistoryAction(event: Event): Promise<void> {
    if (this.isBusy) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button[data-history-action][data-history-id]');
    if (!button || !this.historyList?.contains(button)) return;

    const historyId = button.dataset['historyId'];
    if (!historyId) return;
    switch (button.dataset['historyAction']) {
      case 'open':
        await this.openDocumentHistory(historyId);
        break;
      case 'export':
        await this.exportDocumentHistory(historyId);
        break;
      case 'delete':
        await this.deleteDocumentHistory(historyId);
        break;
    }
  }

  private async saveDocumentHistory(): Promise<void> {
    if (this.isBusy) return;
    if (this.currentResults.length === 0) {
      this.showMessage('Translate at least one block before saving history.', 'error');
      return;
    }

    const sourceText = this.sourceText?.value || this.loadedSourceText;
    const rawFileText = sourceText === this.loadedSourceText
      ? this.loadedRawFileText
      : '';
    const sourceBlocks = this.getCurrentDocumentBlocks(sourceText.trim());
    const complete = sourceBlocks.length === this.currentResults.length
      && sourceBlocks.every((block, index) => (
        block.originalText === this.currentResults[index]?.block.originalText
        && Boolean(
          this.currentResults[index]?.preservedOriginal
          || this.currentResults[index]?.translatedText.trim()
        )
      ));

    try {
      this.setBusy(true);
      const saved = await documentHistoryService.save({
        fileName: this.loadedFileName || 'Pasted document',
        sourceKind: this.loadedSourceKind,
        sourceUrl: this.loadedSourceUrl,
        sourceText,
        ...(rawFileText && this.isTextHistorySourceKind(this.loadedSourceKind)
          ? { rawFileText }
          : {}),
        provider: this.translationProvider?.value || 'google',
        targetLanguage: this.targetLanguage?.value || 'zh-CN',
        displayMode: (this.displayMode?.value || 'bilingual') as DisplayMode,
        complete,
        documentBlocks: sourceBlocks,
        results: this.currentResults
      });
      await this.loadDocumentHistory();
      this.showMessage(`Saved ${saved.fileName} to local history`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not save local document history.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  private async openDocumentHistory(historyId: string): Promise<void> {
    if (this.isBusy) return;
    try {
      this.setBusy(true);
      const entry = await documentHistoryService.get(historyId);
      if (!entry) throw new Error('The selected history entry no longer exists.');

      await this.disposePdfSession();
      this.hasExplicitlyLoadedPdf = false;
      if (this.fileInput) this.fileInput.value = '';
      if (this.sourceText) this.sourceText.value = entry.sourceText;
      this.loadedDocumentBlocks = entry.documentBlocks;
      this.loadedSourceText = entry.sourceText;
      this.loadedRawFileText = entry.rawFileText || '';
      this.loadedRawFileBytes = null;
      this.loadedFileName = entry.fileName;
      this.loadedSourceKind = entry.sourceKind;
      this.loadedSourceUrl = entry.sourceUrl;
      this.setSourceUrlInfo(entry.sourceUrl);
      this.currentResults = entry.results.map(result => ({
        block: result.block,
        translatedText: result.translatedText,
        ...(result.preservedOriginal === undefined
          ? {}
          : { preservedOriginal: result.preservedOriginal })
      }));

      if (
        this.translationProvider
        && Array.from(this.translationProvider.options).some(option => option.value === entry.provider)
      ) {
        this.translationProvider.value = entry.provider;
      }
      this.updateTargetLanguageAvailability();
      if (
        this.targetLanguage
        && Array.from(this.targetLanguage.options).some(option => (
          option.value === entry.targetLanguage && !option.disabled
        ))
      ) {
        this.targetLanguage.value = entry.targetLanguage;
      }
      if (this.displayMode) this.displayMode.value = entry.displayMode;

      this.renderResults(this.currentResults);
      this.renderPdfTranslationOverlays();
      this.updateProgress(this.currentResults.length, this.currentResults.length);
      this.showMessage(`Opened ${entry.fileName} from local history`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not open local document history.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  private async exportDocumentHistory(historyId: string): Promise<void> {
    try {
      const entry = await documentHistoryService.get(historyId);
      if (!entry) throw new Error('The selected history entry no longer exists.');

      this.downloadTextFile(
        `${JSON.stringify({
          schemaVersion: DOCUMENT_HISTORY_SCHEMA_VERSION,
          entry
        }, null, 2)}\n`,
        this.createHistoryExportFilename(entry.fileName),
        'application/json;charset=utf-8'
      );
      this.showMessage(`Exported ${entry.fileName} history`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not export local document history.', 'error');
    }
  }

  private async deleteDocumentHistory(historyId: string): Promise<void> {
    if (this.isBusy) return;
    try {
      this.setBusy(true);
      const deleted = await documentHistoryService.delete(historyId);
      await this.loadDocumentHistory();
      this.showMessage(deleted ? 'Deleted local document history entry' : 'History entry was already deleted');
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not delete local document history.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  private async clearDocumentHistory(): Promise<void> {
    if (this.isBusy) return;
    if (this.historyEntries.length === 0) return;
    if (!window.confirm('Delete all local document history?')) return;

    try {
      this.setBusy(true);
      await documentHistoryService.clear();
      await this.loadDocumentHistory();
      this.showMessage('Cleared local document history');
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not clear local document history.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  private async changeHistoryRetention(): Promise<void> {
    if (this.isBusy) return;
    const retention = Number(this.historyRetention?.value);
    if (retention !== 10 && retention !== 25 && retention !== 50) return;

    try {
      this.setBusy(true);
      await documentHistoryService.setRetention(retention as DocumentHistoryRetention);
      await this.loadDocumentHistory();
      this.showMessage(`Keeping the latest ${retention} local history entries`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Could not update history retention.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  private getDocumentHistorySourceKind(fileName: string): DocumentHistorySourceKind {
    const extension = fileName.toLowerCase().match(/\.([^.]+)$/)?.[1];
    switch (extension) {
      case 'txt':
      case 'md':
      case 'markdown':
      case 'html':
      case 'htm':
      case 'json':
      case 'srt':
      case 'vtt':
      case 'ass':
      case 'ssa':
      case 'pdf':
      case 'docx':
      case 'epub':
      case 'mobi':
      case 'azw3':
        return extension;
      default:
        return 'manual';
    }
  }

  private isTextHistorySourceKind(sourceKind: DocumentHistorySourceKind): boolean {
    return sourceKind !== 'pdf'
      && sourceKind !== 'docx'
      && sourceKind !== 'epub'
      && sourceKind !== 'mobi'
      && sourceKind !== 'azw3';
  }

  private createHistoryExportFilename(fileName: string): string {
    const baseName = (fileName || 'translated-document')
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'translated-document';
    return `${baseName}.translation-history.json`;
  }

  private clearDocument(): void {
    void this.disposePdfSession();
    if (this.sourceText) this.sourceText.value = '';
    if (this.fileInput) this.fileInput.value = '';
    this.loadedDocumentBlocks = null;
    this.loadedSourceText = '';
    this.loadedRawFileText = '';
    this.loadedRawFileBytes = null;
    this.loadedFileName = '';
    this.loadedSourceKind = 'manual';
    this.hasExplicitlyLoadedPdf = false;
    this.currentResults = [];
    this.applySourceUrl();
    this.renderResults([]);
    this.updateProgress(0, 0);
    this.updateExportButtons();
    this.showMessage('');
  }

  private updateProgress(done: number, total: number): void {
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    if (this.progressBar) this.progressBar.style.width = `${percent}%`;
    if (this.progressText) this.progressText.textContent = total > 0 ? `${done}/${total} blocks` : '0 blocks';
  }

  private setBusy(isBusy: boolean): void {
    this.isBusy = isBusy;
    if (this.translateButton) this.translateButton.disabled = isBusy;
    if (this.fileInput) this.fileInput.disabled = isBusy;
    if (this.sourceText) this.sourceText.disabled = isBusy;
    if (this.clearButton) this.clearButton.disabled = isBusy;
    if (this.targetLanguage) this.targetLanguage.disabled = isBusy;
    if (this.translationProvider) this.translationProvider.disabled = isBusy;
    if (this.ocrLanguage) this.ocrLanguage.disabled = isBusy;
    if (this.historyRetention) this.historyRetention.disabled = isBusy;
    if (this.clearHistoryButton) {
      this.clearHistoryButton.disabled = isBusy || this.historyEntries.length === 0;
    }
    this.historyList?.querySelectorAll<HTMLButtonElement>('button[data-history-action]')
      .forEach(button => {
        button.disabled = isBusy;
      });
    this.updateExportButtons(isBusy);
    this.updateBatchControls();
  }

  private updateExportButtons(isBusy: boolean = false): void {
    this.updateSubtitleExportButton(isBusy);
    this.updateJsonExportButton(isBusy);
    this.updateDocxExportButton(isBusy);
    this.updateEpubExportButton(isBusy);
    this.updatePdfExportButton(isBusy);
    this.updateTextExportButton(isBusy);
    this.updateResearchNoteExportButton(isBusy);
    this.updateBabelDocGuideExportButton(isBusy);
    if (this.saveHistoryButton) {
      this.saveHistoryButton.disabled = isBusy || this.currentResults.length === 0;
    }
  }

  private updateSubtitleExportButton(isBusy: boolean = false): void {
    if (!this.exportSubtitleButton) return;

    const hasTranslatedSubtitles = this.currentResults.some(result => (
      (result.block.subtitle || result.block.ass) && result.translatedText.trim()
    ));
    const requiresRawAssScript = this.currentResults.some(result => result.block.ass);
    this.exportSubtitleButton.disabled = isBusy
      || !hasTranslatedSubtitles
      || (requiresRawAssScript && !this.loadedRawFileText);
  }

  private updateJsonExportButton(isBusy: boolean = false): void {
    if (!this.exportJsonButton) return;

    const hasTranslatedJson = this.currentResults.some(result => result.block.json && result.translatedText.trim());
    this.exportJsonButton.disabled = isBusy || !this.loadedRawFileText || !hasTranslatedJson;
  }

  private updateDocxExportButton(isBusy: boolean = false): void {
    if (!this.exportDocxButton) return;

    const hasTranslatedDocx = this.currentResults.some(result => result.block.docx && result.translatedText.trim());
    this.exportDocxButton.disabled = isBusy || !this.loadedRawFileBytes || !hasTranslatedDocx;
  }

  private updateEpubExportButton(isBusy: boolean = false): void {
    if (!this.exportEpubButton) return;

    const hasTranslatedEpub = this.currentResults.some(result => result.block.epub && result.translatedText.trim());
    this.exportEpubButton.disabled = isBusy || !this.loadedRawFileBytes || !hasTranslatedEpub;
  }

  private updatePdfExportButton(isBusy: boolean = false): void {
    if (!this.exportPdfButton) return;

    const hasTranslatedPdf = this.currentResults.some(result => (
      result.block.layout
      && result.block.layout.contentKind !== 'formula'
      && result.translatedText.trim()
    ));
    const hasUnpositionedPdfText = Boolean(this.pdfSession) && this.currentResults.some(result => (
      !result.block.layout && result.translatedText.trim()
    ));
    this.exportPdfButton.disabled = isBusy
      || !this.pdfSession
      || !hasTranslatedPdf
      || hasUnpositionedPdfText;
  }

  private updateTextExportButton(isBusy: boolean = false): void {
    if (!this.exportTextButton) return;
    const hasTranslatedText = this.currentResults.some(result => result.translatedText.trim());
    this.exportTextButton.disabled = isBusy || !hasTranslatedText;
  }

  private updateResearchNoteExportButton(isBusy: boolean = false): void {
    if (!this.exportResearchNoteButton) return;
    const hasTranslatedText = this.currentResults.some(result => result.translatedText.trim());
    this.exportResearchNoteButton.disabled = isBusy || !hasTranslatedText;
  }

  private updateBabelDocGuideExportButton(isBusy: boolean = false): void {
    if (!this.exportBabelDocGuideButton) return;
    const hasLoadedPdf = this.hasExplicitlyLoadedPdf
      && Boolean(this.loadedRawFileBytes)
      && this.isPdfFileName(this.loadedFileName);
    this.exportBabelDocGuideButton.hidden = !hasLoadedPdf;
    this.exportBabelDocGuideButton.disabled = isBusy || !hasLoadedPdf;
  }

  private isJsonDocumentFile(file: File): boolean {
    return file.type === 'application/json' ||
      file.type === 'text/json' ||
      file.name.toLowerCase().endsWith('.json');
  }

  private isDocxDocumentFile(file: File): boolean {
    return file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.toLowerCase().endsWith('.docx');
  }

  private isEpubDocumentFile(file: File): boolean {
    return file.type === 'application/epub+zip' ||
      file.name.toLowerCase().endsWith('.epub');
  }

  private isMobiDocumentFile(file: File): boolean {
    const lowerName = file.name.toLowerCase();
    return file.type === 'application/x-mobipocket-ebook'
      || lowerName.endsWith('.mobi')
      || lowerName.endsWith('.azw3');
  }

  private isPdfDocumentFile(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private isPdfFileName(fileName: string): boolean {
    return fileName.toLowerCase().endsWith('.pdf');
  }

  private isSupportedDocumentFile(file: File): boolean {
    return /\.(?:txt|md|markdown|html|htm|xhtml|json|docx|epub|mobi|azw3|srt|vtt|ass|ssa|pdf)$/i
      .test(file.name);
  }

  private showMessage(message: string, type: 'info' | 'error' = 'info'): void {
    if (!this.message) return;

    this.message.textContent = message;
    this.message.classList.toggle('error', type === 'error');
  }

  private sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  private downloadTextFile(content: string, filename: string, mimeType: string): void {
    this.downloadBinaryFile(new TextEncoder().encode(content), filename, mimeType);
  }

  private downloadBinaryFile(content: Uint8Array, filename: string, mimeType: string): void {
    const buffer = new ArrayBuffer(content.byteLength);
    new Uint8Array(buffer).set(content);

    const blob = new Blob([buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new DocumentTranslatorController();
}, { once: true });
