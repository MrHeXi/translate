export interface PixelImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type OcrTokenLevel = 'symbol' | 'word' | 'line' | 'page-fallback';
export type TextDirection = 'ltr' | 'rtl' | 'vertical' | 'unknown';

export interface OcrToken {
  readonly id: string;
  readonly text: string;
  readonly confidence: number;
  readonly rect: PixelRect;
  readonly level: OcrTokenLevel;
  readonly direction?: TextDirection;
}

export interface PanelRegion {
  readonly id: string;
  readonly rect: PixelRect;
  readonly confidence: number;
  readonly isFallback: boolean;
}

export type RgbaColor = readonly [number, number, number, number];

export interface BubbleRegion {
  readonly id: string;
  readonly panelId?: string;
  readonly rect: PixelRect;
  readonly tokenIds: readonly string[];
  readonly backgroundColor: RgbaColor;
  readonly textureScore: number;
  readonly confidence: number;
}

export interface TextGroup {
  readonly id: string;
  readonly bubbleId?: string;
  readonly panelId?: string;
  readonly tokenIds: readonly string[];
  readonly tokenRects: readonly PixelRect[];
  readonly sourceText: string;
  readonly rect: PixelRect;
  readonly direction: TextDirection;
  readonly geometryReliability: 'precise' | 'page-fallback';
}

export interface TextMask {
  readonly rect: PixelRect;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly pixelCount: number;
  readonly source: 'contrast' | 'none';
}

export type InpaintMode = 'solid' | 'diffusion' | 'skip';

export interface InpaintSafety {
  readonly mode: InpaintMode;
  readonly reason: 'flat-background' | 'smooth-background' | 'high-texture' | 'empty-mask' | 'insufficient-samples';
  readonly backgroundColor: RgbaColor;
  readonly textureScore: number;
  readonly edgeDensity: number;
}

export interface TypesetLine {
  readonly text: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface TypesetPlan {
  readonly bounds: PixelRect;
  readonly writingMode: 'horizontal';
  readonly direction: 'ltr' | 'rtl';
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly lines: readonly TypesetLine[];
  readonly overflow: boolean;
}

export interface ComicImageLimits {
  readonly maxAnalysisPixels: number;
  readonly maxCompositePixels: number;
  readonly maxPanels: number;
  readonly maxBubbles: number;
  readonly maxTokens: number;
}

export const COMIC_IMAGE_LIMITS: ComicImageLimits = Object.freeze({
  maxAnalysisPixels: 3_000_000,
  maxCompositePixels: 16_000_000,
  maxPanels: 64,
  maxBubbles: 200,
  maxTokens: 2_000
});

export class ComicImageLimitError extends Error {
  constructor(
    readonly resource: 'analysis-pixels' | 'composite-pixels' | 'panels' | 'bubbles' | 'tokens',
    readonly actual: number,
    readonly limit: number
  ) {
    super(`${resource} limit exceeded: ${actual} > ${limit}`);
    this.name = 'ComicImageLimitError';
  }
}

export class ComicImageAbortError extends Error {
  constructor() {
    super('Comic image processing aborted');
    this.name = 'AbortError';
  }
}

export interface PanelDetectionOptions {
  readonly backgroundTolerance?: number;
  readonly maxGutterContentDensity?: number;
  readonly minPanelContentDensity?: number;
  readonly minGutterConfidence?: number;
  readonly signal?: AbortSignal;
}

export interface BubbleDetectionOptions {
  readonly backgroundTolerance?: number;
  readonly ringWidth?: number;
  readonly signal?: AbortSignal;
}

export interface TextMaskOptions {
  readonly contrastThreshold?: number;
  readonly dilationRadius?: number;
  readonly signal?: AbortSignal;
}

export interface InpaintOptions {
  readonly iterations?: number;
  readonly signal?: AbortSignal;
}

export interface TypesetOptions {
  readonly minFontSize?: number;
  readonly maxFontSize?: number;
  readonly lineHeightRatio?: number;
  readonly padding?: number;
  readonly direction?: 'ltr' | 'rtl';
  readonly signal?: AbortSignal;
}

export type TextMeasure = (text: string, fontSize: number) => number;

interface IntegralPlane {
  readonly data: Uint32Array;
  readonly stride: number;
}

interface GutterCandidate {
  readonly axis: 'horizontal' | 'vertical';
  readonly start: number;
  readonly end: number;
  readonly confidence: number;
}

interface BubbleCandidate {
  readonly token: OcrToken;
  readonly panelId?: string;
  readonly rect: PixelRect;
  readonly backgroundColor: RgbaColor;
  readonly textureScore: number;
  readonly confidence: number;
}

interface WrapResult {
  readonly lines: readonly { text: string; width: number }[];
  readonly overflow: boolean;
}

const EMPTY_COLOR: RgbaColor = [0, 0, 0, 0];
const MAX_BUBBLE_SEARCH_PIXELS = 65_536;

export function validatePixelImage(image: PixelImage, purpose: 'analysis' | 'composite' = 'analysis'): void {
  if (!Number.isInteger(image.width) || image.width <= 0 || !Number.isInteger(image.height) || image.height <= 0) {
    throw new TypeError('PixelImage width and height must be positive integers');
  }

  const pixelCount = image.width * image.height;
  if (!Number.isSafeInteger(pixelCount)) {
    throw new RangeError('PixelImage dimensions are not safely representable');
  }

  const limit = purpose === 'analysis'
    ? COMIC_IMAGE_LIMITS.maxAnalysisPixels
    : COMIC_IMAGE_LIMITS.maxCompositePixels;
  if (pixelCount > limit) {
    throw new ComicImageLimitError(
      purpose === 'analysis' ? 'analysis-pixels' : 'composite-pixels',
      pixelCount,
      limit
    );
  }

  if (!(image.data instanceof Uint8ClampedArray) || image.data.length !== pixelCount * 4) {
    throw new TypeError(`PixelImage data must contain exactly ${pixelCount * 4} RGBA bytes`);
  }
}

export function detectPanels(image: PixelImage, options: PanelDetectionOptions = {}): PanelRegion[] {
  validatePixelImage(image, 'analysis');
  throwIfAborted(options.signal);

  const background = sampleBorderMedian(image, options.signal);
  const integral = createContentIntegral(
    image,
    background,
    clamp(options.backgroundTolerance ?? 24, 1, 255),
    options.signal
  );
  const root: PixelRect = { x: 0, y: 0, width: image.width, height: image.height };
  const pending: Array<{ rect: PixelRect; confidence: number }> = [{ rect: root, confidence: 1 }];
  const leaves: Array<{ rect: PixelRect; confidence: number }> = [];

  while (pending.length > 0) {
    throwIfAborted(options.signal);
    const current = pending.shift()!;
    const gutter = findBestGutter(current.rect, integral, options);
    if (!gutter) {
      leaves.push(current);
      continue;
    }

    const split = splitRectAtGutter(current.rect, gutter);
    if (!split) {
      leaves.push(current);
      continue;
    }

    const projectedCount = pending.length + leaves.length + 2;
    if (projectedCount > COMIC_IMAGE_LIMITS.maxPanels) {
      throw new ComicImageLimitError('panels', projectedCount, COMIC_IMAGE_LIMITS.maxPanels);
    }

    const confidence = Math.min(current.confidence, gutter.confidence);
    pending.push({ rect: split[0], confidence }, { rect: split[1], confidence });
  }

  if (leaves.length <= 1) {
    return [{ id: 'panel-1', rect: root, confidence: 0, isFallback: true }];
  }

  return leaves
    .sort((left, right) => compareRects(left.rect, right.rect))
    .map((leaf, index) => ({
      id: `panel-${index + 1}`,
      rect: leaf.rect,
      confidence: roundScore(leaf.confidence),
      isFallback: false
    }));
}

export function detectBubbles(
  image: PixelImage,
  tokens: readonly OcrToken[],
  panels: readonly PanelRegion[] = [],
  options: BubbleDetectionOptions = {}
): BubbleRegion[] {
  validatePixelImage(image, 'analysis');
  validateTokens(tokens, image);
  validateCount('panels', panels.length, COMIC_IMAGE_LIMITS.maxPanels);
  panels.forEach(panel => assertRectInsideImage(panel.rect, image, `panel ${panel.id}`));
  throwIfAborted(options.signal);

  const preciseTokens = tokens.filter(token => token.level !== 'page-fallback' && token.text.trim());
  if (preciseTokens.length === 0) return [];
  validateCount('bubbles', preciseTokens.length, COMIC_IMAGE_LIMITS.maxBubbles);

  const effectivePanels = panels.length > 0
    ? panels
    : [{ id: 'panel-1', rect: { x: 0, y: 0, width: image.width, height: image.height }, confidence: 0, isFallback: true }];
  const candidates = preciseTokens.map(token => createBubbleCandidate(image, token, effectivePanels, options));
  const parents = candidates.map((_candidate, index) => index);

  for (let left = 0; left < candidates.length; left += 1) {
    throwIfAborted(options.signal);
    for (let right = left + 1; right < candidates.length; right += 1) {
      if ((right & 127) === 0) throwIfAborted(options.signal);
      if (shouldMergeBubbleCandidates(candidates[left], candidates[right], options.backgroundTolerance ?? 24)) {
        unionParents(parents, left, right);
      }
    }
  }

  const components = new Map<number, BubbleCandidate[]>();
  candidates.forEach((candidate, index) => {
    const root = findParent(parents, index);
    const component = components.get(root) || [];
    component.push(candidate);
    components.set(root, component);
  });

  validateCount('bubbles', components.size, COMIC_IMAGE_LIMITS.maxBubbles);

  return Array.from(components.values())
    .map(component => mergeBubbleComponent(component))
    .sort((left, right) => compareRects(left.rect, right.rect))
    .map((bubble, index) => ({ ...bubble, id: `bubble-${index + 1}` }));
}

export function groupTextTokens(
  tokens: readonly OcrToken[],
  bubbles: readonly BubbleRegion[],
  signal?: AbortSignal
): TextGroup[] {
  validateTokenCollection(tokens);
  validateCount('bubbles', bubbles.length, COMIC_IMAGE_LIMITS.maxBubbles);
  throwIfAborted(signal);

  const tokenById = new Map(tokens.map(token => [token.id, token]));
  const groupedIds = new Set<string>();
  const rawGroups: Array<{ bubble?: BubbleRegion; tokens: OcrToken[] }> = [];

  bubbles.forEach(bubble => {
    throwIfAborted(signal);
    const bubbleTokens = bubble.tokenIds.map(id => {
      const token = tokenById.get(id);
      if (!token) throw new TypeError(`Bubble ${bubble.id} references unknown OCR token ${id}`);
      groupedIds.add(id);
      return token;
    });
    if (bubbleTokens.length > 0) rawGroups.push({ bubble, tokens: bubbleTokens });
  });

  const unassigned = tokens.filter(token => !groupedIds.has(token.id));
  const parents = unassigned.map((_token, index) => index);
  for (let left = 0; left < unassigned.length; left += 1) {
    throwIfAborted(signal);
    if (unassigned[left].level === 'page-fallback') continue;
    for (let right = left + 1; right < unassigned.length; right += 1) {
      if (unassigned[right].level === 'page-fallback') continue;
      if (areTokensAdjacent(unassigned[left], unassigned[right])) unionParents(parents, left, right);
    }
  }

  const unassignedGroups = new Map<number, OcrToken[]>();
  unassigned.forEach((token, index) => {
    const key = token.level === 'page-fallback' ? -(index + 1) : findParent(parents, index);
    const component = unassignedGroups.get(key) || [];
    component.push(token);
    unassignedGroups.set(key, component);
  });
  unassignedGroups.forEach(group => rawGroups.push({ tokens: group }));

  return rawGroups
    .map(raw => createTextGroup(raw.tokens, raw.bubble))
    .sort((left, right) => compareRects(left.rect, right.rect))
    .map((group, index) => ({ ...group, id: `group-${index + 1}` }));
}

export function buildTextMask(
  image: PixelImage,
  group: TextGroup,
  bubble?: BubbleRegion,
  options: TextMaskOptions = {}
): TextMask {
  validatePixelImage(image, 'analysis');
  assertRectInsideImage(group.rect, image, `text group ${group.id}`);
  throwIfAborted(options.signal);

  if (group.geometryReliability === 'page-fallback') {
    return emptyMask(group.rect);
  }

  const dilationRadius = Math.round(clamp(options.dilationRadius ?? 2, 1, 3));
  const workingBounds = clipRect(
    expandRect(unionRects(group.tokenRects), dilationRadius + 1),
    bubble?.rect || { x: 0, y: 0, width: image.width, height: image.height }
  );
  if (workingBounds.width <= 0 || workingBounds.height <= 0) return emptyMask(group.rect);

  const background = bubble?.backgroundColor || sampleRingMedian(image, group.rect, 3, options.signal).color;
  const contrastThreshold = clamp(options.contrastThreshold ?? 48, 1, 255);
  const sourceMask = new Uint8Array(workingBounds.width * workingBounds.height);
  const tokenCoverage = new Uint8Array(sourceMask.length);
  let rasterizedTokenPixels = 0;

  for (const tokenRect of group.tokenRects) {
    throwIfAborted(options.signal);
    const clippedToken = clipRect(tokenRect, workingBounds);
    rasterizedTokenPixels += rectArea(clippedToken);
    if (rasterizedTokenPixels > sourceMask.length * 8) return emptyMask(group.rect);
    for (let y = clippedToken.y; y < rectBottom(clippedToken); y += 1) {
      const rowStart = (y - workingBounds.y) * workingBounds.width + clippedToken.x - workingBounds.x;
      tokenCoverage.fill(1, rowStart, rowStart + clippedToken.width);
    }
  }

  for (let localY = 0; localY < workingBounds.height; localY += 1) {
    if ((localY & 15) === 0) throwIfAborted(options.signal);
    const sourceY = workingBounds.y + localY;
    for (let localX = 0; localX < workingBounds.width; localX += 1) {
      const sourceX = workingBounds.x + localX;
      if (!tokenCoverage[localY * workingBounds.width + localX]) continue;
      const pixel = readPixel(image, sourceX, sourceY);
      if (pixel[3] > 0 && colorDistance(pixel, background) >= contrastThreshold) {
        sourceMask[localY * workingBounds.width + localX] = 1;
      }
    }
  }

  const dilated = dilateMask(sourceMask, workingBounds.width, workingBounds.height, dilationRadius, options.signal);
  let pixelCount = 0;
  for (let index = 0; index < dilated.length; index += 1) pixelCount += dilated[index];

  return {
    rect: workingBounds,
    width: workingBounds.width,
    height: workingBounds.height,
    data: dilated,
    pixelCount,
    source: pixelCount > 0 ? 'contrast' : 'none'
  };
}

export function assessInpaintSafety(
  image: PixelImage,
  mask: TextMask,
  bubble?: BubbleRegion,
  signal?: AbortSignal
): InpaintSafety {
  validatePixelImage(image, 'analysis');
  throwIfAborted(signal);
  if (mask.pixelCount === 0) {
    return {
      mode: 'skip',
      reason: 'empty-mask',
      backgroundColor: EMPTY_COLOR,
      textureScore: 0,
      edgeDensity: 0
    };
  }

  const sampleBounds = clipRect(
    bubble?.rect || expandRect(mask.rect, 4),
    { x: 0, y: 0, width: image.width, height: image.height }
  );
  const sampleStep = Math.max(1, Math.floor(Math.sqrt(rectArea(sampleBounds) / 20_000)));
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];
  const alpha: number[] = [];
  const luminance: number[] = [];
  let edgeCount = 0;
  let edgeSamples = 0;

  for (let y = sampleBounds.y; y < rectBottom(sampleBounds); y += sampleStep) {
    throwIfAborted(signal);
    for (let x = sampleBounds.x; x < rectRight(sampleBounds); x += sampleStep) {
      if (maskValueAt(mask, x, y)) continue;
      const pixel = readPixel(image, x, y);
      red.push(pixel[0]);
      green.push(pixel[1]);
      blue.push(pixel[2]);
      alpha.push(pixel[3]);
      luminance.push(pixelLuminance(pixel));

      const rightX = x + sampleStep;
      if (rightX < rectRight(sampleBounds) && !maskValueAt(mask, rightX, y)) {
        edgeSamples += 1;
        if (Math.abs(pixelLuminance(pixel) - pixelLuminance(readPixel(image, rightX, y))) > 24) edgeCount += 1;
      }
      const lowerY = y + sampleStep;
      if (lowerY < rectBottom(sampleBounds) && !maskValueAt(mask, x, lowerY)) {
        edgeSamples += 1;
        if (Math.abs(pixelLuminance(pixel) - pixelLuminance(readPixel(image, x, lowerY))) > 24) edgeCount += 1;
      }
    }
  }

  if (luminance.length < 8) {
    return {
      mode: 'skip',
      reason: 'insufficient-samples',
      backgroundColor: EMPTY_COLOR,
      textureScore: 0,
      edgeDensity: 0
    };
  }

  const medianLuminance = median(luminance);
  const absoluteDeviation = median(luminance.map(value => Math.abs(value - medianLuminance)));
  const edgeDensity = edgeSamples > 0 ? edgeCount / edgeSamples : 0;
  const textureScore = absoluteDeviation + edgeDensity * 50;
  const backgroundColor: RgbaColor = [median(red), median(green), median(blue), median(alpha)];

  if (textureScore > 25 || edgeDensity > 0.18) {
    return {
      mode: 'skip',
      reason: 'high-texture',
      backgroundColor,
      textureScore: roundScore(textureScore),
      edgeDensity: roundScore(edgeDensity)
    };
  }

  if (absoluteDeviation <= 5 && edgeDensity <= 0.04) {
    return {
      mode: 'solid',
      reason: 'flat-background',
      backgroundColor,
      textureScore: roundScore(textureScore),
      edgeDensity: roundScore(edgeDensity)
    };
  }

  return {
    mode: 'diffusion',
    reason: 'smooth-background',
    backgroundColor,
    textureScore: roundScore(textureScore),
    edgeDensity: roundScore(edgeDensity)
  };
}

export function inpaintText(
  image: PixelImage,
  mask: TextMask,
  safety: InpaintSafety,
  options: InpaintOptions = {}
): PixelImage {
  validatePixelImage(image, 'composite');
  const output: PixelImage = {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data)
  };
  applyInpaintToImage(output, mask, safety, options);
  return output;
}

export function applyInpaintToImage(
  image: PixelImage,
  mask: TextMask,
  safety: InpaintSafety,
  options: InpaintOptions = {}
): void {
  validatePixelImage(image, 'composite');
  assertRectInsideImage(mask.rect, image, 'text mask');
  if (mask.data.length !== mask.width * mask.height || mask.width !== mask.rect.width || mask.height !== mask.rect.height) {
    throw new TypeError('TextMask dimensions do not match its data');
  }
  throwIfAborted(options.signal);
  if (safety.mode === 'skip' || mask.pixelCount === 0) return;

  fillMaskedPixels(image, mask, safety.backgroundColor, options.signal);
  if (safety.mode === 'solid') return;

  const iterations = Math.round(clamp(options.iterations ?? 24, 1, 64));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    throwIfAborted(options.signal);
    for (let localY = 0; localY < mask.height; localY += 1) {
      if ((localY & 7) === 0) throwIfAborted(options.signal);
      for (let localX = 0; localX < mask.width; localX += 1) {
        if (!mask.data[localY * mask.width + localX]) continue;
        const x = mask.rect.x + localX;
        const y = mask.rect.y + localY;
        diffusePixel(image, x, y);
      }
    }
  }
}

export function layoutTranslation(
  text: string,
  bounds: PixelRect,
  measure: TextMeasure,
  options: TypesetOptions = {}
): TypesetPlan {
  assertValidRect(bounds, 'typeset bounds');
  throwIfAborted(options.signal);

  const padding = clamp(options.padding ?? 2, 0, Math.floor(Math.min(bounds.width, bounds.height) / 2));
  const availableWidth = Math.max(0, bounds.width - padding * 2);
  const availableHeight = Math.max(0, bounds.height - padding * 2);
  const minFontSize = Math.max(1, Math.round(options.minFontSize ?? 6));
  const maxFontSize = Math.max(minFontSize, Math.round(options.maxFontSize ?? Math.min(64, availableHeight || minFontSize)));
  const lineHeightRatio = clamp(options.lineHeightRatio ?? 1.2, 1, 2);
  const direction = options.direction || inferTextDirection(text);

  const evaluate = (fontSize: number): { wrap: WrapResult; lineHeight: number } => {
    throwIfAborted(options.signal);
    const lineHeight = fontSize * lineHeightRatio;
    const wrap = wrapText(text, availableWidth, availableHeight, fontSize, lineHeight, measure, options.signal);
    return { wrap, lineHeight };
  };

  let selectedFontSize = minFontSize;
  let selected = evaluate(minFontSize);
  if (!selected.wrap.overflow) {
    let low = minFontSize;
    let high = maxFontSize;
    while (low <= high) {
      throwIfAborted(options.signal);
      const candidate = Math.floor((low + high) / 2);
      const result = evaluate(candidate);
      if (result.wrap.overflow) {
        high = candidate - 1;
      } else {
        selectedFontSize = candidate;
        selected = result;
        low = candidate + 1;
      }
    }
  }

  const lines: TypesetLine[] = selected.wrap.lines.map((line, index) => ({
    text: line.text,
    width: line.width,
    x: direction === 'rtl' ? bounds.x + bounds.width - padding : bounds.x + padding,
    y: bounds.y + padding + selected.lineHeight * (index + 1)
  }));

  return {
    bounds,
    writingMode: 'horizontal',
    direction,
    fontSize: selectedFontSize,
    lineHeight: selected.lineHeight,
    lines,
    overflow: selected.wrap.overflow
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ComicImageAbortError();
}

function validateCount(resource: 'panels' | 'bubbles' | 'tokens', actual: number, limit: number): void {
  if (actual > limit) throw new ComicImageLimitError(resource, actual, limit);
}

function validateTokenCollection(tokens: readonly OcrToken[]): void {
  validateCount('tokens', tokens.length, COMIC_IMAGE_LIMITS.maxTokens);
  const ids = new Set<string>();
  tokens.forEach(token => {
    if (!token.id || ids.has(token.id)) throw new TypeError(`OCR token ids must be non-empty and unique: ${token.id}`);
    ids.add(token.id);
    assertValidRect(token.rect, `OCR token ${token.id}`);
    if (!Number.isFinite(token.confidence) || token.confidence < 0 || token.confidence > 100) {
      throw new TypeError(`OCR token ${token.id} confidence must be between 0 and 100`);
    }
  });
}

function validateTokens(tokens: readonly OcrToken[], image: PixelImage): void {
  validateTokenCollection(tokens);
  tokens.forEach(token => assertRectInsideImage(token.rect, image, `OCR token ${token.id}`));
}

function assertValidRect(rect: PixelRect, label: string): void {
  if (
    !Number.isInteger(rect.x) || !Number.isInteger(rect.y) ||
    !Number.isInteger(rect.width) || !Number.isInteger(rect.height) ||
    rect.width <= 0 || rect.height <= 0
  ) {
    throw new TypeError(`${label} must use integer source-pixel coordinates and positive dimensions`);
  }
}

function assertRectInsideImage(rect: PixelRect, image: PixelImage, label: string): void {
  assertValidRect(rect, label);
  if (rect.x < 0 || rect.y < 0 || rectRight(rect) > image.width || rectBottom(rect) > image.height) {
    throw new RangeError(`${label} lies outside PixelImage bounds`);
  }
}

function sampleBorderMedian(image: PixelImage, signal?: AbortSignal): RgbaColor {
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];
  const alpha: number[] = [];
  const perimeter = Math.max(1, image.width * 2 + image.height * 2);
  const step = Math.max(1, Math.floor(perimeter / 4096));
  let checks = 0;

  const add = (x: number, y: number): void => {
    if ((checks++ & 511) === 0) throwIfAborted(signal);
    const pixel = readPixel(image, x, y);
    red.push(pixel[0]);
    green.push(pixel[1]);
    blue.push(pixel[2]);
    alpha.push(pixel[3]);
  };

  for (let x = 0; x < image.width; x += step) {
    add(x, 0);
    if (image.height > 1) add(x, image.height - 1);
  }
  for (let y = step; y < image.height - 1; y += step) {
    add(0, y);
    if (image.width > 1) add(image.width - 1, y);
  }

  return [median(red), median(green), median(blue), median(alpha)];
}

function createContentIntegral(
  image: PixelImage,
  background: RgbaColor,
  tolerance: number,
  signal?: AbortSignal
): IntegralPlane {
  const stride = image.width + 1;
  const data = new Uint32Array(stride * (image.height + 1));
  for (let y = 0; y < image.height; y += 1) {
    if ((y & 7) === 0) throwIfAborted(signal);
    let rowCount = 0;
    for (let x = 0; x < image.width; x += 1) {
      if (((y * image.width + x) & 8191) === 0) throwIfAborted(signal);
      const pixel = readPixel(image, x, y);
      if (pixel[3] > 8 && colorDistance(pixel, background) > tolerance) rowCount += 1;
      data[(y + 1) * stride + x + 1] = data[y * stride + x + 1] + rowCount;
    }
  }
  return { data, stride };
}

function contentCount(integral: IntegralPlane, rect: PixelRect): number {
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rectRight(rect);
  const y1 = rectBottom(rect);
  const { data, stride } = integral;
  return data[y1 * stride + x1]
    - data[y0 * stride + x1]
    - data[y1 * stride + x0]
    + data[y0 * stride + x0];
}

function contentDensity(integral: IntegralPlane, rect: PixelRect): number {
  return rectArea(rect) > 0 ? contentCount(integral, rect) / rectArea(rect) : 0;
}

function findBestGutter(
  rect: PixelRect,
  integral: IntegralPlane,
  options: PanelDetectionOptions
): GutterCandidate | null {
  const candidates = [
    ...findGuttersForAxis(rect, integral, 'vertical', options),
    ...findGuttersForAxis(rect, integral, 'horizontal', options)
  ];
  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => (
    right.confidence - left.confidence ||
    (left.axis === right.axis ? 0 : left.axis === 'vertical' ? -1 : 1) ||
    left.start - right.start
  ))[0];
}

function findGuttersForAxis(
  rect: PixelRect,
  integral: IntegralPlane,
  axis: 'horizontal' | 'vertical',
  options: PanelDetectionOptions
): GutterCandidate[] {
  const axisStart = axis === 'vertical' ? rect.x : rect.y;
  const axisLength = axis === 'vertical' ? rect.width : rect.height;
  const margin = Math.max(2, Math.floor(axisLength * 0.04));
  const minGutterWidth = Math.max(2, Math.floor(axisLength * 0.01));
  const maxDensity = clamp(options.maxGutterContentDensity ?? 0.025, 0, 0.25);
  const minPanelDensity = clamp(options.minPanelContentDensity ?? 0.035, 0, 1);
  const minConfidence = clamp(options.minGutterConfidence ?? 0.62, 0, 1);
  const end = axisStart + axisLength - margin;
  const candidates: GutterCandidate[] = [];
  let runStart = -1;

  const sliceDensity = (position: number): number => contentDensity(integral, axis === 'vertical'
    ? { x: position, y: rect.y, width: 1, height: rect.height }
    : { x: rect.x, y: position, width: rect.width, height: 1 });

  for (let position = axisStart + margin; position <= end; position += 1) {
    const isGutter = position < end && sliceDensity(position) <= maxDensity;
    if (isGutter && runStart < 0) runStart = position;
    if (isGutter || runStart < 0) continue;

    const runEnd = position;
    if (runEnd - runStart >= minGutterWidth) {
      const before = axis === 'vertical'
        ? { x: rect.x, y: rect.y, width: runStart - rect.x, height: rect.height }
        : { x: rect.x, y: rect.y, width: rect.width, height: runStart - rect.y };
      const after = axis === 'vertical'
        ? { x: runEnd, y: rect.y, width: rectRight(rect) - runEnd, height: rect.height }
        : { x: rect.x, y: runEnd, width: rect.width, height: rectBottom(rect) - runEnd };
      const beforeDensity = contentDensity(integral, before);
      const afterDensity = contentDensity(integral, after);
      if (beforeDensity >= minPanelDensity && afterDensity >= minPanelDensity) {
        const gutterRect = axis === 'vertical'
          ? { x: runStart, y: rect.y, width: runEnd - runStart, height: rect.height }
          : { x: rect.x, y: runStart, width: rect.width, height: runEnd - runStart };
        const gutterPurity = 1 - contentDensity(integral, gutterRect);
        const neighborStrength = Math.min(1, Math.min(beforeDensity, afterDensity) / 0.2);
        const confidence = gutterPurity * 0.65 + neighborStrength * 0.35;
        if (confidence >= minConfidence) candidates.push({ axis, start: runStart, end: runEnd, confidence });
      }
    }
    runStart = -1;
  }

  return candidates;
}

function splitRectAtGutter(rect: PixelRect, gutter: GutterCandidate): readonly [PixelRect, PixelRect] | null {
  const split = gutter.axis === 'vertical'
    ? [
      { x: rect.x, y: rect.y, width: gutter.start - rect.x, height: rect.height },
      { x: gutter.end, y: rect.y, width: rectRight(rect) - gutter.end, height: rect.height }
    ] as const
    : [
      { x: rect.x, y: rect.y, width: rect.width, height: gutter.start - rect.y },
      { x: rect.x, y: gutter.end, width: rect.width, height: rectBottom(rect) - gutter.end }
    ] as const;
  return split[0].width >= 4 && split[0].height >= 4 && split[1].width >= 4 && split[1].height >= 4
    ? split
    : null;
}

function createBubbleCandidate(
  image: PixelImage,
  token: OcrToken,
  panels: readonly PanelRegion[],
  options: BubbleDetectionOptions
): BubbleCandidate {
  throwIfAborted(options.signal);
  const containingPanel = panels.find(panel => pointInsideRect(
    token.rect.x + Math.floor(token.rect.width / 2),
    token.rect.y + Math.floor(token.rect.height / 2),
    panel.rect
  )) || panels[0];
  const ringWidth = Math.round(clamp(options.ringWidth ?? 3, 1, 12));
  const sample = sampleRingMedian(image, token.rect, ringWidth, options.signal);
  const tolerance = clamp(options.backgroundTolerance ?? 24, 1, 255);
  const expansion = Math.max(8, Math.ceil(Math.max(token.rect.width, token.rect.height) * 2));
  const searchRect = clipRect(expandRect(token.rect, expansion), containingPanel.rect);
  if (rectArea(searchRect) > MAX_BUBBLE_SEARCH_PIXELS) {
    return {
      token,
      panelId: containingPanel.id,
      rect: token.rect,
      backgroundColor: sample.color,
      textureScore: sample.textureScore,
      confidence: 0.1
    };
  }
  const visited = new Uint8Array(rectArea(searchRect));
  const queue = new Int32Array(rectArea(searchRect));
  let queueStart = 0;
  let queueEnd = 0;
  const seedRect = clipRect(expandRect(token.rect, ringWidth), searchRect);

  for (let y = seedRect.y; y < rectBottom(seedRect); y += 1) {
    for (let x = seedRect.x; x < rectRight(seedRect); x += 1) {
      if (pointInsideRect(x, y, token.rect)) continue;
      const localIndex = (y - searchRect.y) * searchRect.width + x - searchRect.x;
      if (!visited[localIndex] && colorDistance(readPixel(image, x, y), sample.color) <= tolerance) {
        visited[localIndex] = 1;
        queue[queueEnd++] = localIndex;
      }
    }
  }

  let minX = token.rect.x;
  let minY = token.rect.y;
  let maxX = rectRight(token.rect) - 1;
  let maxY = rectBottom(token.rect) - 1;
  while (queueStart < queueEnd) {
    if ((queueStart & 1023) === 0) throwIfAborted(options.signal);
    const localIndex = queue[queueStart++];
    const localX = localIndex % searchRect.width;
    const localY = Math.floor(localIndex / searchRect.width);
    const x = searchRect.x + localX;
    const y = searchRect.y + localY;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);

    const neighbors = [localIndex - 1, localIndex + 1, localIndex - searchRect.width, localIndex + searchRect.width];
    for (let index = 0; index < neighbors.length; index += 1) {
      const neighbor = neighbors[index];
      if (neighbor < 0 || neighbor >= visited.length || visited[neighbor]) continue;
      const neighborX = neighbor % searchRect.width;
      const neighborY = Math.floor(neighbor / searchRect.width);
      if (Math.abs(neighborX - localX) + Math.abs(neighborY - localY) !== 1) continue;
      const sourceX = searchRect.x + neighborX;
      const sourceY = searchRect.y + neighborY;
      if (colorDistance(readPixel(image, sourceX, sourceY), sample.color) > tolerance) continue;
      visited[neighbor] = 1;
      queue[queueEnd++] = neighbor;
    }
  }

  const rect = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
  const coverage = queueEnd / Math.max(1, rectArea(searchRect));
  const confidence = clamp(0.85 - sample.textureScore / 100 - (coverage > 0.85 ? 0.25 : 0), 0.1, 0.95);
  return {
    token,
    panelId: containingPanel.id,
    rect,
    backgroundColor: sample.color,
    textureScore: sample.textureScore,
    confidence
  };
}

function sampleRingMedian(
  image: PixelImage,
  rect: PixelRect,
  ringWidth: number,
  signal?: AbortSignal
): { color: RgbaColor; textureScore: number } {
  const outer = clipRect(expandRect(rect, ringWidth), { x: 0, y: 0, width: image.width, height: image.height });
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];
  const alpha: number[] = [];
  const luminance: number[] = [];

  for (let y = outer.y; y < rectBottom(outer); y += 1) {
    if ((y & 15) === 0) throwIfAborted(signal);
    for (let x = outer.x; x < rectRight(outer); x += 1) {
      if (pointInsideRect(x, y, rect)) continue;
      const pixel = readPixel(image, x, y);
      red.push(pixel[0]);
      green.push(pixel[1]);
      blue.push(pixel[2]);
      alpha.push(pixel[3]);
      luminance.push(pixelLuminance(pixel));
    }
  }

  if (red.length === 0) {
    const center = readPixel(
      image,
      clamp(rect.x + Math.floor(rect.width / 2), 0, image.width - 1),
      clamp(rect.y + Math.floor(rect.height / 2), 0, image.height - 1)
    );
    return { color: center, textureScore: 0 };
  }

  const centerLuminance = median(luminance);
  return {
    color: [median(red), median(green), median(blue), median(alpha)],
    textureScore: median(luminance.map(value => Math.abs(value - centerLuminance)))
  };
}

function shouldMergeBubbleCandidates(left: BubbleCandidate, right: BubbleCandidate, tolerance: number): boolean {
  if (left.panelId !== right.panelId) return false;
  if (colorDistance(left.backgroundColor, right.backgroundColor) > tolerance) return false;
  const candidateGap = rectDistance(left.rect, right.rect);
  const tokenGap = rectDistance(left.token.rect, right.token.rect);
  const adjacentDistance = Math.max(3, Math.min(left.token.rect.height, right.token.rect.height));
  return candidateGap <= 1 || (candidateGap <= adjacentDistance && tokenGap <= adjacentDistance * 2);
}

function mergeBubbleComponent(component: readonly BubbleCandidate[]): Omit<BubbleRegion, 'id'> {
  const rect = unionRects(component.map(candidate => candidate.rect));
  const red = component.map(candidate => candidate.backgroundColor[0]);
  const green = component.map(candidate => candidate.backgroundColor[1]);
  const blue = component.map(candidate => candidate.backgroundColor[2]);
  const alpha = component.map(candidate => candidate.backgroundColor[3]);
  return {
    panelId: component[0].panelId,
    rect,
    tokenIds: component.map(candidate => candidate.token.id),
    backgroundColor: [median(red), median(green), median(blue), median(alpha)],
    textureScore: roundScore(Math.max(...component.map(candidate => candidate.textureScore))),
    confidence: roundScore(Math.min(...component.map(candidate => candidate.confidence)))
  };
}

function areTokensAdjacent(left: OcrToken, right: OcrToken): boolean {
  const vertical = left.direction === 'vertical' || right.direction === 'vertical';
  const allowedGap = Math.max(3, Math.min(left.rect.height, right.rect.height));
  if (rectDistance(left.rect, right.rect) > allowedGap * 1.5) return false;
  return vertical
    ? rangesOverlap(left.rect.x, rectRight(left.rect), right.rect.x, rectRight(right.rect))
    : rangesOverlap(left.rect.y, rectBottom(left.rect), right.rect.y, rectBottom(right.rect));
}

function createTextGroup(tokens: readonly OcrToken[], bubble?: BubbleRegion): Omit<TextGroup, 'id'> {
  const direction = chooseGroupDirection(tokens);
  const ordered = [...tokens].sort((left, right) => compareTokens(left, right, direction));
  const rect = unionRects(ordered.map(token => token.rect));
  return {
    bubbleId: bubble?.id,
    panelId: bubble?.panelId,
    tokenIds: ordered.map(token => token.id),
    tokenRects: ordered.map(token => token.rect),
    sourceText: joinTokenText(ordered),
    rect,
    direction,
    geometryReliability: ordered.some(token => token.level === 'page-fallback') ? 'page-fallback' : 'precise'
  };
}

function chooseGroupDirection(tokens: readonly OcrToken[]): TextDirection {
  const counts = new Map<TextDirection, number>();
  tokens.forEach(token => {
    const direction = token.direction || 'unknown';
    counts.set(direction, (counts.get(direction) || 0) + 1);
  });
  return (['vertical', 'rtl', 'ltr', 'unknown'] as TextDirection[])
    .sort((left, right) => (counts.get(right) || 0) - (counts.get(left) || 0))[0];
}

function compareTokens(left: OcrToken, right: OcrToken, direction: TextDirection): number {
  if (direction === 'vertical') return right.rect.x - left.rect.x || left.rect.y - right.rect.y;
  if (direction === 'rtl') return left.rect.y - right.rect.y || right.rect.x - left.rect.x;
  return left.rect.y - right.rect.y || left.rect.x - right.rect.x;
}

function joinTokenText(tokens: readonly OcrToken[]): string {
  let result = '';
  tokens.forEach(token => {
    const text = token.text.trim();
    if (!text) return;
    const needsSpace = Boolean(result) && !endsWithCjk(result) && !startsWithCjk(text);
    result += `${needsSpace ? ' ' : ''}${text}`;
  });
  return result;
}

function emptyMask(rect: PixelRect): TextMask {
  return { rect, width: rect.width, height: rect.height, data: new Uint8Array(rectArea(rect)), pixelCount: 0, source: 'none' };
}

function dilateMask(
  source: Uint8Array,
  width: number,
  height: number,
  radius: number,
  signal?: AbortSignal
): Uint8Array {
  const output = new Uint8Array(source);
  for (let y = 0; y < height; y += 1) {
    if ((y & 15) === 0) throwIfAborted(signal);
    for (let x = 0; x < width; x += 1) {
      if (!source[y * width + x]) continue;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
          const targetX = x + offsetX;
          const targetY = y + offsetY;
          if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
            output[targetY * width + targetX] = 1;
          }
        }
      }
    }
  }
  return output;
}

function maskValueAt(mask: TextMask, x: number, y: number): boolean {
  if (!pointInsideRect(x, y, mask.rect)) return false;
  return Boolean(mask.data[(y - mask.rect.y) * mask.width + x - mask.rect.x]);
}

function fillMaskedPixels(image: PixelImage, mask: TextMask, color: RgbaColor, signal?: AbortSignal): void {
  for (let localY = 0; localY < mask.height; localY += 1) {
    if ((localY & 15) === 0) throwIfAborted(signal);
    for (let localX = 0; localX < mask.width; localX += 1) {
      if (!mask.data[localY * mask.width + localX]) continue;
      const index = pixelIndex(image.width, mask.rect.x + localX, mask.rect.y + localY);
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
    }
  }
}

function diffusePixel(image: PixelImage, x: number, y: number): void {
  const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  neighbors.forEach(([neighborX, neighborY]) => {
    if (neighborX < 0 || neighborY < 0 || neighborX >= image.width || neighborY >= image.height) return;
    const pixel = readPixel(image, neighborX, neighborY);
    red += pixel[0];
    green += pixel[1];
    blue += pixel[2];
    count += 1;
  });
  if (count === 0) return;
  const index = pixelIndex(image.width, x, y);
  image.data[index] = Math.round(red / count);
  image.data[index + 1] = Math.round(green / count);
  image.data[index + 2] = Math.round(blue / count);
}

function wrapText(
  text: string,
  availableWidth: number,
  availableHeight: number,
  fontSize: number,
  lineHeight: number,
  measure: TextMeasure,
  signal?: AbortSignal
): WrapResult {
  if (!text) return { lines: [], overflow: false };
  if (availableWidth <= 0 || availableHeight <= 0) return { lines: [], overflow: true };

  const units = createWrapUnits(text);
  const lines: Array<{ text: string; width: number }> = [];
  let line = '';
  let pendingSpace = false;
  let widthOverflow = false;

  const measuredWidth = (value: string): number => {
    throwIfAborted(signal);
    const width = measure(value, fontSize);
    if (!Number.isFinite(width) || width < 0) throw new TypeError('TextMeasure must return a finite non-negative width');
    return width;
  };
  const pushLine = (): void => {
    if (!line && lines.length === 0) return;
    const width = measuredWidth(line);
    if (width > availableWidth) widthOverflow = true;
    lines.push({ text: line, width });
    line = '';
  };

  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    throwIfAborted(signal);
    const unit = units[unitIndex];
    if (unit === '\n') {
      pushLine();
      pendingSpace = false;
      continue;
    }
    if (unit === ' ') {
      pendingSpace = Boolean(line);
      continue;
    }

    const separator = pendingSpace && line ? ' ' : '';
    const candidate = `${line}${separator}${unit}`;
    if (measuredWidth(candidate) <= availableWidth) {
      line = candidate;
      pendingSpace = false;
      continue;
    }

    if (line) pushLine();
    pendingSpace = false;
    if (measuredWidth(unit) <= availableWidth) {
      line = unit;
      continue;
    }

    const graphemes = splitGraphemes(unit);
    for (const grapheme of graphemes) {
      const graphemeCandidate = `${line}${grapheme}`;
      if (line && measuredWidth(graphemeCandidate) > availableWidth) pushLine();
      line += grapheme;
      if (measuredWidth(line) > availableWidth) widthOverflow = true;
    }
  }
  if (line) pushLine();

  const heightOverflow = lines.length * lineHeight > availableHeight + 0.0001;
  return { lines, overflow: widthOverflow || heightOverflow };
}

function createWrapUnits(text: string): string[] {
  const units: string[] = [];
  let word = '';
  const flushWord = (): void => {
    if (word) units.push(word);
    word = '';
  };

  splitGraphemes(text.replace(/\r\n?/g, '\n')).forEach(grapheme => {
    if (grapheme === '\n') {
      flushWord();
      units.push('\n');
    } else if (/^\s+$/u.test(grapheme)) {
      flushWord();
      if (units[units.length - 1] !== ' ') units.push(' ');
    } else if (isCjk(grapheme)) {
      flushWord();
      units.push(grapheme);
    } else {
      word += grapheme;
    }
  });
  flushWord();
  return units;
}

function splitGraphemes(text: string): string[] {
  interface SegmenterLike {
    segment(value: string): Iterable<{ segment: string }>;
  }
  interface SegmenterConstructorLike {
    new (locale?: string, options?: { granularity: 'grapheme' }): SegmenterLike;
  }
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructorLike }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), item => item.segment);

  const result: string[] = [];
  for (const codePoint of Array.from(text)) {
    if (result.length > 0 && (/^\p{Mark}$/u.test(codePoint) || codePoint === '\uFE0E' || codePoint === '\uFE0F')) {
      result[result.length - 1] += codePoint;
    } else if (result.length > 0 && (result[result.length - 1].endsWith('\u200D') || codePoint === '\u200D')) {
      result[result.length - 1] += codePoint;
    } else {
      result.push(codePoint);
    }
  }
  return result;
}

function inferTextDirection(text: string): 'ltr' | 'rtl' {
  return /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u.test(text) ? 'rtl' : 'ltr';
}

function isCjk(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

function startsWithCjk(text: string): boolean {
  return isCjk(splitGraphemes(text)[0] || '');
}

function endsWithCjk(text: string): boolean {
  const graphemes = splitGraphemes(text);
  return isCjk(graphemes[graphemes.length - 1] || '');
}

function readPixel(image: PixelImage, x: number, y: number): RgbaColor {
  const index = pixelIndex(image.width, x, y);
  return [image.data[index], image.data[index + 1], image.data[index + 2], image.data[index + 3]];
}

function pixelIndex(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function pixelLuminance(color: RgbaColor): number {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

function colorDistance(left: RgbaColor, right: RgbaColor): number {
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2])
  );
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function rectArea(rect: PixelRect): number {
  return rect.width * rect.height;
}

function rectRight(rect: PixelRect): number {
  return rect.x + rect.width;
}

function rectBottom(rect: PixelRect): number {
  return rect.y + rect.height;
}

function expandRect(rect: PixelRect, amount: number): PixelRect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 };
}

function clipRect(rect: PixelRect, bounds: PixelRect): PixelRect {
  const x = Math.max(rect.x, bounds.x);
  const y = Math.max(rect.y, bounds.y);
  const right = Math.min(rectRight(rect), rectRight(bounds));
  const bottom = Math.min(rectBottom(rect), rectBottom(bounds));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function unionRects(rects: readonly PixelRect[]): PixelRect {
  if (rects.length === 0) throw new TypeError('At least one PixelRect is required');
  const x = Math.min(...rects.map(rect => rect.x));
  const y = Math.min(...rects.map(rect => rect.y));
  const right = Math.max(...rects.map(rect => rectRight(rect)));
  const bottom = Math.max(...rects.map(rect => rectBottom(rect)));
  return { x, y, width: right - x, height: bottom - y };
}

function compareRects(left: PixelRect, right: PixelRect): number {
  return left.y - right.y || left.x - right.x || left.height - right.height || left.width - right.width;
}

function pointInsideRect(x: number, y: number, rect: PixelRect): boolean {
  return x >= rect.x && x < rectRight(rect) && y >= rect.y && y < rectBottom(rect);
}

function rectDistance(left: PixelRect, right: PixelRect): number {
  const horizontal = Math.max(0, Math.max(left.x, right.x) - Math.min(rectRight(left), rectRight(right)));
  const vertical = Math.max(0, Math.max(left.y, right.y) - Math.min(rectBottom(left), rectBottom(right)));
  return Math.sqrt(horizontal * horizontal + vertical * vertical);
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return Math.min(leftEnd, rightEnd) > Math.max(leftStart, rightStart);
}

function findParent(parents: number[], value: number): number {
  let root = value;
  while (parents[root] !== root) root = parents[root];
  while (parents[value] !== value) {
    const next = parents[value];
    parents[value] = root;
    value = next;
  }
  return root;
}

function unionParents(parents: number[], left: number, right: number): void {
  const leftRoot = findParent(parents, left);
  const rightRoot = findParent(parents, right);
  if (leftRoot === rightRoot) return;
  if (leftRoot < rightRoot) parents[rightRoot] = leftRoot;
  else parents[leftRoot] = rightRoot;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
