import { getDocument, GlobalWorkerOptions, Util } from 'pdfjs-dist/legacy/build/pdf';
import { PDFDocument } from 'pdf-lib';
import type { DocumentBlock, DocumentBlockLayout } from './DocumentTextExtractor';

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
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PdfOcrDetector {
  detect(source: CanvasImageSource): Promise<PdfOcrResult[]>;
}

export type PdfOcrDetectorFactory = () => PdfOcrDetector | null;

export interface PdfPageSummary {
  pageNumber: number;
  width: number;
  height: number;
  blockCount: number;
  source: 'text' | 'ocr' | 'none';
}

export interface PdfDocumentAnalysis {
  blocks: DocumentBlock[];
  pages: PdfPageSummary[];
  ocrPageCount: number;
  unreadablePageCount: number;
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

const createDefaultOcrDetector = (): PdfOcrDetector | null => {
  const Detector = (globalThis as typeof globalThis & {
    TextDetector?: new () => PdfOcrDetector;
  }).TextDetector;
  return Detector ? new Detector() : null;
};

export class PdfDocumentSession {
  private analysisPromise: Promise<PdfDocumentAnalysis> | null = null;
  private readonly pageCache = new Map<number, PdfPageLike>();

  constructor(
    private readonly pdfDocument: PdfDocumentLike,
    private readonly engine: PdfEngineAdapter,
    private readonly ocrDetectorFactory: PdfOcrDetectorFactory
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
    let unreadablePageCount = 0;
    const detector = this.ocrDetectorFactory();

    for (let pageNumber = 1; pageNumber <= this.pdfDocument.numPages; pageNumber++) {
      const page = await this.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      let pageBlocks = this.createTextBlocks(textContent.items, pageNumber, viewport);
      let source: PdfPageSummary['source'] = 'text';

      if (pageBlocks.length === 0 && detector) {
        pageBlocks = await this.createOcrBlocks(page, detector, pageNumber, viewport);
        if (pageBlocks.length > 0) {
          source = 'ocr';
          ocrPageCount++;
        }
      }

      if (pageBlocks.length === 0) {
        source = 'none';
        unreadablePageCount++;
      }

      for (const block of pageBlocks) {
        block.id = blocks.length + 1;
        blocks.push(block);
      }

      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        blockCount: pageBlocks.length,
        source
      });
    }

    return { blocks, pages, ocrPageCount, unreadablePageCount };
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
    const lines = this.groupFragmentsIntoLines(fragments);

    return lines.map((line, index) => ({
      id: index + 1,
      originalText: line.text,
      layout: this.createLayout(
        pageNumber,
        line.x,
        line.y,
        line.width,
        line.height,
        viewport,
        'pdf-text'
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

  private groupFragmentsIntoLines(fragments: PdfTextFragment[]): PdfTextLine[] {
    const sorted = [...fragments].sort((first, second) => {
      const verticalDifference = first.y - second.y;
      return Math.abs(verticalDifference) > 2 ? verticalDifference : first.x - second.x;
    });
    const lines: PdfTextLine[] = [];

    for (const fragment of sorted) {
      const previous = lines[lines.length - 1];
      const sameLine = previous
        && !previous.hasEOL
        && Math.abs(previous.y - fragment.y) <= Math.max(2.5, Math.min(previous.height, fragment.height) * 0.45);

      if (!sameLine || !previous) {
        lines.push({ ...fragment });
        continue;
      }

      const previousRight = previous.x + previous.width;
      const gap = fragment.x - previousRight;
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

  private async createOcrBlocks(
    page: PdfPageLike,
    detector: PdfOcrDetector,
    pageNumber: number,
    baseViewport: PdfViewportLike
  ): Promise<DocumentBlock[]> {
    const canvas = this.createCanvas();
    const viewport = page.getViewport({ scale: OCR_SCALE });
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return [];

    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: context, viewport }).promise;

    const detected = await detector.detect(canvas);
    return detected
      .filter(result => result.rawValue.trim() && result.boundingBox.width > 0 && result.boundingBox.height > 0)
      .sort((first, second) => first.boundingBox.y - second.boundingBox.y || first.boundingBox.x - second.boundingBox.x)
      .map((result, index) => ({
        id: index + 1,
        originalText: result.rawValue.replace(/\s+/g, ' ').trim(),
        layout: this.createLayout(
          pageNumber,
          result.boundingBox.x / OCR_SCALE,
          result.boundingBox.y / OCR_SCALE,
          result.boundingBox.width / OCR_SCALE,
          result.boundingBox.height / OCR_SCALE,
          baseViewport,
          'pdf-ocr'
        )
      }));
  }

  private createLayout(
    pageNumber: number,
    x: number,
    y: number,
    width: number,
    height: number,
    viewport: PdfViewportLike,
    source: 'pdf-text' | 'pdf-ocr'
  ): DocumentBlockLayout {
    return {
      pageNumber,
      x: Math.max(0, Math.round(x * 100) / 100),
      y: Math.max(0, Math.round(y * 100) / 100),
      width: Math.max(8, Math.round(width * 100) / 100),
      height: Math.max(8, Math.round(height * 100) / 100),
      pageWidth: viewport.width,
      pageHeight: viewport.height,
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
      if (!layout || !translatedText) continue;

      const x = layout.x * rendered.scale;
      const y = layout.y * rendered.scale;
      const availableWidth = Math.max(30, rendered.width - layout.x - 4);
      const width = Math.min(
        availableWidth,
        Math.max(layout.width + 8, Math.min(rendered.width * 0.56, availableWidth))
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

  async open(bytes: Uint8Array): Promise<PdfDocumentSession> {
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
    return new PdfDocumentSession(pdfDocument, this.engine, this.ocrDetectorFactory);
  }
}

export const pdfDocumentService = new PdfDocumentService();
