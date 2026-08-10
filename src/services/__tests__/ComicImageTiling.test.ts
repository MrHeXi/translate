import {
  COMIC_IMAGE_TILING_LIMITS,
  ComicImageTile,
  ComicImageTilingAbortError,
  ComicImageTilingLimitError,
  MappedComicOcrLine,
  deduplicateOverlappingOcrLines,
  mapTileOcrLinesToSource,
  planComicImageTiles
} from '../ComicImageTiling';

const tile = (overrides: Partial<ComicImageTile> = {}): ComicImageTile => ({
  id: 'tile-r001-c001',
  index: 0,
  row: 0,
  column: 0,
  sourceRect: { x: 100, y: 200, width: 100, height: 100 },
  coreRect: { x: 100, y: 200, width: 100, height: 100 },
  ...overrides
});

const mappedLine = (overrides: Partial<MappedComicOcrLine> = {}): MappedComicOcrLine => {
  const sourceTileRect = overrides.sourceTileRect ?? { x: 0, y: 0, width: 120, height: 120 };
  return {
    id: 'tile-a:line-1',
    text: 'same text',
    confidence: 90,
    rect: { x: 80, y: 80, width: 40, height: 20 },
    sourceTileId: 'tile-a',
    sourceTileRect,
    sourceTileCoreRect: overrides.sourceTileCoreRect ?? sourceTileRect,
    sourceLineIndex: 0,
    ...overrides
  };
};

describe('ComicImageTiling', () => {
  describe('planComicImageTiles', () => {
    it('plans deterministic overlapping tiles that cover every source pixel', () => {
      const options = {
        maxTileWidth: 100,
        maxTileHeight: 100,
        maxTilePixels: 10_000,
        overlapPixels: 20
      };
      const first = planComicImageTiles({ width: 180, height: 250 }, options);
      const second = planComicImageTiles({ width: 180, height: 250 }, options);

      expect(second).toEqual(first);
      expect(first).toMatchObject({
        tileWidth: 100,
        tileHeight: 100,
        overlapX: 20,
        overlapY: 20,
        columns: 2,
        rows: 3
      });
      expect(first.tiles.map(item => item.sourceRect)).toEqual([
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 80, y: 0, width: 100, height: 100 },
        { x: 0, y: 75, width: 100, height: 100 },
        { x: 80, y: 75, width: 100, height: 100 },
        { x: 0, y: 150, width: 100, height: 100 },
        { x: 80, y: 150, width: 100, height: 100 }
      ]);

      const coverage = new Uint8Array(180 * 250);
      first.tiles.forEach(item => {
        expect(item.sourceRect.width * item.sourceRect.height).toBeLessThanOrEqual(options.maxTilePixels);
        expect(item.sourceRect.x + item.sourceRect.width).toBeLessThanOrEqual(180);
        expect(item.sourceRect.y + item.sourceRect.height).toBeLessThanOrEqual(250);
        for (let y = item.sourceRect.y; y < item.sourceRect.y + item.sourceRect.height; y += 1) {
          for (let x = item.sourceRect.x; x < item.sourceRect.x + item.sourceRect.width; x += 1) {
            coverage[y * 180 + x] = 1;
          }
        }
      });
      expect(coverage.every(value => value === 1)).toBe(true);
    });

    it('partitions the full image into seamless non-overlapping core rectangles', () => {
      const plan = planComicImageTiles(
        { width: 180, height: 250 },
        { maxTileWidth: 100, maxTileHeight: 100, maxTilePixels: 10_000, overlapPixels: 20 }
      );
      const ownership = new Uint8Array(180 * 250);

      plan.tiles.forEach(item => {
        expect(item.coreRect.x).toBeGreaterThanOrEqual(item.sourceRect.x);
        expect(item.coreRect.y).toBeGreaterThanOrEqual(item.sourceRect.y);
        expect(item.coreRect.x + item.coreRect.width)
          .toBeLessThanOrEqual(item.sourceRect.x + item.sourceRect.width);
        expect(item.coreRect.y + item.coreRect.height)
          .toBeLessThanOrEqual(item.sourceRect.y + item.sourceRect.height);
        for (let y = item.coreRect.y; y < item.coreRect.y + item.coreRect.height; y += 1) {
          for (let x = item.coreRect.x; x < item.coreRect.x + item.coreRect.width; x += 1) {
            ownership[y * 180 + x] += 1;
          }
        }
      });

      expect(ownership.every(count => count === 1)).toBe(true);
      expect(Math.max(...plan.tiles.map(item => item.coreRect.x + item.coreRect.width))).toBe(180);
      expect(Math.max(...plan.tiles.map(item => item.coreRect.y + item.coreRect.height))).toBe(250);
      expect(plan.tiles[0].coreRect).toEqual({ x: 0, y: 0, width: 90, height: 87 });
      expect(plan.tiles[plan.tiles.length - 1].coreRect)
        .toEqual({ x: 90, y: 162, width: 90, height: 88 });
    });

    it('reduces tile height to satisfy the pixel budget without losing source coverage', () => {
      const plan = planComicImageTiles(
        { width: 200, height: 170 },
        { maxTileWidth: 90, maxTileHeight: 80, maxTilePixels: 4_000, overlapPixels: 10 }
      );

      expect(plan.tileWidth).toBe(90);
      expect(plan.tileHeight).toBe(44);
      expect(plan.tiles.every(item => item.sourceRect.width * item.sourceRect.height <= 4_000)).toBe(true);
      expect(Math.min(...plan.tiles.map(item => item.sourceRect.x))).toBe(0);
      expect(Math.min(...plan.tiles.map(item => item.sourceRect.y))).toBe(0);
      expect(Math.max(...plan.tiles.map(item => item.sourceRect.x + item.sourceRect.width))).toBe(200);
      expect(Math.max(...plan.tiles.map(item => item.sourceRect.y + item.sourceRect.height))).toBe(170);
    });

    it('rejects unsafe dimensions, invalid options, excessive tile counts, and aborts', () => {
      expect(() => planComicImageTiles({ width: 0, height: 1 })).toThrow(TypeError);
      expect(() => planComicImageTiles({
        width: COMIC_IMAGE_TILING_LIMITS.maxSourceDimension + 1,
        height: 1
      })).toThrow(expect.objectContaining({ resource: 'source-dimension' }));
      expect(() => planComicImageTiles({ width: 100_000, height: 100_000 })).toThrow(
        expect.objectContaining({ resource: 'source-pixels' })
      );
      expect(() => planComicImageTiles(
        { width: 100, height: 200 },
        { maxTileWidth: 100, maxTileHeight: 100, overlapPixels: 100 }
      )).toThrow(RangeError);
      expect(() => planComicImageTiles(
        { width: 1, height: COMIC_IMAGE_TILING_LIMITS.maxTiles + 1 },
        { maxTileWidth: 1, maxTileHeight: 1, maxTilePixels: 1, overlapPixels: 0 }
      )).toThrow(expect.objectContaining({ resource: 'tiles' }));

      const controller = new AbortController();
      controller.abort();
      expect(() => planComicImageTiles({ width: 100, height: 100 }, { signal: controller.signal }))
        .toThrow(ComicImageTilingAbortError);
    });
  });

  describe('mapTileOcrLinesToSource', () => {
    it('maps local rectangles and polygons without mutating OCR input', () => {
      const lines = [{
        id: 'dialogue',
        text: 'Hello',
        confidence: 96,
        rect: { x: 10, y: 15, width: 40, height: 20 },
        sourcePolygon: [
          { x: 10, y: 15 },
          { x: 50, y: 15 },
          { x: 50, y: 35 },
          { x: 10, y: 35 }
        ]
      }] as const;
      const snapshot = JSON.parse(JSON.stringify(lines));

      expect(mapTileOcrLinesToSource(tile(), lines)).toEqual([{
        id: 'tile-r001-c001:dialogue',
        text: 'Hello',
        confidence: 96,
        rect: { x: 110, y: 215, width: 40, height: 20 },
        sourcePolygon: [
          { x: 110, y: 215 },
          { x: 150, y: 215 },
          { x: 150, y: 235 },
          { x: 110, y: 235 }
        ],
        sourceTileId: 'tile-r001-c001',
        sourceTileRect: { x: 100, y: 200, width: 100, height: 100 },
        sourceTileCoreRect: { x: 100, y: 200, width: 100, height: 100 },
        sourceLineIndex: 0
      }]);
      expect(lines).toEqual(snapshot);
    });

    it('enforces local geometry, text, polygon, count, and abort limits', () => {
      expect(() => mapTileOcrLinesToSource(tile(), [{
        text: 'outside',
        rect: { x: 90, y: 0, width: 20, height: 10 }
      }])).toThrow(RangeError);
      expect(() => mapTileOcrLinesToSource(tile(), [{
        text: 'x'.repeat(COMIC_IMAGE_TILING_LIMITS.maxOcrLineTextLength + 1),
        rect: { x: 0, y: 0, width: 1, height: 1 }
      }])).toThrow(expect.objectContaining({ resource: 'ocr-line-text' }));
      expect(() => mapTileOcrLinesToSource(tile(), [{
        text: 'polygon',
        rect: { x: 0, y: 0, width: 1, height: 1 },
        sourcePolygon: Array.from(
          { length: COMIC_IMAGE_TILING_LIMITS.maxPolygonPoints + 1 },
          () => ({ x: 0, y: 0 })
        )
      }])).toThrow(expect.objectContaining({ resource: 'polygon-points' }));
      expect(() => mapTileOcrLinesToSource(
        tile(),
        Array.from({ length: COMIC_IMAGE_TILING_LIMITS.maxOcrLinesPerTile + 1 }, () => ({
          text: 'x',
          rect: { x: 0, y: 0, width: 1, height: 1 }
        }))
      )).toThrow(expect.objectContaining({ resource: 'ocr-lines-per-tile' }));

      const controller = new AbortController();
      controller.abort();
      expect(() => mapTileOcrLinesToSource(tile(), [], controller.signal))
        .toThrow(ComicImageTilingAbortError);
    });

    it('uses half-open core ownership to keep one adjacent tile version at an exact boundary', () => {
      const plan = planComicImageTiles(
        { width: 180, height: 80 },
        { maxTileWidth: 100, maxTileHeight: 80, maxTilePixels: 8_000, overlapPixels: 20 }
      );
      const [left, right] = plan.tiles;
      expect(left.coreRect).toEqual({ x: 0, y: 0, width: 90, height: 80 });
      expect(right.coreRect).toEqual({ x: 90, y: 0, width: 90, height: 80 });

      const leftVersion = mapTileOcrLinesToSource(left, [{
        text: 'Wait!',
        rect: { x: 88, y: 20, width: 4, height: 10 }
      }]);
      const rightVersion = mapTileOcrLinesToSource(right, [{
        text: 'Wait?',
        rect: { x: 8, y: 20, width: 4, height: 10 }
      }]);

      expect(leftVersion).toEqual([]);
      expect(rightVersion).toHaveLength(1);
      expect(rightVersion[0].text).toBe('Wait?');
      expect(mapTileOcrLinesToSource(left, [{
        text: 'Wait!',
        rect: { x: 88, y: 20, width: 4, height: 10 }
      }], { ownership: 'all' })).toHaveLength(1);

      expect(mapTileOcrLinesToSource(right, [{
        text: 'edge',
        rect: { x: 99, y: 20, width: 1, height: 10 }
      }])).toHaveLength(1);
    });
  });

  describe('deduplicateOverlappingOcrLines', () => {
    it('keeps the deterministic best copy of the same OCR line in a tile overlap', () => {
      const edgeCopy = mappedLine({
        id: 'tile-a:line-1',
        text: 'Ｓａｍｅ   text',
        confidence: 99
      });
      const interiorCopy = mappedLine({
        id: 'tile-b:line-1',
        text: 'Same text',
        confidence: 90,
        rect: { x: 81, y: 80, width: 39, height: 20 },
        sourceTileId: 'tile-b',
        sourceTileRect: { x: 70, y: 0, width: 120, height: 120 }
      });

      expect(deduplicateOverlappingOcrLines([edgeCopy, interiorCopy])).toEqual([interiorCopy]);
      expect(deduplicateOverlappingOcrLines([interiorCopy, edgeCopy])).toEqual([interiorCopy]);
    });

    it('deduplicates strongly overlapping OCR alternatives despite boundary jitter and punctuation changes', () => {
      const leftVersion = mappedLine({
        id: 'tile-left:line-1',
        text: 'Wait!',
        confidence: 88,
        rect: { x: 80, y: 30, width: 20, height: 12 },
        sourceTileId: 'tile-left',
        sourceTileRect: { x: 0, y: 0, width: 100, height: 80 },
        sourceTileCoreRect: { x: 0, y: 0, width: 90, height: 80 }
      });
      const rightVersion = mappedLine({
        id: 'tile-right:line-1',
        text: 'Wait?',
        confidence: 94,
        rect: { x: 81, y: 30, width: 20, height: 12 },
        sourceTileId: 'tile-right',
        sourceTileRect: { x: 80, y: 0, width: 100, height: 80 },
        sourceTileCoreRect: { x: 90, y: 0, width: 90, height: 80 }
      });

      expect(deduplicateOverlappingOcrLines([leftVersion, rightVersion])).toEqual([rightVersion]);
      expect(deduplicateOverlappingOcrLines([rightVersion, leftVersion])).toEqual([rightVersion]);
    });

    it('conservatively retains repeated, weakly-overlapping, same-tile, and different text lines', () => {
      const base = mappedLine();
      const distantRepeat = mappedLine({
        id: 'tile-b:distant',
        rect: { x: 80, y: 150, width: 40, height: 20 },
        sourceTileId: 'tile-b',
        sourceTileRect: { x: 70, y: 100, width: 120, height: 120 }
      });
      const weakOverlap = mappedLine({
        id: 'tile-b:weak',
        rect: { x: 115, y: 80, width: 40, height: 20 },
        sourceTileId: 'tile-b',
        sourceTileRect: { x: 70, y: 0, width: 120, height: 120 }
      });
      const sameTile = mappedLine({
        id: 'tile-a:line-2',
        rect: { x: 82, y: 82, width: 40, height: 20 },
        sourceLineIndex: 1,
        sourceTileRect: { x: 0, y: 0, width: 130, height: 120 }
      });
      const differentText = mappedLine({
        id: 'tile-b:different',
        text: 'different text',
        rect: { x: 81, y: 80, width: 39, height: 20 },
        sourceTileId: 'tile-b',
        sourceTileRect: { x: 70, y: 0, width: 120, height: 120 }
      });
      const containedDifferentScale = mappedLine({
        id: 'tile-c:contained',
        rect: { x: 84, y: 84, width: 10, height: 5 },
        sourceTileId: 'tile-c',
        sourceTileRect: { x: 75, y: 75, width: 120, height: 120 }
      });

      const result = deduplicateOverlappingOcrLines([
        distantRepeat,
        weakOverlap,
        sameTile,
        differentText,
        containedDifferentScale,
        base
      ]);
      expect(result).toHaveLength(6);
      expect(result.map(line => line.id)).toEqual([
        'tile-a:line-1',
        'tile-b:different',
        'tile-b:weak',
        'tile-a:line-2',
        'tile-c:contained',
        'tile-b:distant'
      ]);
    });

    it('returns a permutation-independent global reading order', () => {
      const top = mappedLine({ id: 'tile-a:top', rect: { x: 20, y: 10, width: 20, height: 10 } });
      const lowerLeft = mappedLine({ id: 'tile-a:left', text: 'left', rect: { x: 10, y: 50, width: 20, height: 10 } });
      const lowerRight = mappedLine({ id: 'tile-a:right', text: 'right', rect: { x: 50, y: 50, width: 20, height: 10 } });

      const expected = ['tile-a:top', 'tile-a:left', 'tile-a:right'];
      expect(deduplicateOverlappingOcrLines([lowerRight, top, lowerLeft]).map(line => line.id)).toEqual(expected);
      expect(deduplicateOverlappingOcrLines([lowerLeft, lowerRight, top]).map(line => line.id)).toEqual(expected);
    });

    it('enforces mapped line count, geometry, confidence, threshold, and abort limits', () => {
      expect(() => deduplicateOverlappingOcrLines([
        mappedLine({ rect: { x: 119, y: 80, width: 2, height: 2 } })
      ])).toThrow(RangeError);
      expect(() => deduplicateOverlappingOcrLines([
        mappedLine({ confidence: 101 })
      ])).toThrow(RangeError);
      expect(() => deduplicateOverlappingOcrLines([], { minimumOverlapRatio: 0.5 })).toThrow(RangeError);
      expect(() => deduplicateOverlappingOcrLines(Array.from(
        { length: COMIC_IMAGE_TILING_LIMITS.maxMappedOcrLines + 1 },
        (_item, index) => mappedLine({ id: `line-${index}` })
      ))).toThrow(expect.objectContaining({ resource: 'mapped-ocr-lines' }));

      const controller = new AbortController();
      controller.abort();
      expect(() => deduplicateOverlappingOcrLines([], { signal: controller.signal }))
        .toThrow(ComicImageTilingAbortError);
    });

    it('bounds pathological duplicate comparisons before quadratic work grows unchecked', () => {
      const sameTileLines = Array.from({ length: 1_415 }, (_item, index) => mappedLine({
        id: `tile-a:repeated-${index}`,
        sourceLineIndex: index
      }));

      expect(() => deduplicateOverlappingOcrLines(sameTileLines)).toThrow(expect.objectContaining({
        resource: 'deduplication-comparisons',
        limit: COMIC_IMAGE_TILING_LIMITS.maxDeduplicationComparisons
      }));
    });

    it('counts non-overlapping fuzzy candidates toward the comparison limit', () => {
      const uniqueSameTileLines = Array.from({ length: 1_415 }, (_item, index) => mappedLine({
        id: `tile-a:unique-${index}`,
        text: `unique-${index}`,
        sourceLineIndex: index
      }));

      expect(() => deduplicateOverlappingOcrLines(uniqueSameTileLines)).toThrow(expect.objectContaining({
        resource: 'deduplication-comparisons',
        limit: COMIC_IMAGE_TILING_LIMITS.maxDeduplicationComparisons
      }));
    });

    it('exposes a typed limit error for callers to distinguish bounded failures', () => {
      try {
        planComicImageTiles({ width: 100_000, height: 100_000 });
        throw new Error('expected a source pixel limit error');
      } catch (error) {
        expect(error).toBeInstanceOf(ComicImageTilingLimitError);
        expect(error).toMatchObject({
          resource: 'source-pixels',
          actual: 10_000_000_000,
          limit: COMIC_IMAGE_TILING_LIMITS.maxSourcePixels
        });
      }
    });
  });
});
