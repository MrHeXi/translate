import {
  BundledOcrLanguageCode,
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
  groupTextTokens,
  layoutTranslation,
  OcrToken,
  PixelImage,
  RgbaColor,
  TextGroup
} from './ComicImageProcessor';
import { createTranslationRequestNamespace } from './TranslationRequestId';

export const LOCAL_IMAGE_LIMITS = Object.freeze({
  maxFiles: 12,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxSourcePixels: COMIC_IMAGE_LIMITS.maxCompositePixels,
  maxTotalSourcePixels: COMIC_IMAGE_LIMITS.maxCompositePixels * 2,
  maxWorkingPixels: COMIC_IMAGE_LIMITS.maxAnalysisPixels,
  maxReconstructionPixels: 1_500_000,
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
      throw new Error('The working image exceeds the local OCR pixel limit.');
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
      });
      this.throwIfAborted(runOptions.signal);

      const normalizedLines = lines
        .filter(line => line.text.trim())
        .slice(0, LOCAL_IMAGE_LIMITS.maxBlocks);
      const tokens: OcrToken[] = normalizedLines
        .map((line, index) => ({
          id: `ocr-${index}`,
          text: line.text.trim(),
          confidence: Math.max(0, Math.min(100, line.confidence || 0)),
          rect: {
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
          },
          level: this.isPageFallbackLine(
            line.boundingBox,
            normalizedLines.length,
            sourceCanvas.width,
            sourceCanvas.height
          ) ? 'page-fallback' as const : 'line' as const,
          direction: 'unknown' as const
        }))
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
    signal: AbortSignal
  ): Promise<{
    canvas: HTMLCanvasElement;
    reconstructedBlockCount: number;
    overlayBlockCount: number;
  }> {
    await this.yieldToMainThread(signal);
    this.throwIfAborted(signal);
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = sourceImage.width;
    outputCanvas.height = sourceImage.height;
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
      const plan = layoutTranslation(translatedTexts[index], bounds, measure, {
        minFontSize: 6,
        maxFontSize: Math.max(8, Math.min(48, Math.floor(bounds.height * 0.45))),
        padding: Math.max(2, Math.floor(Math.min(bounds.width, bounds.height) * 0.08)),
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
    context.textBaseline = 'alphabetic';

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
      context.textAlign = item.plan.direction === 'rtl' ? 'right' : 'left';
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
