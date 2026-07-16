import { createWorker, OEM, PSM } from 'tesseract.js';

export type BundledOcrLanguageCode = 'eng' | 'chi_sim' | 'chi_tra' | 'jpn' | 'kor';

export interface BundledOcrLanguageDefinition {
  code: BundledOcrLanguageCode;
  label: string;
}

export const BUNDLED_OCR_LANGUAGES: BundledOcrLanguageDefinition[] = [
  { code: 'eng', label: 'English' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'chi_tra', label: 'Chinese (Traditional)' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' }
];

export interface BundledOcrProgress {
  status: string;
  progress: number;
}

export interface BundledOcrLine {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface TesseractLineLike {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

interface TesseractWorkerLike {
  setParameters(params: Record<string, string>): Promise<unknown>;
  recognize(
    image: HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>
  ): Promise<{
    data: {
      text: string;
      confidence: number;
      lines: TesseractLineLike[];
    };
  }>;
  terminate(): Promise<unknown>;
}

interface TesseractWorkerOptionsLike {
  workerPath: string;
  corePath: string;
  langPath: string;
  workerBlobURL: boolean;
  cacheMethod: string;
  gzip: boolean;
  logger: (message: { status: string; progress: number }) => void;
}

export type TesseractWorkerFactory = (
  language: BundledOcrLanguageCode,
  options: TesseractWorkerOptionsLike
) => Promise<TesseractWorkerLike>;

export type BundledOcrProgressCallback = (progress: BundledOcrProgress) => void;

const extensionUrl = (path: string): string => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
};

const defaultWorkerFactory: TesseractWorkerFactory = async (language, options) => (
  createWorker(language, OEM.LSTM_ONLY, options as any) as unknown as Promise<TesseractWorkerLike>
);

export class BundledOcrSession {
  private workerPromise: Promise<TesseractWorkerLike> | null = null;
  private activeProgressCallback: BundledOcrProgressCallback | null = null;

  constructor(
    private readonly language: BundledOcrLanguageCode,
    private readonly workerFactory: TesseractWorkerFactory
  ) {}

  async recognize(
    canvas: HTMLCanvasElement,
    onProgress?: BundledOcrProgressCallback
  ): Promise<BundledOcrLine[]> {
    this.activeProgressCallback = onProgress || null;
    const worker = await this.getWorker();

    try {
      const result = await worker.recognize(
        canvas,
        { rotateAuto: true },
        { blocks: true, text: true, hocr: false, tsv: false }
      );
      const lines = (result.data.lines || [])
        .map(line => this.mapLine(line))
        .filter((line): line is BundledOcrLine => Boolean(line));

      if (lines.length > 0) return lines;

      const fallbackText = result.data.text.replace(/\s+/g, ' ').trim();
      if (!fallbackText) return [];
      return [{
        text: fallbackText,
        confidence: result.data.confidence || 0,
        boundingBox: { x: 0, y: 0, width: canvas.width, height: canvas.height }
      }];
    } finally {
      this.activeProgressCallback = null;
    }
  }

  async terminate(): Promise<void> {
    const workerPromise = this.workerPromise;
    this.workerPromise = null;
    this.activeProgressCallback = null;
    if (!workerPromise) return;

    try {
      const worker = await workerPromise;
      await worker.terminate();
    } catch {
      // Cleanup must remain safe after a worker initialization or recognition failure.
    }
  }

  private async getWorker(): Promise<TesseractWorkerLike> {
    if (!this.workerPromise) {
      this.workerPromise = this.workerFactory(this.language, {
        workerPath: extensionUrl('ocr/worker.min.js'),
        corePath: extensionUrl('ocr/core/'),
        langPath: extensionUrl('ocr/lang/'),
        workerBlobURL: false,
        cacheMethod: 'none',
        gzip: true,
        logger: message => this.reportProgress(message)
      }).then(async worker => {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
          preserve_interword_spaces: '1',
          user_defined_dpi: '200'
        });
        return worker;
      });
    }
    return this.workerPromise;
  }

  private mapLine(line: TesseractLineLike): BundledOcrLine | null {
    const text = line.text.replace(/\s+/g, ' ').trim();
    const width = line.bbox.x1 - line.bbox.x0;
    const height = line.bbox.y1 - line.bbox.y0;
    if (!text || width <= 0 || height <= 0) return null;

    return {
      text,
      confidence: line.confidence || 0,
      boundingBox: {
        x: line.bbox.x0,
        y: line.bbox.y0,
        width,
        height
      }
    };
  }

  private reportProgress(message: { status: string; progress: number }): void {
    this.activeProgressCallback?.({
      status: message.status,
      progress: Math.max(0, Math.min(1, message.progress || 0))
    });
  }
}

export class BundledOcrService {
  constructor(private readonly workerFactory: TesseractWorkerFactory = defaultWorkerFactory) {}

  createSession(language: string | undefined): BundledOcrSession {
    const normalizedLanguage = BUNDLED_OCR_LANGUAGES.some(item => item.code === language)
      ? language as BundledOcrLanguageCode
      : 'eng';
    return new BundledOcrSession(normalizedLanguage, this.workerFactory);
  }
}

export const bundledOcrService = new BundledOcrService();
