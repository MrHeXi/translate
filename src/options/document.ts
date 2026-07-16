import { DocumentBlock, DocumentTextExtractor } from '../services/DocumentTextExtractor';
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
import { AVAILABLE_TRANSLATION_PROVIDERS, TRANSLATION_LANGUAGES } from '../services/TranslationProviderRegistry';

type DisplayMode = 'bilingual' | 'translation-only' | 'original-only';

interface TranslationResult {
  block: DocumentBlock;
  translatedText: string;
}

interface UserSettings {
  defaultTargetLanguage?: string;
  translationProvider?: string;
  pageTranslationDisplayMode?: DisplayMode;
  documentOcrLanguage?: BundledOcrLanguageCode;
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

class DocumentTranslatorController {
  private sourceText: HTMLTextAreaElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private translateButton: HTMLButtonElement | null = null;
  private exportSubtitleButton: HTMLButtonElement | null = null;
  private exportJsonButton: HTMLButtonElement | null = null;
  private exportDocxButton: HTMLButtonElement | null = null;
  private exportEpubButton: HTMLButtonElement | null = null;
  private exportPdfButton: HTMLButtonElement | null = null;
  private clearButton: HTMLButtonElement | null = null;
  private targetLanguage: HTMLSelectElement | null = null;
  private translationProvider: HTMLSelectElement | null = null;
  private displayMode: HTMLSelectElement | null = null;
  private ocrLanguage: HTMLSelectElement | null = null;
  private message: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private progressText: HTMLElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private pdfViewer: HTMLElement | null = null;
  private loadedDocumentBlocks: DocumentBlock[] | null = null;
  private loadedSourceText = '';
  private loadedRawFileText = '';
  private loadedRawFileBytes: Uint8Array | null = null;
  private loadedFileName = '';
  private currentResults: TranslationResult[] = [];
  private pdfSession: PdfDocumentSession | null = null;
  private pdfAnalysis: PdfDocumentAnalysis | null = null;
  private readonly pdfPageViews = new Map<number, PdfPageView>();

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
    this.clearButton = document.getElementById('clearDocument') as HTMLButtonElement | null;
    this.targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement | null;
    this.translationProvider = document.getElementById('translationProvider') as HTMLSelectElement | null;
    this.displayMode = document.getElementById('displayMode') as HTMLSelectElement | null;
    this.ocrLanguage = document.getElementById('ocrLanguage') as HTMLSelectElement | null;
    this.message = document.getElementById('documentMessage');
    this.progressBar = document.getElementById('progressBar');
    this.progressText = document.getElementById('progressText');
    this.resultsContainer = document.getElementById('translationResults');
    this.pdfViewer = document.getElementById('pdfViewer');

    this.populateControls();
    await this.loadSettings();
    this.applySourceUrl();
    this.bindEvents();
    this.renderResults([]);
    this.updateExportButtons();
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
    } catch (error) {
      this.showMessage('Could not load settings. Using defaults.', 'error');
    }
  }

  private applySourceUrl(): void {
    const sourceUrl = new URLSearchParams(window.location.search).get('sourceUrl');
    const sourceUrlInfo = document.getElementById('sourceUrlInfo');
    if (!sourceUrl || !sourceUrlInfo) return;

    sourceUrlInfo.hidden = false;
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
    this.clearButton?.addEventListener('click', () => this.clearDocument());
    this.displayMode?.addEventListener('change', () => this.applyDisplayMode());
    this.ocrLanguage?.addEventListener('change', () => void this.handleOcrLanguageChange());

    const openOptions = document.getElementById('openOptions');
    openOptions?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  private async loadSelectedFile(): Promise<void> {
    const file = this.fileInput?.files?.[0];
    if (!file || !this.sourceText) return;

    try {
      this.setBusy(true);
      await this.disposePdfSession();
      const isJsonDocument = this.isJsonDocumentFile(file);
      const isDocxDocument = this.isDocxDocumentFile(file);
      const isEpubDocument = this.isEpubDocumentFile(file);
      const isPdfDocument = this.isPdfDocumentFile(file);
      const rawText = isJsonDocument ? await file.text() : '';
      const rawBytes = isDocxDocument || isEpubDocument || isPdfDocument
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
      for (const block of blocks) {
        const translatedText = await this.translateBlock(block.originalText);
        results.push({ block, translatedText });
        this.currentResults = results;
        this.renderResults(results);
        this.renderPdfTranslationOverlays();
        this.updateExportButtons();
        this.updateProgress(results.length, blocks.length);
      }

      this.showMessage(`Translated ${results.length} blocks`);
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Document translation failed.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  private async translateBlock(text: string): Promise<string> {
    const response = await this.sendMessage({
      action: 'translate',
      data: {
        text,
        targetLang: this.targetLanguage?.value || 'zh-CN',
        provider: this.translationProvider?.value || 'google'
      }
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Document translation failed.');
    }

    return response.data.translatedText;
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

      const index = document.createElement('div');
      index.className = 'block-index';
      index.textContent = this.getBlockLabel(result.block);

      const original = document.createElement('div');
      original.className = 'document-original';
      original.textContent = result.block.originalText;

      const translation = document.createElement('div');
      translation.className = 'document-translation';
      translation.textContent = result.translatedText;

      block.append(index, original, translation);
      this.resultsContainer.appendChild(block);
    }

    this.applyDisplayMode();
  }

  private exportTranslatedSubtitles(): void {
    const subtitleResults = this.currentResults.filter(result => result.block.subtitle && result.translatedText.trim());
    if (subtitleResults.length === 0) {
      this.showMessage('Translate a subtitle file before exporting.', 'error');
      return;
    }

    const format = subtitleResults[0]!.block.subtitle!.format;
    const content = this.renderTranslatedSubtitleFile(subtitleResults, format);
    const extension = format === 'vtt' ? 'vtt' : 'srt';
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
    const pdfResults = this.currentResults.filter(result => result.block.layout && result.translatedText.trim());
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

  private createSubtitleExportFilename(extension: 'srt' | 'vtt'): string {
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
      if (typeof CanvasRenderingContext2D !== 'undefined') {
        const translatedContext = translatedCanvas.getContext('2d', { alpha: false });
        translatedContext?.drawImage(originalCanvas, 0, 0);
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
        && result.translatedText.trim()
      ));

      for (const result of pageResults) {
        const layout = result.block.layout!;
        const pageWidth = layout.pageWidth || view.summary.width;
        const pageHeight = layout.pageHeight || view.summary.height;
        const left = Math.max(0, Math.min(99, (layout.x / pageWidth) * 100));
        const top = Math.max(0, Math.min(99, (layout.y / pageHeight) * 100));
        const sourceWidth = Math.max(4, (layout.width / pageWidth) * 100);
        const width = Math.min(100 - left, Math.max(sourceWidth, Math.min(52, 100 - left)));
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

    this.applyPdfDisplayMode();
  }

  private getCurrentDocumentBlocks(text: string): DocumentBlock[] {
    if (this.loadedDocumentBlocks && text === this.loadedSourceText) {
      return this.loadedDocumentBlocks;
    }

    return DocumentTextExtractor.splitIntoBlocks(text);
  }

  private getBlockLabel(block: DocumentBlock): string {
    if (!block.layout) return `Block ${block.id}`;

    return [
      `Page ${block.layout.pageNumber}`,
      `Block ${block.id}`,
      `x ${block.layout.x}`,
      `y ${block.layout.y}`
    ].join(' · ');
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
    this.currentResults = [];
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
    if (this.translateButton) this.translateButton.disabled = isBusy;
    this.updateExportButtons(isBusy);
  }

  private updateExportButtons(isBusy: boolean = false): void {
    this.updateSubtitleExportButton(isBusy);
    this.updateJsonExportButton(isBusy);
    this.updateDocxExportButton(isBusy);
    this.updateEpubExportButton(isBusy);
    this.updatePdfExportButton(isBusy);
  }

  private updateSubtitleExportButton(isBusy: boolean = false): void {
    if (!this.exportSubtitleButton) return;

    const hasTranslatedSubtitles = this.currentResults.some(result => result.block.subtitle && result.translatedText.trim());
    this.exportSubtitleButton.disabled = isBusy || !hasTranslatedSubtitles;
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

    const hasTranslatedPdf = this.currentResults.some(result => result.block.layout && result.translatedText.trim());
    this.exportPdfButton.disabled = isBusy || !this.pdfSession || !hasTranslatedPdf;
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

  private isPdfDocumentFile(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private isPdfFileName(fileName: string): boolean {
    return fileName.toLowerCase().endsWith('.pdf');
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
