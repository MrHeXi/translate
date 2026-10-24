import { fitPdfText, type PdfTextFittingInput } from '../PdfTextFitting';

const codePointMeasure = (text: string, fontSize: number): number => (
  Array.from(text).length * fontSize
);

const createInput = (
  overrides: Partial<PdfTextFittingInput> = {}
): PdfTextFittingInput => ({
  text: 'alpha beta',
  maxWidth: 20,
  maxHeight: 20,
  preferredFontSize: 1,
  minimumFontSize: 1,
  lineHeightRatio: 1,
  measureText: codePointMeasure,
  ...overrides
});

describe('fitPdfText', () => {
  it('keeps whole space-delimited words together before wrapping', () => {
    const result = fitPdfText(createInput({
      text: '  a   bb\t c  ',
      maxWidth: 4
    }));

    expect(result).toEqual({
      fontSize: 1,
      lineHeight: 1,
      lines: ['a bb', 'c'],
      truncated: false
    });
  });

  it('wraps a language without spaces by Unicode code point', () => {
    const result = fitPdfText(createInput({
      text: '\u7ffb\u8bd1\u6587\u672c\u9002\u914d\u5668',
      maxWidth: 3
    }));

    expect(result.lines).toEqual(['\u7ffb\u8bd1\u6587', '\u672c\u9002\u914d', '\u5668']);
    expect(result.truncated).toBe(false);
  });

  it('splits an overlong word so every divisible fragment fits', () => {
    const result = fitPdfText(createInput({ text: 'abcdef', maxWidth: 2 }));

    expect(result.lines).toEqual(['ab', 'cd', 'ef']);
    expect(result.lines.every(line => codePointMeasure(line, result.fontSize) <= 2)).toBe(true);
  });

  it('does not split an emoji surrogate pair', () => {
    const result = fitPdfText(createInput({ text: 'A\ud83d\ude00B', maxWidth: 2 }));

    expect(result.lines).toEqual(['A\ud83d\ude00', 'B']);
    expect(result.lines.flatMap(line => Array.from(line))).toEqual(['A', '\ud83d\ude00', 'B']);
  });

  it('preserves explicit internal line breaks, including an empty paragraph', () => {
    const result = fitPdfText(createInput({ text: 'alpha\r\n\r\nbeta' }));

    expect(result.lines).toEqual(['alpha', '', 'beta']);
  });

  it('shrinks one point at a time and returns the first size that fits', () => {
    const measuredFontSizes: number[] = [];
    const result = fitPdfText(createInput({
      text: 'aa aa',
      maxWidth: 40,
      maxHeight: 10,
      preferredFontSize: 10,
      minimumFontSize: 6,
      lineHeightRatio: 1,
      measureText: (text, fontSize) => {
        measuredFontSizes.push(fontSize);
        return Array.from(text).length * fontSize;
      }
    }));

    expect(result).toEqual({
      fontSize: 8,
      lineHeight: 8,
      lines: ['aa aa'],
      truncated: false
    });
    expect(new Set(measuredFontSizes)).toEqual(new Set([10, 9, 8]));
  });

  it('always includes a fractional minimum size after whole-point steps', () => {
    const result = fitPdfText(createInput({
      text: 'abcd',
      maxWidth: 10,
      maxHeight: 1.5,
      preferredFontSize: 3,
      minimumFontSize: 1.5,
      measureText: codePointMeasure
    }));

    expect(result).toMatchObject({
      fontSize: 1.5,
      lineHeight: 1.5,
      lines: ['abcd'],
      truncated: false
    });
  });

  it('adds a width-safe ellipsis to the final visible line at minimum size', () => {
    const result = fitPdfText(createInput({
      text: 'alpha beta gamma',
      maxWidth: 5,
      maxHeight: 2
    }));

    expect(result).toEqual({
      fontSize: 1,
      lineHeight: 1,
      lines: ['alpha', 'beta\u2026'],
      truncated: true
    });
    expect(result.lines.length * result.lineHeight).toBeLessThanOrEqual(2);
    expect(result.lines.every(line => codePointMeasure(line, 1) <= 5)).toBe(true);
  });

  it('removes code points from the final line until its ellipsis fits', () => {
    const result = fitPdfText(createInput({
      text: 'abcdef gh',
      maxWidth: 4,
      maxHeight: 1
    }));

    expect(result.lines).toEqual(['abc\u2026']);
    expect(result.truncated).toBe(true);
  });

  it('returns no visible line when the box is too short for the minimum line height', () => {
    const result = fitPdfText(createInput({
      text: 'visible text',
      maxHeight: 0.5
    }));

    expect(result).toEqual({
      fontSize: 1,
      lineHeight: 1,
      lines: [],
      truncated: true
    });
  });

  it('returns no text when even the ellipsis cannot fit the narrow box', () => {
    const result = fitPdfText(createInput({
      text: 'ab',
      maxWidth: 0.5,
      maxHeight: 1
    }));

    expect(result.lines).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it('marks overflow when one indivisible code point cannot fit the minimum width', () => {
    const result = fitPdfText(createInput({
      text: '\ud83d\ude00',
      maxWidth: 0.5,
      maxHeight: 1
    }));

    expect(result.lines).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it('returns a stable empty result without measuring empty or whitespace-only text', () => {
    const measureText = jest.fn(codePointMeasure);

    expect(fitPdfText(createInput({
      text: ' \r\n\t ',
      preferredFontSize: 9,
      minimumFontSize: 6,
      lineHeightRatio: 1.25,
      measureText
    }))).toEqual({
      fontSize: 9,
      lineHeight: 11.25,
      lines: [],
      truncated: false
    });
    expect(measureText).not.toHaveBeenCalled();
  });

  it.each([
    ['zero width', { maxWidth: 0 }],
    ['negative height', { maxHeight: -1 }],
    ['NaN width', { maxWidth: Number.NaN }],
    ['infinite height', { maxHeight: Number.POSITIVE_INFINITY }],
    ['zero preferred size', { preferredFontSize: 0 }],
    ['zero minimum size', { minimumFontSize: 0 }],
    ['zero line-height ratio', { lineHeightRatio: 0 }]
  ])('rejects an invalid numeric dimension: %s', (_label, overrides) => {
    expect(() => fitPdfText(createInput(overrides))).toThrow(RangeError);
  });

  it('rejects a preferred font size below the minimum font size', () => {
    expect(() => fitPdfText(createInput({
      preferredFontSize: 8,
      minimumFontSize: 9
    }))).toThrow('preferredFontSize must be greater than or equal to minimumFontSize');
  });

  it('rejects invalid widths returned by the injected measurer', () => {
    expect(() => fitPdfText(createInput({
      measureText: () => Number.NaN
    }))).toThrow('measureText must return a non-negative finite width');
    expect(() => fitPdfText(createInput({
      measureText: () => -1
    }))).toThrow('measureText must return a non-negative finite width');
  });

  it('is independent of DOM and Canvas APIs and does not mutate its input', () => {
    const createElement = jest.spyOn(document, 'createElement');
    const input = Object.freeze(createInput({ text: 'pure function' }));

    fitPdfText(input);

    expect(createElement).not.toHaveBeenCalled();
    expect(input.text).toBe('pure function');
  });
});
