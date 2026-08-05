import { TextEncoder } from 'util';
import {
  DOCUMENT_HISTORY_ENTRY_MAX_BYTES,
  DOCUMENT_HISTORY_LOCK_NAME,
  DOCUMENT_HISTORY_SCHEMA_VERSION,
  DOCUMENT_HISTORY_STORAGE_KEY,
  DOCUMENT_HISTORY_TOTAL_MAX_BYTES,
  DocumentHistoryEntry,
  DocumentHistorySaveInput,
  DocumentHistoryService
} from '../DocumentHistoryService';

Object.assign(globalThis, { TextEncoder });

const makeInput = (
  fileName: string = 'notes.txt',
  overrides: Partial<DocumentHistorySaveInput> = {}
): DocumentHistorySaveInput => ({
  fileName,
  sourceKind: 'txt',
  sourceUrl: '',
  sourceText: `Source for ${fileName}`,
  rawFileText: `Raw source for ${fileName}`,
  provider: 'google',
  targetLanguage: 'zh-CN',
  displayMode: 'bilingual',
  complete: true,
  documentBlocks: [{ id: 1, originalText: `Source for ${fileName}` }],
  results: [{
    block: { id: 1, originalText: `Source for ${fileName}` },
    translatedText: `Translation for ${fileName}`
  }],
  ...overrides
});

describe('DocumentHistoryService', () => {
  let localData: Record<string, unknown>;
  let localGet: jest.Mock;
  let localSet: jest.Mock;
  let syncGet: jest.Mock;
  let syncSet: jest.Mock;

  beforeEach(() => {
    localData = {};
    localGet = jest.fn(async (key: string) => ({ [key]: localData[key] }));
    localSet = jest.fn(async (items: Record<string, unknown>) => {
      Object.assign(localData, JSON.parse(JSON.stringify(items)));
    });
    syncGet = jest.fn();
    syncSet = jest.fn();

    Object.assign(chrome.storage.local, { get: localGet, set: localSet });
    Object.assign(chrome.storage.sync, { get: syncGet, set: syncSet });
  });

  it('uses local storage only and supports explicit CRUD', async () => {
    const service = new DocumentHistoryService();

    expect(await service.list()).toEqual([]);
    expect(localSet).not.toHaveBeenCalled();

    const saved = await service.save(makeInput());
    expect(saved.id).toBeTruthy();
    expect(Number.isFinite(Date.parse(saved.createdAt))).toBe(true);
    expect(await service.get(saved.id)).toEqual(saved);
    expect(await service.list()).toEqual([saved]);

    expect(await service.delete('missing')).toBe(false);
    expect(await service.delete(saved.id)).toBe(true);
    expect(await service.get(saved.id)).toBeUndefined();

    await service.save(makeInput('second.txt'));
    await service.clear();
    expect(await service.list()).toEqual([]);
    expect(await service.getRetention()).toBe(10);

    expect(localGet).toHaveBeenCalled();
    expect(localSet).toHaveBeenCalled();
    expect(syncGet).not.toHaveBeenCalled();
    expect(syncSet).not.toHaveBeenCalled();
    expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
    expect(chrome.storage.sync.clear).not.toHaveBeenCalled();
    expect(chrome.storage.local.clear).not.toHaveBeenCalled();
  });

  it('lists newest entries first and persists only supported retention values', async () => {
    const service = new DocumentHistoryService();
    const now = jest.spyOn(Date.prototype, 'toISOString');
    now.mockReturnValueOnce('2026-01-01T00:00:00.000Z');
    const older = await service.save(makeInput('older.txt'));
    now.mockReturnValueOnce('2026-01-02T00:00:00.000Z');
    const newer = await service.save(makeInput('newer.txt'));
    now.mockRestore();

    expect((await service.list()).map(entry => entry.id)).toEqual([newer.id, older.id]);
    await service.setRetention(25);
    expect(await service.getRetention()).toBe(25);
    expect(localData[DOCUMENT_HISTORY_STORAGE_KEY]).toMatchObject({
      schemaVersion: DOCUMENT_HISTORY_SCHEMA_VERSION,
      retention: 25
    });
    await expect(service.setRetention(11 as 10)).rejects.toThrow(RangeError);
    expect(await service.getRetention()).toBe(25);
  });

  it('prunes oldest whole entries when retention is reduced', async () => {
    const service = new DocumentHistoryService();
    await service.setRetention(25);

    for (let index = 0; index < 14; index += 1) {
      await service.save(makeInput(`${index}.txt`));
    }
    await service.setRetention(10);

    const entries = await service.list();
    expect(entries).toHaveLength(10);
    expect(entries.map(entry => entry.fileName)).toEqual(
      Array.from({ length: 10 }, (_, index) => `${13 - index}.txt`)
    );
  });

  it('filters corrupt persisted entries and falls back from a corrupt schema', async () => {
    const validEntry: DocumentHistoryEntry = {
      id: 'valid',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...makeInput('valid.txt')
    };
    localData[DOCUMENT_HISTORY_STORAGE_KEY] = {
      schemaVersion: DOCUMENT_HISTORY_SCHEMA_VERSION,
      retention: 99,
      entries: [
        validEntry,
        { ...validEntry, id: 'bad-date', createdAt: 'not-a-date' },
        { ...validEntry, id: 'bad-results', results: [{ translatedText: 12 }] },
        {
          ...validEntry,
          id: 'bad-ass',
          documentBlocks: [{
            id: 1,
            originalText: 'Broken ASS block',
            ass: { fields: [], textFieldIndex: 0 }
          }],
          results: []
        },
        null
      ]
    };

    const service = new DocumentHistoryService();
    expect(await service.list()).toEqual([validEntry]);
    expect(await service.getRetention()).toBe(10);

    localData[DOCUMENT_HISTORY_STORAGE_KEY] = {
      schemaVersion: 2,
      retention: 50,
      entries: [validEntry]
    };
    expect(await service.list()).toEqual([]);
    expect(await service.getRetention()).toBe(10);
  });

  it('returns deep clones from save, list, and get', async () => {
    const service = new DocumentHistoryService();
    const saved = await service.save(makeInput());

    saved.results[0].translatedText = 'mutated save result';
    const listed = await service.list();
    listed[0].documentBlocks[0].originalText = 'mutated document block';
    listed[0].results[0].block.originalText = 'mutated list block';
    listed[0].results[0].translatedText = 'mutated list result';
    const fetched = await service.get(listed[0].id);
    if (!fetched) throw new Error('Expected a stored history entry');
    fetched.results[0].block.originalText = 'mutated fetched block';

    const pristine = await service.get(listed[0].id);
    expect(pristine?.sourceText).toBe('Source for notes.txt');
    expect(pristine?.documentBlocks[0].originalText).toBe('Source for notes.txt');
    expect(pristine?.results[0]).toEqual({
      block: { id: 1, originalText: 'Source for notes.txt' },
      translatedText: 'Translation for notes.txt'
    });
  });

  it('rejects oversized entries and binary data anywhere in an input', async () => {
    const service = new DocumentHistoryService();
    const oversized = makeInput('large.txt', {
      sourceText: 'x'.repeat(DOCUMENT_HISTORY_ENTRY_MAX_BYTES)
    });

    await expect(service.save(oversized)).rejects.toThrow(/oversized/i);
    await expect(service.save({
      ...makeInput(),
      sourceText: new Uint8Array([1, 2, 3])
    } as unknown as DocumentHistorySaveInput)).rejects.toThrow(/JSON text data/i);
    await expect(service.save({
      ...makeInput(),
      results: [{
        block: {
          id: 1,
          originalText: 'text',
          bytes: new Uint8Array([1, 2, 3])
        } as unknown as DocumentHistoryEntry['results'][number]['block'],
        translatedText: 'translation'
      }]
    })).rejects.toThrow(/JSON text data/i);
    await expect(service.save({
      ...makeInput(),
      sourceKind: 'pdf',
      rawFileText: 'binary source represented as text'
    })).rejects.toThrow(/Invalid/i);

    expect(await service.list()).toEqual([]);
  });

  it('keeps the total serialized store under 4 MiB by evicting oldest whole entries', async () => {
    const service = new DocumentHistoryService();
    await service.setRetention(50);
    const payload = 'x'.repeat(470 * 1024);

    for (let index = 0; index < 10; index += 1) {
      await service.save(makeInput(`${index}.txt`, {
        sourceText: payload,
        rawFileText: undefined
      }));
    }

    const entries = await service.list();
    const stored = localData[DOCUMENT_HISTORY_STORAGE_KEY];
    const bytes = new TextEncoder().encode(JSON.stringify({
      [DOCUMENT_HISTORY_STORAGE_KEY]: stored
    })).byteLength;

    expect(bytes).toBeLessThanOrEqual(DOCUMENT_HISTORY_TOTAL_MAX_BYTES);
    expect(entries.length).toBeLessThan(10);
    expect(entries[0].fileName).toBe('9.txt');
    expect(entries.some(entry => entry.fileName === '0.txt')).toBe(false);
    expect(entries.every(entry => entry.sourceText.length === payload.length)).toBe(true);
  });

  it('retains all source blocks for an incomplete translation', async () => {
    const service = new DocumentHistoryService();
    const saved = await service.save(makeInput('partial.txt', {
      complete: false,
      sourceText: 'First block\n\nSecond block',
      documentBlocks: [
        { id: 1, originalText: 'First block' },
        { id: 2, originalText: 'Second block' }
      ],
      results: [{
        block: { id: 1, originalText: 'First block' },
        translatedText: 'Translated first block'
      }]
    }));

    expect(saved.complete).toBe(false);
    expect(saved.documentBlocks.map(block => block.originalText)).toEqual([
      'First block',
      'Second block'
    ]);
    expect(saved.results).toHaveLength(1);
  });

  it('serializes read-modify-write mutations across service instances with a shared Web Lock', async () => {
    let lockQueue: Promise<void> = Promise.resolve();
    const lockRequest = jest.fn();
    const lockManager = {
      request<T>(name: string, operation: () => Promise<T>): Promise<T> {
        lockRequest(name);
        expect(name).toBe(DOCUMENT_HISTORY_LOCK_NAME);
        const result = lockQueue.then(operation, operation);
        lockQueue = result.then(() => undefined, () => undefined);
        return result;
      }
    };
    const storageArea = { get: localGet, set: localSet };
    const firstService = new DocumentHistoryService(storageArea, lockManager);
    const secondService = new DocumentHistoryService(storageArea, lockManager);

    await Promise.all([
      firstService.save(makeInput('first-page.txt')),
      secondService.save(makeInput('second-page.txt'))
    ]);

    expect((await firstService.list()).map(entry => entry.fileName).sort()).toEqual([
      'first-page.txt',
      'second-page.txt'
    ]);
    expect(lockRequest).toHaveBeenCalledTimes(2);
  });
});
