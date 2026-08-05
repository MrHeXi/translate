import type { DocumentBlock } from './DocumentTextExtractor';

export const DOCUMENT_HISTORY_SCHEMA_VERSION = 1 as const;
export const DOCUMENT_HISTORY_STORAGE_KEY = 'documentHistory';
export const DOCUMENT_HISTORY_ENTRY_MAX_BYTES = 512 * 1024;
export const DOCUMENT_HISTORY_TOTAL_MAX_BYTES = 4 * 1024 * 1024;
export const DOCUMENT_HISTORY_LOCK_NAME = 'lexibridge-document-history';

export type DocumentHistoryRetention = 10 | 25 | 50;
export type DocumentHistoryDisplayMode = 'bilingual' | 'translation-only' | 'original-only';
export type DocumentHistorySourceKind =
  | 'manual'
  | 'txt'
  | 'md'
  | 'markdown'
  | 'html'
  | 'htm'
  | 'json'
  | 'srt'
  | 'vtt'
  | 'ass'
  | 'ssa'
  | 'pdf'
  | 'docx'
  | 'epub';

export interface DocumentHistoryResult {
  block: DocumentBlock;
  translatedText: string;
  preservedOriginal?: boolean;
}

export interface DocumentHistoryEntry {
  id: string;
  createdAt: string;
  fileName: string;
  sourceKind: DocumentHistorySourceKind;
  sourceUrl: string;
  sourceText: string;
  rawFileText?: string;
  provider: string;
  targetLanguage: string;
  displayMode: DocumentHistoryDisplayMode;
  complete: boolean;
  documentBlocks: DocumentBlock[];
  results: DocumentHistoryResult[];
}

export type DocumentHistorySaveInput = Omit<DocumentHistoryEntry, 'id' | 'createdAt'>;

interface StoredDocumentHistory {
  schemaVersion: typeof DOCUMENT_HISTORY_SCHEMA_VERSION;
  retention: DocumentHistoryRetention;
  entries: DocumentHistoryEntry[];
}

type DocumentHistoryStorageArea = Pick<chrome.storage.StorageArea, 'get' | 'set'>;

interface DocumentHistoryLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

const DEFAULT_RETENTION: DocumentHistoryRetention = 10;
const RETENTION_VALUES = new Set<DocumentHistoryRetention>([10, 25, 50]);
const SOURCE_KINDS = new Set<DocumentHistorySourceKind>([
  'manual',
  'txt',
  'md',
  'markdown',
  'html',
  'htm',
  'json',
  'srt',
  'vtt',
  'ass',
  'ssa',
  'pdf',
  'docx',
  'epub'
]);
const TEXT_SOURCE_KINDS = new Set<DocumentHistorySourceKind>([
  'manual',
  'txt',
  'md',
  'markdown',
  'html',
  'htm',
  'json',
  'srt',
  'vtt',
  'ass',
  'ssa'
]);
const DISPLAY_MODES = new Set<DocumentHistoryDisplayMode>([
  'bilingual',
  'translation-only',
  'original-only'
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const serializedByteLength = (value: unknown): number => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return Number.POSITIVE_INFINITY;
  return new TextEncoder().encode(serialized).byteLength;
};

const isJsonData = (value: unknown, seen: Set<object> = new Set()): boolean => {
  if (
    value === undefined
    || value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;

  if (
    value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
    || (typeof Blob !== 'undefined' && value instanceof Blob)
  ) {
    return false;
  }

  if (seen.has(value)) return false;
  seen.add(value);

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) {
    return false;
  }

  const children = Array.isArray(value) ? value : Object.values(value);
  const valid = children.every(child => isJsonData(child, seen));
  seen.delete(value);
  return valid;
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const isOptionalFiniteNumber = (value: unknown): boolean => (
  value === undefined || isFiniteNumber(value)
);

const isNonNegativeInteger = (value: unknown): value is number => (
  Number.isInteger(value) && (value as number) >= 0
);

const isValidLayout = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (
    !isFiniteNumber(value.pageNumber)
    || !isFiniteNumber(value.x)
    || !isFiniteNumber(value.y)
    || !isFiniteNumber(value.width)
    || !isFiniteNumber(value.height)
    || typeof value.source !== 'string'
    || !new Set(['pdf-text', 'pdf-ocr', 'plain-text', 'subtitle', 'html', 'json']).has(value.source)
  ) return false;
  if (
    !isOptionalFiniteNumber(value.pageWidth)
    || !isOptionalFiniteNumber(value.pageHeight)
    || !isOptionalFiniteNumber(value.readingOrder)
    || !isOptionalFiniteNumber(value.columnIndex)
    || !isOptionalFiniteNumber(value.columnCount)
    || !isOptionalFiniteNumber(value.regionX)
    || !isOptionalFiniteNumber(value.regionWidth)
  ) return false;
  return value.contentKind === undefined || value.contentKind === 'prose' || value.contentKind === 'formula';
};

const isValidSubtitle = (value: unknown): boolean => (
  isRecord(value)
  && (value.format === 'srt' || value.format === 'vtt')
  && typeof value.timing === 'string'
  && Array.isArray(value.textLines)
  && value.textLines.every(line => typeof line === 'string')
  && (value.index === undefined || typeof value.index === 'string')
  && (value.identifier === undefined || typeof value.identifier === 'string')
);

const isValidAssDialogue = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (
    (value.format !== 'ass' && value.format !== 'ssa')
    || !isNonNegativeInteger(value.lineIndex)
    || !isNonNegativeInteger(value.dialogueIndex)
    || !Array.isArray(value.formatFields)
    || !value.formatFields.every(field => typeof field === 'string')
    || !Array.isArray(value.fields)
    || value.fields.length !== value.formatFields.length
    || !value.fields.every((field, index) => (
      isRecord(field)
      && typeof field.name === 'string'
      && field.name === (value.formatFields as string[])[index]
      && typeof field.value === 'string'
    ))
    || !isNonNegativeInteger(value.textFieldIndex)
    || value.textFieldIndex >= value.fields.length
    || (value.formatFields as string[])[value.textFieldIndex as number]?.trim().toLowerCase() !== 'text'
    || !isRecord(value.textRange)
    || !isNonNegativeInteger(value.textRange.start)
    || !isNonNegativeInteger(value.textRange.end)
    || value.textRange.end < value.textRange.start
    || !Array.isArray(value.inlineTags)
    || !value.inlineTags.every(tag => (
      isRecord(tag)
      && isNonNegativeInteger(tag.offset)
      && tag.offset <= (value.plainTextLength as number)
      && typeof tag.value === 'string'
    ))
    || !isNonNegativeInteger(value.plainTextLength)
  ) return false;
  return value.hardSpaces === undefined || (
    Array.isArray(value.hardSpaces)
    && value.hardSpaces.every(offset => (
      isNonNegativeInteger(offset) && offset <= (value.plainTextLength as number)
    ))
  );
};

const isValidJsonMetadata = (value: unknown): boolean => (
  isRecord(value)
  && Array.isArray(value.path)
  && value.path.every(segment => typeof segment === 'string' || isFiniteNumber(segment))
);

const isValidDocxMetadata = (value: unknown): boolean => (
  isRecord(value)
  && typeof value.entryName === 'string'
  && isNonNegativeInteger(value.paragraphIndex)
);

const isValidEpubMetadata = (value: unknown): boolean => (
  isRecord(value)
  && typeof value.entryName === 'string'
  && isNonNegativeInteger(value.blockIndex)
);

const normalizeBlock = (value: unknown): DocumentBlock | null => {
  if (!isRecord(value) || !isJsonData(value)) return null;
  if (!Number.isInteger(value.id) || (value.id as number) < 0 || typeof value.originalText !== 'string') {
    return null;
  }
  if (value.layout !== undefined && !isValidLayout(value.layout)) return null;
  if (value.subtitle !== undefined && !isValidSubtitle(value.subtitle)) return null;
  if (value.ass !== undefined && !isValidAssDialogue(value.ass)) return null;
  if (value.json !== undefined && !isValidJsonMetadata(value.json)) return null;
  if (value.docx !== undefined && !isValidDocxMetadata(value.docx)) return null;
  if (value.epub !== undefined && !isValidEpubMetadata(value.epub)) return null;
  return cloneJson(value) as unknown as DocumentBlock;
};

const normalizeResult = (value: unknown): DocumentHistoryResult | null => {
  if (!isRecord(value) || typeof value.translatedText !== 'string') return null;
  if (value.preservedOriginal !== undefined && typeof value.preservedOriginal !== 'boolean') return null;

  const block = normalizeBlock(value.block);
  if (!block) return null;

  return {
    block,
    translatedText: value.translatedText,
    ...(value.preservedOriginal === undefined
      ? {}
      : { preservedOriginal: value.preservedOriginal })
  };
};

const normalizeEntry = (value: unknown): DocumentHistoryEntry | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string'
    || value.id.length === 0
    || typeof value.createdAt !== 'string'
    || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.fileName !== 'string'
    || typeof value.sourceKind !== 'string'
    || !SOURCE_KINDS.has(value.sourceKind as DocumentHistorySourceKind)
    || typeof value.sourceUrl !== 'string'
    || typeof value.sourceText !== 'string'
    || typeof value.provider !== 'string'
    || value.provider.length === 0
    || typeof value.targetLanguage !== 'string'
    || value.targetLanguage.length === 0
    || typeof value.displayMode !== 'string'
    || !DISPLAY_MODES.has(value.displayMode as DocumentHistoryDisplayMode)
    || typeof value.complete !== 'boolean'
    || !Array.isArray(value.documentBlocks)
    || !Array.isArray(value.results)
  ) {
    return null;
  }

  const sourceKind = value.sourceKind as DocumentHistorySourceKind;
  if (
    value.rawFileText !== undefined
    && (typeof value.rawFileText !== 'string' || !TEXT_SOURCE_KINDS.has(sourceKind))
  ) {
    return null;
  }

  const documentBlocks = value.documentBlocks.map(normalizeBlock);
  const results = value.results.map(normalizeResult);
  if (documentBlocks.some(block => block === null) || results.some(result => result === null)) return null;
  const normalizedBlocks = documentBlocks as DocumentBlock[];
  const blockKeys = new Set(normalizedBlocks.map(block => `${block.id}\u0000${block.originalText}`));
  const resultKeys = (results as DocumentHistoryResult[])
    .map(result => `${result.block.id}\u0000${result.block.originalText}`);
  if (
    blockKeys.size !== normalizedBlocks.length
    || new Set(resultKeys).size !== resultKeys.length
    || resultKeys.some(key => !blockKeys.has(key))
    || (value.complete && resultKeys.length !== normalizedBlocks.length)
  ) return null;

  const entry: DocumentHistoryEntry = {
    id: value.id,
    createdAt: value.createdAt,
    fileName: value.fileName,
    sourceKind,
    sourceUrl: value.sourceUrl,
    sourceText: value.sourceText,
    ...(value.rawFileText === undefined ? {} : { rawFileText: value.rawFileText }),
    provider: value.provider,
    targetLanguage: value.targetLanguage,
    displayMode: value.displayMode as DocumentHistoryDisplayMode,
    complete: value.complete,
    documentBlocks: normalizedBlocks,
    results: results as DocumentHistoryResult[]
  };

  if (!isJsonData(entry) || serializedByteLength(entry) > DOCUMENT_HISTORY_ENTRY_MAX_BYTES) return null;
  return entry;
};

const sortNewestFirst = (entries: DocumentHistoryEntry[]): DocumentHistoryEntry[] => (
  [...entries].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
);

const createEmptyStore = (retention: DocumentHistoryRetention = DEFAULT_RETENTION): StoredDocumentHistory => ({
  schemaVersion: DOCUMENT_HISTORY_SCHEMA_VERSION,
  retention,
  entries: []
});

const pruneStore = (store: StoredDocumentHistory): StoredDocumentHistory => {
  let entries = sortNewestFirst(store.entries).slice(0, store.retention);
  const seenIds = new Set<string>();
  entries = entries.filter(entry => {
    if (seenIds.has(entry.id)) return false;
    seenIds.add(entry.id);
    return true;
  });

  let pruned: StoredDocumentHistory = { ...store, entries };
  while (
    pruned.entries.length > 0
    && serializedByteLength({ [DOCUMENT_HISTORY_STORAGE_KEY]: pruned }) > DOCUMENT_HISTORY_TOTAL_MAX_BYTES
  ) {
    pruned = { ...pruned, entries: pruned.entries.slice(0, -1) };
  }
  return pruned;
};

const normalizeStore = (value: unknown): StoredDocumentHistory => {
  if (!isRecord(value) || value.schemaVersion !== DOCUMENT_HISTORY_SCHEMA_VERSION) {
    return createEmptyStore();
  }

  const retention = RETENTION_VALUES.has(value.retention as DocumentHistoryRetention)
    ? value.retention as DocumentHistoryRetention
    : DEFAULT_RETENTION;
  const rawEntries = Array.isArray(value.entries) ? value.entries : [];
  const entries = rawEntries
    .map(normalizeEntry)
    .filter((entry): entry is DocumentHistoryEntry => entry !== null);

  return pruneStore({
    schemaVersion: DOCUMENT_HISTORY_SCHEMA_VERSION,
    retention,
    entries
  });
};

export class DocumentHistoryService {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storageArea?: DocumentHistoryStorageArea,
    private readonly lockManager?: DocumentHistoryLockManager | null
  ) {}

  async list(): Promise<DocumentHistoryEntry[]> {
    await this.mutationQueue;
    const store = await this.readStore();
    return cloneJson(store.entries);
  }

  async get(id: string): Promise<DocumentHistoryEntry | undefined> {
    await this.mutationQueue;
    const store = await this.readStore();
    const entry = store.entries.find(candidate => candidate.id === id);
    return entry ? cloneJson(entry) : undefined;
  }

  async save(input: DocumentHistorySaveInput): Promise<DocumentHistoryEntry> {
    return this.enqueueMutation(async () => {
      if (!isRecord(input) || !isJsonData(input)) {
        throw new TypeError('Document history entries must contain JSON text data only');
      }

      const entry = normalizeEntry({
        ...input,
        id: this.createId(),
        createdAt: new Date().toISOString()
      });
      if (!entry) {
        throw new TypeError('Invalid or oversized document history entry');
      }

      const store = await this.readStore();
      const updated = pruneStore({ ...store, entries: [entry, ...store.entries] });
      if (!updated.entries.some(candidate => candidate.id === entry.id)) {
        throw new RangeError('Document history entry exceeds the total storage limit');
      }
      await this.writeStore(updated);
      return cloneJson(entry);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.enqueueMutation(async () => {
      const store = await this.readStore();
      const entries = store.entries.filter(entry => entry.id !== id);
      if (entries.length === store.entries.length) return false;
      await this.writeStore({ ...store, entries });
      return true;
    });
  }

  async clear(): Promise<void> {
    return this.enqueueMutation(async () => {
      const store = await this.readStore();
      await this.writeStore(createEmptyStore(store.retention));
    });
  }

  async getRetention(): Promise<DocumentHistoryRetention> {
    await this.mutationQueue;
    return (await this.readStore()).retention;
  }

  async setRetention(retention: DocumentHistoryRetention): Promise<void> {
    if (!RETENTION_VALUES.has(retention)) {
      throw new RangeError('Document history retention must be 10, 25, or 50');
    }

    return this.enqueueMutation(async () => {
      const store = await this.readStore();
      await this.writeStore(pruneStore({ ...store, retention }));
    });
  }

  private getStorageArea(): DocumentHistoryStorageArea {
    return this.storageArea || chrome.storage.local;
  }

  private async readStore(): Promise<StoredDocumentHistory> {
    const result = await this.getStorageArea().get(DOCUMENT_HISTORY_STORAGE_KEY);
    return normalizeStore(result[DOCUMENT_HISTORY_STORAGE_KEY]);
  }

  private async writeStore(store: StoredDocumentHistory): Promise<void> {
    await this.getStorageArea().set({
      [DOCUMENT_HISTORY_STORAGE_KEY]: cloneJson(pruneStore(store))
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const runOperation = () => this.runWithCrossContextLock(operation);
    const result = this.mutationQueue.then(runOperation, runOperation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async runWithCrossContextLock<T>(operation: () => Promise<T>): Promise<T> {
    const lockManager = this.getLockManager();
    return lockManager
      ? lockManager.request(DOCUMENT_HISTORY_LOCK_NAME, operation)
      : operation();
  }

  private getLockManager(): DocumentHistoryLockManager | undefined {
    if (this.lockManager !== undefined) return this.lockManager || undefined;
    if (typeof navigator === 'undefined') return undefined;
    return (navigator as Navigator & { locks?: DocumentHistoryLockManager }).locks;
  }

  private createId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    const randomPart = Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12);
    return `${Date.now().toString(16)}-${randomPart}`;
  }
}

export const documentHistoryService = new DocumentHistoryService();
