export type PdfTextMeasure = (text: string, fontSize: number) => number;

export interface PdfTextFittingInput {
  readonly text: string;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly preferredFontSize: number;
  readonly minimumFontSize: number;
  readonly lineHeightRatio: number;
  readonly measureText: PdfTextMeasure;
}

export interface PdfTextFittingResult {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly lines: readonly string[];
  readonly truncated: boolean;
}

const FONT_SIZE_STEP = 1;
const ELLIPSIS = '\u2026';

export function fitPdfText(input: PdfTextFittingInput): PdfTextFittingResult {
  validateInput(input);

  const normalizedText = normalizeText(input.text);
  if (!normalizedText) {
    return {
      fontSize: input.preferredFontSize,
      lineHeight: input.preferredFontSize * input.lineHeightRatio,
      lines: [],
      truncated: false
    };
  }

  for (
    let fontSize = input.preferredFontSize;
    fontSize >= input.minimumFontSize;
    fontSize = Math.max(input.minimumFontSize, fontSize - FONT_SIZE_STEP)
  ) {
    const lineHeight = fontSize * input.lineHeightRatio;
    const measure = createValidatedMeasurer(input.measureText, fontSize);
    const lines = wrapText(normalizedText, input.maxWidth, measure);
    const visibleLineCount = Math.floor(input.maxHeight / lineHeight);
    const linesFitWidth = lines.every(line => measure(line) <= input.maxWidth);

    if (linesFitWidth && lines.length <= visibleLineCount) {
      return { fontSize, lineHeight, lines, truncated: false };
    }

    if (fontSize === input.minimumFontSize) {
      return {
        fontSize,
        lineHeight,
        lines: truncateLines(lines, visibleLineCount, input.maxWidth, measure),
        truncated: true
      };
    }
  }

  throw new Error('Unable to evaluate the minimum font size');
}

function validateInput(input: PdfTextFittingInput): void {
  if (!input || typeof input !== 'object') {
    throw new TypeError('input must be an object');
  }
  if (typeof input.text !== 'string') {
    throw new TypeError('text must be a string');
  }
  assertPositiveFinite(input.maxWidth, 'maxWidth');
  assertPositiveFinite(input.maxHeight, 'maxHeight');
  assertPositiveFinite(input.preferredFontSize, 'preferredFontSize');
  assertPositiveFinite(input.minimumFontSize, 'minimumFontSize');
  assertPositiveFinite(input.lineHeightRatio, 'lineHeightRatio');
  if (input.preferredFontSize < input.minimumFontSize) {
    throw new RangeError('preferredFontSize must be greater than or equal to minimumFontSize');
  }
  if (typeof input.measureText !== 'function') {
    throw new TypeError('measureText must be a function');
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number`);
  }
}

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

function createValidatedMeasurer(
  measureText: PdfTextMeasure,
  fontSize: number
): (text: string) => number {
  const cache = new Map<string, number>();
  return (text: string): number => {
    if (!text) return 0;
    const cached = cache.get(text);
    if (cached !== undefined) return cached;

    const width = measureText(text, fontSize);
    if (!Number.isFinite(width) || width < 0) {
      throw new RangeError('measureText must return a non-negative finite width');
    }
    cache.set(text, width);
    return width;
  };
}

function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  return text.split('\n').flatMap(paragraph => {
    const words = paragraph.trim().split(/\s+/u).filter(Boolean);
    if (words.length === 0) return [''];
    return wrapWords(words, maxWidth, measure);
  });
}

function wrapWords(
  words: readonly string[],
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  const lines: string[] = [];
  let currentLine = '';

  words.forEach(word => {
    if (currentLine) {
      const combined = `${currentLine} ${word}`;
      if (measure(combined) <= maxWidth) {
        currentLine = combined;
        return;
      }
      lines.push(currentLine);
      currentLine = '';
    }

    if (measure(word) <= maxWidth) {
      currentLine = word;
      return;
    }

    const fragments = splitOverlongWord(word, maxWidth, measure);
    lines.push(...fragments.slice(0, -1));
    currentLine = fragments[fragments.length - 1];
  });

  if (currentLine) lines.push(currentLine);
  return lines;
}

function splitOverlongWord(
  word: string,
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  const fragments: string[] = [];
  let currentFragment = '';

  Array.from(word).forEach(codePoint => {
    const candidate = currentFragment + codePoint;
    if (!currentFragment || measure(candidate) <= maxWidth) {
      currentFragment = candidate;
      return;
    }
    fragments.push(currentFragment);
    currentFragment = codePoint;
  });

  if (currentFragment) fragments.push(currentFragment);
  return fragments;
}

function truncateLines(
  lines: readonly string[],
  visibleLineCount: number,
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  if (visibleLineCount < 1 || measure(ELLIPSIS) > maxWidth) return [];

  const visibleLines = lines.slice(0, visibleLineCount);
  const finalLineCodePoints = Array.from(visibleLines[visibleLines.length - 1]);
  while (measure(finalLineCodePoints.join('') + ELLIPSIS) > maxWidth) {
    finalLineCodePoints.pop();
  }
  visibleLines[visibleLines.length - 1] = finalLineCodePoints.join('') + ELLIPSIS;
  return visibleLines;
}
