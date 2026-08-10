import { TextEncoder } from 'util';
import {
  LIVE_CAPTION_HISTORY_ENTRY_MAX_BYTES,
  LIVE_CAPTION_HISTORY_LOCK_NAME,
  LIVE_CAPTION_HISTORY_SCHEMA_VERSION,
  LIVE_CAPTION_HISTORY_STORAGE_KEY,
  LIVE_CAPTION_HISTORY_TOTAL_MAX_BYTES,
  LiveCaptionHistoryEntry,
  LiveCaptionHistorySaveInput,
  LiveCaptionHistoryService
} from '../LiveCaptionHistoryService';

Object.assign(globalThis, { TextEncoder });

const makeCue = (id: number = 1, startTimeMs: number = 100, endTimeMs: number = 900) => ({
  id,
  startTimeMs,
  endTimeMs,
  source: 'Google Meet',
  speaker: 'Ada',
  originalText: `Original ${id}`,
  translatedText: `Translation ${id}`
});

const makeInput = (
  sourceTitle: string = 'Weekly review',
  overrides: Partial<LiveCaptionHistorySaveInput> = {}
): LiveCaptionHistorySaveInput => ({
  sessionStartedAt: '2026-08-10T08:00:00.000Z',
  sourceUrl: 'https://meet.example.test/room',
  sourceTitle,
  sourceHost: 'meet.example.test',
  cues: [makeCue()],
  ...overrides
});

describe('LiveCaptionHistoryService', () => {
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

  it('is inert until called, uses its own local key, and supports explicit CRUD', async () => {
    const fetchMock = jest.fn();
    const previousFetch = globalThis.fetch;
    Object.assign(globalThis, { fetch: fetchMock });
    const service = new LiveCaptionHistoryService();

    expect(localGet).not.toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();

    const saved = await service.save(makeInput());
    expect(saved).toMatchObject({
      sourceTitle: 'Weekly review',
      cueCount: 1,
      durationMs: 900
    });
    expect(saved.id).toBeTruthy();
    expect(Number.isFinite(Date.parse(saved.createdAt))).toBe(true);
    expect(await service.get(saved.id)).toEqual(saved);
    expect(await service.list()).toEqual([saved]);

    expect(await service.delete('missing')).toBe(false);
    expect(await service.delete(saved.id)).toBe(true);
    expect(await service.get(saved.id)).toBeUndefined();
    await service.save(makeInput('Second session'));
    await service.clear();

    expect(await service.list()).toEqual([]);
    expect(await service.getRetention()).toBe(10);
    expect(Object.keys(localData)).toEqual([LIVE_CAPTION_HISTORY_STORAGE_KEY]);
    expect(syncGet).not.toHaveBeenCalled();
    expect(syncSet).not.toHaveBeenCalled();
    expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
    expect(chrome.storage.sync.clear).not.toHaveBeenCalled();
    expect(chrome.storage.local.clear).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    Object.assign(globalThis, { fetch: previousFetch });
  });

  it('derives cue count and duration and returns deep clones', async () => {
    const service = new LiveCaptionHistoryService();
    const input = makeInput('Derived fields', {
      cues: [makeCue(1, 100, 500), makeCue(2, 700, 1800)]
    });
    const saved = await service.save(input);

    expect(saved.cueCount).toBe(2);
    expect(saved.durationMs).toBe(1800);
    saved.cues[0].originalText = 'mutated saved value';
    const listed = await service.list();
    listed[0].cues[0].translatedText = 'mutated listed value';
    const fetched = await service.get(saved.id);
    if (!fetched) throw new Error('Expected a stored live-caption entry');
    fetched.cues[1].source = 'mutated fetched value';

    expect((await service.get(saved.id))?.cues).toEqual(input.cues);
  });

  it('persists schema and retention and prunes oldest entries deterministically', async () => {
    const service = new LiveCaptionHistoryService();
    await service.setRetention(25);
    const now = jest.spyOn(Date.prototype, 'toISOString');
    for (let index = 0; index < 14; index += 1) {
      now.mockReturnValueOnce(`2026-08-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`);
      await service.save(makeInput(`Session ${index}`));
    }
    now.mockRestore();

    expect(localData[LIVE_CAPTION_HISTORY_STORAGE_KEY]).toMatchObject({
      schemaVersion: LIVE_CAPTION_HISTORY_SCHEMA_VERSION,
      retention: 25
    });
    await service.setRetention(10);
    expect((await service.list()).map(entry => entry.sourceTitle)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Session ${13 - index}`)
    );
    await expect(service.setRetention(11 as 10)).rejects.toThrow(RangeError);
    expect(await service.getRetention()).toBe(10);
  });

  it('normalizes stored data strictly and recomputes persisted derived fields', async () => {
    const validEntry: LiveCaptionHistoryEntry = {
      id: 'valid',
      createdAt: '2026-08-10T09:00:00.000Z',
      ...makeInput('Valid session'),
      cueCount: 999,
      durationMs: 999
    };
    localData[LIVE_CAPTION_HISTORY_STORAGE_KEY] = {
      schemaVersion: LIVE_CAPTION_HISTORY_SCHEMA_VERSION,
      retention: 99,
      entries: [
        validEntry,
        { ...validEntry, id: 'empty', cues: [] },
        { ...validEntry, id: 'bad-date', createdAt: 'not-a-date' },
        { ...validEntry, id: 'bad-cue', cues: [{ ...makeCue(), endTimeMs: 50 }] },
        { ...validEntry, id: 'unknown-field', unexpected: true },
        null
      ]
    };

    const service = new LiveCaptionHistoryService();
    expect(await service.list()).toEqual([{ ...validEntry, cueCount: 1, durationMs: 900 }]);
    expect(await service.getRetention()).toBe(10);

    localData[LIVE_CAPTION_HISTORY_STORAGE_KEY] = {
      schemaVersion: 2,
      retention: 50,
      entries: [validEntry]
    };
    expect(await service.list()).toEqual([]);
    expect(await service.getRetention()).toBe(10);
  });

  it('rejects empty cues, malformed timestamps, non-JSON values, and unknown fields', async () => {
    const service = new LiveCaptionHistoryService();

    await expect(service.save(makeInput('Empty', { cues: [] }))).rejects.toThrow(/empty/i);
    await expect(service.save(makeInput('Negative', {
      cues: [{ ...makeCue(), startTimeMs: -1 }]
    }))).rejects.toThrow(/Invalid/i);
    await expect(service.save(makeInput('Backwards', {
      cues: [{ ...makeCue(), startTimeMs: 900, endTimeMs: 100 }]
    }))).rejects.toThrow(/Invalid/i);
    await expect(service.save(makeInput('Duplicate IDs', {
      cues: [makeCue(1, 0, 100), makeCue(1, 200, 300)]
    }))).rejects.toThrow(/Invalid/i);
    await expect(service.save(makeInput('Out of order', {
      cues: [makeCue(1, 200, 300), makeCue(2, 100, 150)]
    }))).rejects.toThrow(/Invalid/i);
    await expect(service.save(makeInput('Bad session start', {
      sessionStartedAt: 'August 10, 2026'
    }))).rejects.toThrow(/Invalid/i);
    await expect(service.save({
      ...makeInput('Binary'),
      cues: [{ ...makeCue(), bytes: new Uint8Array([1, 2, 3]) }]
    } as unknown as LiveCaptionHistorySaveInput)).rejects.toThrow(/JSON data/i);
    await expect(service.save({
      ...makeInput('Unknown'),
      unexpected: true
    } as unknown as LiveCaptionHistorySaveInput)).rejects.toThrow(/Invalid/i);

    expect(await service.list()).toEqual([]);
  });

  it('rejects entries above 512 KiB', async () => {
    const service = new LiveCaptionHistoryService();
    const oversized = makeInput('Oversized', {
      cues: [{
        ...makeCue(),
        originalText: 'x'.repeat(LIVE_CAPTION_HISTORY_ENTRY_MAX_BYTES)
      }]
    });

    await expect(service.save(oversized)).rejects.toThrow(/oversized/i);
    expect(await service.list()).toEqual([]);
  });

  it('keeps total persisted JSON below 4 MiB by removing oldest whole entries', async () => {
    const service = new LiveCaptionHistoryService();
    await service.setRetention(50);
    const payload = 'x'.repeat(470 * 1024);

    for (let index = 0; index < 10; index += 1) {
      await service.save(makeInput(`Session ${index}`, {
        cues: [{ ...makeCue(), originalText: payload }]
      }));
    }

    const entries = await service.list();
    const bytes = new TextEncoder().encode(JSON.stringify({
      [LIVE_CAPTION_HISTORY_STORAGE_KEY]: localData[LIVE_CAPTION_HISTORY_STORAGE_KEY]
    })).byteLength;

    expect(bytes).toBeLessThanOrEqual(LIVE_CAPTION_HISTORY_TOTAL_MAX_BYTES);
    expect(entries.length).toBeLessThan(10);
    expect(entries[0].sourceTitle).toBe('Session 9');
    expect(entries.some(entry => entry.sourceTitle === 'Session 0')).toBe(false);
    expect(entries.every(entry => entry.cues[0].originalText.length === payload.length)).toBe(true);
  });

  it('serializes same-context mutations and uses a shared Web Lock across instances', async () => {
    let lockQueue: Promise<void> = Promise.resolve();
    const lockRequest = jest.fn();
    const lockManager = {
      request<T>(name: string, operation: () => Promise<T>): Promise<T> {
        lockRequest(name);
        const result = lockQueue.then(operation, operation);
        lockQueue = result.then(() => undefined, () => undefined);
        return result;
      }
    };
    const storageArea = { get: localGet, set: localSet };
    const firstService = new LiveCaptionHistoryService(storageArea, lockManager);
    const secondService = new LiveCaptionHistoryService(storageArea, lockManager);

    await Promise.all([
      firstService.save(makeInput('First')),
      secondService.save(makeInput('Second'))
    ]);
    await Promise.all([
      firstService.save(makeInput('Third')),
      firstService.save(makeInput('Fourth'))
    ]);

    expect((await firstService.list()).map(entry => entry.sourceTitle).sort()).toEqual([
      'First',
      'Fourth',
      'Second',
      'Third'
    ]);
    expect(lockRequest).toHaveBeenCalledTimes(4);
    expect(lockRequest).toHaveBeenCalledWith(LIVE_CAPTION_HISTORY_LOCK_NAME);
  });
});
