import { getDocument, GlobalWorkerOptions, OPS, Util } from 'pdfjs-dist/legacy/build/pdf';
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFObject,
  PDFRef,
  PDFStream,
  PDFString,
  degrees
} from 'pdf-lib';
import type { DocumentBlock, DocumentBlockLayout } from './DocumentTextExtractor';
import {
  BundledOcrLanguageCode,
  BundledOcrSession,
  bundledOcrService
} from './BundledOcrService';
import { preprocessDocumentScan } from './DocumentScanPreprocessor';
import { routeOcrLanguageCandidates } from './OcrLanguageRouter';

interface PdfViewportLike {
  width: number;
  height: number;
  transform: number[];
}

interface PdfTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

interface PdfPageLike {
  getViewport(params: { scale: number }): PdfViewportLike;
  getTextContent(): Promise<{ items: Array<PdfTextItemLike | { type: string }> }>;
  getOperatorList?(): Promise<{ fnArray: number[] }>;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewportLike;
  }): { promise: Promise<void> };
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  destroy(): Promise<void>;
}

interface PdfLoadingTaskLike {
  promise: Promise<PdfDocumentLike>;
}

export interface PdfEngineAdapter {
  getDocument(params: Record<string, unknown>): PdfLoadingTaskLike;
  transform(first: number[], second: number[]): number[];
}

export interface PdfOcrResult {
  rawValue: string;
  confidence?: number;
  engine?: 'browser' | 'tesseract';
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PdfOcrDetector {
  detect(
    source: CanvasImageSource,
    onProgress?: (progress: PdfOcrProgress) => void,
    context?: PdfOcrDetectionContext
  ): Promise<PdfOcrResult[]>;
  dispose?(): Promise<void>;
}

export interface PdfOcrDetectionContext {
  referenceText?: string;
}

export interface PdfOcrProgress {
  pageNumber: number;
  status: string;
  progress: number;
  engine: 'browser' | 'tesseract';
}

export type DocumentScanPreprocessing = 'none' | 'grayscale' | 'binarize';

export interface PdfOpenOptions {
  ocrLanguage?: BundledOcrLanguageCode;
  onOcrProgress?: (progress: PdfOcrProgress) => void;
  enableOcr?: boolean;
  scanPreprocessing?: DocumentScanPreprocessing;
  mixedLanguageOcr?: boolean;
}

export type PdfOcrDetectorFactory = (options?: PdfOpenOptions) => PdfOcrDetector | null;

export interface PdfPageSummary {
  pageNumber: number;
  width: number;
  height: number;
  blockCount: number;
  formulaBlockCount: number;
  columnCount: number;
  source: 'text' | 'ocr' | 'mixed' | 'none';
  ocrEngine?: 'browser' | 'tesseract';
}

export interface PdfDocumentAnalysis {
  blocks: DocumentBlock[];
  pages: PdfPageSummary[];
  ocrPageCount: number;
  bundledOcrPageCount: number;
  unreadablePageCount: number;
  formulaBlockCount: number;
  multiColumnPageCount: number;
}

export interface PdfTranslationResult {
  block: DocumentBlock;
  translatedText: string;
}

interface PdfInteractionSnapshot {
  acroForm: string | null;
  annotations: string[][];
}

export interface PdfRenderedPage {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
}

interface PdfTextFragment {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

interface PdfTextLine extends PdfTextFragment {
  sourceBlock?: DocumentBlock;
}

interface PdfAnalyzedLine extends PdfTextLine {
  contentKind: 'prose' | 'formula';
  readingOrder: number;
  columnIndex: number;
  columnCount: number;
  regionX: number;
  regionWidth: number;
}

interface PdfLineAnalysis {
  lines: PdfAnalyzedLine[];
  columnCount: number;
}

const DEFAULT_PREVIEW_SCALE = 1.35;
const OCR_SCALE = 2;
const SPARSE_TEXT_MAX_BLOCKS = 4;
const SPARSE_TEXT_MAX_CHARACTERS = 160;
const SPARSE_TEXT_MAX_PAGE_AREA_RATIO = 0.03;
const SPARSE_TEXT_MARGIN_RATIO = 0.2;
export const PDF_DOCUMENT_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
export const PDF_DOCUMENT_MAX_PAGES = 1_000;
export const PDF_DOCUMENT_MAX_PAGE_RENDER_PIXELS = 32 * 1024 * 1024;
export const PDF_DOCUMENT_MAX_TOTAL_RENDER_PIXELS = 1024 * 1024 * 1024;
const MAX_PRESERVED_INTERACTION_OBJECTS = 10_000;
const MAX_PRESERVED_PDF_GRAPH_OBJECTS = 100_000;
const MAX_PRESERVED_INTERACTION_DEPTH = 64;
const MAX_PRESERVED_INTERACTION_STRING_LENGTH = 1_000_000;
const MAX_PRESERVED_INTERACTION_NAME_LENGTH = 4_096;
const MAX_PRESERVED_INTERACTION_PAYLOAD_BYTES = 16 * 1024 * 1024;
const SIGNATURE_FIELD_TYPE = '/Sig';
const SAFE_NAMED_ACTIONS = new Set(['/FirstPage', '/LastPage', '/NextPage', '/PrevPage']);
const PDF_ACTION_TYPES = new Set([
  '/GoTo',
  '/GoTo3DView',
  '/GoToE',
  '/GoToR',
  '/Hide',
  '/ImportData',
  '/JavaScript',
  '/Launch',
  '/Movie',
  '/Named',
  '/NOP',
  '/Rendition',
  '/ResetForm',
  '/RichMediaExecute',
  '/SetOCGState',
  '/SetState',
  '/Sound',
  '/SubmitForm',
  '/Thread',
  '/Trans',
  '/URI'
]);
const UNSAFE_PDF_GRAPH_KEYS = new Set([
  '/AA',
  '/AF',
  '/Collection',
  '/EF',
  '/EmbeddedFiles',
  '/JavaScript',
  '/JS',
  '/XFA'
]);
const UNSAFE_ANNOTATION_SUBTYPES = new Set([
  '/3D',
  '/FileAttachment',
  '/Movie',
  '/RichMedia',
  '/Screen',
  '/Sound'
]);
const RASTER_IMAGE_OPERATORS = new Set<number>([
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectGroup,
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintImageXObjectRepeat,
  OPS.paintImageMaskXObjectRepeat
]);

const isUsableOcrResult = (result: PdfOcrResult): boolean => {
  const box = result?.boundingBox;
  if (typeof result?.rawValue !== 'string' || !result.rawValue.trim() || !box) return false;
  return Number.isFinite(box.x)
    && Number.isFinite(box.y)
    && Number.isFinite(box.width)
    && Number.isFinite(box.height)
    && box.width > 0
    && box.height > 0;
};

const defaultEngine: PdfEngineAdapter = {
  getDocument: params => getDocument(params as any) as unknown as PdfLoadingTaskLike,
  transform: (first, second) => Util.transform(first, second)
};

const extensionUrl = (path: string): string => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
};

const hasExtensionResourceUrls = (): boolean => (
  typeof chrome !== 'undefined' && typeof chrome.runtime?.getURL === 'function'
);

class DefaultPdfOcrDetector implements PdfOcrDetector {
  private readonly browserDetector: { detect(source: CanvasImageSource): Promise<PdfOcrResult[]> } | null;
  private readonly bundledSessions = new Map<BundledOcrLanguageCode, BundledOcrSession>();

  constructor(
    private readonly language: BundledOcrLanguageCode = 'eng',
    private readonly scanPreprocessing: DocumentScanPreprocessing = 'none',
    private readonly mixedLanguageOcr = false
  ) {
    const Detector = (globalThis as typeof globalThis & {
      TextDetector?: new () => { detect(source: CanvasImageSource): Promise<PdfOcrResult[]> };
    }).TextDetector;
    this.browserDetector = Detector ? new Detector() : null;
  }

  async detect(
    source: CanvasImageSource,
    onProgress?: (progress: PdfOcrProgress) => void,
    context?: PdfOcrDetectionContext
  ): Promise<PdfOcrResult[]> {
    const processedSource = this.prepareSource(source);
    if (this.browserDetector) {
      try {
        const browserResults = (await this.browserDetector.detect(processedSource)).filter(isUsableOcrResult);
        if (browserResults.length > 0) {
          return browserResults.map(result => ({ ...result, engine: 'browser' }));
        }
      } catch {
        // The bundled worker remains available when the browser API rejects an image.
      }
    }

    const primaryLines = await this.recognizeWithBundledLanguage(
      this.language,
      processedSource,
      onProgress
    );
    if (!this.mixedLanguageOcr) return primaryLines;

    const route = routeOcrLanguageCandidates({
      userSelectedLanguage: this.language,
      explicitText: context?.referenceText,
      ocrProbeResults: primaryLines.slice(0, 5).map(line => ({
        text: Array.from(line.rawValue).slice(0, 4_000).join(''),
        language: this.language,
        confidence: Number.isFinite(line.confidence)
          ? Math.max(0, Math.min(100, line.confidence!))
          : undefined
      }))
    });
    const additionalLanguage = route.candidates.find(candidate => candidate !== this.language);
    if (!additionalLanguage) return primaryLines;

    const additionalLines = await this.recognizeWithBundledLanguage(
      additionalLanguage,
      processedSource,
      onProgress
    );
    return [...primaryLines, ...additionalLines];
  }

  private async recognizeWithBundledLanguage(
    language: BundledOcrLanguageCode,
    source: HTMLCanvasElement,
    onProgress?: (progress: PdfOcrProgress) => void
  ): Promise<PdfOcrResult[]> {
    const session = this.getBundledSession(language);
    const lines = await session.recognize(source, progress => {
      onProgress?.({ ...progress, pageNumber: 0, engine: 'tesseract' });
    });
    return lines.map(line => ({
      rawValue: line.text,
      confidence: line.confidence,
      boundingBox: line.boundingBox,
      engine: 'tesseract'
    }));
  }

  async dispose(): Promise<void> {
    const sessions = Array.from(this.bundledSessions.values());
    this.bundledSessions.clear();
    await Promise.all(sessions.map(session => session.terminate()));
  }

  private getBundledSession(language: BundledOcrLanguageCode): BundledOcrSession {
    const existing = this.bundledSessions.get(language);
    if (existing) return existing;
    const session = bundledOcrService.createSession(language);
    this.bundledSessions.set(language, session);
    return session;
  }

  private prepareSource(source: CanvasImageSource): HTMLCanvasElement {
    if (this.scanPreprocessing === 'none') return source as HTMLCanvasElement;
    if (typeof document === 'undefined' || !(source instanceof HTMLCanvasElement)) {
      throw new Error('PDF scan preprocessing requires a browser canvas.');
    }

    const context = source.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('PDF scan preprocessing is unavailable in this browser.');
    const image = context.getImageData(0, 0, source.width, source.height);
    const result = preprocessDocumentScan(image, {
      contrast: this.scanPreprocessing === 'binarize' ? 1.15 : 1.35,
      binarize: this.scanPreprocessing === 'binarize'
    });
    const canvas = document.createElement('canvas');
    canvas.width = result.width;
    canvas.height = result.height;
    const outputContext = canvas.getContext('2d', { willReadFrequently: true });
    if (!outputContext) throw new Error('PDF scan preprocessing is unavailable in this browser.');
    const outputImage = outputContext.createImageData(result.width, result.height);
    outputImage.data.set(result.data);
    outputContext.putImageData(outputImage, 0, 0);
    return canvas;
  }
}

const createDefaultOcrDetector = (options?: PdfOpenOptions): PdfOcrDetector => {
  return new DefaultPdfOcrDetector(
    options?.ocrLanguage || 'eng',
    options?.scanPreprocessing || 'none',
    options?.mixedLanguageOcr || false
  );
};

export class PdfDocumentSession {
  private analysisPromise: Promise<PdfDocumentAnalysis> | null = null;
  private readonly pageCache = new Map<number, PdfPageLike>();

  constructor(
    private readonly pdfDocument: PdfDocumentLike,
    private readonly engine: PdfEngineAdapter,
    private readonly ocrDetector: PdfOcrDetector | null,
    private readonly onOcrProgress?: (progress: PdfOcrProgress) => void,
    private readonly sourceBytes?: Uint8Array
  ) {}

  analyze(): Promise<PdfDocumentAnalysis> {
    if (!this.analysisPromise) {
      this.analysisPromise = this.analyzeDocument();
    }
    return this.analysisPromise;
  }

  async renderPage(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale: number = DEFAULT_PREVIEW_SCALE
  ): Promise<PdfRenderedPage> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    this.assertRenderablePagePixels(viewport.width, viewport.height, pageNumber);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas rendering is not available in this browser.');

    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: context, viewport }).promise;

    return {
      pageNumber,
      width: viewport.width / scale,
      height: viewport.height / scale,
      scale
    };
  }

  async exportTranslatedPdf(results: PdfTranslationResult[]): Promise<Uint8Array> {
    const analysis = await this.analyze();
    if (analysis.pages.length === 0) throw new Error('The PDF has no renderable pages.');

    const output = await PDFDocument.create();
    output.setProducer('LexiBridge Translate');
    output.setCreator('LexiBridge Translate');

    for (const pageSummary of analysis.pages) {
      const canvas = this.createCanvas();
      const rendered = await this.renderPage(pageSummary.pageNumber, canvas, 1.6);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas rendering is not available in this browser.');

      this.drawTranslatedBlocks(
        context,
        results.filter(result => result.block.layout?.pageNumber === pageSummary.pageNumber),
        rendered
      );

      const image = await output.embedPng(canvas.toDataURL('image/png'));
      const outputPage = output.addPage([pageSummary.width, pageSummary.height]);
      outputPage.drawImage(image, {
        x: 0,
        y: 0,
        width: pageSummary.width,
        height: pageSummary.height
      });
    }

    return new Uint8Array(await output.save());
  }

  async exportTranslatedPdfPreservingInteractions(
    results: PdfTranslationResult[]
  ): Promise<Uint8Array> {
    const analysis = await this.analyze();
    if (analysis.pages.length === 0) throw new Error('The PDF has no renderable pages.');
    if (!this.sourceBytes) {
      throw new Error('The original PDF bytes are unavailable for interaction-preserving export.');
    }

    let output: PDFDocument;
    try {
      output = await PDFDocument.load(this.sourceBytes.slice(), {
        throwOnInvalidObject: true,
        updateMetadata: false
      });
    } catch (error) {
      throw new Error(
        `Cannot preserve PDF forms and annotations because the original PDF could not be loaded: ${this.describeError(error)}`
      );
    }

    if (output.isEncrypted) {
      throw new Error('Cannot preserve PDF forms and annotations in an encrypted PDF.');
    }
    if (output.getPageCount() !== analysis.pages.length) {
      throw new Error('Cannot preserve PDF interactions because the source page count changed during export.');
    }

    const sourceAnnotationPresence = pagesHaveDirectAnnotations(output);
    const sourceSnapshot = this.captureInteractionSnapshot(output, 'source PDF');
    const pages = output.getPages();

    for (const pageSummary of analysis.pages) {
      const pageResults = results.filter(result => (
        result.block.layout?.pageNumber === pageSummary.pageNumber
        && result.block.layout.contentKind !== 'formula'
        && Boolean(result.translatedText.trim())
      ));
      if (pageResults.length === 0) continue;

      const page = pages[pageSummary.pageNumber - 1];
      if (!page) {
        throw new Error(`Cannot preserve PDF interactions because page ${pageSummary.pageNumber} is missing.`);
      }
      const canvas = this.createCanvas();
      const rendered: PdfRenderedPage = {
        pageNumber: pageSummary.pageNumber,
        width: pageSummary.width,
        height: pageSummary.height,
        scale: 1.6
      };
      canvas.width = Math.max(1, Math.ceil(rendered.width * rendered.scale));
      canvas.height = Math.max(1, Math.ceil(rendered.height * rendered.scale));
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('Canvas rendering is not available in this browser.');

      context.clearRect(0, 0, canvas.width, canvas.height);
      this.drawTranslatedBlocks(context, pageResults, rendered);

      const image = await output.embedPng(canvas.toDataURL('image/png'));
      this.drawPreservedTranslationLayer(page, image, rendered.width, rendered.height);
    }

    // pdf-lib normalizes pages when drawing and may create an empty /Annots entry.
    // Remove only entries that did not exist in the source; preserve explicit empty arrays.
    output.getPages().forEach((page, pageIndex) => {
      if (sourceAnnotationPresence[pageIndex]) return;
      const annotations = page.node.get(PDFName.Annots);
      if (annotations instanceof PDFArray && annotations.size() === 0) {
        page.node.delete(PDFName.Annots);
      }
    });

    let bytes: Uint8Array;
    try {
      bytes = await output.save({ updateFieldAppearances: false });
    } catch (error) {
      throw new Error(
        `Cannot preserve PDF forms and annotations while saving the translated PDF: ${this.describeError(error)}`
      );
    }

    let reopened: PDFDocument;
    try {
      reopened = await PDFDocument.load(bytes, {
        throwOnInvalidObject: true,
        updateMetadata: false
      });
    } catch (error) {
      throw new Error(
        `Cannot verify preserved PDF forms and annotations after export: ${this.describeError(error)}`
      );
    }
    const exportedSnapshot = this.captureInteractionSnapshot(reopened, 'exported PDF');
    if (JSON.stringify(sourceSnapshot) !== JSON.stringify(exportedSnapshot)) {
      throw new Error(
        'Cannot verify that the original PDF forms and annotations were preserved; no PDF was exported.'
      );
    }

    return new Uint8Array(bytes);
  }

  async destroy(): Promise<void> {
    this.pageCache.clear();
    await this.pdfDocument.destroy();
  }

  private async analyzeDocument(): Promise<PdfDocumentAnalysis> {
    const blocks: DocumentBlock[] = [];
    const pages: PdfPageSummary[] = [];
    let ocrPageCount = 0;
    let bundledOcrPageCount = 0;
    let unreadablePageCount = 0;
    let formulaBlockCount = 0;
    let multiColumnPageCount = 0;
    let totalRenderPixels = 0;

    try {
      for (let pageNumber = 1; pageNumber <= this.pdfDocument.numPages; pageNumber++) {
        const page = await this.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const pageRenderPixels = this.getPageRenderPixels(
          viewport.width * OCR_SCALE,
          viewport.height * OCR_SCALE,
          pageNumber
        );
        totalRenderPixels += pageRenderPixels;
        if (totalRenderPixels > PDF_DOCUMENT_MAX_TOTAL_RENDER_PIXELS) {
          throw new Error('The selected PDF exceeds the total rendered-pixel safety limit.');
        }
        const textContent = await page.getTextContent();
        const textBlocks = this.createTextBlocks(textContent.items, pageNumber, viewport);
        let pageBlocks = textBlocks;
        let source: PdfPageSummary['source'] = 'text';
        let ocrEngine: PdfPageSummary['ocrEngine'];

        if (this.ocrDetector && await this.shouldRunOcr(page, textBlocks, viewport)) {
          const ocrResult = await this.createOcrBlocks(
            page,
            this.ocrDetector,
            pageNumber,
            viewport,
            textBlocks.map(block => block.originalText).join(' ').slice(0, 20_000)
          );
          ocrEngine = ocrResult.engine;
          if (ocrResult.blocks.length > 0) {
            ocrPageCount++;
            if (ocrEngine === 'tesseract') bundledOcrPageCount++;
          }
          pageBlocks = this.mergePageBlocks(textBlocks, ocrResult.blocks, viewport);
          const hasTextBlocks = pageBlocks.some(block => block.layout?.source === 'pdf-text');
          const hasOcrBlocks = pageBlocks.some(block => block.layout?.source === 'pdf-ocr');
          source = hasTextBlocks && hasOcrBlocks
            ? 'mixed'
            : hasOcrBlocks
              ? 'ocr'
              : hasTextBlocks
                ? 'text'
                : 'none';
        }

        if (pageBlocks.length === 0) {
          source = 'none';
          unreadablePageCount++;
        }

        const pageFormulaBlockCount = pageBlocks.filter(
          block => block.layout?.contentKind === 'formula'
        ).length;
        const pageColumnCount = pageBlocks.reduce(
          (maximum, block) => Math.max(maximum, block.layout?.columnCount || 1),
          1
        );
        formulaBlockCount += pageFormulaBlockCount;
        if (pageColumnCount > 1) multiColumnPageCount++;

        for (const block of pageBlocks) {
          block.id = blocks.length + 1;
          blocks.push(block);
        }

        pages.push({
          pageNumber,
          width: viewport.width,
          height: viewport.height,
          blockCount: pageBlocks.length,
          formulaBlockCount: pageFormulaBlockCount,
          columnCount: pageColumnCount,
          source,
          ...(ocrEngine ? { ocrEngine } : {})
        });
      }
    } finally {
      await this.ocrDetector?.dispose?.();
    }

    return {
      blocks,
      pages,
      ocrPageCount,
      bundledOcrPageCount,
      unreadablePageCount,
      formulaBlockCount,
      multiColumnPageCount
    };
  }

  private createTextBlocks(
    items: Array<PdfTextItemLike | { type: string }>,
    pageNumber: number,
    viewport: PdfViewportLike
  ): DocumentBlock[] {
    const fragments = items
      .filter((item): item is PdfTextItemLike => 'str' in item && Boolean(item.str.trim()))
      .map(item => this.createTextFragment(item, viewport))
      .filter((fragment): fragment is PdfTextFragment => Boolean(fragment));
    const lineAnalysis = this.analyzePageLines(
      this.groupFragmentsIntoLines(fragments, viewport.width),
      viewport.width
    );

    return lineAnalysis.lines.map((line, index) => ({
      id: index + 1,
      originalText: line.text,
      layout: this.createLayout(
        pageNumber,
        line.x,
        line.y,
        line.width,
        line.height,
        viewport,
        'pdf-text',
        line
      )
    }));
  }

  private async shouldRunOcr(
    page: PdfPageLike,
    textBlocks: DocumentBlock[],
    viewport: PdfViewportLike
  ): Promise<boolean> {
    if (textBlocks.length === 0) return true;
    if (!this.hasSparseText(textBlocks, viewport)) return false;
    if (!page.getOperatorList) return this.isTextConfinedToPageMargins(textBlocks, viewport);

    try {
      const operatorList = await page.getOperatorList();
      if (operatorList.fnArray.some(operator => RASTER_IMAGE_OPERATORS.has(operator))) return true;
      return false;
    } catch {
      // Sparse marginal text is still safer to supplement when operator inspection is unavailable.
      return this.isTextConfinedToPageMargins(textBlocks, viewport);
    }
  }

  private hasSparseText(
    blocks: DocumentBlock[],
    viewport: PdfViewportLike
  ): boolean {
    if (blocks.length > SPARSE_TEXT_MAX_BLOCKS || viewport.width <= 0 || viewport.height <= 0) {
      return false;
    }

    const characterCount = blocks.reduce(
      (total, block) => total + Array.from(block.originalText.replace(/\s+/g, '')).length,
      0
    );
    if (characterCount > SPARSE_TEXT_MAX_CHARACTERS) return false;

    const occupiedArea = blocks.reduce((total, block) => {
      const layout = block.layout;
      if (!layout) return total;
      const left = Math.max(0, layout.x);
      const top = Math.max(0, layout.y);
      const right = Math.min(viewport.width, layout.x + layout.width);
      const bottom = Math.min(viewport.height, layout.y + layout.height);
      return total + Math.max(0, right - left) * Math.max(0, bottom - top);
    }, 0);
    if (occupiedArea / (viewport.width * viewport.height) > SPARSE_TEXT_MAX_PAGE_AREA_RATIO) {
      return false;
    }

    return true;
  }

  private isTextConfinedToPageMargins(
    blocks: DocumentBlock[],
    viewport: PdfViewportLike
  ): boolean {
    if (viewport.height <= 0) return false;

    const marginBoundary = viewport.height * SPARSE_TEXT_MARGIN_RATIO;
    return blocks.every(block => {
      const layout = block.layout;
      if (!layout) return false;
      const verticalCenter = layout.y + layout.height / 2;
      return verticalCenter <= marginBoundary
        || verticalCenter >= viewport.height - marginBoundary;
    });
  }

  private mergePageBlocks(
    textBlocks: DocumentBlock[],
    ocrBlocks: DocumentBlock[],
    viewport: PdfViewportLike
  ): DocumentBlock[] {
    if (ocrBlocks.length === 0) return textBlocks;

    const retained = [...textBlocks];
    for (const ocrBlock of ocrBlocks) {
      if (!retained.some(block => this.areDuplicateBlocks(block, ocrBlock))) {
        retained.push(ocrBlock);
      }
    }

    const combinedLines: PdfTextLine[] = retained.map(block => {
      const layout = block.layout!;
      return {
        text: block.originalText,
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        hasEOL: true,
        sourceBlock: block
      };
    });
    const lineAnalysis = this.analyzePageLines(combinedLines, viewport.width);

    return lineAnalysis.lines.map((line, index) => {
      const sourceBlock = line.sourceBlock!;
      const layout = sourceBlock.layout!;
      return {
        ...sourceBlock,
        id: index + 1,
        layout: {
          ...layout,
          contentKind: line.contentKind,
          readingOrder: line.readingOrder,
          columnIndex: line.columnIndex,
          columnCount: line.columnCount,
          regionX: Math.max(0, Math.round(line.regionX * 100) / 100),
          regionWidth: Math.max(8, Math.round(line.regionWidth * 100) / 100)
        }
      };
    });
  }

  private areDuplicateBlocks(preferred: DocumentBlock, candidate: DocumentBlock): boolean {
    const preferredLayout = preferred.layout;
    const candidateLayout = candidate.layout;
    if (!preferredLayout || !candidateLayout || preferredLayout.pageNumber !== candidateLayout.pageNumber) {
      return false;
    }
    if (!this.haveEquivalentGeometry(preferredLayout, candidateLayout)) return false;

    const preferredText = this.normalizeComparableText(preferred.originalText);
    const candidateText = this.normalizeComparableText(candidate.originalText);
    if (!preferredText || !candidateText) return false;
    if (preferredText === candidateText) return true;

    if (
      preferredLayout.source === 'pdf-text'
      && candidateLayout.source === 'pdf-ocr'
      && candidateText.length >= 4
      && preferredText.includes(candidateText)
    ) {
      return true;
    }

    const longestLength = Math.max(preferredText.length, candidateText.length);
    const shortestLength = Math.min(preferredText.length, candidateText.length);
    const allowedDistance = Math.max(1, Math.floor(longestLength * 0.18));
    if (shortestLength < 4 || longestLength - shortestLength > allowedDistance) return false;
    if (preferredText.includes(candidateText) || candidateText.includes(preferredText)) return true;
    return this.editDistance(preferredText, candidateText) <= allowedDistance;
  }

  private haveEquivalentGeometry(
    first: DocumentBlockLayout,
    second: DocumentBlockLayout
  ): boolean {
    const intersectionWidth = Math.max(
      0,
      Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x)
    );
    const intersectionHeight = Math.max(
      0,
      Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y)
    );
    const intersectionArea = intersectionWidth * intersectionHeight;
    const smallestArea = Math.min(first.width * first.height, second.width * second.height);
    if (smallestArea > 0 && intersectionArea / smallestArea >= 0.45) return true;

    const verticalOverlap = intersectionHeight / Math.max(1, Math.min(first.height, second.height));
    const firstCenterX = first.x + first.width / 2;
    const secondCenterX = second.x + second.width / 2;
    const horizontalTolerance = Math.max(
      Math.max(first.height, second.height) * 2,
      Math.max(first.width, second.width) * 0.25
    );
    return verticalOverlap >= 0.55 && Math.abs(firstCenterX - secondCenterX) <= horizontalTolerance;
  }

  private normalizeComparableText(text: string): string {
    return text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\p{P}]+/gu, '');
  }

  private editDistance(first: string, second: string): number {
    let previous = Array.from({ length: second.length + 1 }, (_, index) => index);

    for (let firstIndex = 1; firstIndex <= first.length; firstIndex++) {
      const current = [firstIndex];
      for (let secondIndex = 1; secondIndex <= second.length; secondIndex++) {
        const substitutionCost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
        current[secondIndex] = Math.min(
          (current[secondIndex - 1] || 0) + 1,
          (previous[secondIndex] || 0) + 1,
          (previous[secondIndex - 1] || 0) + substitutionCost
        );
      }
      previous = current;
    }

    return previous[second.length] || 0;
  }

  private createTextFragment(item: PdfTextItemLike, viewport: PdfViewportLike): PdfTextFragment | null {
    const transformed = this.engine.transform(viewport.transform, item.transform);
    if (transformed.length < 6) return null;

    const fontHeight = Math.max(
      4,
      Math.hypot(transformed[2] || 0, transformed[3] || 0),
      item.height || 0
    );
    const x = transformed[4] || 0;
    const baseline = transformed[5] || 0;

    return {
      text: item.str.replace(/\s+/g, ' ').trim(),
      x,
      y: baseline - fontHeight,
      width: Math.max(2, item.width || 0),
      height: fontHeight,
      hasEOL: Boolean(item.hasEOL)
    };
  }

  private groupFragmentsIntoLines(fragments: PdfTextFragment[], pageWidth: number): PdfTextLine[] {
    const sorted = [...fragments].sort((first, second) => {
      const verticalDifference = first.y - second.y;
      return Math.abs(verticalDifference) > 2 ? verticalDifference : first.x - second.x;
    });
    const lines: PdfTextLine[] = [];

    for (const fragment of sorted) {
      const previous = lines[lines.length - 1];
      const previousRight = previous ? previous.x + previous.width : 0;
      const gap = previous ? fragment.x - previousRight : 0;
      const maximumJoinGap = Math.min(
        pageWidth * 0.08,
        Math.max(18, Math.min(previous?.height || fragment.height, fragment.height) * 4)
      );
      const sameLine = previous
        && !previous.hasEOL
        && Math.abs(previous.y - fragment.y) <= Math.max(2.5, Math.min(previous.height, fragment.height) * 0.45)
        && gap <= maximumJoinGap;

      if (!sameLine || !previous) {
        lines.push({ ...fragment });
        continue;
      }

      const separator = gap > Math.max(1.5, Math.min(previous.height, fragment.height) * 0.12) ? ' ' : '';
      previous.text = `${previous.text}${separator}${fragment.text}`.replace(/\s+/g, ' ').trim();
      previous.x = Math.min(previous.x, fragment.x);
      previous.y = Math.min(previous.y, fragment.y);
      previous.width = Math.max(previousRight, fragment.x + fragment.width) - previous.x;
      previous.height = Math.max(previous.height, fragment.height);
      previous.hasEOL = fragment.hasEOL;
    }

    return lines.filter(line => line.text.trim());
  }

  private analyzePageLines(lines: PdfTextLine[], pageWidth: number): PdfLineAnalysis {
    const sorted = [...lines].sort((first, second) => first.y - second.y || first.x - second.x);
    const singleColumn = (): PdfLineAnalysis => ({
      columnCount: 1,
      lines: sorted.map((line, index) => ({
        ...line,
        contentKind: this.isLikelyFormulaText(line.text) ? 'formula' : 'prose',
        readingOrder: index,
        columnIndex: 1,
        columnCount: 1,
        regionX: 0,
        regionWidth: pageWidth
      }))
    });
    if (sorted.length < 4 || pageWidth <= 0) return singleColumn();

    const pageCenter = pageWidth / 2;
    const wideLineThreshold = pageWidth * 0.62;
    const leftCandidates = sorted.filter(line => (
      line.width < wideLineThreshold
      && line.x + line.width / 2 < pageCenter
    ));
    const rightCandidates = sorted.filter(line => (
      line.width < wideLineThreshold
      && line.x + line.width / 2 >= pageCenter
    ));
    if (leftCandidates.length < 2 || rightCandidates.length < 2) return singleColumn();

    const leftStart = this.median(leftCandidates.map(line => line.x));
    const rightStart = this.median(rightCandidates.map(line => line.x));
    if (rightStart - leftStart < pageWidth * 0.28) return singleColumn();

    const leftEdge = this.percentile(
      leftCandidates.map(line => line.x + line.width),
      0.8
    );
    const rightEdge = this.percentile(rightCandidates.map(line => line.x), 0.2);
    if (rightEdge - leftEdge < pageWidth * 0.015) return singleColumn();

    const leftTop = Math.min(...leftCandidates.map(line => line.y));
    const leftBottom = Math.max(...leftCandidates.map(line => line.y + line.height));
    const rightTop = Math.min(...rightCandidates.map(line => line.y));
    const rightBottom = Math.max(...rightCandidates.map(line => line.y + line.height));
    const overlap = Math.min(leftBottom, rightBottom) - Math.max(leftTop, rightTop);
    const shortestColumnHeight = Math.min(leftBottom - leftTop, rightBottom - rightTop);
    if (overlap < Math.max(12, shortestColumnHeight * 0.2)) return singleColumn();

    const divider = (leftEdge + rightEdge) / 2;
    const pageMargin = Math.max(0, Math.min(
      leftStart,
      pageWidth - Math.max(...rightCandidates.map(line => line.x + line.width))
    ));
    const leftRegionX = pageMargin;
    const leftRegionWidth = Math.max(8, divider - leftRegionX);
    const rightRegionX = divider;
    const rightRegionWidth = Math.max(8, pageWidth - pageMargin - rightRegionX);

    const classified = sorted.map(line => {
      const crossesDivider = line.x < divider && line.x + line.width > divider;
      const isWide = line.width >= wideLineThreshold;
      const columnIndex = isWide || crossesDivider
        ? 0
        : line.x + line.width / 2 < pageCenter
          ? 1
          : 2;
      return { line, columnIndex };
    });
    const ordered: Array<{ line: PdfTextLine; columnIndex: number }> = [];
    let segment: Array<{ line: PdfTextLine; columnIndex: number }> = [];
    const flushSegment = (): void => {
      if (segment.length === 0) return;
      const left = segment.filter(item => item.columnIndex === 1);
      const right = segment.filter(item => item.columnIndex === 2);
      const other = segment.filter(item => item.columnIndex === 0);
      if (left.length > 0 && right.length > 0) {
        ordered.push(...left, ...right, ...other);
      } else {
        ordered.push(...segment);
      }
      segment = [];
    };

    for (const item of classified) {
      if (item.columnIndex === 0) {
        flushSegment();
        ordered.push(item);
      } else {
        segment.push(item);
      }
    }
    flushSegment();

    return {
      columnCount: 2,
      lines: ordered.map((item, index) => ({
        ...item.line,
        contentKind: this.isLikelyFormulaText(item.line.text) ? 'formula' : 'prose',
        readingOrder: index,
        columnIndex: item.columnIndex,
        columnCount: item.columnIndex === 0 ? 1 : 2,
        regionX: item.columnIndex === 1
          ? leftRegionX
          : item.columnIndex === 2
            ? rightRegionX
            : 0,
        regionWidth: item.columnIndex === 1
          ? leftRegionWidth
          : item.columnIndex === 2
            ? rightRegionWidth
            : pageWidth
      }))
    };
  }

  private isLikelyFormulaText(text: string): boolean {
    const value = text.trim();
    if (!value || value.length > 240) return false;
    if (/\\(?:frac|sum|prod|int|sqrt|begin|left|right)\b/.test(value)) return true;

    const proseWords = value.match(/[A-Za-z]{3,}|[\u4e00-\u9fff]{2,}/g) || [];
    const endsLikeSentence = /[.!?。！？]$/.test(value);
    const specializedSymbols = value.match(/[∑∏∫√∞≈≠≤≥±×÷∂∆∇∈∉⊂⊆∪∩]/g) || [];
    if (specializedSymbols.length > 0) {
      if (endsLikeSentence && proseWords.length >= 3) return false;
      return proseWords.length <= 5;
    }
    const operators = value.match(/[=+*/^<>]|(?:->)|(?:=>)/g) || [];
    if (operators.length === 0) return false;
    if (endsLikeSentence && proseWords.length >= 2) return false;
    const compactLength = value.replace(/\s+/g, '').length || 1;
    const operatorDensity = operators.length / compactLength;
    const equationShape = /(?:^|[\s(])[A-Za-z\d][^=]{0,48}=[^=]/.test(value);
    return (equationShape && proseWords.length <= 4) || (operatorDensity >= 0.12 && proseWords.length <= 3);
  }

  private median(values: number[]): number {
    return this.percentile(values, 0.5);
  }

  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((first, second) => first - second);
    const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * percentile)));
    return sorted[index] || 0;
  }

  private async createOcrBlocks(
    page: PdfPageLike,
    detector: PdfOcrDetector,
    pageNumber: number,
    baseViewport: PdfViewportLike,
    referenceText = ''
  ): Promise<{ blocks: DocumentBlock[]; engine?: 'browser' | 'tesseract' }> {
    const canvas = this.createCanvas();
    const viewport = page.getViewport({ scale: OCR_SCALE });
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return { blocks: [] };

    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: context, viewport }).promise;

    const detected = await detector.detect(
      canvas,
      progress => this.onOcrProgress?.({ ...progress, pageNumber }),
      { referenceText }
    );
    const usableResults = detected.filter(isUsableOcrResult);
    const engine = usableResults.find(result => result.engine)?.engine;
    const lines = usableResults
      .sort((first, second) => first.boundingBox.y - second.boundingBox.y || first.boundingBox.x - second.boundingBox.x)
      .map(result => ({
        text: result.rawValue.replace(/\s+/g, ' ').trim(),
        x: result.boundingBox.x / OCR_SCALE,
        y: result.boundingBox.y / OCR_SCALE,
        width: result.boundingBox.width / OCR_SCALE,
        height: result.boundingBox.height / OCR_SCALE,
        hasEOL: true
      }));
    const lineAnalysis = this.analyzePageLines(lines, baseViewport.width);
    const blocks = lineAnalysis.lines.map((line, index) => ({
      id: index + 1,
      originalText: line.text,
      layout: this.createLayout(
        pageNumber,
        line.x,
        line.y,
        line.width,
        line.height,
        baseViewport,
        'pdf-ocr',
        line
      )
    }));
    return { blocks, ...(engine ? { engine } : {}) };
  }

  private createLayout(
    pageNumber: number,
    x: number,
    y: number,
    width: number,
    height: number,
    viewport: PdfViewportLike,
    source: 'pdf-text' | 'pdf-ocr',
    line?: PdfAnalyzedLine
  ): DocumentBlockLayout {
    return {
      pageNumber,
      x: Math.max(0, Math.round(x * 100) / 100),
      y: Math.max(0, Math.round(y * 100) / 100),
      width: Math.max(8, Math.round(width * 100) / 100),
      height: Math.max(8, Math.round(height * 100) / 100),
      pageWidth: viewport.width,
      pageHeight: viewport.height,
      ...(line ? {
        contentKind: line.contentKind,
        readingOrder: line.readingOrder,
        columnIndex: line.columnIndex,
        columnCount: line.columnCount,
        regionX: Math.max(0, Math.round(line.regionX * 100) / 100),
        regionWidth: Math.max(8, Math.round(line.regionWidth * 100) / 100)
      } : {}),
      source
    };
  }

  private async getPage(pageNumber: number): Promise<PdfPageLike> {
    const cached = this.pageCache.get(pageNumber);
    if (cached) return cached;

    const page = await this.pdfDocument.getPage(pageNumber);
    this.pageCache.set(pageNumber, page);
    return page;
  }

  private createCanvas(): HTMLCanvasElement {
    if (typeof document === 'undefined') {
      throw new Error('PDF rendering requires a browser document.');
    }
    return document.createElement('canvas');
  }

  private drawPreservedTranslationLayer(
    page: ReturnType<PDFDocument['getPages']>[number],
    image: Awaited<ReturnType<PDFDocument['embedPng']>>,
    renderedWidth: number,
    renderedHeight: number
  ): void {
    const cropBox = page.getCropBox();
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const isQuarterTurn = rotation === 90 || rotation === 270;
    const targetVisualWidth = isQuarterTurn ? cropBox.height : cropBox.width;
    const targetVisualHeight = isQuarterTurn ? cropBox.width : cropBox.height;
    const horizontalScale = targetVisualWidth / renderedWidth;
    const verticalScale = targetVisualHeight / renderedHeight;
    if (
      !Number.isFinite(horizontalScale)
      || !Number.isFinite(verticalScale)
      || horizontalScale <= 0
      || verticalScale <= 0
      || Math.abs(horizontalScale - verticalScale) > 0.01
    ) {
      throw new Error('Cannot preserve PDF interactions because the rendered page geometry is incompatible.');
    }
    const scale = Math.min(horizontalScale, verticalScale);
    const width = renderedWidth * scale;
    const height = renderedHeight * scale;

    if (rotation === 0) {
      page.drawImage(image, { x: cropBox.x, y: cropBox.y, width, height });
      return;
    }
    if (rotation === 90) {
      page.drawImage(image, {
        x: cropBox.x + cropBox.width,
        y: cropBox.y,
        width,
        height,
        rotate: degrees(90)
      });
      return;
    }
    if (rotation === 180) {
      page.drawImage(image, {
        x: cropBox.x + cropBox.width,
        y: cropBox.y + cropBox.height,
        width,
        height,
        rotate: degrees(180)
      });
      return;
    }
    if (rotation === 270) {
      page.drawImage(image, {
        x: cropBox.x,
        y: cropBox.y + cropBox.height,
        width,
        height,
        rotate: degrees(-90)
      });
      return;
    }
    throw new Error(`Cannot preserve PDF interactions on a page rotated by ${rotation} degrees.`);
  }

  private captureInteractionSnapshot(
    document: PDFDocument,
    label: string
  ): PdfInteractionSnapshot {
    const acroForm = document.catalog.get(PDFName.of('AcroForm'));
    const annotationRoots = document.getPages()
      .map(page => page.node.get(PDFName.Annots))
      .filter((object): object is PDFObject => Boolean(object));
    if (
      document.catalog.has(PDFName.of('Perms'))
      || this.containsSignatureField(document, [acroForm, ...annotationRoots])
    ) {
      throw new Error(
        'Cannot preserve a PDF signature during translation export because changing the document invalidates the signature.'
      );
    }
    this.assertSafePreservedInteractions(document, acroForm, annotationRoots, label);

    const state = { objectCount: 0, payloadBytes: 0 };
    return {
      acroForm: acroForm
        ? this.serializeInteractionObject(document, acroForm, state, new Set(), 0, label)
        : null,
      annotations: document.getPages().map((page, pageIndex) => {
        const annotations = page.node.get(PDFName.Annots);
        if (!annotations) return [];
        const annotationArray = document.context.lookupMaybe(annotations, PDFArray);
        if (!annotationArray) {
          throw new Error(
            `Cannot verify preserved interactions because ${label} page ${pageIndex + 1} has an invalid annotations array.`
          );
        }
        const snapshots: string[] = [];
        for (let index = 0; index < annotationArray.size(); index++) {
          snapshots.push(this.serializeInteractionObject(
            document,
            annotationArray.get(index),
            state,
            new Set(),
            0,
            label
          ));
        }
        return snapshots;
      })
    };
  }

  private containsSignatureField(
    document: PDFDocument,
    roots: Array<PDFObject | undefined>
  ): boolean {
    const queue = roots.filter((object): object is PDFObject => Boolean(object));
    if (queue.length > MAX_PRESERVED_INTERACTION_OBJECTS) {
      throw new Error('Cannot preserve PDF interactions because the form structure exceeds the safety limit.');
    }
    const visitedRefs = new Set<string>();
    let objectCount = 0;
    const enqueue = (object: PDFObject): void => {
      if (queue.length >= MAX_PRESERVED_INTERACTION_OBJECTS) {
        throw new Error('Cannot preserve PDF interactions because the form structure exceeds the safety limit.');
      }
      queue.push(object);
    };

    while (queue.length > 0) {
      if (++objectCount > MAX_PRESERVED_INTERACTION_OBJECTS) {
        throw new Error('Cannot preserve PDF interactions because the form structure exceeds the safety limit.');
      }
      const object = queue.shift()!;
      if (object instanceof PDFRef) {
        if (visitedRefs.has(object.tag)) continue;
        visitedRefs.add(object.tag);
        const resolved = document.context.lookup(object);
        if (resolved) enqueue(resolved);
        continue;
      }
      if (object instanceof PDFArray) {
        for (let index = 0; index < object.size(); index++) enqueue(object.get(index));
        continue;
      }
      if (!(object instanceof PDFDict)) continue;
      const fieldType = object.get(PDFName.of('FT'));
      const resolvedFieldType = document.context.lookup(fieldType);
      if (resolvedFieldType instanceof PDFName && resolvedFieldType.toString() === SIGNATURE_FIELD_TYPE) {
        return true;
      }
      const fields = object.get(PDFName.of('Fields'));
      const kids = object.get(PDFName.of('Kids'));
      const parent = object.get(PDFName.of('Parent'));
      if (fields) enqueue(fields);
      if (kids) enqueue(kids);
      if (parent) enqueue(parent);
    }
    return false;
  }

  private assertSafePreservedInteractions(
    document: PDFDocument,
    acroForm: PDFObject | undefined,
    annotationRoots: PDFObject[],
    label: string
  ): void {
    const resolvedAcroForm = acroForm ? document.context.lookup(acroForm) : undefined;
    if (resolvedAcroForm instanceof PDFDict && resolvedAcroForm.has(PDFName.of('XFA'))) {
      throw new Error(`Cannot preserve ${label} because XFA forms may contain active content.`);
    }
    const names = document.context.lookup(document.catalog.get(PDFName.of('Names')));
    if (names instanceof PDFDict) {
      if (names.has(PDFName.of('JavaScript'))) {
        throw new Error(`Cannot preserve ${label} because document JavaScript is not allowed.`);
      }
      if (names.has(PDFName.of('EmbeddedFiles'))) {
        throw new Error(`Cannot preserve ${label} because embedded files are not allowed.`);
      }
    }
    if (
      document.catalog.has(PDFName.of('AA'))
      || document.catalog.has(PDFName.of('AF'))
      || document.catalog.has(PDFName.of('Collection'))
    ) {
      throw new Error(`Cannot preserve ${label} because automatic document actions are not allowed.`);
    }
    if (document.getPages().some(page => page.node.has(PDFName.of('AA')))) {
      throw new Error(`Cannot preserve ${label} because automatic page actions are not allowed.`);
    }
    const openAction = document.catalog.get(PDFName.of('OpenAction'));
    if (openAction) {
      const resolved = document.context.lookup(openAction);
      if (!(resolved instanceof PDFArray)
        && !(resolved instanceof PDFName)
        && !(resolved instanceof PDFString)
        && !(resolved instanceof PDFHexString)) {
        this.assertSafePdfAction(document, openAction, true, new Set(), 0, label);
      }
    }
    this.assertSafePdfObjectGraph(document, label);

    const queue = [acroForm, ...annotationRoots].filter((object): object is PDFObject => Boolean(object));
    const visitedRefs = new Set<string>();
    let objectCount = 0;
    while (queue.length > 0) {
      if (++objectCount > MAX_PRESERVED_INTERACTION_OBJECTS) {
        throw new Error(`Cannot preserve ${label} because the interaction structure exceeds the safety limit.`);
      }
      const object = queue.shift()!;
      if (object instanceof PDFRef) {
        if (visitedRefs.has(object.tag)) continue;
        visitedRefs.add(object.tag);
        const resolved = document.context.lookup(object);
        if (resolved) queue.push(resolved);
        continue;
      }
      if (object instanceof PDFArray) {
        if (object.size() > MAX_PRESERVED_INTERACTION_OBJECTS - queue.length) {
          throw new Error(`Cannot preserve ${label} because the interaction structure exceeds the safety limit.`);
        }
        for (let index = 0; index < object.size(); index++) queue.push(object.get(index));
        continue;
      }
      if (!(object instanceof PDFDict)) continue;

      const subtype = document.context.lookup(object.get(PDFName.of('Subtype')));
      if (subtype instanceof PDFName && UNSAFE_ANNOTATION_SUBTYPES.has(subtype.toString())) {
        throw new Error(`Cannot preserve ${label} because active ${subtype.toString()} annotations are not allowed.`);
      }
      if (object.has(PDFName.of('AA'))) {
        throw new Error(`Cannot preserve ${label} because automatic form or annotation actions are not allowed.`);
      }
      const action = object.get(PDFName.of('A'));
      if (action) this.assertSafePdfAction(document, action, false, new Set(), 0, label);

      for (const key of ['Fields', 'Kids', 'Parent']) {
        const child = object.get(PDFName.of(key));
        if (child) queue.push(child);
      }
      if (queue.length > MAX_PRESERVED_INTERACTION_OBJECTS) {
        throw new Error(`Cannot preserve ${label} because the interaction structure exceeds the safety limit.`);
      }
    }
  }

  private assertSafePdfObjectGraph(document: PDFDocument, label: string): void {
    const indirectObjects = document.context.enumerateIndirectObjects();
    if (indirectObjects.length > MAX_PRESERVED_PDF_GRAPH_OBJECTS) {
      throw new Error(`Cannot preserve ${label} because the PDF object graph exceeds the safety limit.`);
    }

    const queue: PDFObject[] = [document.catalog, ...indirectObjects.map(([, object]) => object)];
    const visited = new Set<PDFObject>();
    let objectCount = 0;

    while (queue.length > 0) {
      const object = queue.shift()!;
      if (object instanceof PDFRef || visited.has(object)) continue;
      visited.add(object);
      if (++objectCount > MAX_PRESERVED_PDF_GRAPH_OBJECTS) {
        throw new Error(`Cannot preserve ${label} because the PDF object graph exceeds the safety limit.`);
      }
      if (object instanceof PDFArray) {
        for (let index = 0; index < object.size(); index++) queue.push(object.get(index));
        continue;
      }

      const dictionary = object instanceof PDFStream
        ? object.dict
        : object instanceof PDFDict
          ? object
          : null;
      if (!dictionary) {
        if (
          object instanceof PDFName
          && object.toString().length > MAX_PRESERVED_INTERACTION_NAME_LENGTH
        ) {
          throw new Error(`Cannot preserve ${label} because the PDF object graph contains an oversized name.`);
        }
        continue;
      }

      const fieldType = document.context.lookup(dictionary.get(PDFName.of('FT')));
      const objectType = document.context.lookup(dictionary.get(PDFName.of('Type')));
      const actionType = document.context.lookup(dictionary.get(PDFName.of('S')));
      if (
        (objectType instanceof PDFName && objectType.toString() === '/Action')
        || (actionType instanceof PDFName && PDF_ACTION_TYPES.has(actionType.toString()))
      ) {
        this.assertSafePdfAction(document, dictionary, false, new Set(), 0, label);
      }
      if (
        (fieldType instanceof PDFName && fieldType.toString() === SIGNATURE_FIELD_TYPE)
        || (objectType instanceof PDFName && objectType.toString() === SIGNATURE_FIELD_TYPE)
      ) {
        throw new Error(
          'Cannot preserve a PDF signature during translation export because changing the document invalidates the signature.'
        );
      }
      const subtype = document.context.lookup(dictionary.get(PDFName.of('Subtype')));
      if (subtype instanceof PDFName && UNSAFE_ANNOTATION_SUBTYPES.has(subtype.toString())) {
        throw new Error(`Cannot preserve ${label} because active ${subtype.toString()} annotations are not allowed.`);
      }

      for (const [key, value] of dictionary.entries()) {
        const keyText = key.toString();
        if (keyText.length > MAX_PRESERVED_INTERACTION_NAME_LENGTH) {
          throw new Error(`Cannot preserve ${label} because the PDF object graph contains an oversized name.`);
        }
        if (UNSAFE_PDF_GRAPH_KEYS.has(keyText)) {
          if (keyText === '/AA') {
            throw new Error(`Cannot preserve ${label} because automatic actions are not allowed.`);
          }
          if (keyText === '/AF' || keyText === '/EF' || keyText === '/EmbeddedFiles') {
            throw new Error(`Cannot preserve ${label} because embedded or associated files are not allowed.`);
          }
          if (keyText === '/Collection') {
            throw new Error(`Cannot preserve ${label} because PDF collections are not allowed.`);
          }
          if (keyText === '/XFA') {
            throw new Error(`Cannot preserve ${label} because XFA forms may contain active content.`);
          }
          throw new Error(`Cannot preserve ${label} because document JavaScript is not allowed.`);
        }
        queue.push(value);
      }
      if (queue.length > MAX_PRESERVED_PDF_GRAPH_OBJECTS) {
        throw new Error(`Cannot preserve ${label} because the PDF object graph exceeds the safety limit.`);
      }
    }
  }

  private assertSafePdfAction(
    document: PDFDocument,
    object: PDFObject,
    localOnly: boolean,
    visitedRefs: Set<string>,
    depth: number,
    label: string
  ): void {
    if (depth > MAX_PRESERVED_INTERACTION_DEPTH) {
      throw new Error(`Cannot preserve ${label} because an action exceeds the structure depth limit.`);
    }
    if (object instanceof PDFRef) {
      if (visitedRefs.has(object.tag)) return;
      visitedRefs.add(object.tag);
      const resolved = document.context.lookup(object);
      if (!resolved) throw new Error(`Cannot preserve ${label} because an action has a broken reference.`);
      this.assertSafePdfAction(document, resolved, localOnly, visitedRefs, depth + 1, label);
      return;
    }
    if (object instanceof PDFArray) {
      if (object.size() > MAX_PRESERVED_INTERACTION_OBJECTS) {
        throw new Error(`Cannot preserve ${label} because an action exceeds the safety limit.`);
      }
      for (let index = 0; index < object.size(); index++) {
        this.assertSafePdfAction(document, object.get(index), localOnly, visitedRefs, depth + 1, label);
      }
      return;
    }
    if (!(object instanceof PDFDict)) {
      throw new Error(`Cannot preserve ${label} because an action is malformed.`);
    }

    const actionType = document.context.lookup(object.get(PDFName.of('S')));
    const actionName = actionType instanceof PDFName ? actionType.toString() : '';
    if (actionName === '/GoTo') {
      // Local destinations do not execute code or contact another origin.
    } else if (!localOnly && actionName === '/URI') {
      const uriObject = document.context.lookup(object.get(PDFName.of('URI')));
      if (!(uriObject instanceof PDFString) && !(uriObject instanceof PDFHexString)) {
        throw new Error(`Cannot preserve ${label} because a link URI is malformed.`);
      }
      let uri: URL;
      try {
        uri = new URL(uriObject.decodeText());
      } catch {
        throw new Error(`Cannot preserve ${label} because a link URI is invalid.`);
      }
      if (uri.protocol !== 'https:' && uri.protocol !== 'http:') {
        throw new Error(`Cannot preserve ${label} because only HTTP(S) links are allowed.`);
      }
    } else if (!localOnly && actionName === '/Named') {
      const named = document.context.lookup(object.get(PDFName.of('N')));
      if (!(named instanceof PDFName) || !SAFE_NAMED_ACTIONS.has(named.toString())) {
        throw new Error(`Cannot preserve ${label} because a named action is not allowed.`);
      }
    } else {
      throw new Error(`Cannot preserve ${label} because ${actionName || 'unknown'} actions are not allowed.`);
    }

    const next = object.get(PDFName.of('Next'));
    if (next) this.assertSafePdfAction(document, next, localOnly, visitedRefs, depth + 1, label);
  }

  private serializeInteractionObject(
    document: PDFDocument,
    object: PDFObject,
    state: { objectCount: number; payloadBytes: number },
    ancestors: Set<string>,
    depth: number,
    label: string
  ): string {
    if (depth > MAX_PRESERVED_INTERACTION_DEPTH) {
      throw new Error(`Cannot verify preserved interactions because ${label} exceeds the structure depth limit.`);
    }
    if (++state.objectCount > MAX_PRESERVED_INTERACTION_OBJECTS) {
      throw new Error(`Cannot verify preserved interactions because ${label} exceeds the object count limit.`);
    }
    if (object instanceof PDFRef) {
      const pageIndex = document.getPages().findIndex(page => page.ref.tag === object.tag);
      if (pageIndex >= 0) return `page-ref:${pageIndex + 1}`;
      if (ancestors.has(object.tag)) return 'ref-cycle';
      const resolved = document.context.lookup(object);
      if (!resolved) throw new Error(`Cannot verify preserved interactions because ${label} has a broken reference.`);
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(object.tag);
      return `ref:${this.serializeInteractionObject(
        document,
        resolved,
        state,
        nextAncestors,
        depth + 1,
        label
      )}`;
    }
    if (object instanceof PDFArray) {
      const values: string[] = [];
      for (let index = 0; index < object.size(); index++) {
        values.push(this.serializeInteractionObject(
          document,
          object.get(index),
          state,
          ancestors,
          depth + 1,
          label
        ));
      }
      return `[${values.join(',')}]`;
    }
    if (object instanceof PDFStream) {
      return `stream:${this.serializeInteractionObject(
        document,
        object.dict,
        state,
        ancestors,
        depth + 1,
        label
      )}:${this.encodeBytes(object.getContents(), label, state)}`;
    }
    if (object instanceof PDFDict) {
      const map = object.asMap();
      if (state.objectCount + map.size > MAX_PRESERVED_INTERACTION_OBJECTS) {
        throw new Error(`Cannot verify preserved interactions because ${label} exceeds the object count limit.`);
      }
      state.objectCount += map.size;
      for (const key of map.keys()) {
        const keyText = key.toString();
        if (keyText.length > MAX_PRESERVED_INTERACTION_NAME_LENGTH) {
          throw new Error(`Cannot verify preserved interactions because ${label} contains an oversized name.`);
        }
        this.addInteractionPayloadBytes(state, keyText.length * 2, label);
      }
      const entries = Array.from(map.entries())
        .sort(([left], [right]) => left.toString().localeCompare(right.toString()))
        .map(([key, value]) => `${key.toString()}:${this.serializeInteractionObject(
          document,
          value,
          state,
          ancestors,
          depth + 1,
          label
        )}`);
      return `{${entries.join(',')}}`;
    }
    if (object instanceof PDFName) {
      const name = object.toString();
      if (name.length > MAX_PRESERVED_INTERACTION_NAME_LENGTH) {
        throw new Error(`Cannot verify preserved interactions because ${label} contains an oversized name.`);
      }
      this.addInteractionPayloadBytes(state, name.length * 2, label);
      return `name:${name}`;
    }
    if (object instanceof PDFString || object instanceof PDFHexString) {
      const value = object.decodeText();
      if (value.length > MAX_PRESERVED_INTERACTION_STRING_LENGTH) {
        throw new Error(`Cannot verify preserved interactions because ${label} contains an oversized string.`);
      }
      this.addInteractionPayloadBytes(state, value.length * 2, label);
      return `string:${JSON.stringify(value)}`;
    }
    if (object instanceof PDFNumber) return `number:${object.asNumber()}`;
    if (object instanceof PDFBool) return `boolean:${object.asBoolean()}`;
    if (object === PDFNull) return 'null';
    throw new Error(
      `Cannot verify preserved interactions because ${label} contains unsupported ${object.constructor.name} data.`
    );
  }

  private encodeBytes(
    bytes: Uint8Array,
    label: string,
    state?: { objectCount: number; payloadBytes: number }
  ): string {
    if (state) this.addInteractionPayloadBytes(state, bytes.byteLength, label);
    let encoded = '';
    for (const value of bytes) encoded += value.toString(16).padStart(2, '0');
    return encoded;
  }

  private addInteractionPayloadBytes(
    state: { objectCount: number; payloadBytes: number },
    byteLength: number,
    label: string
  ): void {
    state.payloadBytes += byteLength;
    if (state.payloadBytes > MAX_PRESERVED_INTERACTION_PAYLOAD_BYTES) {
      throw new Error(`Cannot verify preserved interactions because ${label} exceeds the payload safety limit.`);
    }
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private assertRenderablePagePixels(width: number, height: number, pageNumber: number): void {
    this.getPageRenderPixels(width, height, pageNumber);
  }

  private getPageRenderPixels(width: number, height: number, pageNumber: number): number {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error(`PDF page ${pageNumber} has invalid dimensions.`);
    }
    const renderedWidth = Math.ceil(width);
    const renderedHeight = Math.ceil(height);
    const pixels = renderedWidth * renderedHeight;
    if (!Number.isSafeInteger(pixels) || pixels > PDF_DOCUMENT_MAX_PAGE_RENDER_PIXELS) {
      throw new Error(`PDF page ${pageNumber} exceeds the rendered-pixel safety limit.`);
    }
    return pixels;
  }

  private drawTranslatedBlocks(
    context: CanvasRenderingContext2D,
    results: PdfTranslationResult[],
    rendered: PdfRenderedPage
  ): void {
    for (const result of results) {
      const layout = result.block.layout;
      const translatedText = result.translatedText.trim();
      if (!layout || !translatedText || layout.contentKind === 'formula') continue;

      const x = layout.x * rendered.scale;
      const y = layout.y * rendered.scale;
      const regionX = layout.regionX ?? 0;
      const regionWidth = layout.regionWidth ?? rendered.width;
      const regionRight = Math.min(rendered.width, regionX + regionWidth);
      const isColumnLayout = (layout.columnCount || 1) > 1;
      const availableWidth = Math.max(
        isColumnLayout ? 8 : 30,
        regionRight - layout.x - 4
      );
      const desiredWidth = isColumnLayout
        ? availableWidth
        : Math.max(layout.width + 8, Math.min(rendered.width * 0.56, availableWidth));
      const width = Math.min(
        availableWidth,
        Math.max(layout.width + 8, desiredWidth)
      ) * rendered.scale;
      let fontSize = Math.max(8, Math.min(18, layout.height * 0.82)) * rendered.scale;
      const minimumFontSize = 6.5 * rendered.scale;
      let lines = this.wrapCanvasText(context, translatedText, width - 8 * rendered.scale, fontSize);
      let lineHeight = fontSize * 1.22;
      const preferredHeight = Math.max(layout.height * 1.6, 24) * rendered.scale;

      while (fontSize > minimumFontSize && lines.length * lineHeight > preferredHeight) {
        fontSize -= 0.75 * rendered.scale;
        lineHeight = fontSize * 1.22;
        lines = this.wrapCanvasText(context, translatedText, width - 8 * rendered.scale, fontSize);
      }

      const pageHeight = rendered.height * rendered.scale;
      const requiredHeight = Math.max(preferredHeight, lines.length * lineHeight + 8 * rendered.scale);
      const height = Math.min(pageHeight, requiredHeight);
      const drawY = Math.max(0, Math.min(y, pageHeight - height));
      context.save();
      context.fillStyle = 'rgba(255, 255, 255, 0.97)';
      context.fillRect(
        x - 2 * rendered.scale,
        drawY - 2 * rendered.scale,
        width + 4 * rendered.scale,
        height + 4 * rendered.scale
      );
      context.fillStyle = '#172033';
      context.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      context.textBaseline = 'top';

      lines.forEach((line, index) => {
        const lineY = drawY + index * lineHeight;
        if (lineY + lineHeight <= drawY + height) {
          context.fillText(line, x + 2 * rendered.scale, lineY, width - 8 * rendered.scale);
        }
      });
      context.restore();
    }
  }

  private wrapCanvasText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    fontSize: number
  ): string[] {
    context.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const useSpaces = /\s/.test(text.trim());
    const tokens = useSpaces ? text.trim().split(/\s+/) : Array.from(text.trim());
    const separator = useSpaces ? ' ' : '';
    const lines: string[] = [];
    let current = '';

    for (const token of tokens) {
      const candidate = current ? `${current}${separator}${token}` : token;
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = token;
      } else {
        current = candidate;
      }
    }

    if (current) lines.push(current);
    return lines.length > 0 ? lines : [text];
  }
}

function pagesHaveDirectAnnotations(document: PDFDocument): boolean[] {
  return document.getPages().map(page => Boolean(page.node.get(PDFName.Annots)));
}

export class PdfDocumentService {
  constructor(
    private readonly engine: PdfEngineAdapter = defaultEngine,
    private readonly ocrDetectorFactory: PdfOcrDetectorFactory = createDefaultOcrDetector
  ) {
    if (hasExtensionResourceUrls() && !GlobalWorkerOptions.workerSrc) {
      GlobalWorkerOptions.workerSrc = extensionUrl('pdfjs/pdf.worker.min.js');
    }
  }

  async open(bytes: Uint8Array, options: PdfOpenOptions = {}): Promise<PdfDocumentSession> {
    if (bytes.byteLength === 0) throw new Error('The selected PDF is empty.');
    if (bytes.byteLength > PDF_DOCUMENT_MAX_SOURCE_BYTES) {
      throw new Error('The selected PDF exceeds the 64 MB document limit.');
    }
    const workerBytes = bytes.slice();

    const resourceOptions = hasExtensionResourceUrls()
      ? {
        cMapUrl: extensionUrl('pdfjs/cmaps/'),
        cMapPacked: true,
        standardFontDataUrl: extensionUrl('pdfjs/standard_fonts/')
      }
      : {};
    const loadingTask = this.engine.getDocument({
      data: workerBytes,
      useSystemFonts: true,
      ...resourceOptions
    });
    const pdfDocument = await loadingTask.promise;
    if (pdfDocument.numPages > PDF_DOCUMENT_MAX_PAGES) {
      await pdfDocument.destroy();
      throw new Error(`The selected PDF exceeds the ${PDF_DOCUMENT_MAX_PAGES}-page safety limit.`);
    }
    return new PdfDocumentSession(
      pdfDocument,
      this.engine,
      options.enableOcr === false ? null : this.ocrDetectorFactory(options),
      options.onOcrProgress,
      bytes
    );
  }
}

export const pdfDocumentService = new PdfDocumentService();
