import { DocumentBlock, DocumentTextExtractor } from '../services/DocumentTextExtractor';
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
}

class DocumentTranslatorController {
  private sourceText: HTMLTextAreaElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private translateButton: HTMLButtonElement | null = null;
  private exportSubtitleButton: HTMLButtonElement | null = null;
  private clearButton: HTMLButtonElement | null = null;
  private targetLanguage: HTMLSelectElement | null = null;
  private translationProvider: HTMLSelectElement | null = null;
  private displayMode: HTMLSelectElement | null = null;
  private message: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private progressText: HTMLElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private loadedDocumentBlocks: DocumentBlock[] | null = null;
  private loadedSourceText = '';
  private loadedFileName = '';
  private currentResults: TranslationResult[] = [];

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    this.sourceText = document.getElementById('sourceText') as HTMLTextAreaElement | null;
    this.fileInput = document.getElementById('documentFile') as HTMLInputElement | null;
    this.translateButton = document.getElementById('translateDocument') as HTMLButtonElement | null;
    this.exportSubtitleButton = document.getElementById('exportSubtitleFile') as HTMLButtonElement | null;
    this.clearButton = document.getElementById('clearDocument') as HTMLButtonElement | null;
    this.targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement | null;
    this.translationProvider = document.getElementById('translationProvider') as HTMLSelectElement | null;
    this.displayMode = document.getElementById('displayMode') as HTMLSelectElement | null;
    this.message = document.getElementById('documentMessage');
    this.progressBar = document.getElementById('progressBar');
    this.progressText = document.getElementById('progressText');
    this.resultsContainer = document.getElementById('translationResults');

    this.populateControls();
    await this.loadSettings();
    this.applySourceUrl();
    this.bindEvents();
    this.renderResults([]);
    this.updateSubtitleExportButton();
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
    this.clearButton?.addEventListener('click', () => this.clearDocument());
    this.displayMode?.addEventListener('change', () => this.applyDisplayMode());

    const openOptions = document.getElementById('openOptions');
    openOptions?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  private async loadSelectedFile(): Promise<void> {
    const file = this.fileInput?.files?.[0];
    if (!file || !this.sourceText) return;

    try {
      this.setBusy(true);
      const blocks = await DocumentTextExtractor.extractBlocksFromFile(file);
      const text = blocks.map(block => block.originalText).join('\n\n');

      if (!text.trim()) {
        this.loadedDocumentBlocks = null;
        this.loadedSourceText = '';
        this.loadedFileName = '';
        this.currentResults = [];
        this.updateSubtitleExportButton();
        this.showMessage('No selectable text was found. Scanned PDFs and image-only documents need OCR in a later batch.', 'error');
        return;
      }

      this.loadedDocumentBlocks = blocks;
      this.loadedSourceText = text;
      this.loadedFileName = file.name;
      this.currentResults = [];
      this.sourceText.value = text;
      const hasLayout = blocks.some(block => block.layout);
      this.showMessage(`${file.name} loaded${hasLayout ? ' with PDF layout blocks' : ''}`);
      this.updateProgress(0, 0);
      this.renderResults([]);
      this.updateSubtitleExportButton();
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
    this.updateSubtitleExportButton();
    this.setBusy(true);
    this.updateProgress(0, blocks.length);
    this.showMessage(`Translating ${blocks.length} blocks`);

    try {
      for (const block of blocks) {
        const translatedText = await this.translateBlock(block.originalText);
        results.push({ block, translatedText });
        this.currentResults = results;
        this.renderResults(results);
        this.updateSubtitleExportButton();
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
    if (this.sourceText) this.sourceText.value = '';
    if (this.fileInput) this.fileInput.value = '';
    this.loadedDocumentBlocks = null;
    this.loadedSourceText = '';
    this.loadedFileName = '';
    this.currentResults = [];
    this.renderResults([]);
    this.updateProgress(0, 0);
    this.updateSubtitleExportButton();
    this.showMessage('');
  }

  private updateProgress(done: number, total: number): void {
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    if (this.progressBar) this.progressBar.style.width = `${percent}%`;
    if (this.progressText) this.progressText.textContent = total > 0 ? `${done}/${total} blocks` : '0 blocks';
  }

  private setBusy(isBusy: boolean): void {
    if (this.translateButton) this.translateButton.disabled = isBusy;
    this.updateSubtitleExportButton(isBusy);
  }

  private updateSubtitleExportButton(isBusy: boolean = false): void {
    if (!this.exportSubtitleButton) return;

    const hasTranslatedSubtitles = this.currentResults.some(result => result.block.subtitle && result.translatedText.trim());
    this.exportSubtitleButton.disabled = isBusy || !hasTranslatedSubtitles;
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
    const blob = new Blob([content], { type: mimeType });
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
});
