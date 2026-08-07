import {
  assessInpaintSafety,
  buildTextMask,
  COMIC_IMAGE_LIMITS,
  ComicImageAbortError,
  ComicImageLimitError,
  detectBubbles,
  detectPanels,
  groupTextTokens,
  inpaintText,
  InpaintSafety,
  layoutTranslation,
  OcrToken,
  PixelImage,
  PixelRect,
  TextMask,
  validatePixelImage
} from '../ComicImageProcessor';

type Color = readonly [number, number, number, number];

const createImage = (width: number, height: number, color: Color): PixelImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = color[0];
    data[index * 4 + 1] = color[1];
    data[index * 4 + 2] = color[2];
    data[index * 4 + 3] = color[3];
  }
  return { width, height, data };
};

const paintRect = (image: PixelImage, rect: PixelRect, color: Color): void => {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const index = (y * image.width + x) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = color[3];
    }
  }
};

const pixel = (image: PixelImage, x: number, y: number): Color => {
  const index = (y * image.width + x) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2], image.data[index + 3]];
};

const token = (
  id: string,
  text: string,
  rect: PixelRect,
  overrides: Partial<OcrToken> = {}
): OcrToken => ({
  id,
  text,
  rect,
  confidence: 95,
  level: 'word',
  direction: 'ltr',
  ...overrides
});

const flatSafety = (color: Color): InpaintSafety => ({
  mode: 'solid',
  reason: 'flat-background',
  backgroundColor: color,
  textureScore: 0,
  edgeDensity: 0
});

describe('ComicImageProcessor', () => {
  it('publishes and enforces the analysis, composite, panel, bubble, and token limits', () => {
    expect(COMIC_IMAGE_LIMITS).toEqual({
      maxAnalysisPixels: 3_000_000,
      maxCompositePixels: 16_000_000,
      maxPanels: 64,
      maxBubbles: 200,
      maxTokens: 2_000
    });

    expect(() => validatePixelImage({
      width: COMIC_IMAGE_LIMITS.maxAnalysisPixels + 1,
      height: 1,
      data: new Uint8ClampedArray(0)
    })).toThrow(ComicImageLimitError);
    expect(() => validatePixelImage({
      width: COMIC_IMAGE_LIMITS.maxCompositePixels + 1,
      height: 1,
      data: new Uint8ClampedArray(0)
    }, 'composite')).toThrow(ComicImageLimitError);

    const image = createImage(8, 8, [255, 255, 255, 255]);
    const tooManyTokens = Array.from({ length: COMIC_IMAGE_LIMITS.maxTokens + 1 }, (_item, index) => (
      token(`token-${index}`, 'x', { x: 1, y: 1, width: 1, height: 1 })
    ));
    expect(() => detectBubbles(image, tooManyTokens)).toThrow(ComicImageLimitError);
    const tooManyBubbleSeeds = Array.from({ length: COMIC_IMAGE_LIMITS.maxBubbles + 1 }, (_item, index) => (
      token(`bubble-token-${index}`, 'x', { x: 1, y: 1, width: 1, height: 1 })
    ));
    expect(() => detectBubbles(image, tooManyBubbleSeeds)).toThrow(expect.objectContaining({ resource: 'bubbles' }));
    expect(() => groupTextTokens([], Array.from({ length: COMIC_IMAGE_LIMITS.maxBubbles + 1 }, (_item, index) => ({
      id: `bubble-${index}`,
      rect: { x: 0, y: 0, width: 1, height: 1 },
      tokenIds: [],
      backgroundColor: [255, 255, 255, 255] as const,
      textureScore: 0,
      confidence: 1
    })))).toThrow(ComicImageLimitError);
  });

  it('splits rectangular panels at a full whitespace gutter and falls back on low confidence', () => {
    const page = createImage(100, 60, [255, 255, 255, 255]);
    paintRect(page, { x: 4, y: 4, width: 42, height: 52 }, [70, 70, 70, 255]);
    paintRect(page, { x: 54, y: 4, width: 42, height: 52 }, [90, 90, 90, 255]);

    const panels = detectPanels(page);
    expect(panels).toHaveLength(2);
    expect(panels.every(panel => !panel.isFallback && panel.confidence >= 0.62)).toBe(true);
    expect(panels[0].rect.x + panels[0].rect.width).toBeLessThanOrEqual(panels[1].rect.x);
    expect(detectPanels(page)).toEqual(panels);

    const blankPage = createImage(40, 30, [255, 255, 255, 255]);
    expect(detectPanels(blankPage)).toEqual([{
      id: 'panel-1',
      rect: { x: 0, y: 0, width: 40, height: 30 },
      confidence: 0,
      isFallback: true
    }]);
  });

  it('detects white and black bubbles from OCR seeds and removes text with robust flat fills', () => {
    const image = createImage(100, 40, [120, 120, 120, 255]);
    const whiteBubble = { x: 5, y: 5, width: 35, height: 28 };
    const blackBubble = { x: 60, y: 5, width: 35, height: 28 };
    const blackText = { x: 14, y: 15, width: 10, height: 5 };
    const whiteText = { x: 69, y: 15, width: 10, height: 5 };
    paintRect(image, whiteBubble, [248, 248, 248, 255]);
    paintRect(image, blackBubble, [8, 8, 8, 255]);
    paintRect(image, blackText, [5, 5, 5, 255]);
    paintRect(image, whiteText, [250, 250, 250, 255]);
    const original = new Uint8ClampedArray(image.data);
    const tokens = [token('white', 'YES', blackText), token('black', 'NO', whiteText)];

    const bubbles = detectBubbles(image, tokens);
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].backgroundColor[0]).toBeGreaterThan(240);
    expect(bubbles[1].backgroundColor[0]).toBeLessThan(16);

    const groups = groupTextTokens(tokens, bubbles);
    groups.forEach(group => {
      const bubble = bubbles.find(item => item.id === group.bubbleId)!;
      const mask = buildTextMask(image, group, bubble, { dilationRadius: 2 });
      const safety = assessInpaintSafety(image, mask, bubble);
      expect(mask.pixelCount).toBeGreaterThan(group.rect.width * group.rect.height);
      expect(safety.mode).toBe('solid');
      const output = inpaintText(image, mask, safety);
      const centerX = group.rect.x + Math.floor(group.rect.width / 2);
      const centerY = group.rect.y + Math.floor(group.rect.height / 2);
      expect(Math.abs(pixel(output, centerX, centerY)[0] - bubble.backgroundColor[0])).toBeLessThanOrEqual(1);
    });
    expect(image.data).toEqual(original);
  });

  it('merges adjacent tokens inside one bubble but keeps repeated dialogue in separate bubbles', () => {
    const image = createImage(120, 50, [100, 100, 100, 255]);
    paintRect(image, { x: 5, y: 5, width: 45, height: 35 }, [250, 250, 250, 255]);
    paintRect(image, { x: 70, y: 5, width: 40, height: 35 }, [250, 250, 250, 255]);
    const first = { x: 13, y: 16, width: 8, height: 5 };
    const adjacent = { x: 24, y: 16, width: 12, height: 5 };
    const repeated = { x: 82, y: 16, width: 8, height: 5 };
    paintRect(image, first, [0, 0, 0, 255]);
    paintRect(image, adjacent, [0, 0, 0, 255]);
    paintRect(image, repeated, [0, 0, 0, 255]);
    const tokens = [
      token('first', 'YES', first),
      token('adjacent', 'NOW', adjacent),
      token('repeated', 'YES', repeated)
    ];

    const bubbles = detectBubbles(image, tokens);
    const groups = groupTextTokens(tokens, bubbles);
    expect(bubbles).toHaveLength(2);
    expect(groups).toHaveLength(2);
    expect(groups.map(group => group.sourceText)).toEqual(['YES NOW', 'YES']);
    expect(groups[0].bubbleId).not.toBe(groups[1].bubbleId);
  });

  it('returns skip for textured artwork and leaves every source and output pixel unchanged', () => {
    const image = createImage(32, 32, [0, 0, 0, 255]);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const value = (x + y) % 2 === 0 ? 25 : 230;
        paintRect(image, { x, y, width: 1, height: 1 }, [value, value, value, 255]);
      }
    }
    const maskData = new Uint8Array(16);
    maskData.fill(1);
    const mask: TextMask = {
      rect: { x: 14, y: 14, width: 4, height: 4 },
      width: 4,
      height: 4,
      data: maskData,
      pixelCount: 16,
      source: 'contrast'
    };
    const before = new Uint8ClampedArray(image.data);

    const safety = assessInpaintSafety(image, mask, {
      id: 'textured',
      rect: { x: 0, y: 0, width: 32, height: 32 },
      tokenIds: [],
      backgroundColor: [128, 128, 128, 255],
      textureScore: 100,
      confidence: 0.2
    });
    expect(safety).toEqual(expect.objectContaining({ mode: 'skip', reason: 'high-texture' }));
    expect(inpaintText(image, mask, safety).data).toEqual(before);
    expect(image.data).toEqual(before);
  });

  it('never creates an erase mask from an OCR page fallback box', () => {
    const image = createImage(24, 18, [255, 255, 255, 255]);
    paintRect(image, { x: 5, y: 7, width: 10, height: 3 }, [0, 0, 0, 255]);
    const before = new Uint8ClampedArray(image.data);
    const fallback = token('fallback', 'Full page text', { x: 0, y: 0, width: 24, height: 18 }, {
      level: 'page-fallback'
    });
    const group = groupTextTokens([fallback], [])[0];

    const mask = buildTextMask(image, group);
    const safety = assessInpaintSafety(image, mask);
    expect(group.geometryReliability).toBe('page-fallback');
    expect(mask).toEqual(expect.objectContaining({ pixelCount: 0, source: 'none' }));
    expect(safety).toEqual(expect.objectContaining({ mode: 'skip', reason: 'empty-mask' }));
    expect(inpaintText(image, mask, safety).data).toEqual(before);
  });

  it('performs bounded deterministic diffusion on a smooth gradient without mutating input', () => {
    const image = createImage(30, 12, [0, 0, 0, 255]);
    for (let x = 0; x < image.width; x += 1) {
      paintRect(image, { x, y: 0, width: 1, height: image.height }, [100 + x * 3, 100 + x * 3, 100 + x * 3, 255]);
    }
    const maskData = new Uint8Array(3 * 6);
    maskData.fill(1);
    const mask: TextMask = {
      rect: { x: 14, y: 3, width: 3, height: 6 },
      width: 3,
      height: 6,
      data: maskData,
      pixelCount: maskData.length,
      source: 'contrast'
    };
    const before = new Uint8ClampedArray(image.data);
    const safety = assessInpaintSafety(image, mask, {
      id: 'gradient',
      rect: { x: 0, y: 0, width: 30, height: 12 },
      tokenIds: [],
      backgroundColor: [144, 144, 144, 255],
      textureScore: 12,
      confidence: 0.8
    });

    expect(safety.mode).toBe('diffusion');
    const first = inpaintText(image, mask, safety, { iterations: 12 });
    const second = inpaintText(image, mask, safety, { iterations: 12 });
    expect(first.data).toEqual(second.data);
    expect(image.data).toEqual(before);
    expect(pixel(first, 15, 6)[0]).toBeGreaterThan(130);
    expect(pixel(first, 15, 6)[0]).toBeLessThan(160);
    expect(pixel(first, 2, 2)).toEqual(pixel(image, 2, 2));
  });

  it('checks AbortSignal repeatedly inside pixel loops', () => {
    const image = createImage(160, 120, [255, 255, 255, 255]);
    let checks = 0;
    const signal = {
      get aborted(): boolean {
        checks += 1;
        return checks > 5;
      }
    } as AbortSignal;

    expect(() => detectPanels(image, { signal })).toThrow(ComicImageAbortError);
    expect(checks).toBeGreaterThan(5);
  });

  it.each([
    ['CJK', '这是一个很长的漫画翻译句子', 'ltr'],
    ['long word', 'supercalifragilisticexpialidocious', 'ltr'],
    ['RTL', 'مرحبا بالعالم الجميل', 'rtl'],
    ['combining characters', 'Cafe\u0301 deja\u0300 vu', 'ltr']
  ])('wraps %s text by measured width without horizontal or vertical overflow', (_label, text, direction) => {
    const measure = (value: string, fontSize: number): number => (
      Array.from(value.normalize('NFC')).length * fontSize * 0.55
    );
    const bounds = { x: 10, y: 20, width: 92, height: 72 };
    const plan = layoutTranslation(text, bounds, measure, {
      minFontSize: 6,
      maxFontSize: 20,
      padding: 3
    });

    expect(plan.direction).toBe(direction);
    expect(plan.overflow).toBe(false);
    expect(plan.lines.length * plan.lineHeight).toBeLessThanOrEqual(bounds.height - 6);
    expect(plan.lines.every(line => line.width <= bounds.width - 6)).toBe(true);
    expect(plan.lines.every(line => !/^\p{Mark}/u.test(line.text))).toBe(true);
    expect(plan.lines.map(line => line.text).join('').replace(/\s/gu, '').normalize('NFC'))
      .toBe(text.replace(/\s/gu, '').normalize('NFC'));
  });

  it('reports overflow when even one grapheme cannot fit at minimum size', () => {
    const plan = layoutTranslation('W', { x: 0, y: 0, width: 12, height: 12 }, () => 100, {
      minFontSize: 6,
      maxFontSize: 12,
      padding: 2
    });
    expect(plan.overflow).toBe(true);
    expect(plan.fontSize).toBe(6);
    expect(plan.lines).toEqual([expect.objectContaining({ text: 'W', width: 100 })]);
  });

  it('keeps solid inpainting byte-deterministic and preserves alpha', () => {
    const image = createImage(10, 10, [20, 30, 40, 180]);
    paintRect(image, { x: 4, y: 4, width: 2, height: 2 }, [250, 250, 250, 77]);
    const maskData = new Uint8Array([1, 1, 1, 1]);
    const mask: TextMask = {
      rect: { x: 4, y: 4, width: 2, height: 2 },
      width: 2,
      height: 2,
      data: maskData,
      pixelCount: 4,
      source: 'contrast'
    };
    const original = new Uint8ClampedArray(image.data);
    const first = inpaintText(image, mask, flatSafety([20, 30, 40, 180]));
    const second = inpaintText(image, mask, flatSafety([20, 30, 40, 180]));

    expect(first.data).toEqual(second.data);
    expect(image.data).toEqual(original);
    expect(pixel(first, 4, 4)).toEqual([20, 30, 40, 77]);
  });
});
