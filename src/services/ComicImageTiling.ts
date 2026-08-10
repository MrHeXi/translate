import type { PixelPoint, PixelRect } from './ComicImageProcessor';

export const COMIC_IMAGE_TILING_LIMITS = Object.freeze({
  maxSourceDimension: 1_000_000,
  maxSourcePixels: 1_000_000_000,
  maxTileDimension: 16_384,
  maxTilePixels: 3_000_000,
  maxOverlapPixels: 1_024,
  maxTiles: 512,
  maxOcrLinesPerTile: 2_000,
  maxMappedOcrLines: 20_000,
  maxOcrLineTextLength: 8_000,
  maxTotalOcrTextLength: 2_000_000,
  maxPolygonPoints: 8,
  maxDeduplicationComparisons: 1_000_000
});

export type ComicImageTilingLimitResource =
  | 'source-dimension'
  | 'source-pixels'
  | 'tile-dimension'
  | 'tile-pixels'
  | 'overlap-pixels'
  | 'tiles'
  | 'ocr-lines-per-tile'
  | 'mapped-ocr-lines'
  | 'ocr-line-text'
  | 'total-ocr-text'
  | 'polygon-points'
  | 'deduplication-comparisons';

export class ComicImageTilingLimitError extends Error {
  constructor(
    readonly resource: ComicImageTilingLimitResource,
    readonly actual: number,
    readonly limit: number
  ) {
    super(`${resource} limit exceeded: ${actual} > ${limit}`);
    this.name = 'ComicImageTilingLimitError';
  }
}

export class ComicImageTilingAbortError extends Error {
  constructor() {
    super('Comic image tiling aborted');
    this.name = 'AbortError';
  }
}

export interface ComicImageSize {
  readonly width: number;
  readonly height: number;
}

export interface ComicImageTilingOptions {
  readonly maxTileWidth?: number;
  readonly maxTileHeight?: number;
  readonly maxTilePixels?: number;
  readonly overlapPixels?: number;
  readonly signal?: AbortSignal;
}

export interface ComicImageTile {
  readonly id: string;
  readonly index: number;
  readonly row: number;
  readonly column: number;
  readonly sourceRect: PixelRect;
  readonly coreRect: PixelRect;
}

export interface ComicImageTilePlan {
  readonly source: ComicImageSize;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly overlapX: number;
  readonly overlapY: number;
  readonly columns: number;
  readonly rows: number;
  readonly tiles: readonly ComicImageTile[];
}

export interface TileOcrLine {
  readonly id?: string;
  readonly text: string;
  readonly confidence?: number;
  readonly rect: PixelRect;
  readonly sourcePolygon?: readonly PixelPoint[];
}

export interface MappedComicOcrLine {
  readonly id: string;
  readonly text: string;
  readonly confidence?: number;
  readonly rect: PixelRect;
  readonly sourcePolygon?: readonly PixelPoint[];
  readonly sourceTileId: string;
  readonly sourceTileRect: PixelRect;
  readonly sourceTileCoreRect: PixelRect;
  readonly sourceLineIndex: number;
}

export type TileOcrOwnership = 'core-center' | 'all';

export interface TileOcrMappingOptions {
  readonly ownership?: TileOcrOwnership;
  readonly signal?: AbortSignal;
}

export interface OcrLineDeduplicationOptions {
  readonly minimumOverlapRatio?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_MAX_TILE_WIDTH = 1_600;
const DEFAULT_MAX_TILE_HEIGHT = 1_800;
const DEFAULT_OVERLAP_PIXELS = 128;
const DEFAULT_MINIMUM_OVERLAP_RATIO = 0.85;
const MAX_IDENTIFIER_COMPONENT_LENGTH = 128;
const MAX_MAPPED_IDENTIFIER_LENGTH = MAX_IDENTIFIER_COMPONENT_LENGTH * 2 + 1;

export function planComicImageTiles(
  source: ComicImageSize,
  options: ComicImageTilingOptions = {}
): ComicImageTilePlan {
  throwIfAborted(options.signal);
  validateSourceSize(source);

  const maxTileWidth = readBoundedPositiveInteger(
    options.maxTileWidth,
    DEFAULT_MAX_TILE_WIDTH,
    'tile-dimension',
    COMIC_IMAGE_TILING_LIMITS.maxTileDimension,
    'maxTileWidth'
  );
  const maxTileHeight = readBoundedPositiveInteger(
    options.maxTileHeight,
    DEFAULT_MAX_TILE_HEIGHT,
    'tile-dimension',
    COMIC_IMAGE_TILING_LIMITS.maxTileDimension,
    'maxTileHeight'
  );
  const maxTilePixels = readBoundedPositiveInteger(
    options.maxTilePixels,
    COMIC_IMAGE_TILING_LIMITS.maxTilePixels,
    'tile-pixels',
    COMIC_IMAGE_TILING_LIMITS.maxTilePixels,
    'maxTilePixels'
  );
  const overlapPixels = readBoundedNonNegativeInteger(
    options.overlapPixels,
    DEFAULT_OVERLAP_PIXELS,
    'overlap-pixels',
    COMIC_IMAGE_TILING_LIMITS.maxOverlapPixels,
    'overlapPixels'
  );

  const tileWidth = Math.min(source.width, maxTileWidth, maxTilePixels);
  const tileHeight = Math.min(source.height, maxTileHeight, Math.floor(maxTilePixels / tileWidth));
  if (tileHeight < 1) {
    throw new ComicImageTilingLimitError('tile-pixels', tileWidth, maxTilePixels);
  }

  const isHorizontallyTiled = source.width > tileWidth;
  const isVerticallyTiled = source.height > tileHeight;
  if (isHorizontallyTiled && overlapPixels >= tileWidth) {
    throw new RangeError('overlapPixels must be smaller than the effective tile width');
  }
  if (isVerticallyTiled && overlapPixels >= tileHeight) {
    throw new RangeError('overlapPixels must be smaller than the effective tile height');
  }

  const overlapX = isHorizontallyTiled ? overlapPixels : 0;
  const overlapY = isVerticallyTiled ? overlapPixels : 0;
  const columnCount = getAxisTileCount(source.width, tileWidth, overlapX);
  const rowCount = getAxisTileCount(source.height, tileHeight, overlapY);
  if (columnCount > COMIC_IMAGE_TILING_LIMITS.maxTiles
    || rowCount > Math.floor(COMIC_IMAGE_TILING_LIMITS.maxTiles / columnCount)) {
    const actual = columnCount * rowCount;
    throw new ComicImageTilingLimitError('tiles', actual, COMIC_IMAGE_TILING_LIMITS.maxTiles);
  }

  const xStarts = getAxisStarts(source.width, tileWidth, columnCount);
  const yStarts = getAxisStarts(source.height, tileHeight, rowCount);
  const xCores = getAxisCoreIntervals(source.width, tileWidth, xStarts);
  const yCores = getAxisCoreIntervals(source.height, tileHeight, yStarts);
  const tiles: ComicImageTile[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    throwIfAborted(options.signal);
    for (let column = 0; column < columnCount; column += 1) {
      throwIfAborted(options.signal);
      const index = tiles.length;
      tiles.push({
        id: `tile-r${String(row + 1).padStart(3, '0')}-c${String(column + 1).padStart(3, '0')}`,
        index,
        row,
        column,
        sourceRect: {
          x: xStarts[column],
          y: yStarts[row],
          width: tileWidth,
          height: tileHeight
        },
        coreRect: {
          x: xCores[column].start,
          y: yCores[row].start,
          width: xCores[column].length,
          height: yCores[row].length
        }
      });
    }
  }

  return {
    source: { width: source.width, height: source.height },
    tileWidth,
    tileHeight,
    overlapX,
    overlapY,
    columns: columnCount,
    rows: rowCount,
    tiles
  };
}

export function mapTileOcrLinesToSource(
  tile: ComicImageTile,
  lines: readonly TileOcrLine[],
  signalOrOptions: AbortSignal | TileOcrMappingOptions = {}
): MappedComicOcrLine[] {
  const options = resolveMappingOptions(signalOrOptions);
  throwIfAborted(options.signal);
  validateTile(tile);
  assertCountWithinLimit(
    'ocr-lines-per-tile',
    lines.length,
    COMIC_IMAGE_TILING_LIMITS.maxOcrLinesPerTile
  );

  const mapped: MappedComicOcrLine[] = [];
  const ids = new Set<string>();
  let totalTextLength = 0;
  for (let index = 0; index < lines.length; index += 1) {
    throwIfAborted(options.signal);
    const line = lines[index];
    validateLocalOcrLine(line, tile.sourceRect);
    totalTextLength += line.text.length;
    assertCountWithinLimit(
      'total-ocr-text',
      totalTextLength,
      COMIC_IMAGE_TILING_LIMITS.maxTotalOcrTextLength
    );

    const localId = line.id ?? `line-${index + 1}`;
    validateIdentifier(localId, `OCR line ${index} id`, MAX_IDENTIFIER_COMPONENT_LENGTH);
    const id = `${tile.id}:${localId}`;
    if (ids.has(id)) throw new TypeError(`OCR line ids must be unique within tile ${tile.id}: ${localId}`);
    ids.add(id);

    const sourceRect = offsetRect(line.rect, tile.sourceRect.x, tile.sourceRect.y);
    if (options.ownership !== 'all' && !isRectCenterInsideHalfOpenRect(sourceRect, tile.coreRect)) {
      continue;
    }

    mapped.push({
      id,
      text: line.text,
      confidence: line.confidence,
      rect: sourceRect,
      sourcePolygon: line.sourcePolygon?.map(point => offsetPoint(point, tile.sourceRect.x, tile.sourceRect.y)),
      sourceTileId: tile.id,
      sourceTileRect: { ...tile.sourceRect },
      sourceTileCoreRect: { ...tile.coreRect },
      sourceLineIndex: index
    });
  }
  return mapped;
}

export function deduplicateOverlappingOcrLines(
  lines: readonly MappedComicOcrLine[],
  options: OcrLineDeduplicationOptions = {}
): MappedComicOcrLine[] {
  throwIfAborted(options.signal);
  assertCountWithinLimit(
    'mapped-ocr-lines',
    lines.length,
    COMIC_IMAGE_TILING_LIMITS.maxMappedOcrLines
  );
  const minimumOverlapRatio = options.minimumOverlapRatio ?? DEFAULT_MINIMUM_OVERLAP_RATIO;
  if (!Number.isFinite(minimumOverlapRatio)
    || minimumOverlapRatio < DEFAULT_MINIMUM_OVERLAP_RATIO
    || minimumOverlapRatio > 1) {
    throw new RangeError(
      `minimumOverlapRatio must be between ${DEFAULT_MINIMUM_OVERLAP_RATIO} and 1`
    );
  }

  const ids = new Set<string>();
  const countsByTile = new Map<string, number>();
  const groups = new Map<string, MappedComicOcrLine[]>();
  let totalTextLength = 0;
  for (const line of lines) {
    throwIfAborted(options.signal);
    validateMappedOcrLine(line);
    if (ids.has(line.id)) throw new TypeError(`Mapped OCR line ids must be unique: ${line.id}`);
    ids.add(line.id);

    const tileCount = (countsByTile.get(line.sourceTileId) ?? 0) + 1;
    assertCountWithinLimit(
      'ocr-lines-per-tile',
      tileCount,
      COMIC_IMAGE_TILING_LIMITS.maxOcrLinesPerTile
    );
    countsByTile.set(line.sourceTileId, tileCount);
    totalTextLength += line.text.length;
    assertCountWithinLimit(
      'total-ocr-text',
      totalTextLength,
      COMIC_IMAGE_TILING_LIMITS.maxTotalOcrTextLength
    );

    const normalizedText = normalizeOcrText(line.text);
    const group = groups.get(normalizedText);
    if (group) group.push(line);
    else groups.set(normalizedText, [line]);
  }

  const retained: MappedComicOcrLine[] = [];
  let comparisonCount = 0;
  [...groups.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .forEach(([, group]) => {
      throwIfAborted(options.signal);
      const retainedInGroup: MappedComicOcrLine[] = [];
      [...group].sort(compareOcrLineQuality).forEach(candidate => {
        throwIfAborted(options.signal);
        const duplicate = retainedInGroup.some(existing => {
          comparisonCount += 1;
          assertCountWithinLimit(
            'deduplication-comparisons',
            comparisonCount,
            COMIC_IMAGE_TILING_LIMITS.maxDeduplicationComparisons
          );
          return areConservativeDuplicates(candidate, existing, minimumOverlapRatio);
        });
        if (!duplicate) retainedInGroup.push(candidate);
      });
      retained.push(...retainedInGroup);
    });

  const fuzzyRetained: MappedComicOcrLine[] = [];
  retained.sort(compareOcrLineQuality).forEach(candidate => {
    throwIfAborted(options.signal);
    const duplicate = fuzzyRetained.some(existing => {
      comparisonCount += 1;
      assertCountWithinLimit(
        'deduplication-comparisons',
        comparisonCount,
        COMIC_IMAGE_TILING_LIMITS.maxDeduplicationComparisons
      );
      if (!areConservativeDuplicates(candidate, existing, minimumOverlapRatio)) return false;
      return areNearTextAlternatives(candidate.text, existing.text);
    });
    if (!duplicate) fuzzyRetained.push(candidate);
  });

  return fuzzyRetained.sort(compareOcrLineReadingOrder);
}

function validateSourceSize(source: ComicImageSize): void {
  assertPositiveSafeInteger(source.width, 'source width');
  assertPositiveSafeInteger(source.height, 'source height');
  if (source.width > COMIC_IMAGE_TILING_LIMITS.maxSourceDimension) {
    throw new ComicImageTilingLimitError(
      'source-dimension',
      source.width,
      COMIC_IMAGE_TILING_LIMITS.maxSourceDimension
    );
  }
  if (source.height > COMIC_IMAGE_TILING_LIMITS.maxSourceDimension) {
    throw new ComicImageTilingLimitError(
      'source-dimension',
      source.height,
      COMIC_IMAGE_TILING_LIMITS.maxSourceDimension
    );
  }
  const pixels = source.width * source.height;
  assertCountWithinLimit('source-pixels', pixels, COMIC_IMAGE_TILING_LIMITS.maxSourcePixels);
}

function validateTile(tile: ComicImageTile): void {
  validateIdentifier(tile.id, 'tile id', MAX_IDENTIFIER_COMPONENT_LENGTH);
  assertNonNegativeSafeInteger(tile.index, 'tile index');
  assertNonNegativeSafeInteger(tile.row, 'tile row');
  assertNonNegativeSafeInteger(tile.column, 'tile column');
  validateRect(tile.sourceRect, 'tile sourceRect');
  if (tile.sourceRect.width > COMIC_IMAGE_TILING_LIMITS.maxTileDimension) {
    throw new ComicImageTilingLimitError(
      'tile-dimension',
      tile.sourceRect.width,
      COMIC_IMAGE_TILING_LIMITS.maxTileDimension
    );
  }
  if (tile.sourceRect.height > COMIC_IMAGE_TILING_LIMITS.maxTileDimension) {
    throw new ComicImageTilingLimitError(
      'tile-dimension',
      tile.sourceRect.height,
      COMIC_IMAGE_TILING_LIMITS.maxTileDimension
    );
  }
  assertCountWithinLimit(
    'tile-pixels',
    tile.sourceRect.width * tile.sourceRect.height,
    COMIC_IMAGE_TILING_LIMITS.maxTilePixels
  );
  assertCoordinateWithinSourceLimit(tile.sourceRect.x + tile.sourceRect.width, 'tile right');
  assertCoordinateWithinSourceLimit(tile.sourceRect.y + tile.sourceRect.height, 'tile bottom');
  validateRect(tile.coreRect, 'tile coreRect');
  if (!containsRect(tile.sourceRect, tile.coreRect)) {
    throw new RangeError('tile coreRect must lie inside its sourceRect');
  }
  assertCoordinateWithinSourceLimit(tile.coreRect.x + tile.coreRect.width, 'tile core right');
  assertCoordinateWithinSourceLimit(tile.coreRect.y + tile.coreRect.height, 'tile core bottom');
}

function validateLocalOcrLine(line: TileOcrLine, tileRect: PixelRect): void {
  validateOcrText(line.text);
  validateConfidence(line.confidence);
  validateRect(line.rect, 'OCR line rect');
  if (line.rect.x + line.rect.width > tileRect.width
    || line.rect.y + line.rect.height > tileRect.height) {
    throw new RangeError('OCR line rect must lie inside its tile');
  }
  if (line.sourcePolygon) validatePolygon(line.sourcePolygon, tileRect.width, tileRect.height);
}

function validateMappedOcrLine(line: MappedComicOcrLine): void {
  validateIdentifier(line.id, 'mapped OCR line id', MAX_MAPPED_IDENTIFIER_LENGTH);
  validateIdentifier(line.sourceTileId, 'mapped OCR source tile id', MAX_IDENTIFIER_COMPONENT_LENGTH);
  assertNonNegativeSafeInteger(line.sourceLineIndex, 'mapped OCR source line index');
  assertCountWithinLimit(
    'ocr-lines-per-tile',
    line.sourceLineIndex + 1,
    COMIC_IMAGE_TILING_LIMITS.maxOcrLinesPerTile
  );
  validateOcrText(line.text);
  validateConfidence(line.confidence);
  validateRect(line.sourceTileRect, 'mapped OCR source tile rect');
  if (line.sourceTileRect.width > COMIC_IMAGE_TILING_LIMITS.maxTileDimension) {
    throw new ComicImageTilingLimitError(
      'tile-dimension',
      line.sourceTileRect.width,
      COMIC_IMAGE_TILING_LIMITS.maxTileDimension
    );
  }
  if (line.sourceTileRect.height > COMIC_IMAGE_TILING_LIMITS.maxTileDimension) {
    throw new ComicImageTilingLimitError(
      'tile-dimension',
      line.sourceTileRect.height,
      COMIC_IMAGE_TILING_LIMITS.maxTileDimension
    );
  }
  assertCountWithinLimit(
    'tile-pixels',
    line.sourceTileRect.width * line.sourceTileRect.height,
    COMIC_IMAGE_TILING_LIMITS.maxTilePixels
  );
  assertCoordinateWithinSourceLimit(
    line.sourceTileRect.x + line.sourceTileRect.width,
    'mapped OCR source tile right'
  );
  assertCoordinateWithinSourceLimit(
    line.sourceTileRect.y + line.sourceTileRect.height,
    'mapped OCR source tile bottom'
  );
  validateRect(line.sourceTileCoreRect, 'mapped OCR source tile core rect');
  if (!containsRect(line.sourceTileRect, line.sourceTileCoreRect)) {
    throw new RangeError('Mapped OCR source tile core rect must lie inside its source tile');
  }
  validateRect(line.rect, 'mapped OCR line rect');
  if (!containsRect(line.sourceTileRect, line.rect)) {
    throw new RangeError('Mapped OCR line rect must lie inside its source tile');
  }
  if (line.sourcePolygon) {
    validatePolygon(
      line.sourcePolygon,
      line.sourceTileRect.x + line.sourceTileRect.width,
      line.sourceTileRect.y + line.sourceTileRect.height,
      line.sourceTileRect.x,
      line.sourceTileRect.y
    );
  }
}

function validateOcrText(text: string): void {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('OCR line text must be non-empty');
  assertCountWithinLimit(
    'ocr-line-text',
    text.length,
    COMIC_IMAGE_TILING_LIMITS.maxOcrLineTextLength
  );
}

function validateConfidence(confidence: number | undefined): void {
  if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 100)) {
    throw new RangeError('OCR line confidence must be between 0 and 100');
  }
}

function validatePolygon(
  polygon: readonly PixelPoint[],
  maxX: number,
  maxY: number,
  minX = 0,
  minY = 0
): void {
  if (polygon.length < 3) throw new TypeError('OCR source polygon must contain at least 3 points');
  assertCountWithinLimit(
    'polygon-points',
    polygon.length,
    COMIC_IMAGE_TILING_LIMITS.maxPolygonPoints
  );
  polygon.forEach(point => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x < minX || point.y < minY || point.x > maxX || point.y > maxY) {
      throw new RangeError('OCR source polygon points must lie inside their tile');
    }
  });
}

function validateRect(rect: PixelRect, label: string): void {
  assertNonNegativeSafeInteger(rect.x, `${label} x`);
  assertNonNegativeSafeInteger(rect.y, `${label} y`);
  assertPositiveSafeInteger(rect.width, `${label} width`);
  assertPositiveSafeInteger(rect.height, `${label} height`);
  if (!Number.isSafeInteger(rect.x + rect.width) || !Number.isSafeInteger(rect.y + rect.height)) {
    throw new RangeError(`${label} coordinates exceed the safe integer range`);
  }
}

function getAxisTileCount(length: number, tileLength: number, overlap: number): number {
  if (length <= tileLength) return 1;
  return Math.ceil((length - tileLength) / (tileLength - overlap)) + 1;
}

function getAxisStarts(length: number, tileLength: number, count: number): number[] {
  if (count === 1) return [0];
  const finalStart = length - tileLength;
  return Array.from({ length: count }, (_item, index) => (
    index === count - 1 ? finalStart : Math.floor((finalStart * index) / (count - 1))
  ));
}

function getAxisCoreIntervals(
  sourceLength: number,
  tileLength: number,
  starts: readonly number[]
): Array<{ readonly start: number; readonly length: number }> {
  const boundaries = [0];
  for (let index = 0; index < starts.length - 1; index += 1) {
    const currentTileEnd = starts[index] + tileLength;
    const nextTileStart = starts[index + 1];
    boundaries.push(Math.floor((currentTileEnd + nextTileStart) / 2));
  }
  boundaries.push(sourceLength);
  return starts.map((_start, index) => ({
    start: boundaries[index],
    length: boundaries[index + 1] - boundaries[index]
  }));
}

function offsetRect(rect: PixelRect, offsetX: number, offsetY: number): PixelRect {
  return { x: rect.x + offsetX, y: rect.y + offsetY, width: rect.width, height: rect.height };
}

function offsetPoint(point: PixelPoint, offsetX: number, offsetY: number): PixelPoint {
  return { x: point.x + offsetX, y: point.y + offsetY };
}

function normalizeOcrText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function areNearTextAlternatives(left: string, right: string): boolean {
  const leftCharacters = Array.from(normalizeOcrText(left).toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, ''));
  const rightCharacters = Array.from(normalizeOcrText(right).toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, ''));
  if (leftCharacters.length === 0 || rightCharacters.length === 0) return false;
  if (leftCharacters.join('') === rightCharacters.join('')) return true;
  if (Math.max(leftCharacters.length, rightCharacters.length) < 4) return false;
  if (Math.abs(leftCharacters.length - rightCharacters.length) > 1) return false;

  if (leftCharacters.length === rightCharacters.length) {
    let differences = 0;
    for (let index = 0; index < leftCharacters.length; index += 1) {
      if (leftCharacters[index] !== rightCharacters[index] && ++differences > 1) return false;
    }
    return differences === 1;
  }

  const shorter = leftCharacters.length < rightCharacters.length ? leftCharacters : rightCharacters;
  const longer = leftCharacters.length < rightCharacters.length ? rightCharacters : leftCharacters;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longIndex += 1;
  }
  return true;
}

function areConservativeDuplicates(
  left: MappedComicOcrLine,
  right: MappedComicOcrLine,
  minimumOverlapRatio: number
): boolean {
  if (left.sourceTileId === right.sourceTileId) return false;
  if (intersectionArea(left.sourceTileRect, right.sourceTileRect) === 0) return false;
  const leftArea = rectArea(left.rect);
  const rightArea = rectArea(right.rect);
  const smallerArea = Math.min(leftArea, rightArea);
  const largerArea = Math.max(leftArea, rightArea);
  return smallerArea / largerArea >= minimumOverlapRatio
    && intersectionArea(left.rect, right.rect) / smallerArea >= minimumOverlapRatio;
}

function compareOcrLineQuality(left: MappedComicOcrLine, right: MappedComicOcrLine): number {
  return compareNumbersDescending(edgeClearance(left), edgeClearance(right))
    || compareNumbersDescending(left.confidence ?? -1, right.confidence ?? -1)
    || compareNumbersDescending(rectArea(left.rect), rectArea(right.rect))
    || compareStrings(left.sourceTileId, right.sourceTileId)
    || compareStrings(left.id, right.id);
}

function compareOcrLineReadingOrder(left: MappedComicOcrLine, right: MappedComicOcrLine): number {
  return left.rect.y - right.rect.y
    || left.rect.x - right.rect.x
    || left.rect.height - right.rect.height
    || left.rect.width - right.rect.width
    || compareStrings(normalizeOcrText(left.text), normalizeOcrText(right.text))
    || compareStrings(left.sourceTileId, right.sourceTileId)
    || compareStrings(left.id, right.id);
}

function edgeClearance(line: MappedComicOcrLine): number {
  return Math.min(
    line.rect.x - line.sourceTileRect.x,
    line.rect.y - line.sourceTileRect.y,
    line.sourceTileRect.x + line.sourceTileRect.width - line.rect.x - line.rect.width,
    line.sourceTileRect.y + line.sourceTileRect.height - line.rect.y - line.rect.height
  );
}

function compareNumbersDescending(left: number, right: number): number {
  return right - left;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rectArea(rect: PixelRect): number {
  return rect.width * rect.height;
}

function intersectionArea(left: PixelRect, right: PixelRect): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

function containsRect(container: PixelRect, child: PixelRect): boolean {
  return child.x >= container.x
    && child.y >= container.y
    && child.x + child.width <= container.x + container.width
    && child.y + child.height <= container.y + container.height;
}

function isRectCenterInsideHalfOpenRect(rect: PixelRect, owner: PixelRect): boolean {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return centerX >= owner.x
    && centerX < owner.x + owner.width
    && centerY >= owner.y
    && centerY < owner.y + owner.height;
}

function resolveMappingOptions(
  signalOrOptions: AbortSignal | TileOcrMappingOptions
): Required<Pick<TileOcrMappingOptions, 'ownership'>> & Pick<TileOcrMappingOptions, 'signal'> {
  const options = isAbortSignal(signalOrOptions) ? { signal: signalOrOptions } : signalOrOptions;
  const ownership = options.ownership ?? 'core-center';
  if (ownership !== 'core-center' && ownership !== 'all') {
    throw new TypeError(`Unsupported OCR tile ownership mode: ${String(ownership)}`);
  }
  return { ownership, signal: options.signal };
}

function isAbortSignal(value: AbortSignal | TileOcrMappingOptions): value is AbortSignal {
  return typeof (value as AbortSignal).aborted === 'boolean'
    && typeof (value as AbortSignal).addEventListener === 'function';
}

function readBoundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  resource: ComicImageTilingLimitResource,
  limit: number,
  label: string
): number {
  const resolved = value ?? fallback;
  assertPositiveSafeInteger(resolved, label);
  assertCountWithinLimit(resource, resolved, limit);
  return resolved;
}

function readBoundedNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  resource: ComicImageTilingLimitResource,
  limit: number,
  label: string
): number {
  const resolved = value ?? fallback;
  assertNonNegativeSafeInteger(resolved, label);
  assertCountWithinLimit(resource, resolved, limit);
  return resolved;
}

function assertCountWithinLimit(
  resource: ComicImageTilingLimitResource,
  actual: number,
  limit: number
): void {
  if (actual > limit) throw new ComicImageTilingLimitError(resource, actual, limit);
}

function assertCoordinateWithinSourceLimit(value: number, label: string): void {
  if (value > COMIC_IMAGE_TILING_LIMITS.maxSourceDimension) {
    throw new ComicImageTilingLimitError(
      'source-dimension',
      value,
      COMIC_IMAGE_TILING_LIMITS.maxSourceDimension
    );
  }
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer`);
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
}

function validateIdentifier(value: string, label: string, limit: number): void {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty`);
  if (value.length > limit) {
    throw new TypeError(`${label} must contain at most ${limit} characters`);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ComicImageTilingAbortError();
}
