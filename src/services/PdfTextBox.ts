import type { DocumentBlockLayout } from './DocumentTextExtractor';
import { fitPdfText, PdfTextFittingResult, PdfTextMeasure } from './PdfTextFitting';

export interface PdfTextBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
}

export const PDF_TEXT_BOX_PADDING = 4;
const MIN_BOX_SIZE = 16;
const MIN_FONT_SIZE = 6.5;
const MAX_FONT_SIZE = 36;
const BOX_KEYS = ['x', 'y', 'width', 'height', 'fontSize'];

export function canArrangePdfText(
  layout: DocumentBlockLayout | undefined
): layout is DocumentBlockLayout & { pageWidth: number; pageHeight: number } {
  return Boolean(layout
    && (layout.source === 'pdf-text' || layout.source === 'pdf-ocr')
    && layout.contentKind !== 'formula'
    && !layout.tableCell
    && Number.isInteger(layout.pageNumber) && layout.pageNumber > 0
    && Number.isFinite(layout.pageWidth) && layout.pageWidth! >= MIN_BOX_SIZE
    && Number.isFinite(layout.pageHeight) && layout.pageHeight! >= MIN_BOX_SIZE
    && [layout.x, layout.y, layout.width, layout.height].every(Number.isFinite)
    && layout.x >= 0 && layout.y >= 0 && layout.width > 0 && layout.height > 0
    && layout.x + layout.width <= layout.pageWidth!
    && layout.y + layout.height <= layout.pageHeight!);
}

export function isValidPdfTextBox(value: unknown, layout: DocumentBlockLayout | undefined): value is PdfTextBox {
  if (!canArrangePdfText(layout) || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const box = value as Record<string, unknown>;
  if (Object.keys(box).length !== BOX_KEYS.length || BOX_KEYS.some(key => !Number.isFinite(box[key]))) return false;
  return (box.x as number) >= 0
    && (box.y as number) >= 0
    && (box.width as number) >= MIN_BOX_SIZE
    && (box.height as number) >= MIN_BOX_SIZE
    && (box.x as number) + (box.width as number) <= layout.pageWidth
    && (box.y as number) + (box.height as number) <= layout.pageHeight
    && (box.fontSize as number) >= MIN_FONT_SIZE
    && (box.fontSize as number) <= MAX_FONT_SIZE;
}

export function createDefaultPdfTextBox(layout: DocumentBlockLayout): PdfTextBox {
  if (!canArrangePdfText(layout)) throw new Error('This PDF block cannot be arranged.');
  const x = Math.min(layout.x, layout.pageWidth - MIN_BOX_SIZE);
  const y = Math.min(layout.y, layout.pageHeight - MIN_BOX_SIZE);
  return {
    x,
    y,
    width: Math.min(layout.pageWidth - x, Math.max(MIN_BOX_SIZE, layout.width + 8)),
    height: Math.min(layout.pageHeight - y, Math.max(24, layout.height * 1.6)),
    fontSize: Math.max(MIN_FONT_SIZE, Math.min(18, layout.height * 0.82))
  };
}

export function getPdfSourceMask(layout: DocumentBlockLayout): Omit<PdfTextBox, 'fontSize'> {
  if (!canArrangePdfText(layout)) throw new Error('This PDF block has no usable source geometry.');
  // PDF.js text boxes end at the baseline; include descenders and antialiased edge pixels.
  const padding = Math.min(4, Math.max(2, layout.height * 0.3));
  const x = Math.max(0, layout.x - padding);
  const y = Math.max(0, layout.y - padding);
  return {
    x, y,
    width: Math.min(layout.pageWidth, layout.x + layout.width + padding) - x,
    height: Math.min(layout.pageHeight, layout.y + layout.height + padding) - y
  };
}

export function fitPdfTextBox(text: string, box: PdfTextBox, measureText: PdfTextMeasure): PdfTextFittingResult {
  return fitPdfText({
    text,
    maxWidth: box.width - PDF_TEXT_BOX_PADDING * 2,
    maxHeight: box.height - PDF_TEXT_BOX_PADDING * 2,
    preferredFontSize: box.fontSize,
    minimumFontSize: MIN_FONT_SIZE,
    lineHeightRatio: 1.22,
    measureText
  });
}
