import { getDocument, GlobalWorkerOptions, Util } from 'pdfjs-dist/legacy/build/pdf';
import { PDFDocument } from 'pdf-lib';
import type { DocumentBlock, DocumentBlockLayout } from './DocumentTextExtractor';
import {
  BundledOcrLanguageCode,
  BundledOcrSession,
  bundledOcrService
} from './BundledOcrService';

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
  detect(source: CanvasImageSource, onProgress?: (progress: PdfOcrProgress) => void): Promise<PdfOcrResult[]>;
  dispose?(): Promise<void>;
}

export interface PdfOcrProgress {
  pageNumber: number;
  status: string;
  progress: number;
  engine: 'browser' | 'tesseract';
}

export interface PdfOpenOptions {
  ocrLanguage?: BundledOcrLanguageCode;
  onOcrProgress?: (progress: PdfOcrProgress) => void;
}

export type PdfOcrDetectorFactory = (options?: PdfOpenOptions) => PdfOcrDetector | null;

export interface PdfPageSummary {
  pageNumber: number;
  width: number;
  height: number;
  blockCount: number;
  formulaBlockCount: number;
  columnCount: number;
  source: 'text' | 'ocr' | 'none';
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

interface PdfTextLine extends PdfTextFragment {}

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
  private readonly bundledSession: BundledOcrSession;

  constructor(language: BundledOcrLanguageCode = 'eng') {
    const Detector = (globalThis as typeof globalThis & {
      TextDetector?: new () => { detect(source: CanvasImageSource): Promise<PdfOcrResult[]> };
    }).TextDetector;
    this.browserDetector = Detector ? new Detector() : null;
    this.bundledSession = bundledOcrService.createSession(language);
  }

  async detect(
    source: CanvasImageSource,
    onProgress?: (progress: PdfOcrProgress) => void
  ): Promise<PdfOcrResult[]> {
    if (this.browserDetector) {
      try {
        const browserResults = await this.browserDetector.detect(source);
        if (browserResults.length > 0) {
          return browserResults.map(result => ({ ...result, engine: 'browser' }));
        }
      } catch {
        // The bundled worker remains available when the browser API rejects an image.
      }
    }

    const lines = await this.bundledSession.recognize(source as HTMLCanvasElement, progress => {
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
    await this.bundledSession.terminate();
  }
}

const createDefaultOcrDetector = (options?: PdfOpenOptions): PdfOcrDetector => {
  return new DefaultPdfOcrDetector(options?.ocrLanguage || 'eng');
};

export class PdfDocumentSession {
  private analysisPromise: Promise<PdfDocumentAnalysis> | null = null;
  private readonly pageCache = new Map<number, PdfPageLike>();

  constructor(
    private readonly pdfDocument: PdfDocumentLike,
    private readonly engine: PdfEngineAdapter,
    private readonly ocrDetector: PdfOcrDetector | null,
    private readonly onOcrProgress?: (progress: PdfOcrProgress) => void
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

    try {
      for (let pageNumber = 1; pageNumber <= this.pdfDocument.numPages; pageNumber++) {
        const page = await this.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        let pageBlocks = this.createTextBlocks(textContent.items, pageNumber, viewport);
        let source: PdfPageSummary['source'] = 'text';
        let ocrEngine: PdfPageSummary['ocrEngine'];

        if (pageBlocks.length === 0 && this.ocrDetector) {
          const ocrResult = await this.createOcrBlocks(page, this.ocrDetector, pageNumber, viewport);
          pageBlocks = ocrResult.blocks;
          ocrEngine = ocrResult.engine;
          if (pageBlocks.length > 0) {
            source = 'ocr';
            ocrPageCount++;
            if (ocrEngine === 'tesseract') bundledOcrPageCount++;
          }
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
    baseViewport: PdfViewportLike
  ): Promise<{ blocks: DocumentBlock[]; engine?: 'browser' | 'tesseract' }> {
    const canvas = this.createCanvas();
    const viewport = page.getViewport({ scale: OCR_SCALE });
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return { blocks: [] };

    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: context, viewport }).promise;

    const detected = await detector.detect(canvas, progress => {
      this.onOcrProgress?.({ ...progress, pageNumber });
    });
    const engine = detected.find(result => result.engine)?.engine;
    const lines = detected
      .filter(result => result.rawValue.trim() && result.boundingBox.width > 0 && result.boundingBox.height > 0)
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

    const resourceOptions = hasExtensionResourceUrls()
      ? {
        cMapUrl: extensionUrl('pdfjs/cmaps/'),
        cMapPacked: true,
        standardFontDataUrl: extensionUrl('pdfjs/standard_fonts/')
      }
      : {};
    const loadingTask = this.engine.getDocument({
      data: bytes.slice(),
      useSystemFonts: true,
      ...resourceOptions
    });
    const pdfDocument = await loadingTask.promise;
    return new PdfDocumentSession(
      pdfDocument,
      this.engine,
      this.ocrDetectorFactory(options),
      options.onOcrProgress
    );
  }
}

export const pdfDocumentService = new PdfDocumentService();
