export type MobiDocumentFormat = 'mobi' | 'kf8';

export interface MobiDocumentChapter {
  id: string;
  index: number;
  html: string;
}

export interface MobiDocumentOptions {
  signal?: AbortSignal;
  maxFileBytes?: number;
  maxChapters?: number;
  maxChapterBytes?: number;
  maxTotalHtmlBytes?: number;
}

interface MobiParserSpineItem {
  id: string;
  text?: string;
}

interface MobiParserLike {
  getSpine(): MobiParserSpineItem[];
  loadChapter(id: string): { html: string } | undefined;
  destroy(): void;
}

export interface MobiParserFactories {
  mobi(bytes: Uint8Array): Promise<MobiParserLike>;
  kf8(bytes: Uint8Array): Promise<MobiParserLike>;
}

export const MOBI_DOCUMENT_MAX_FILE_BYTES = 64 * 1024 * 1024;
export const MOBI_DOCUMENT_MAX_CHAPTERS = 4096;
export const MOBI_DOCUMENT_MAX_CHAPTER_BYTES = 8 * 1024 * 1024;
export const MOBI_DOCUMENT_MAX_TOTAL_HTML_BYTES = 64 * 1024 * 1024;

interface MobiParserModule {
  initMobiFile(bytes: Uint8Array): Promise<unknown>;
  initKf8File(bytes: Uint8Array): Promise<unknown>;
}

let parserModulePromise: Promise<MobiParserModule> | null = null;

const loadParserModule = (): Promise<MobiParserModule> => {
  if (!parserModulePromise) {
    parserModulePromise = import(
      /* webpackMode: "eager" */ '@lingo-reader/mobi-parser'
    ) as Promise<MobiParserModule>;
  }
  return parserModulePromise;
};

const DEFAULT_FACTORIES: MobiParserFactories = {
  mobi: async bytes => {
    const parserModule = await loadParserModule();
    return parserModule.initMobiFile(bytes) as Promise<MobiParserLike>;
  },
  kf8: async bytes => {
    const parserModule = await loadParserModule();
    return parserModule.initKf8File(bytes) as Promise<MobiParserLike>;
  }
};

const createAbortError = (): Error => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('MOBI parsing was cancelled', 'AbortError');
  }

  const error = new Error('MOBI parsing was cancelled');
  error.name = 'AbortError';
  return error;
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw createAbortError();
};

const requireBound = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return value;
};

export class MobiDocumentService {
  constructor(private readonly factories: MobiParserFactories = DEFAULT_FACTORIES) {}

  async extractChapters(
    bytes: Uint8Array,
    format: MobiDocumentFormat,
    options: MobiDocumentOptions = {}
  ): Promise<MobiDocumentChapter[]> {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError('MOBI source must be a Uint8Array');
    }

    const maxFileBytes = requireBound(
      options.maxFileBytes ?? MOBI_DOCUMENT_MAX_FILE_BYTES,
      'MOBI file limit'
    );
    const maxChapters = requireBound(
      options.maxChapters ?? MOBI_DOCUMENT_MAX_CHAPTERS,
      'MOBI chapter limit'
    );
    const maxChapterBytes = requireBound(
      options.maxChapterBytes ?? MOBI_DOCUMENT_MAX_CHAPTER_BYTES,
      'MOBI chapter size limit'
    );
    const maxTotalHtmlBytes = requireBound(
      options.maxTotalHtmlBytes ?? MOBI_DOCUMENT_MAX_TOTAL_HTML_BYTES,
      'MOBI extracted HTML limit'
    );

    if (bytes.byteLength === 0) throw new Error('The MOBI file is empty');
    if (bytes.byteLength > maxFileBytes) {
      throw new RangeError(`MOBI files cannot exceed ${maxFileBytes} bytes`);
    }

    throwIfAborted(options.signal);
    const parserPromise = Promise.resolve().then(() => this.factories[format](bytes));
    const parser = await this.awaitParserInitialization(parserPromise, options.signal);

    try {
      throwIfAborted(options.signal);
      const spine = parser.getSpine();
      if (!Array.isArray(spine)) throw new Error('The MOBI spine is invalid');
      if (spine.length > maxChapters) {
        throw new RangeError(`MOBI books cannot contain more than ${maxChapters} spine items`);
      }

      const encoder = new TextEncoder();
      const chapters: MobiDocumentChapter[] = [];
      let totalHtmlBytes = 0;

      for (let index = 0; index < spine.length; index += 1) {
        throwIfAborted(options.signal);
        const spineItem = spine[index];
        if (!spineItem || typeof spineItem.id !== 'string' || !spineItem.id) continue;

        const rawHtml = format === 'mobi' && typeof spineItem.text === 'string'
          ? spineItem.text
          : parser.loadChapter(spineItem.id)?.html;
        if (typeof rawHtml !== 'string' || !rawHtml.trim()) continue;

        const chapterBytes = encoder.encode(rawHtml).byteLength;
        if (chapterBytes > maxChapterBytes) {
          throw new RangeError(`MOBI spine item ${index + 1} exceeds ${maxChapterBytes} bytes`);
        }
        totalHtmlBytes += chapterBytes;
        if (totalHtmlBytes > maxTotalHtmlBytes) {
          throw new RangeError(`MOBI extracted HTML cannot exceed ${maxTotalHtmlBytes} bytes`);
        }

        chapters.push({
          id: spineItem.id,
          index,
          html: rawHtml
        });
      }

      throwIfAborted(options.signal);
      return chapters;
    } finally {
      parser.destroy();
    }
  }

  private async awaitParserInitialization(
    parserPromise: Promise<MobiParserLike>,
    signal?: AbortSignal
  ): Promise<MobiParserLike> {
    if (!signal) return parserPromise;
    throwIfAborted(signal);

    let abortListener: (() => void) | null = null;
    const abortPromise = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(createAbortError());
      signal.addEventListener('abort', abortListener, { once: true });
    });

    try {
      return await Promise.race([parserPromise, abortPromise]);
    } catch (error) {
      if (signal.aborted) {
        void parserPromise.then(parser => parser.destroy(), () => undefined);
      }
      throw error;
    } finally {
      if (abortListener) signal.removeEventListener('abort', abortListener);
    }
  }
}

export const mobiDocumentService = new MobiDocumentService();
