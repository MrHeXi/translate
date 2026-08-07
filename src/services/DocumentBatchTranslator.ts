import { BundledOcrLanguageCode } from './BundledOcrService';
import { normalizeDocumentArchiveFileName } from './DocumentBatchArchive';
import { DocumentBlock, DocumentTextExtractor } from './DocumentTextExtractor';
import {
  PdfDocumentService,
  PdfDocumentSession,
  PdfOcrProgress,
  pdfDocumentService
} from './PdfDocumentService';

export interface DocumentBatchTranslationProgress {
  completedBlocks: number;
  totalBlocks: number;
  ocr?: PdfOcrProgress;
}

export type DocumentBatchTranslateText = (
  text: string,
  context: string,
  requestId: string,
  signal: AbortSignal
) => Promise<string>;

export interface DocumentBatchTranslationOptions {
  targetLanguage: string;
  provider: string;
  ocrLanguage: BundledOcrLanguageCode;
  requestIdPrefix: string;
  signal: AbortSignal;
  translateText: DocumentBatchTranslateText;
  onProgress?: (progress: DocumentBatchTranslationProgress) => void;
}

export interface DocumentBatchTranslationOutput {
  sourceFileName: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  blockCount: number;
  translatedBlockCount: number;
  preservedFormulaCount: number;
}

interface BatchTranslationResult {
  block: DocumentBlock;
  translatedText: string;
  preservedOriginal?: boolean;
}

export const DOCUMENT_BATCH_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
export const DOCUMENT_BATCH_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

const encodeText = (text: string): Uint8Array => new TextEncoder().encode(text);

const throwIfAborted = (signal: AbortSignal): void => {
  if (!signal.aborted) return;

  if (typeof DOMException !== 'undefined') {
    throw new DOMException('Document batch translation was cancelled', 'AbortError');
  }

  const error = new Error('Document batch translation was cancelled');
  error.name = 'AbortError';
  throw error;
};

const extensionOf = (fileName: string): string => (
  fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] || ''
);

const outputBaseName = (fileName: string): string => {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  return normalizeDocumentArchiveFileName(withoutExtension || 'document');
};

export class DocumentBatchTranslator {
  constructor(private readonly pdfService: PdfDocumentService = pdfDocumentService) {}

  async translateFile(
    file: File,
    options: DocumentBatchTranslationOptions
  ): Promise<DocumentBatchTranslationOutput> {
    if (!file || typeof file.name !== 'string') {
      throw new TypeError('A document file is required');
    }
    if (!options.targetLanguage || !options.provider || !options.requestIdPrefix) {
      throw new Error('Batch translation settings are incomplete');
    }
    if (file.size > DOCUMENT_BATCH_MAX_SOURCE_BYTES) {
      throw new RangeError(`Batch source files cannot exceed ${DOCUMENT_BATCH_MAX_SOURCE_BYTES} bytes`);
    }

    throwIfAborted(options.signal);
    const extension = extensionOf(file.name);
    let rawText = '';
    let rawBytes: Uint8Array | null = null;
    let pdfSession: PdfDocumentSession | null = null;
    let blocks: DocumentBlock[] = [];
    let removePdfAbortListener: (() => void) | null = null;

    try {
      if (extension === 'pdf') {
        rawBytes = await this.readFileBytes(file, options.signal);
        pdfSession = await this.pdfService.open(rawBytes, {
          ocrLanguage: options.ocrLanguage,
          onOcrProgress: ocr => options.onProgress?.({
            completedBlocks: 0,
            totalBlocks: 0,
            ocr
          })
        });
        const activeSession = pdfSession;
        const abortPdf = (): void => {
          void activeSession.destroy().catch(() => undefined);
        };
        options.signal.addEventListener('abort', abortPdf, { once: true });
        removePdfAbortListener = () => options.signal.removeEventListener('abort', abortPdf);
        throwIfAborted(options.signal);
        blocks = (await pdfSession.analyze()).blocks;
      } else if (extension === 'docx') {
        rawBytes = await this.readFileBytes(file, options.signal);
        blocks = await DocumentTextExtractor.extractBlocksFromDocxBytes(rawBytes, 1200, options.signal);
      } else if (extension === 'epub') {
        rawBytes = await this.readFileBytes(file, options.signal);
        blocks = await DocumentTextExtractor.extractBlocksFromEpubBytes(rawBytes, 1200, options.signal);
      } else if (extension === 'mobi' || extension === 'azw3') {
        rawBytes = await this.readFileBytes(file, options.signal);
        blocks = await DocumentTextExtractor.extractBlocksFromMobiBytes(
          rawBytes,
          extension === 'azw3' ? 'kf8' : 'mobi',
          1200,
          options.signal
        );
      } else {
        rawText = await this.readFileText(file, options.signal);
        if (extension === 'json') {
          blocks = DocumentTextExtractor.extractBlocksFromJson(rawText);
        } else if (extension === 'html' || extension === 'htm' || extension === 'xhtml') {
          blocks = DocumentTextExtractor.extractBlocksFromHtml(rawText);
        } else if (extension === 'ass' || extension === 'ssa') {
          blocks = DocumentTextExtractor.extractBlocksFromSubtitleText(rawText, extension);
        } else if (extension === 'srt' || extension === 'vtt') {
          blocks = DocumentTextExtractor.extractBlocksFromSubtitleText(rawText, extension);
        } else {
          blocks = DocumentTextExtractor.splitIntoBlocks(rawText);
        }
      }

      throwIfAborted(options.signal);
      if (blocks.length === 0) throw new Error('No translatable text was found in this file');

      const results: BatchTranslationResult[] = [];
      let translatedBlockCount = 0;
      let preservedFormulaCount = 0;
      options.onProgress?.({ completedBlocks: 0, totalBlocks: blocks.length });

      for (let index = 0; index < blocks.length; index += 1) {
        throwIfAborted(options.signal);
        const block = blocks[index]!;
        if (block.layout?.contentKind === 'formula') {
          results.push({
            block,
            translatedText: block.originalText,
            preservedOriginal: true
          });
          preservedFormulaCount += 1;
        } else {
          const translatedText = await options.translateText(
            block.originalText,
            this.createContext(blocks, index),
            `${options.requestIdPrefix}:block-${index + 1}`,
            options.signal
          );
          throwIfAborted(options.signal);
          if (!translatedText.trim()) throw new Error(`Block ${index + 1} returned an empty translation`);
          results.push({ block, translatedText });
          translatedBlockCount += 1;
        }

        options.onProgress?.({
          completedBlocks: results.length,
          totalBlocks: blocks.length
        });
      }

      const output = await this.createOutput(
        file.name,
        extension,
        rawText,
        rawBytes,
        pdfSession,
        results,
        options.signal
      );
      if (output.bytes.byteLength > DOCUMENT_BATCH_MAX_OUTPUT_BYTES) {
        throw new RangeError(`Batch output files cannot exceed ${DOCUMENT_BATCH_MAX_OUTPUT_BYTES} bytes`);
      }

      return {
        sourceFileName: file.name,
        ...output,
        blockCount: blocks.length,
        translatedBlockCount,
        preservedFormulaCount
      };
    } finally {
      removePdfAbortListener?.();
      await pdfSession?.destroy().catch(() => undefined);
    }
  }

  private async createOutput(
    sourceFileName: string,
    extension: string,
    rawText: string,
    rawBytes: Uint8Array | null,
    pdfSession: PdfDocumentSession | null,
    results: BatchTranslationResult[],
    signal: AbortSignal
  ): Promise<{ fileName: string; mimeType: string; bytes: Uint8Array }> {
    throwIfAborted(signal);
    const baseName = outputBaseName(sourceFileName);

    if (extension === 'pdf' && pdfSession) {
      const bytes = await pdfSession.exportTranslatedPdf(results);
      throwIfAborted(signal);
      return { fileName: `${baseName}.translated.pdf`, mimeType: 'application/pdf', bytes };
    }
    if (extension === 'docx' && rawBytes) {
      const bytes = await DocumentTextExtractor.rewriteDocxWithTranslations(rawBytes, results, signal);
      throwIfAborted(signal);
      return {
        fileName: `${baseName}.translated.docx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes
      };
    }
    if (extension === 'epub' && rawBytes) {
      const bytes = await DocumentTextExtractor.rewriteEpubWithTranslations(rawBytes, results, signal);
      throwIfAborted(signal);
      return { fileName: `${baseName}.translated.epub`, mimeType: 'application/epub+zip', bytes };
    }
    if (extension === 'json') {
      return {
        fileName: `${baseName}.translated.json`,
        mimeType: 'application/json;charset=utf-8',
        bytes: encodeText(DocumentTextExtractor.rewriteJsonWithTranslations(rawText, results))
      };
    }
    if (extension === 'ass' || extension === 'ssa') {
      return {
        fileName: `${baseName}.translated.${extension}`,
        mimeType: 'text/plain;charset=utf-8',
        bytes: encodeText(DocumentTextExtractor.rewriteAssWithTranslations(rawText, results))
      };
    }
    if (extension === 'srt' || extension === 'vtt') {
      return {
        fileName: `${baseName}.translated.${extension}`,
        mimeType: extension === 'vtt' ? 'text/vtt;charset=utf-8' : 'text/plain;charset=utf-8',
        bytes: encodeText(DocumentTextExtractor.rewriteTimedSubtitleWithTranslations(rawText, results))
      };
    }

    const translatedText = `${results.map(result => result.translatedText.trim()).join('\n\n')}\n`;
    return {
      fileName: `${baseName}.translated.txt`,
      mimeType: 'text/plain;charset=utf-8',
      bytes: encodeText(translatedText)
    };
  }

  private createContext(blocks: DocumentBlock[], blockIndex: number): string {
    return blocks
      .slice(Math.max(0, blockIndex - 2), Math.min(blocks.length, blockIndex + 3))
      .filter(block => block.layout?.contentKind !== 'formula')
      .map(block => block.originalText.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000);
  }

  private async readFileBytes(file: File, signal: AbortSignal): Promise<Uint8Array> {
    throwIfAborted(signal);
    const bytes = new Uint8Array(await file.arrayBuffer());
    throwIfAborted(signal);
    if (bytes.byteLength > DOCUMENT_BATCH_MAX_SOURCE_BYTES) {
      throw new RangeError(`Batch source files cannot exceed ${DOCUMENT_BATCH_MAX_SOURCE_BYTES} bytes`);
    }
    return bytes;
  }

  private async readFileText(file: File, signal: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    const text = await file.text();
    throwIfAborted(signal);
    if (encodeText(text).byteLength > DOCUMENT_BATCH_MAX_SOURCE_BYTES) {
      throw new RangeError(`Batch source files cannot exceed ${DOCUMENT_BATCH_MAX_SOURCE_BYTES} bytes`);
    }
    return text;
  }
}

export const documentBatchTranslator = new DocumentBatchTranslator();
