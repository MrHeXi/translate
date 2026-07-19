import {
  PdfDocumentService,
  PdfEngineAdapter,
  PdfOcrDetector,
  PdfOcrDetectorFactory
} from '../PdfDocumentService';
import { BundledOcrSession, bundledOcrService } from '../BundledOcrService';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf';
import { ReadableStream } from 'stream/web';

Object.assign(globalThis, { ReadableStream });

interface FakeTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

const createEngine = (
  pages: Array<{
    width?: number;
    height?: number;
    items: FakeTextItem[];
    operatorIds?: number[];
    render?: jest.Mock;
  }>
): { engine: PdfEngineAdapter; destroy: jest.Mock } => {
  const destroy = jest.fn(async () => undefined);
  const pdfDocument = {
    numPages: pages.length,
    getPage: jest.fn(async (pageNumber: number) => {
      const page = pages[pageNumber - 1]!;
      return {
        getViewport: ({ scale }: { scale: number }) => ({
          width: (page.width || 600) * scale,
          height: (page.height || 800) * scale,
          transform: [scale, 0, 0, -scale, 0, (page.height || 800) * scale]
        }),
        getTextContent: jest.fn(async () => ({ items: page.items })),
        getOperatorList: jest.fn(async () => ({ fnArray: page.operatorIds || [] })),
        render: page.render || jest.fn(() => ({ promise: Promise.resolve() }))
      };
    }),
    destroy
  };

  return {
    engine: {
      getDocument: jest.fn(() => ({ promise: Promise.resolve(pdfDocument) })),
      transform: (viewport, item) => [
        item[0] || 1,
        item[1] || 0,
        item[2] || 0,
        -(item[3] || 12),
        (item[4] || 0) * (viewport[0] || 1),
        (viewport[5] || 0) - (item[5] || 0) * Math.abs(viewport[3] || 1)
      ]
    },
    destroy
  };
};

describe('PdfDocumentService', () => {
  it('parses a generated standards-compliant PDF with the bundled PDF.js engine', async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    const page = source.addPage([600, 800]);
    page.drawText('Real PDF.js integration text', { x: 72, y: 720, size: 18, font });
    const bytes = new Uint8Array(await source.save());
    const service = new PdfDocumentService();
    const session = await service.open(bytes);

    try {
      const analysis = await session.analyze();
      expect(analysis.pages).toHaveLength(1);
      expect(analysis.blocks.map(block => block.originalText).join(' ')).toContain(
        'Real PDF.js integration text'
      );
      expect(analysis.blocks[0]?.layout).toEqual(expect.objectContaining({
        pageNumber: 1,
        pageWidth: 600,
        pageHeight: 800,
        source: 'pdf-text'
      }));
    } finally {
      await session.destroy();
    }
  });

  it('uses PDF.js raster operators to supplement sparse centered text on a real PDF', async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    const page = source.addPage([600, 800]);
    page.drawText('Sparse central marker', { x: 250, y: 390, size: 12, font });
    const pngBytes = Uint8Array.from(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
      'base64'
    ));
    const image = await source.embedPng(pngBytes);
    page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
    const bytes = new Uint8Array(await source.save());
    const detector: PdfOcrDetector = {
      detect: jest.fn(async () => [{
        rawValue: 'Scanned body from raster page',
        engine: 'browser' as const,
        boundingBox: { x: 120, y: 1000, width: 360, height: 36 }
      }]),
      dispose: jest.fn(async () => undefined)
    };
    const contextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as CanvasRenderingContext2D);

    try {
      const realPdfJsEngine: PdfEngineAdapter = {
        getDocument: params => {
          const loadingTask = getDocument(params as any);
          return {
            promise: loadingTask.promise.then(pdf => ({
              numPages: pdf.numPages,
              getPage: async (pageNumber: number) => {
                const page = await pdf.getPage(pageNumber);
                return {
                  getViewport: page.getViewport.bind(page),
                  getTextContent: page.getTextContent.bind(page),
                  getOperatorList: page.getOperatorList.bind(page),
                  render: () => ({ promise: Promise.resolve() })
                };
              },
              destroy: pdf.destroy.bind(pdf)
            }))
          };
        },
        transform: (first, second) => Util.transform(first, second)
      };
      const session = await new PdfDocumentService(realPdfJsEngine, () => detector).open(bytes);
      const analysis = await session.analyze();

      expect(detector.detect).toHaveBeenCalledTimes(1);
      expect(analysis.blocks.map(block => block.originalText)).toEqual([
        'Sparse central marker',
        'Scanned body from raster page'
      ]);
      expect(analysis.pages[0]).toEqual(expect.objectContaining({
        source: 'mixed',
        blockCount: 2,
        ocrEngine: 'browser'
      }));
      await session.destroy();
      expect(detector.dispose).toHaveBeenCalledTimes(1);
    } finally {
      contextSpy.mockRestore();
    }
  });

  it('detects columns and formulas in a generated PDF through the bundled PDF.js engine', async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    const page = source.addPage([600, 800]);
    page.drawText('Two column research paper', { x: 50, y: 760, size: 16, font });
    page.drawText('Left paragraph one', { x: 50, y: 720, size: 12, font });
    page.drawText('Right paragraph one', { x: 330, y: 720, size: 12, font });
    page.drawText('Left paragraph two', { x: 50, y: 700, size: 12, font });
    page.drawText('Right paragraph two', { x: 330, y: 700, size: 12, font });
    page.drawText('E = mc^2', { x: 80, y: 660, size: 12, font });
    const bytes = new Uint8Array(await source.save());
    const session = await new PdfDocumentService().open(bytes);

    try {
      const analysis = await session.analyze();
      const text = analysis.blocks.map(block => block.originalText);
      expect(text.indexOf('Left paragraph two')).toBeLessThan(text.indexOf('Right paragraph one'));
      expect(analysis.blocks.find(block => block.originalText === 'E = mc^2')?.layout).toEqual(
        expect.objectContaining({ contentKind: 'formula', columnIndex: 1, columnCount: 2 })
      );
      expect(analysis.pages[0]).toEqual(expect.objectContaining({
        columnCount: 2,
        formulaBlockCount: 1
      }));
    } finally {
      await session.destroy();
    }
  });

  it('extracts real PDF text items into positioned page lines', async () => {
    const { engine, destroy } = createEngine([
      {
        items: [
          { str: 'Hello', transform: [1, 0, 0, 12, 72, 720], width: 28, height: 12 },
          { str: 'world', transform: [1, 0, 0, 12, 106, 720], width: 30, height: 12, hasEOL: true },
          { str: 'Second line', transform: [1, 0, 0, 12, 72, 690], width: 64, height: 12, hasEOL: true }
        ]
      }
    ]);
    const service = new PdfDocumentService(engine, () => null);
    const session = await service.open(new Uint8Array([1, 2, 3]));
    const analysis = await session.analyze();

    expect(analysis.blocks.map(block => block.originalText)).toEqual([
      'Hello world',
      'Second line'
    ]);
    expect(analysis.blocks[0]?.layout).toEqual(expect.objectContaining({
      pageNumber: 1,
      x: 72,
      y: 68,
      pageWidth: 600,
      pageHeight: 800,
      source: 'pdf-text'
    }));
    expect(analysis.pages).toEqual([
      {
        pageNumber: 1,
        width: 600,
        height: 800,
        blockCount: 2,
        formulaBlockCount: 0,
        columnCount: 1,
        source: 'text'
      }
    ]);
    expect(analysis.ocrPageCount).toBe(0);
    expect(analysis.unreadablePageCount).toBe(0);
    expect(analysis.formulaBlockCount).toBe(0);
    expect(analysis.multiColumnPageCount).toBe(0);

    await session.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('keeps two-column reading order, separates same-height columns, and marks formulas', async () => {
    const { engine } = createEngine([
      {
        items: [
          { str: 'Research heading', transform: [1, 0, 0, 16, 50, 760], width: 500, height: 16, hasEOL: true },
          { str: 'Left line one', transform: [1, 0, 0, 12, 50, 720], width: 180, height: 12, hasEOL: true },
          { str: 'Right line one', transform: [1, 0, 0, 12, 330, 720], width: 180, height: 12, hasEOL: true },
          { str: 'Left line two', transform: [1, 0, 0, 12, 50, 700], width: 180, height: 12, hasEOL: true },
          { str: 'Right line two', transform: [1, 0, 0, 12, 330, 700], width: 180, height: 12, hasEOL: true },
          { str: 'E = mc²', transform: [1, 0, 0, 12, 80, 660], width: 90, height: 12, hasEOL: true },
          { str: 'The result is approximately ≥ 5.', transform: [1, 0, 0, 12, 50, 640], width: 200, height: 12, hasEOL: true }
        ]
      }
    ]);
    const service = new PdfDocumentService(engine, () => null);
    const session = await service.open(new Uint8Array([1, 2, 3]));
    const analysis = await session.analyze();

    expect(analysis.blocks.map(block => block.originalText)).toEqual([
      'Research heading',
      'Left line one',
      'Left line two',
      'E = mc²',
      'The result is approximately ≥ 5.',
      'Right line one',
      'Right line two'
    ]);
    expect(analysis.blocks[1]?.layout).toEqual(expect.objectContaining({
      readingOrder: 1,
      columnIndex: 1,
      columnCount: 2,
      contentKind: 'prose'
    }));
    expect(analysis.blocks[5]?.layout).toEqual(expect.objectContaining({
      columnIndex: 2,
      columnCount: 2
    }));
    expect(analysis.blocks[3]?.layout).toEqual(expect.objectContaining({
      contentKind: 'formula',
      columnIndex: 1
    }));
    expect(analysis.blocks[4]?.layout?.contentKind).toBe('prose');
    const leftRegion = analysis.blocks[1]!.layout!;
    expect((leftRegion.regionX || 0) + (leftRegion.regionWidth || 0)).toBeLessThan(330);
    expect(analysis.pages[0]).toEqual(expect.objectContaining({
      blockCount: 7,
      formulaBlockCount: 1,
      columnCount: 2
    }));
    expect(analysis.formulaBlockCount).toBe(1);
    expect(analysis.multiColumnPageCount).toBe(1);
  });

  it('runs OCR for sparse marginal text and keeps useful text-layer and OCR blocks', async () => {
    const render = jest.fn(() => ({ promise: Promise.resolve() }));
    const { engine } = createEngine([{
      items: [
        { str: 'Journal header', transform: [1, 0, 0, 12, 40, 760], width: 92, height: 12, hasEOL: true }
      ],
      operatorIds: [OPS.paintImageXObject],
      render
    }]);
    const detector: PdfOcrDetector = {
      detect: jest.fn(async () => [{
        rawValue: 'Scanned body paragraph',
        engine: 'browser' as const,
        boundingBox: { x: 80, y: 320, width: 600, height: 40 }
      }])
    };
    const contextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as CanvasRenderingContext2D);

    try {
      const session = await new PdfDocumentService(engine, () => detector)
        .open(new Uint8Array([1, 2, 3]));
      const analysis = await session.analyze();

      expect(render).toHaveBeenCalledTimes(1);
      expect(detector.detect).toHaveBeenCalledTimes(1);
      expect(analysis.blocks.map(block => block.originalText)).toEqual([
        'Journal header',
        'Scanned body paragraph'
      ]);
      expect(analysis.blocks.map(block => block.layout?.source)).toEqual([
        'pdf-text',
        'pdf-ocr'
      ]);
      expect(analysis.blocks[1]?.layout).toEqual(expect.objectContaining({
        pageNumber: 1,
        x: 40,
        y: 160,
        pageWidth: 600,
        pageHeight: 800,
        readingOrder: 1
      }));
      expect(analysis.pages[0]).toEqual(expect.objectContaining({
        source: 'mixed',
        blockCount: 2,
        ocrEngine: 'browser'
      }));
      expect(analysis.ocrPageCount).toBe(1);
    } finally {
      contextSpy.mockRestore();
    }
  });

  it('runs OCR for sparse centered text when the page has raster content', async () => {
    const { engine } = createEngine([{
      items: [
        { str: 'Scanned page marker', transform: [1, 0, 0, 12, 280, 420], width: 120, height: 12, hasEOL: true }
      ],
      operatorIds: [OPS.paintImageXObject]
    }]);
    const detector: PdfOcrDetector = {
      detect: jest.fn(async () => [{
        rawValue: 'Centered scanned body',
        engine: 'browser' as const,
        boundingBox: { x: 160, y: 1000, width: 280, height: 36 }
      }])
    };
    const contextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as CanvasRenderingContext2D);

    try {
      const session = await new PdfDocumentService(engine, () => detector)
        .open(new Uint8Array([1, 2, 3]));
      const analysis = await session.analyze();

      expect(detector.detect).toHaveBeenCalledTimes(1);
      expect(analysis.blocks.map(block => block.originalText)).toEqual([
        'Scanned page marker',
        'Centered scanned body'
      ]);
      expect(analysis.pages[0]?.source).toBe('mixed');
    } finally {
      contextSpy.mockRestore();
    }
  });

  it('removes equivalent OCR text that overlaps a text-layer block', async () => {
    const { engine } = createEngine([{
      items: [
        { str: 'Quarterly report', transform: [1, 0, 0, 12, 40, 760], width: 100, height: 12, hasEOL: true }
      ],
      operatorIds: [OPS.paintImageXObject]
    }]);
    const detector: PdfOcrDetector = {
      detect: jest.fn(async () => [{
        rawValue: 'Quarterly report.',
        engine: 'browser' as const,
        boundingBox: { x: 80, y: 56, width: 200, height: 24 }
      }])
    };
    const contextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as CanvasRenderingContext2D);

    try {
      const session = await new PdfDocumentService(engine, () => detector)
        .open(new Uint8Array([1, 2, 3]));
      const analysis = await session.analyze();

      expect(detector.detect).toHaveBeenCalledTimes(1);
      expect(analysis.blocks).toHaveLength(1);
      expect(analysis.blocks[0]).toEqual(expect.objectContaining({
        originalText: 'Quarterly report',
        layout: expect.objectContaining({ source: 'pdf-text' })
      }));
      expect(analysis.pages[0]).toEqual(expect.objectContaining({
        source: 'text',
        blockCount: 1,
        ocrEngine: 'browser'
      }));
      expect(analysis.ocrPageCount).toBe(1);
    } finally {
      contextSpy.mockRestore();
    }
  });

  it('does not run OCR when the text layer is sufficiently populated', async () => {
    const render = jest.fn(() => ({ promise: Promise.resolve() }));
    const { engine } = createEngine([{
      items: [
        { str: 'Line one', transform: [1, 0, 0, 12, 40, 760], width: 70, height: 12, hasEOL: true },
        { str: 'Line two', transform: [1, 0, 0, 12, 40, 740], width: 70, height: 12, hasEOL: true },
        { str: 'Line three', transform: [1, 0, 0, 12, 40, 720], width: 80, height: 12, hasEOL: true },
        { str: 'Line four', transform: [1, 0, 0, 12, 40, 700], width: 75, height: 12, hasEOL: true },
        { str: 'Line five', transform: [1, 0, 0, 12, 40, 680], width: 75, height: 12, hasEOL: true }
      ],
      operatorIds: [OPS.paintImageXObject],
      render
    }]);
    const detector: PdfOcrDetector = { detect: jest.fn(async () => []) };
    const session = await new PdfDocumentService(engine, () => detector)
      .open(new Uint8Array([1, 2, 3]));
    const analysis = await session.analyze();

    expect(detector.detect).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(analysis.blocks).toHaveLength(5);
    expect(analysis.pages[0]?.source).toBe('text');
    expect(analysis.ocrPageCount).toBe(0);
  });

  it('does not run OCR for a sparse text-only page without raster content', async () => {
    const render = jest.fn(() => ({ promise: Promise.resolve() }));
    const { engine } = createEngine([{
      items: [
        { str: 'Short text page', transform: [1, 0, 0, 12, 40, 760], width: 94, height: 12, hasEOL: true }
      ],
      operatorIds: [OPS.showText],
      render
    }]);
    const detector: PdfOcrDetector = { detect: jest.fn(async () => []) };
    const session = await new PdfDocumentService(engine, () => detector)
      .open(new Uint8Array([1, 2, 3]));
    const analysis = await session.analyze();

    expect(detector.detect).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(analysis.blocks.map(block => block.originalText)).toEqual(['Short text page']);
    expect(analysis.pages[0]?.source).toBe('text');
    expect(analysis.ocrPageCount).toBe(0);
  });

  it('uses browser OCR for image-only PDF pages and keeps bounding boxes', async () => {
    const render = jest.fn(() => ({ promise: Promise.resolve() }));
    const { engine } = createEngine([{ items: [], render }]);
    const detector: PdfOcrDetector = {
      detect: jest.fn(async () => [
        {
          rawValue: 'Scanned heading',
          engine: 'browser' as const,
          boundingBox: { x: 40, y: 60, width: 240, height: 44 }
        }
      ])
    };
    const detectorFactory: PdfOcrDetectorFactory = () => detector;
    const context = {} as CanvasRenderingContext2D;
    const contextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context);

    try {
      const service = new PdfDocumentService(engine, detectorFactory);
      const session = await service.open(new Uint8Array([4, 5, 6]));
      const analysis = await session.analyze();

      expect(render).toHaveBeenCalledTimes(1);
      expect(detector.detect).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), expect.any(Function));
      expect(analysis.ocrPageCount).toBe(1);
      expect(analysis.bundledOcrPageCount).toBe(0);
      expect(analysis.unreadablePageCount).toBe(0);
      expect(analysis.pages[0]?.ocrEngine).toBe('browser');
      expect(analysis.blocks).toEqual([
        expect.objectContaining({
          id: 1,
          originalText: 'Scanned heading',
          layout: expect.objectContaining({
            x: 20,
            y: 30,
            width: 120,
            height: 22,
            source: 'pdf-ocr'
          })
        })
      ]);
    } finally {
      contextSpy.mockRestore();
    }
  });

  it('falls back to bundled OCR when browser OCR returns only unusable results', async () => {
    const { engine } = createEngine([{ items: [] }]);
    const browserDetect = jest.fn(async () => [{
      rawValue: 'Browser artifact',
      boundingBox: { x: 20, y: 30, width: 0, height: 20 }
    }]);
    const recognize = jest.fn(async () => [{
      text: 'Bundled fallback line',
      confidence: 91,
      boundingBox: { x: 20, y: 30, width: 240, height: 40 }
    }]);
    const terminate = jest.fn(async () => undefined);
    const bundledSession = { recognize, terminate } as unknown as BundledOcrSession;
    const createSessionSpy = jest.spyOn(bundledOcrService, 'createSession')
      .mockReturnValue(bundledSession);
    const contextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as CanvasRenderingContext2D);
    const globalScope = globalThis as typeof globalThis & { TextDetector?: unknown };
    const previousTextDetector = globalScope.TextDetector;
    globalScope.TextDetector = class {
      detect = browserDetect;
    };

    try {
      const session = await new PdfDocumentService(engine).open(new Uint8Array([4, 5, 6]));
      const analysis = await session.analyze();

      expect(browserDetect).toHaveBeenCalledTimes(1);
      expect(recognize).toHaveBeenCalledTimes(1);
      expect(analysis.blocks[0]).toEqual(expect.objectContaining({
        originalText: 'Bundled fallback line',
        layout: expect.objectContaining({ source: 'pdf-ocr' })
      }));
      expect(analysis.pages[0]?.ocrEngine).toBe('tesseract');
      expect(analysis.bundledOcrPageCount).toBe(1);
      expect(terminate).toHaveBeenCalledTimes(1);
    } finally {
      if (previousTextDetector === undefined) {
        delete globalScope.TextDetector;
      } else {
        globalScope.TextDetector = previousTextDetector;
      }
      contextSpy.mockRestore();
      createSessionSpy.mockRestore();
    }
  });

  it('tracks bundled OCR pages, forwards page progress, and disposes the detector', async () => {
    const render = jest.fn(() => ({ promise: Promise.resolve() }));
    const { engine } = createEngine([{ items: [], render }]);
    const dispose = jest.fn(async () => undefined);
    const detector: PdfOcrDetector = {
      detect: jest.fn(async (_source, onProgress) => {
        onProgress?.({ pageNumber: 0, status: 'recognizing text', progress: 0.4, engine: 'tesseract' });
        return [{
          rawValue: 'Bundled OCR line',
          engine: 'tesseract' as const,
          boundingBox: { x: 20, y: 30, width: 200, height: 40 }
        }];
      }),
      dispose
    };
    const detectorFactory = jest.fn(() => detector);
    const progress = jest.fn();
    const contextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as CanvasRenderingContext2D);

    try {
      const service = new PdfDocumentService(engine, detectorFactory);
      const session = await service.open(new Uint8Array([4, 5]), {
        ocrLanguage: 'jpn',
        onOcrProgress: progress
      });
      const analysis = await session.analyze();

      expect(detectorFactory).toHaveBeenCalledWith(expect.objectContaining({ ocrLanguage: 'jpn' }));
      expect(analysis.ocrPageCount).toBe(1);
      expect(analysis.bundledOcrPageCount).toBe(1);
      expect(analysis.pages[0]?.ocrEngine).toBe('tesseract');
      expect(progress).toHaveBeenCalledWith({
        pageNumber: 1,
        status: 'recognizing text',
        progress: 0.4,
        engine: 'tesseract'
      });
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      contextSpy.mockRestore();
    }
  });

  it('exports rendered translated pages as a valid flattened PDF', async () => {
    const { engine } = createEngine([
      {
        items: [
          { str: 'Source line', transform: [1, 0, 0, 12, 72, 5], width: 64, height: 12, hasEOL: true }
        ]
      }
    ]);
    const context = {
      save: jest.fn(),
      restore: jest.fn(),
      fillRect: jest.fn(),
      fillText: jest.fn(),
      measureText: jest.fn((text: string) => ({ width: text.length * 6 })),
      fillStyle: '',
      font: '',
      textBaseline: 'top'
    } as unknown as CanvasRenderingContext2D;
    const contextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context);
    const dataUrlSpy = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII='
      );

    try {
      const service = new PdfDocumentService(engine, () => null);
      const session = await service.open(new Uint8Array([8, 9]));
      const analysis = await session.analyze();
      const bytes = await session.exportTranslatedPdf([
        { block: analysis.blocks[0]!, translatedText: 'Translated source line' }
      ]);
      const reopened = await PDFDocument.load(bytes);

      expect(reopened.getPageCount()).toBe(1);
      expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF');
      expect(context.fillRect).toHaveBeenCalled();
      expect(context.fillText).toHaveBeenCalledWith(
        'Translated source line',
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
      const drawnY = (context.fillText as jest.Mock).mock.calls[0]?.[2] as number;
      expect(drawnY).toBeLessThan(analysis.blocks[0]!.layout!.y * 1.6);
    } finally {
      contextSpy.mockRestore();
      dataUrlSpy.mockRestore();
    }
  });

  it('leaves detected formulas untouched in flattened PDF export', async () => {
    const { engine } = createEngine([
      {
        items: [
          { str: 'E = mc²', transform: [1, 0, 0, 12, 72, 720], width: 70, height: 12, hasEOL: true }
        ]
      }
    ]);
    const context = {
      save: jest.fn(),
      restore: jest.fn(),
      fillRect: jest.fn(),
      fillText: jest.fn(),
      measureText: jest.fn((text: string) => ({ width: text.length * 6 })),
      fillStyle: '',
      font: '',
      textBaseline: 'top'
    } as unknown as CanvasRenderingContext2D;
    const contextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context);
    const dataUrlSpy = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII='
      );

    try {
      const service = new PdfDocumentService(engine, () => null);
      const session = await service.open(new Uint8Array([8, 9]));
      const analysis = await session.analyze();
      await session.exportTranslatedPdf([
        { block: analysis.blocks[0]!, translatedText: 'Do not paint over this formula' }
      ]);

      expect(analysis.blocks[0]?.layout?.contentKind).toBe('formula');
      expect(context.fillRect).not.toHaveBeenCalled();
      expect(context.fillText).not.toHaveBeenCalled();
    } finally {
      contextSpy.mockRestore();
      dataUrlSpy.mockRestore();
    }
  });

  it('reports pages that contain neither a text layer nor available OCR', async () => {
    const { engine } = createEngine([{ items: [] }, { items: [] }]);
    const service = new PdfDocumentService(engine, () => null);
    const session = await service.open(new Uint8Array([7]));
    const analysis = await session.analyze();

    expect(analysis.blocks).toEqual([]);
    expect(analysis.pages.map(page => page.source)).toEqual(['none', 'none']);
    expect(analysis.unreadablePageCount).toBe(2);
  });

  it('rejects empty PDF input before creating a PDF.js task', async () => {
    const { engine } = createEngine([]);
    const service = new PdfDocumentService(engine, () => null);

    await expect(service.open(new Uint8Array())).rejects.toThrow('empty');
    expect(engine.getDocument).not.toHaveBeenCalled();
  });
});
