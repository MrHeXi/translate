import {
  BundledOcrLanguageCode,
  BundledOcrLine,
  BundledOcrSession,
  BundledOcrService,
  bundledOcrService
} from './BundledOcrService';
import {
  applyInpaintToImage,
  assessInpaintSafety,
  BubbleRegion,
  buildTextMask,
  COMIC_IMAGE_LIMITS,
  detectBubbles,
  detectPanels,
  getTranslationWritingMode,
  groupTextTokens,
  inferOcrTextDirection,
  layoutTranslation,
  OcrToken,
  PixelImage,
  RgbaColor,
  TextGroup
} from './ComicImageProcessor';
import {
  ComicImageTile,
  deduplicateOverlappingOcrLines,
  MappedComicOcrLine,
  mapTileOcrLinesToSource,
  planComicImageTiles,
  TileOcrLine
} from './ComicImageTiling';
import { createTranslationRequestNamespace } from './TranslationRequestId';

export const LOCAL_IMAGE_LIMITS = Object.freeze({
  maxFiles: 12,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxSourcePixels: COMIC_IMAGE_LIMITS.maxCompositePixels,
  maxTotalSourcePixels: COMIC_IMAGE_LIMITS.maxCompositePixels * 2,
  maxWorkingPixels: COMIC_IMAGE_LIMITS.maxAnalysisPixels,
  maxReconstructionPixels: 1_500_000,
  maxLongImageTiles: 64,
  maxRawOcrLines: 512,
  maxOcrCharacters: 120_000,
  maxEstimatedRgbaBytes: 224 * 1024 * 1024,
  maxBlocks: 64,
  translationConcurrency: 4
});

export interface LocalImageTranslationRequest {
  requestId: string;
  signal: AbortSignal;
}

export interface LocalImageTranslationProgress {
  stage: 'ocr' | 'translate' | 'render';
  completed: number;
  total: number;
  message: string;
}

export interface LocalImageTranslationOptions {
  ocrLanguage: BundledOcrLanguageCode;
  signal: AbortSignal;
  translateText: (text: string, request: LocalImageTranslationRequest) => Promise<string>;
  onProgress?: (progress: LocalImageTranslationProgress) => void;
}

export interface LocalImageTranslationResult {
  canvas: HTMLCanvasElement;
  sourceTexts: string[];
  translatedTexts: string[];
  reconstructedBlockCount: number;
  overlayBlockCount: number;
}

export interface LocalImageTranslationEngine {
  translate(
    sourceCanvas: HTMLCanvasElement,
    options: LocalImageTranslationOptions
  ): Promise<LocalImageTranslationResult>;
}

interface LocalImageAnalysis {
  bubbles: BubbleRegion[];
  groups: TextGroup[];
}

interface LocalTileAnalysis extends LocalImageAnalysis {
  tile: ComicImageTile;
  translationOffset: number;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateLocalImageFile(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Choose a JPG, JPEG, PNG, or WEBP image.');
  }
  if (file.size <= 0) throw new Error('The selected image is empty.');
  if (file.size > LOCAL_IMAGE_LIMITS.maxFileBytes) {
    throw new Error('Each image must be 20 MB or smaller.');
  }
}

export function validateLocalImageDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('The image has invalid dimensions.');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > LOCAL_IMAGE_LIMITS.maxSourcePixels) {
    throw new Error('The image is too large. Use an image with at most 16 million pixels.');
  }
}

export function validateLocalImageQueuePixels(currentPixels: number, width: number, height: number): void {
  validateLocalImageDimensions(width, height);
  const nextPixels = currentPixels + width * height;
  if (!Number.isSafeInteger(nextPixels) || nextPixels > LOCAL_IMAGE_LIMITS.maxTotalSourcePixels) {
    throw new Error('The image queue is too large. Keep its decoded images within 32 million pixels.');
  }
}

export function getWorkingImageDimensions(
  width: number,
  height: number
): { width: number; height: number } {
  validateLocalImageDimensions(width, height);
  const pixels = width * height;
  if (pixels <= LOCAL_IMAGE_LIMITS.maxWorkingPixels) return { width, height };

  const scale = Math.sqrt(LOCAL_IMAGE_LIMITS.maxWorkingPixels / pixels);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale))
  };
}

export class LocalImageTranslationService implements LocalImageTranslationEngine {
  private readonly requestNamespace = createTranslationRequestNamespace('image-workspace');
  private runSequence = 0;

  constructor(private readonly ocrService: BundledOcrService = bundledOcrService) {}

  async translate(
    sourceCanvas: HTMLCanvasElement,
    options: LocalImageTranslationOptions
  ): Promise<LocalImageTranslationResult> {
    this.throwIfAborted(options.signal);
    validateLocalImageDimensions(sourceCanvas.width, sourceCanvas.height);
    if (sourceCanvas.width * sourceCanvas.height > LOCAL_IMAGE_LIMITS.maxWorkingPixels) {
      return this.translateTiledImage(sourceCanvas, options);
    }

    const sourceContext = sourceCanvas.getContext('2d', { alpha: true });
    if (!sourceContext || typeof sourceContext.getImageData !== 'function') {
      throw new Error('This browser cannot read the selected image.');
    }
    const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const sourceImage: PixelImage = {
      width: sourceCanvas.width,
      height: sourceCanvas.height,
      data: new Uint8ClampedArray(sourceData.data)
    };

    const session = this.ocrService.createSession(options.ocrLanguage);
    const runController = new AbortController();
    const forwardAbort = (): void => runController.abort();
    options.signal.addEventListener('abort', forwardAbort, { once: true });
    const runOptions: LocalImageTranslationOptions = {
      ...options,
      signal: runController.signal
    };
    const terminateOnAbort = (): void => {
      void session.terminate();
    };
    runOptions.signal.addEventListener('abort', terminateOnAbort, { once: true });

    try {
      runOptions.onProgress?.({ stage: 'ocr', completed: 0, total: 1, message: 'Recognizing image text' });
      const lines = await session.recognize(sourceCanvas, progress => {
        this.throwIfAborted(runOptions.signal);
        runOptions.onProgress?.({
          stage: 'ocr',
          completed: Math.round(progress.progress * 100),
          total: 100,
          message: progress.status || 'Recognizing image text'
        });
      }, runOptions.signal);
      this.throwIfAborted(runOptions.signal);

      const normalizedLines = lines
        .filter(line => line.text.trim())
        .slice(0, LOCAL_IMAGE_LIMITS.maxBlocks);
      const tokens: OcrToken[] = normalizedLines
        .map((line, index) => {
          const rect = {
            x: Math.max(0, Math.floor(line.boundingBox.x)),
            y: Math.max(0, Math.floor(line.boundingBox.y)),
            width: Math.max(1, Math.min(
              sourceCanvas.width - Math.max(0, Math.floor(line.boundingBox.x)),
              Math.ceil(line.boundingBox.width)
            )),
            height: Math.max(1, Math.min(
              sourceCanvas.height - Math.max(0, Math.floor(line.boundingBox.y)),
              Math.ceil(line.boundingBox.height)
            ))
          };
          const text = line.text.trim();
          return {
            id: `ocr-${index}`,
            text,
            confidence: Math.max(0, Math.min(100, line.confidence || 0)),
            rect,
            level: this.isPageFallbackLine(
              line.boundingBox,
              normalizedLines.length,
              sourceCanvas.width,
              sourceCanvas.height
            ) ? 'page-fallback' as const : 'line' as const,
            direction: inferOcrTextDirection(text, rect)
          };
        })
        .filter(token => token.rect.x < sourceCanvas.width && token.rect.y < sourceCanvas.height);

      if (tokens.length === 0) throw new Error('No readable text was found in this image.');

      const analysis = await this.analyzeImage(sourceImage, tokens, runOptions.signal);
      const bubbles = analysis.bubbles;
      const groups = analysis.groups.slice(0, LOCAL_IMAGE_LIMITS.maxBlocks);
      if (groups.length === 0) throw new Error('No translatable text blocks were found.');

      const runId = ++this.runSequence;
      const translatedTexts = await this.translateGroups(
        groups.map(group => group.sourceText),
        runId,
        runOptions
      );
      this.throwIfAborted(runOptions.signal);
      runOptions.onProgress?.({
        stage: 'render',
        completed: 0,
        total: groups.length,
        message: 'Rendering translated image'
      });

      const output = await this.renderResult(
        sourceImage,
        groups,
        bubbles,
        translatedTexts,
        runOptions.signal
      );
      runOptions.onProgress?.({
        stage: 'render',
        completed: groups.length,
        total: groups.length,
        message: 'Translated image ready'
      });
      return {
        canvas: output.canvas,
        sourceTexts: groups.map(group => group.sourceText),
        translatedTexts,
        reconstructedBlockCount: output.reconstructedBlockCount,
        overlayBlockCount: output.overlayBlockCount
      };
    } catch (error) {
      runController.abort();
      throw error;
    } finally {
      options.signal.removeEventListener('abort', forwardAbort);
      runOptions.signal.removeEventListener('abort', terminateOnAbort);
      await session.terminate();
    }
  }

  private async translateTiledImage(
    sourceCanvas: HTMLCanvasElement,
    options: LocalImageTranslationOptions
  ): Promise<LocalImageTranslationResult> {
    const plan = planComicImageTiles(
      { width: sourceCanvas.width, height: sourceCanvas.height },
      {
        maxTilePixels: LOCAL_IMAGE_LIMITS.maxReconstructionPixels,
        signal: options.signal
      }
    );
    if (plan.tiles.length > LOCAL_IMAGE_LIMITS.maxLongImageTiles) {
      throw new Error(
        `The image requires ${plan.tiles.length} OCR tiles; the local limit is ${LOCAL_IMAGE_LIMITS.maxLongImageTiles}.`
      );
    }
    this.assertTiledMemoryBudget(sourceCanvas.width * sourceCanvas.height, plan.tileWidth * plan.tileHeight);

    const session = this.ocrService.createSession(options.ocrLanguage);
    const runController = new AbortController();
    const forwardAbort = (): void => runController.abort();
    options.signal.addEventListener('abort', forwardAbort, { once: true });
    const runOptions: LocalImageTranslationOptions = {
      ...options,
      signal: runController.signal
    };
    const terminateOnAbort = (): void => {
      void session.terminate();
    };
    runOptions.signal.addEventListener('abort', terminateOnAbort, { once: true });

    try {
      const mappedLines = await this.recognizeTiles(sourceCanvas, plan.tiles, session, runOptions);
      const retainedLines = deduplicateOverlappingOcrLines(mappedLines, {
        signal: runOptions.signal
      });
      this.assertBlockLimit(retainedLines.length, 'OCR blocks');
      if (retainedLines.length === 0) {
        throw new Error('No readable text was found in this image.');
      }

      const analyses = await this.analyzeTiles(
        sourceCanvas,
        plan.tiles,
        retainedLines,
        runOptions.signal
      );
      const groups = analyses.flatMap(analysis => analysis.groups);
      this.assertBlockLimit(groups.length, 'translatable text blocks');
      this.assertCharacterLimit(
        groups.reduce((total, group) => total + group.sourceText.length, 0),
        'translation text'
      );
      if (groups.length === 0) throw new Error('No translatable text blocks were found.');

      const runId = ++this.runSequence;
      const translatedTexts = await this.translateGroups(
        groups.map(group => group.sourceText),
        runId,
        runOptions
      );
      this.throwIfAborted(runOptions.signal);
      runOptions.onProgress?.({
        stage: 'render',
        completed: 0,
        total: groups.length,
        message: 'Rendering translated image'
      });

      const output = await this.renderTiledResult(
        sourceCanvas,
        analyses,
        translatedTexts,
        runOptions
      );
      return {
        canvas: output.canvas,
        sourceTexts: groups.map(group => group.sourceText),
        translatedTexts,
        reconstructedBlockCount: output.reconstructedBlockCount,
        overlayBlockCount: output.overlayBlockCount
      };
    } catch (error) {
      runController.abort();
      throw error;
    } finally {
      options.signal.removeEventListener('abort', forwardAbort);
      runOptions.signal.removeEventListener('abort', terminateOnAbort);
      await session.terminate();
    }
  }

  private async recognizeTiles(
    sourceCanvas: HTMLCanvasElement,
    tiles: readonly ComicImageTile[],
    session: BundledOcrSession,
    options: LocalImageTranslationOptions
  ): Promise<MappedComicOcrLine[]> {
    const mappedLines: MappedComicOcrLine[] = [];
    let rawLineCount = 0;
    let characterCount = 0;
    const progressTotal = tiles.length * 100;
    options.onProgress?.({
      stage: 'ocr',
      completed: 0,
      total: progressTotal,
      message: `Recognizing tile 1 of ${tiles.length}`
    });

    for (let index = 0; index < tiles.length; index += 1) {
      this.throwIfAborted(options.signal);
      const tile = tiles[index];
      const tileCanvas = this.createTileCanvas(sourceCanvas, tile, options.signal);
      try {
        const lines = await session.recognize(tileCanvas, progress => {
          this.throwIfAborted(options.signal);
          options.onProgress?.({
            stage: 'ocr',
            completed: index * 100 + Math.round(progress.progress * 100),
            total: progressTotal,
            message: progress.status || `Recognizing tile ${index + 1} of ${tiles.length}`
          });
        }, options.signal);
        this.throwIfAborted(options.signal);

        const normalizedLines = this.normalizeTileOcrLines(lines, tile, options.signal);
        rawLineCount += normalizedLines.length;
        if (rawLineCount > LOCAL_IMAGE_LIMITS.maxRawOcrLines) {
          throw new Error(
            `The image contains more than ${LOCAL_IMAGE_LIMITS.maxRawOcrLines} raw OCR lines.`
          );
        }
        characterCount += normalizedLines.reduce((total, line) => total + line.text.length, 0);
        this.assertCharacterLimit(characterCount, 'OCR text');
        mappedLines.push(...mapTileOcrLinesToSource(tile, normalizedLines, options.signal));
        options.onProgress?.({
          stage: 'ocr',
          completed: (index + 1) * 100,
          total: progressTotal,
          message: `Recognized tile ${index + 1} of ${tiles.length}`
        });
      } finally {
        this.releaseCanvas(tileCanvas);
      }
    }
    return mappedLines;
  }

  private async analyzeTiles(
    sourceCanvas: HTMLCanvasElement,
    tiles: readonly ComicImageTile[],
    lines: readonly MappedComicOcrLine[],
    signal: AbortSignal
  ): Promise<LocalTileAnalysis[]> {
    const linesByTile = new Map<string, MappedComicOcrLine[]>();
    lines.forEach(line => {
      this.throwIfAborted(signal);
      const tileLines = linesByTile.get(line.sourceTileId);
      if (tileLines) tileLines.push(line);
      else linesByTile.set(line.sourceTileId, [line]);
    });

    const analyses: LocalTileAnalysis[] = [];
    let groupCount = 0;
    for (const tile of tiles) {
      this.throwIfAborted(signal);
      const tileLines = linesByTile.get(tile.id) || [];
      if (tileLines.length === 0) continue;
      const tileCanvas = this.createTileCanvas(sourceCanvas, tile, signal);
      try {
        const sourceImage = this.readCanvasImage(tileCanvas, signal);
        const tokens = this.mapSourceLinesToTileTokens(tileLines, tile);
        const analysis = await this.analyzeImage(sourceImage, tokens, signal);
        const groups = this.downgradeUnsafeTileGroups(
          analysis.groups,
          analysis.bubbles,
          tile,
          sourceCanvas.width,
          sourceCanvas.height
        );
        groupCount += groups.length;
        this.assertBlockLimit(groupCount, 'translatable text blocks');
        analyses.push({
          tile,
          bubbles: analysis.bubbles,
          groups,
          translationOffset: groupCount - groups.length
        });
      } finally {
        this.releaseCanvas(tileCanvas);
      }
    }
    return analyses;
  }

  private async renderTiledResult(
    sourceCanvas: HTMLCanvasElement,
    analyses: readonly LocalTileAnalysis[],
    translatedTexts: readonly string[],
    options: LocalImageTranslationOptions
  ): Promise<{
    canvas: HTMLCanvasElement;
    reconstructedBlockCount: number;
    overlayBlockCount: number;
  }> {
    await this.yieldToMainThread(options.signal);
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = sourceCanvas.width;
    outputCanvas.height = sourceCanvas.height;
    if (outputCanvas.width !== sourceCanvas.width || outputCanvas.height !== sourceCanvas.height) {
      throw new Error('This browser cannot allocate the original-resolution output image.');
    }
    const outputContext = outputCanvas.getContext('2d', { alpha: true });
    if (!outputContext || typeof outputContext.drawImage !== 'function') {
      throw new Error('This browser cannot allocate the original-resolution output image.');
    }
    try {
      outputContext.drawImage(sourceCanvas, 0, 0);
    } catch {
      throw new Error('This browser cannot copy the original-resolution image for rendering.');
    }
    this.throwIfAborted(options.signal);

    let reconstructedBlockCount = 0;
    let overlayBlockCount = 0;
    let completed = 0;
    for (const analysis of analyses) {
      this.throwIfAborted(options.signal);
      const tileCanvas = this.createTileCanvas(sourceCanvas, analysis.tile, options.signal);
      try {
        const sourceImage = this.readCanvasImage(tileCanvas, options.signal);
        const tileTranslations = translatedTexts.slice(
          analysis.translationOffset,
          analysis.translationOffset + analysis.groups.length
        );
        const rendered = await this.renderResult(
          sourceImage,
          analysis.groups,
          analysis.bubbles,
          tileTranslations,
          options.signal,
          tileCanvas
        );
        this.commitTilePatches(
          outputContext,
          rendered.canvas,
          analysis,
          options.signal
        );
        reconstructedBlockCount += rendered.reconstructedBlockCount;
        overlayBlockCount += rendered.overlayBlockCount;
        completed += analysis.groups.length;
        options.onProgress?.({
          stage: 'render',
          completed,
          total: translatedTexts.length,
          message: completed === translatedTexts.length
            ? 'Translated image ready'
            : `Rendering text ${completed} of ${translatedTexts.length}`
        });
      } finally {
        this.releaseCanvas(tileCanvas);
      }
    }

    return { canvas: outputCanvas, reconstructedBlockCount, overlayBlockCount };
  }

  private normalizeTileOcrLines(
    lines: readonly BundledOcrLine[],
    tile: ComicImageTile,
    signal: AbortSignal
  ): TileOcrLine[] {
    const normalized: TileOcrLine[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      this.throwIfAborted(signal);
      const line = lines[index];
      const text = line.text.trim();
      if (!text) continue;
      const box = line.boundingBox;
      if (![box.x, box.y, box.width, box.height].every(Number.isFinite)
        || box.width <= 0 || box.height <= 0) {
        throw new Error(`OCR returned invalid coordinates for tile ${tile.index + 1}.`);
      }
      const x = Math.max(0, Math.floor(box.x));
      const y = Math.max(0, Math.floor(box.y));
      if (x >= tile.sourceRect.width || y >= tile.sourceRect.height) {
        throw new Error(`OCR returned text outside tile ${tile.index + 1}.`);
      }
      normalized.push({
        id: `line-${index + 1}`,
        text,
        confidence: Math.max(0, Math.min(100, line.confidence || 0)),
        rect: {
          x,
          y,
          width: Math.max(1, Math.min(tile.sourceRect.width - x, Math.ceil(box.width))),
          height: Math.max(1, Math.min(tile.sourceRect.height - y, Math.ceil(box.height)))
        }
      });
    }
    return normalized;
  }

  private mapSourceLinesToTileTokens(
    lines: readonly MappedComicOcrLine[],
    tile: ComicImageTile
  ): OcrToken[] {
    return lines.map(line => {
      const rect = {
        x: line.rect.x - tile.sourceRect.x,
        y: line.rect.y - tile.sourceRect.y,
        width: line.rect.width,
        height: line.rect.height
      };
      const text = line.text.trim();
      return {
        id: line.id,
        text,
        confidence: Math.max(0, Math.min(100, line.confidence || 0)),
        rect,
        sourcePolygon: line.sourcePolygon?.map(point => ({
          x: point.x - tile.sourceRect.x,
          y: point.y - tile.sourceRect.y
        })),
        level: this.isPageFallbackLine(
          rect,
          lines.length,
          tile.sourceRect.width,
          tile.sourceRect.height
        ) ? 'page-fallback' as const : 'line' as const,
        direction: inferOcrTextDirection(text, rect)
      };
    });
  }

  private createTileCanvas(
    sourceCanvas: HTMLCanvasElement,
    tile: ComicImageTile,
    signal: AbortSignal
  ): HTMLCanvasElement {
    this.throwIfAborted(signal);
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = tile.sourceRect.width;
    tileCanvas.height = tile.sourceRect.height;
    if (tileCanvas.width !== tile.sourceRect.width || tileCanvas.height !== tile.sourceRect.height) {
      throw new Error(`This browser cannot allocate OCR tile ${tile.index + 1}.`);
    }
    const context = tileCanvas.getContext('2d', { alpha: true });
    if (!context || typeof context.drawImage !== 'function') {
      throw new Error('This browser cannot create an OCR tile canvas.');
    }
    try {
      context.drawImage(
        sourceCanvas,
        tile.sourceRect.x,
        tile.sourceRect.y,
        tile.sourceRect.width,
        tile.sourceRect.height,
        0,
        0,
        tile.sourceRect.width,
        tile.sourceRect.height
      );
    } catch {
      throw new Error(`This browser could not read OCR tile ${tile.index + 1}.`);
    }
    this.throwIfAborted(signal);
    return tileCanvas;
  }

  private readCanvasImage(canvas: HTMLCanvasElement, signal: AbortSignal): PixelImage {
    this.throwIfAborted(signal);
    const context = canvas.getContext('2d', { alpha: true });
    if (!context || typeof context.getImageData !== 'function') {
      throw new Error('This browser cannot read an OCR tile.');
    }
    let data: ImageData;
    try {
      data = context.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      throw new Error('This browser could not allocate tile analysis pixels.');
    }
    this.throwIfAborted(signal);
    const expectedBytes = canvas.width * canvas.height * 4;
    if (data.data.byteLength !== expectedBytes) {
      throw new Error(`Tile pixel allocation is incomplete: ${data.data.byteLength} of ${expectedBytes} bytes.`);
    }
    return { width: canvas.width, height: canvas.height, data: data.data };
  }

  private commitTilePatches(
    outputContext: CanvasRenderingContext2D,
    patchCanvas: HTMLCanvasElement,
    analysis: LocalTileAnalysis,
    signal: AbortSignal
  ): void {
    const bubbleById = new Map(analysis.bubbles.map(bubble => [bubble.id, bubble]));
    for (const group of analysis.groups) {
      this.throwIfAborted(signal);
      const bubble = group.bubbleId ? bubbleById.get(group.bubbleId) : undefined;
      const bounds = group.geometryReliability === 'page-fallback'
        ? this.getPageFallbackBounds(analysis.tile.sourceRect.width, analysis.tile.sourceRect.height)
        : bubble?.rect || group.rect;
      const patch = this.clampPatchBounds(
        bounds,
        analysis.tile.sourceRect.width,
        analysis.tile.sourceRect.height
      );
      try {
        outputContext.drawImage(
          patchCanvas,
          patch.x,
          patch.y,
          patch.width,
          patch.height,
          analysis.tile.sourceRect.x + patch.x,
          analysis.tile.sourceRect.y + patch.y,
          patch.width,
          patch.height
        );
      } catch {
        throw new Error(`This browser could not commit translated tile ${analysis.tile.index + 1}.`);
      }
    }
  }

  private clampPatchBounds(
    bounds: { x: number; y: number; width: number; height: number },
    width: number,
    height: number
  ): { x: number; y: number; width: number; height: number } {
    const x = Math.min(width - 1, Math.max(0, Math.floor(bounds.x)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(bounds.y)));
    return {
      x,
      y,
      width: Math.max(1, Math.min(width - x, Math.ceil(bounds.width))),
      height: Math.max(1, Math.min(height - y, Math.ceil(bounds.height)))
    };
  }

  private assertTiledMemoryBudget(sourcePixels: number, tilePixels: number): void {
    const estimatedBytes = sourcePixels * 12 + tilePixels * 20;
    if (!Number.isSafeInteger(estimatedBytes)
      || estimatedBytes > LOCAL_IMAGE_LIMITS.maxEstimatedRgbaBytes) {
      throw new Error(
        `The image needs about ${estimatedBytes} RGBA bytes; the local memory limit is ${LOCAL_IMAGE_LIMITS.maxEstimatedRgbaBytes}.`
      );
    }
  }

  private assertBlockLimit(count: number, label: string): void {
    if (count > LOCAL_IMAGE_LIMITS.maxBlocks) {
      throw new Error(`The image contains more than ${LOCAL_IMAGE_LIMITS.maxBlocks} ${label}.`);
    }
  }

  private assertCharacterLimit(count: number, label: string): void {
    if (!Number.isSafeInteger(count) || count > LOCAL_IMAGE_LIMITS.maxOcrCharacters) {
      throw new Error(
        `The image contains more than ${LOCAL_IMAGE_LIMITS.maxOcrCharacters} characters of ${label}.`
      );
    }
  }

  private downgradeUnsafeTileGroups(
    groups: readonly TextGroup[],
    bubbles: readonly BubbleRegion[],
    tile: ComicImageTile,
    sourceWidth: number,
    sourceHeight: number
  ): TextGroup[] {
    const bubbleById = new Map(bubbles.map(bubble => [bubble.id, bubble]));
    return groups.map(group => {
      const bubble = group.bubbleId ? bubbleById.get(group.bubbleId) : undefined;
      if (!bubble || this.isBubbleSafelyInsideTile(bubble.rect, tile, sourceWidth, sourceHeight)) {
        return group;
      }
      return { ...group, bubbleId: undefined };
    });
  }

  private isBubbleSafelyInsideTile(
    bubble: { x: number; y: number; width: number; height: number },
    tile: ComicImageTile,
    sourceWidth: number,
    sourceHeight: number
  ): boolean {
    const margin = Math.max(4, Math.min(32, Math.floor(Math.min(bubble.width, bubble.height) * 0.25)));
    const internalLeft = tile.sourceRect.x > 0;
    const internalTop = tile.sourceRect.y > 0;
    const internalRight = tile.sourceRect.x + tile.sourceRect.width < sourceWidth;
    const internalBottom = tile.sourceRect.y + tile.sourceRect.height < sourceHeight;
    return (!internalLeft || bubble.x >= margin) &&
      (!internalTop || bubble.y >= margin) &&
      (!internalRight || bubble.x + bubble.width <= tile.sourceRect.width - margin) &&
      (!internalBottom || bubble.y + bubble.height <= tile.sourceRect.height - margin);
  }

  private releaseCanvas(canvas: HTMLCanvasElement): void {
    canvas.width = 1;
    canvas.height = 1;
  }

  private async analyzeImage(
    sourceImage: PixelImage,
    tokens: OcrToken[],
    signal: AbortSignal
  ): Promise<LocalImageAnalysis> {
    this.throwIfAborted(signal);
    if (typeof Worker === 'undefined') {
      await this.yieldToMainThread(signal);
      const panels = detectPanels(sourceImage, { signal });
      await this.yieldToMainThread(signal);
      const bubbles = detectBubbles(sourceImage, tokens, panels, { signal });
      await this.yieldToMainThread(signal);
      return { bubbles, groups: groupTextTokens(tokens, bubbles, signal) };
    }

    return new Promise<LocalImageAnalysis>((resolve, reject) => {
      let settled = false;
      let worker: Worker | null = null;
      const finish = (result?: LocalImageAnalysis, error?: Error): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', handleAbort);
        worker?.terminate();
        worker = null;
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error('Image analysis returned no result.'));
      };
      const handleAbort = (): void => finish(undefined, new DOMException('Canceled', 'AbortError'));
      signal.addEventListener('abort', handleAbort, { once: true });

      try {
        worker = new Worker(this.getExtensionUrl('image-processor-worker.js'));
        worker.onmessage = (event: MessageEvent<{
          success: boolean;
          bubbles?: BubbleRegion[];
          groups?: TextGroup[];
          error?: string;
        }>) => {
          if (!event.data.success || !event.data.bubbles || !event.data.groups) {
            finish(undefined, new Error(event.data.error || 'Image analysis failed.'));
            return;
          }
          finish({ bubbles: event.data.bubbles, groups: event.data.groups });
        };
        worker.onerror = () => finish(undefined, new Error('Image analysis worker failed.'));
        const analysisPixels = new Uint8ClampedArray(sourceImage.data);
        worker.postMessage({
          image: {
            width: sourceImage.width,
            height: sourceImage.height,
            data: analysisPixels
          },
          tokens
        }, [analysisPixels.buffer]);
      } catch (error) {
        finish(undefined, error instanceof Error ? error : new Error('Could not start image analysis.'));
      }
    });
  }

  private async translateGroups(
    texts: string[],
    runId: number,
    options: LocalImageTranslationOptions
  ): Promise<string[]> {
    const translations = new Array<string>(texts.length);
    let nextIndex = 0;
    let completed = 0;
    const workerCount = Math.min(LOCAL_IMAGE_LIMITS.translationConcurrency, texts.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < texts.length) {
        this.throwIfAborted(options.signal);
        const index = nextIndex;
        nextIndex += 1;

        translations[index] = await options.translateText(texts[index], {
          requestId: `${this.requestNamespace}:${runId}:${index}`,
          signal: options.signal
        });
        this.throwIfAborted(options.signal);
        completed += 1;
        options.onProgress?.({
          stage: 'translate',
          completed,
          total: texts.length,
          message: `Translating text ${completed} of ${texts.length}`
        });
      }
    });
    await Promise.all(workers);
    return translations;
  }

  private async renderResult(
    sourceImage: PixelImage,
    groups: ReturnType<typeof groupTextTokens>,
    bubbles: ReturnType<typeof detectBubbles>,
    translatedTexts: string[],
    signal: AbortSignal,
    targetCanvas?: HTMLCanvasElement
  ): Promise<{
    canvas: HTMLCanvasElement;
    reconstructedBlockCount: number;
    overlayBlockCount: number;
  }> {
    await this.yieldToMainThread(signal);
    this.throwIfAborted(signal);
    const outputCanvas = targetCanvas || document.createElement('canvas');
    if (!targetCanvas) {
      outputCanvas.width = sourceImage.width;
      outputCanvas.height = sourceImage.height;
    }
    const context = outputCanvas.getContext('2d', { alpha: true });
    if (
      !context ||
      typeof context.createImageData !== 'function' ||
      typeof context.putImageData !== 'function' ||
      typeof context.measureText !== 'function' ||
      typeof context.fillText !== 'function' ||
      typeof context.fillRect !== 'function' ||
      typeof context.save !== 'function' ||
      typeof context.restore !== 'function' ||
      typeof context.beginPath !== 'function' ||
      typeof context.rect !== 'function' ||
      typeof context.clip !== 'function'
    ) {
      throw new Error('This browser cannot render translated images.');
    }

    const composite: PixelImage = {
      width: sourceImage.width,
      height: sourceImage.height,
      data: new Uint8ClampedArray(sourceImage.data)
    };
    const bubbleById = new Map(bubbles.map(bubble => [bubble.id, bubble]));
    const renderPlans: Array<{
      plan: ReturnType<typeof layoutTranslation>;
      textColor: string;
      overlayBackground: string | null;
    }> = [];
    let reconstructedBlockCount = 0;
    let overlayBlockCount = 0;

    for (let index = 0; index < groups.length; index += 1) {
      await this.yieldToMainThread(signal);
      this.throwIfAborted(signal);
      const group = groups[index];
      const bubble = group.bubbleId ? bubbleById.get(group.bubbleId) : undefined;
      const bounds = group.geometryReliability === 'page-fallback'
        ? this.getPageFallbackBounds(sourceImage.width, sourceImage.height)
        : bubble?.rect || group.rect;
      const measure = (text: string, fontSize: number): number => {
        context.font = this.getFont(fontSize);
        return context.measureText(text).width;
      };
      const writingMode = getTranslationWritingMode(group.direction, translatedTexts[index]);
      const plan = layoutTranslation(translatedTexts[index], bounds, measure, {
        minFontSize: 6,
        maxFontSize: Math.max(8, Math.min(48, Math.floor(
          (writingMode === 'vertical-rl' ? bounds.width : bounds.height) * 0.45
        ))),
        padding: Math.max(2, Math.floor(Math.min(bounds.width, bounds.height) * 0.08)),
        writingMode,
        signal
      });
      let canReconstruct = false;
      let textColor = '#111827';
      if (
        bubble
        && sourceImage.width * sourceImage.height <= LOCAL_IMAGE_LIMITS.maxReconstructionPixels
        && !plan.overflow
      ) {
        const mask = buildTextMask(sourceImage, group, bubble, { signal });
        const safety = assessInpaintSafety(sourceImage, mask, bubble, signal);
        canReconstruct = safety.mode !== 'skip';
        textColor = canReconstruct ? this.getTextColor(safety.backgroundColor) : textColor;
        if (canReconstruct) applyInpaintToImage(composite, mask, safety, { signal });
      }
      if (canReconstruct) {
        reconstructedBlockCount += 1;
      } else {
        overlayBlockCount += 1;
      }
      renderPlans.push({
        plan,
        textColor,
        overlayBackground: canReconstruct ? null : 'rgba(255, 255, 255, 0.88)'
      });
    }

    await this.yieldToMainThread(signal);
    const imageData = context.createImageData(composite.width, composite.height);
    imageData.data.set(composite.data);
    context.putImageData(imageData, 0, 0);
    for (const item of renderPlans) {
      this.throwIfAborted(signal);
      context.save();
      context.beginPath();
      context.rect(item.plan.bounds.x, item.plan.bounds.y, item.plan.bounds.width, item.plan.bounds.height);
      context.clip();
      if (item.overlayBackground) {
        context.fillStyle = item.overlayBackground;
        context.fillRect(
          item.plan.bounds.x,
          item.plan.bounds.y,
          item.plan.bounds.width,
          item.plan.bounds.height
        );
      }
      context.fillStyle = item.textColor;
      context.direction = item.plan.direction;
      context.textBaseline = item.plan.writingMode === 'vertical-rl' ? 'middle' : 'alphabetic';
      context.textAlign = item.plan.writingMode === 'vertical-rl'
        ? 'center'
        : item.plan.direction === 'rtl' ? 'right' : 'left';
      context.font = this.getFont(item.plan.fontSize);
      item.plan.lines.forEach(line => context.fillText(line.text, line.x, line.y));
      context.restore();
    }

    return { canvas: outputCanvas, reconstructedBlockCount, overlayBlockCount };
  }

  private getFont(fontSize: number): string {
    return `${fontSize}px Arial, sans-serif`;
  }

  private async yieldToMainThread(signal: AbortSignal): Promise<void> {
    await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
    this.throwIfAborted(signal);
  }

  private getExtensionUrl(path: string): string {
    return typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL(path)
      : path;
  }

  private getPageFallbackBounds(imageWidth: number, imageHeight: number): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const inset = Math.min(8, Math.floor(Math.min(imageWidth, imageHeight) * 0.05));
    const height = Math.max(1, Math.min(imageHeight - inset * 2, Math.floor(imageHeight * 0.3)));
    return {
      x: inset,
      y: Math.max(inset, imageHeight - height - inset),
      width: Math.max(1, imageWidth - inset * 2),
      height
    };
  }

  private isPageFallbackLine(
    box: { x: number; y: number; width: number; height: number },
    lineCount: number,
    imageWidth: number,
    imageHeight: number
  ): boolean {
    if (lineCount !== 1) return false;
    const coversWidth = box.x <= 1 && box.width >= imageWidth * 0.9;
    const coversHeight = box.y <= 1 && box.height >= imageHeight * 0.9;
    return coversWidth && coversHeight;
  }

  private getTextColor(background: RgbaColor): string {
    const luminance = background[0] * 0.299 + background[1] * 0.587 + background[2] * 0.114;
    return luminance < 128 ? '#ffffff' : '#111111';
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
  }
}

export const localImageTranslationService = new LocalImageTranslationService();
