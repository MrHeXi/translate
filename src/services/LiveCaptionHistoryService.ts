export const LIVE_CAPTION_HISTORY_SCHEMA_VERSION = 1 as const;
export const LIVE_CAPTION_HISTORY_STORAGE_KEY = 'liveCaptionHistory';
export const LIVE_CAPTION_HISTORY_ENTRY_MAX_BYTES = 512 * 1024;
export const LIVE_CAPTION_HISTORY_TOTAL_MAX_BYTES = 4 * 1024 * 1024;
export const LIVE_CAPTION_HISTORY_LOCK_NAME = 'lexibridge-live-caption-history';

export type LiveCaptionHistoryRetention = 10 | 25 | 50;

export interface LiveCaptionHistoryCue {
  id: number;
  startTimeMs: number;
  endTimeMs: number;
  source: string;
  speaker?: string;
  originalText: string;
  translatedText: string;
}

export interface LiveCaptionHistoryEntry {
  id: string;
  createdAt: string;
  sessionStartedAt: string | null;
  sourceUrl: string;
  sourceTitle: string;
  sourceHost: string;
  cueCount: number;
  durationMs: number;
  cues: LiveCaptionHistoryCue[];
}

export type LiveCaptionHistorySaveInput = Omit<
  LiveCaptionHistoryEntry,
  'id' | 'createdAt' | 'cueCount' | 'durationMs'
>;

interface StoredLiveCaptionHistory {
  schemaVersion: typeof LIVE_CAPTION_HISTORY_SCHEMA_VERSION;
  retention: LiveCaptionHistoryRetention;
  entries: LiveCaptionHistoryEntry[];
}

type LiveCaptionHistoryStorageArea = Pick<chrome.storage.StorageArea, 'get' | 'set'>;

interface LiveCaptionHistoryLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

const DEFAULT_RETENTION: LiveCaptionHistoryRetention = 10;
const RETENTION_VALUES = new Set<LiveCaptionHistoryRetention>([10, 25, 50]);
const ENTRY_KEYS = new Set([
  'id',
  'createdAt',
  'sessionStartedAt',
  'sourceUrl',
  'sourceTitle',
  'sourceHost',
  'cueCount',
  'durationMs',
  'cues'
]);
const CUE_REQUIRED_KEYS = new Set([
  'id',
  'startTimeMs',
  'endTimeMs',
  'source',
  'originalText',
  'translatedText'
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: Set<string>,
  optional: Set<string> = new Set()
): boolean => {
  const keys = Object.keys(value);
  return (
    [...required].every(key => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every(key => required.has(key) || optional.has(key))
  );
};

const isJsonData = (value: unknown, seen: Set<object> = new Set()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (
    value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
    || (typeof Blob !== 'undefined' && value instanceof Blob)
  ) return false;

  if (seen.has(value)) return false;
  seen.add(value);

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) {
    seen.delete(value);
    return false;
  }

  const children = Array.isArray(value) ? value : Object.values(value);
  const valid = children.every(child => isJsonData(child, seen));
  seen.delete(value);
  return valid;
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const serializedByteLength = (value: unknown): number => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return Number.POSITIVE_INFINITY;
  return new TextEncoder().encode(serialized).byteLength;
};

const isCanonicalTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const isNonNegativeSafeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
);

const normalizeCue = (value: unknown): LiveCaptionHistoryCue | null => {
  if (
    !isRecord(value)
    || !isJsonData(value)
    || !hasExactKeys(value, CUE_REQUIRED_KEYS, new Set(['speaker']))
    || !Number.isSafeInteger(value.id)
    || (value.id as number) <= 0
    || !isNonNegativeSafeInteger(value.startTimeMs)
    || !isNonNegativeSafeInteger(value.endTimeMs)
    || value.endTimeMs <= value.startTimeMs
    || typeof value.source !== 'string'
    || value.source.trim().length === 0
    || typeof value.originalText !== 'string'
    || value.originalText.trim().length === 0
    || typeof value.translatedText !== 'string'
    || (
      value.speaker !== undefined
      && (typeof value.speaker !== 'string' || value.speaker.trim().length === 0)
    )
  ) return null;

  return {
    id: value.id as number,
    startTimeMs: value.startTimeMs,
    endTimeMs: value.endTimeMs,
    source: value.source,
    ...(value.speaker === undefined ? {} : { speaker: value.speaker }),
    originalText: value.originalText,
    translatedText: value.translatedText
  };
};

const normalizeEntry = (value: unknown): LiveCaptionHistoryEntry | null => {
  if (
    !isRecord(value)
    || !isJsonData(value)
    || !hasExactKeys(value, ENTRY_KEYS)
    || typeof value.id !== 'string'
    || value.id.trim().length === 0
    || !isCanonicalTimestamp(value.createdAt)
    || !(
      value.sessionStartedAt === null
      || isCanonicalTimestamp(value.sessionStartedAt)
    )
    || typeof value.sourceUrl !== 'string'
    || typeof value.sourceTitle !== 'string'
    || typeof value.sourceHost !== 'string'
    || !isNonNegativeSafeInteger(value.cueCount)
    || !isNonNegativeSafeInteger(value.durationMs)
    || !Array.isArray(value.cues)
    || value.cues.length === 0
  ) return null;

  const normalizedCues = value.cues.map(normalizeCue);
  if (normalizedCues.some(cue => cue === null)) return null;
  const cues = normalizedCues as LiveCaptionHistoryCue[];
  const cueIds = new Set<number>();
  let previousStartTimeMs = -1;

  for (const cue of cues) {
    if (cueIds.has(cue.id) || cue.startTimeMs < previousStartTimeMs) return null;
    cueIds.add(cue.id);
    previousStartTimeMs = cue.startTimeMs;
  }

  const entry: LiveCaptionHistoryEntry = {
    id: value.id,
    createdAt: value.createdAt,
    sessionStartedAt: value.sessionStartedAt as string | null,
    sourceUrl: value.sourceUrl,
    sourceTitle: value.sourceTitle,
    sourceHost: value.sourceHost,
    cueCount: cues.length,
    durationMs: Math.max(...cues.map(cue => cue.endTimeMs)),
    cues
  };

  if (serializedByteLength(entry) > LIVE_CAPTION_HISTORY_ENTRY_MAX_BYTES) return null;
  return entry;
};

const compareNewestFirst = (
  left: LiveCaptionHistoryEntry,
  right: LiveCaptionHistoryEntry
): number => {
  const timestampDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  return timestampDifference || left.id.localeCompare(right.id);
};

const createEmptyStore = (
  retention: LiveCaptionHistoryRetention = DEFAULT_RETENTION
): StoredLiveCaptionHistory => ({
  schemaVersion: LIVE_CAPTION_HISTORY_SCHEMA_VERSION,
  retention,
  entries: []
});

const pruneStore = (store: StoredLiveCaptionHistory): StoredLiveCaptionHistory => {
  const seenIds = new Set<string>();
  const entries = [...store.entries]
    .sort(compareNewestFirst)
    .filter(entry => {
      if (seenIds.has(entry.id)) return false;
      seenIds.add(entry.id);
      return true;
    })
    .slice(0, store.retention);

  let pruned: StoredLiveCaptionHistory = { ...store, entries };
  while (
    pruned.entries.length > 0
    && serializedByteLength({ [LIVE_CAPTION_HISTORY_STORAGE_KEY]: pruned })
      > LIVE_CAPTION_HISTORY_TOTAL_MAX_BYTES
  ) {
    pruned = { ...pruned, entries: pruned.entries.slice(0, -1) };
  }
  return pruned;
};

const normalizeStore = (value: unknown): StoredLiveCaptionHistory => {
  if (
    !isRecord(value)
    || !hasExactKeys(value, new Set(['schemaVersion', 'retention', 'entries']))
    || value.schemaVersion !== LIVE_CAPTION_HISTORY_SCHEMA_VERSION
  ) return createEmptyStore();

  const retention = RETENTION_VALUES.has(value.retention as LiveCaptionHistoryRetention)
    ? value.retention as LiveCaptionHistoryRetention
    : DEFAULT_RETENTION;
  const rawEntries = Array.isArray(value.entries) ? value.entries : [];
  const entries = rawEntries
    .map(normalizeEntry)
    .filter((entry): entry is LiveCaptionHistoryEntry => entry !== null);

  return pruneStore({
    schemaVersion: LIVE_CAPTION_HISTORY_SCHEMA_VERSION,
    retention,
    entries
  });
};

export class LiveCaptionHistoryService {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storageArea?: LiveCaptionHistoryStorageArea,
    private readonly lockManager?: LiveCaptionHistoryLockManager | null
  ) {}

  async list(): Promise<LiveCaptionHistoryEntry[]> {
    await this.mutationQueue;
    return cloneJson((await this.readStore()).entries);
  }

  async get(id: string): Promise<LiveCaptionHistoryEntry | undefined> {
    await this.mutationQueue;
    const entry = (await this.readStore()).entries.find(candidate => candidate.id === id);
    return entry ? cloneJson(entry) : undefined;
  }

  async save(input: LiveCaptionHistorySaveInput): Promise<LiveCaptionHistoryEntry> {
    return this.enqueueMutation(async () => {
      if (!isRecord(input) || !isJsonData(input)) {
        throw new TypeError('Live-caption history entries must contain JSON data only');
      }

      const entry = normalizeEntry({
        ...input,
        id: this.createId(),
        createdAt: new Date().toISOString(),
        cueCount: 0,
        durationMs: 0
      });
      if (!entry) {
        throw new TypeError('Invalid, empty, or oversized live-caption history entry');
      }

      const store = await this.readStore();
      const updated = pruneStore({ ...store, entries: [entry, ...store.entries] });
      if (!updated.entries.some(candidate => candidate.id === entry.id)) {
        throw new RangeError('Live-caption history entry exceeds the total storage limit');
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

  async getRetention(): Promise<LiveCaptionHistoryRetention> {
    await this.mutationQueue;
    return (await this.readStore()).retention;
  }

  async setRetention(retention: LiveCaptionHistoryRetention): Promise<void> {
    if (!RETENTION_VALUES.has(retention)) {
      throw new RangeError('Live-caption history retention must be 10, 25, or 50');
    }

    return this.enqueueMutation(async () => {
      const store = await this.readStore();
      await this.writeStore(pruneStore({ ...store, retention }));
    });
  }

  private getStorageArea(): LiveCaptionHistoryStorageArea {
    return this.storageArea || chrome.storage.local;
  }

  private async readStore(): Promise<StoredLiveCaptionHistory> {
    const result = await this.getStorageArea().get(LIVE_CAPTION_HISTORY_STORAGE_KEY);
    return normalizeStore(result[LIVE_CAPTION_HISTORY_STORAGE_KEY]);
  }

  private async writeStore(store: StoredLiveCaptionHistory): Promise<void> {
    await this.getStorageArea().set({
      [LIVE_CAPTION_HISTORY_STORAGE_KEY]: cloneJson(pruneStore(store))
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
      ? lockManager.request(LIVE_CAPTION_HISTORY_LOCK_NAME, operation)
      : operation();
  }

  private getLockManager(): LiveCaptionHistoryLockManager | undefined {
    if (this.lockManager !== undefined) return this.lockManager || undefined;
    if (typeof navigator === 'undefined') return undefined;
    return (navigator as Navigator & { locks?: LiveCaptionHistoryLockManager }).locks;
  }

  private createId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    const randomPart = Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12);
    return `${Date.now().toString(16)}-${randomPart}`;
  }
}

export const liveCaptionHistoryService = new LiveCaptionHistoryService();
