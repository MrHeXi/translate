import { DocumentBlockLayout } from '../DocumentTextExtractor';
import { canArrangePdfText, createDefaultPdfTextBox, fitPdfTextBox, getPdfSourceMask, isValidPdfTextBox } from '../PdfTextBox';

const layout: DocumentBlockLayout = {
  source: 'pdf-text', pageNumber: 1, pageWidth: 600, pageHeight: 800,
  x: 60, y: 100, width: 180, height: 12, contentKind: 'prose'
};
const box = { x: 120, y: 240, width: 240, height: 96, fontSize: 12 };

describe('manual PDF text areas', () => {
  it('creates a usable starting area without changing the source geometry', () => {
    const original = { ...layout };
    expect(isValidPdfTextBox(createDefaultPdfTextBox(layout), layout)).toBe(true);
    expect(layout).toEqual(original);
    const nearEdge = { ...layout, x: 593, y: 793, width: 7, height: 7 };
    expect(isValidPdfTextBox(createDefaultPdfTextBox(nearEdge), nearEdge)).toBe(true);
  });

  it.each([
    { ...box, x: -1 }, { ...box, y: -1 }, { ...box, x: 500 }, { ...box, y: 750 },
    { ...box, width: 15 }, { ...box, height: 15 }, { ...box, fontSize: 0 },
    { ...box, fontSize: 37 }, { ...box, width: Infinity }, { ...box, x: NaN },
    { ...box, height: '96' }, { ...box, pageNumber: 2 }, null
  ])('rejects invalid or unbounded edits (%j)', invalid => {
    expect(isValidPdfTextBox(invalid, layout)).toBe(false);
  });

  it('covers source descenders while clipping the removal mask to the original page', () => {
    const mask = getPdfSourceMask(layout);
    expect(mask.y).toBeLessThan(layout.y);
    expect(mask.y + mask.height).toBeGreaterThan(layout.y + layout.height);
    const edge = getPdfSourceMask({ ...layout, x: 0, y: 793, width: 600, height: 7 });
    expect(edge.x).toBe(0);
    expect(edge.width).toBe(600);
    expect(edge.y + edge.height).toBe(800);
  });

  it('keeps formulas, table cells, non-PDF content, and unknown page geometry out of reflow', () => {
    for (const unavailable of [
      undefined, { ...layout, contentKind: 'formula' as const },
      { ...layout, source: 'plain-text' as const }, { ...layout, pageWidth: undefined },
      { ...layout, pageNumber: 0 },
      { ...layout, tableCell: { tableId: 1, rowIndex: 1, rowCount: 3, columnIndex: 1,
        columnCount: 2, x: 50, y: 90, width: 200, height: 40 } }
    ]) {
      expect(canArrangePdfText(unavailable)).toBe(false);
      expect(isValidPdfTextBox(box, unavailable)).toBe(false);
    }
    expect(canArrangePdfText({ ...layout, source: 'pdf-ocr' })).toBe(true);
  });

  it('fits full edited text in the chosen area and reports overflow until enough space is provided', () => {
    const text = 'A longer translated paragraph with several complete words. '.repeat(5).trim();
    const measure = (line: string, fontSize: number): number => line.length * fontSize * 0.5;
    expect(fitPdfTextBox(text, { ...box, width: 40, height: 16 }, measure).truncated).toBe(true);
    const fitted = fitPdfTextBox(text, { ...box, height: 180 }, measure);
    expect(fitted.truncated).toBe(false);
    expect(fitted.lines.join(' ')).toBe(text);
    expect(fitted.lines.every(line => measure(line, fitted.fontSize) <= box.width - 8)).toBe(true);
    expect(fitted.lines.length * fitted.lineHeight).toBeLessThanOrEqual(172);
  });
});
