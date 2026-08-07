import { TextDecoder, TextEncoder } from 'util';
import {
  DOCUMENT_BATCH_ARCHIVE_MAX_FILE_BYTES,
  DOCUMENT_BATCH_ARCHIVE_MAX_FILES,
  createDocumentBatchArchive
} from '../DocumentBatchArchive';

Object.assign(globalThis, { TextDecoder, TextEncoder });

interface ParsedArchiveEntry {
  name: string;
  bytes: Uint8Array;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  localName: string;
  localFlags: number;
  localMethod: number;
  localCrc32: number;
}

interface ParsedArchive {
  entries: ParsedArchiveEntry[];
  centralOffset: number;
  centralSize: number;
  entryCount: number;
}

const readUint16 = (view: DataView, offset: number): number => view.getUint16(offset, true);
const readUint32 = (view: DataView, offset: number): number => view.getUint32(offset, true);

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const parseStoredArchive = (archive: Uint8Array): ParsedArchive => {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const decoder = new TextDecoder();
  const endOffset = archive.byteLength - 22;

  expect(endOffset).toBeGreaterThanOrEqual(0);
  expect(readUint32(view, endOffset)).toBe(0x06054b50);
  expect(readUint16(view, endOffset + 4)).toBe(0);
  expect(readUint16(view, endOffset + 6)).toBe(0);
  const entryCount = readUint16(view, endOffset + 10);
  expect(readUint16(view, endOffset + 8)).toBe(entryCount);
  const centralSize = readUint32(view, endOffset + 12);
  const centralOffset = readUint32(view, endOffset + 16);
  expect(readUint16(view, endOffset + 20)).toBe(0);
  expect(centralOffset + centralSize).toBe(endOffset);

  const entries: ParsedArchiveEntry[] = [];
  let cursor = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    expect(readUint32(view, cursor)).toBe(0x02014b50);
    const flags = readUint16(view, cursor + 8);
    const method = readUint16(view, cursor + 10);
    const centralCrc32 = readUint32(view, cursor + 16);
    const compressedSize = readUint32(view, cursor + 20);
    const uncompressedSize = readUint32(view, cursor + 24);
    const nameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localOffset = readUint32(view, cursor + 42);
    const nameStart = cursor + 46;
    const name = decoder.decode(archive.slice(nameStart, nameStart + nameLength));

    expect(readUint32(view, localOffset)).toBe(0x04034b50);
    const localFlags = readUint16(view, localOffset + 6);
    const localMethod = readUint16(view, localOffset + 8);
    const localCrc32 = readUint32(view, localOffset + 14);
    const localCompressedSize = readUint32(view, localOffset + 18);
    const localUncompressedSize = readUint32(view, localOffset + 22);
    const localNameLength = readUint16(view, localOffset + 26);
    const localExtraLength = readUint16(view, localOffset + 28);
    const localNameStart = localOffset + 30;
    const localName = decoder.decode(
      archive.slice(localNameStart, localNameStart + localNameLength)
    );
    const dataStart = localNameStart + localNameLength + localExtraLength;
    const bytes = archive.slice(dataStart, dataStart + localCompressedSize);

    expect(localCompressedSize).toBe(compressedSize);
    expect(localUncompressedSize).toBe(uncompressedSize);
    expect(localCrc32).toBe(centralCrc32);

    entries.push({
      name,
      bytes,
      flags,
      method,
      crc32: centralCrc32,
      compressedSize,
      uncompressedSize,
      localOffset,
      localName,
      localFlags,
      localMethod,
      localCrc32
    });

    cursor = nameStart + nameLength + extraLength + commentLength;
  }

  expect(cursor).toBe(centralOffset + centralSize);
  return { entries, centralOffset, centralSize, entryCount };
};

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

const expectAbortError = (action: () => unknown): void => {
  try {
    action();
    throw new Error('Expected archive creation to abort');
  } catch (error) {
    expect((error as Error).name).toBe('AbortError');
  }
};

describe('DocumentBatchArchive', () => {
  it('writes ordered UTF-8 stored entries with valid CRC values and offsets', () => {
    const sourceFiles = [
      { fileName: 'first.txt', bytes: encode('alpha') },
      { fileName: '翻译结果.json', bytes: encode('{"ok":true}') },
      { fileName: 'empty.bin', bytes: new Uint8Array() }
    ];

    const parsed = parseStoredArchive(createDocumentBatchArchive(sourceFiles));

    expect(parsed.entryCount).toBe(3);
    expect(parsed.entries.map(entry => entry.name)).toEqual([
      'first.txt',
      '翻译结果.json',
      'empty.bin'
    ]);
    expect(parsed.entries.map(entry => [...entry.bytes])).toEqual(
      sourceFiles.map(file => [...file.bytes])
    );

    for (const entry of parsed.entries) {
      expect(entry.flags & 0x0800).toBe(0x0800);
      expect(entry.localFlags).toBe(entry.flags);
      expect(entry.method).toBe(0);
      expect(entry.localMethod).toBe(0);
      expect(entry.compressedSize).toBe(entry.bytes.byteLength);
      expect(entry.uncompressedSize).toBe(entry.bytes.byteLength);
      expect(entry.crc32).toBe(crc32(entry.bytes));
      expect(entry.localCrc32).toBe(entry.crc32);
      expect(entry.localName).toBe(entry.name);
    }

    expect(parsed.entries[0].localOffset).toBe(0);
    for (let index = 1; index < parsed.entries.length; index += 1) {
      const previous = parsed.entries[index - 1];
      const previousNameLength = encode(previous.name).byteLength;
      expect(parsed.entries[index].localOffset).toBe(
        previous.localOffset + 30 + previousNameLength + previous.bytes.byteLength
      );
    }
    expect(parsed.centralOffset).toBe(
      parsed.entries.reduce(
        (offset, entry) => offset + 30 + encode(entry.name).byteLength + entry.bytes.byteLength,
        0
      )
    );
  });

  it('is byte-for-byte deterministic and does not mutate input arrays', () => {
    const firstBytes = new Uint8Array([0, 255, 1, 2, 3]);
    const secondBytes = encode('same input');
    const firstSnapshot = firstBytes.slice();
    const secondSnapshot = secondBytes.slice();
    const files = [
      { fileName: 'a.bin', bytes: firstBytes },
      { fileName: 'b.txt', bytes: secondBytes }
    ];

    const firstArchive = createDocumentBatchArchive(files);
    const secondArchive = createDocumentBatchArchive(files);

    expect(secondArchive).toEqual(firstArchive);
    expect(firstBytes).toEqual(firstSnapshot);
    expect(secondBytes).toEqual(secondSnapshot);
  });

  it('normalizes unsafe paths and names while preserving reasonable extensions', () => {
    const parsed = parseStoredArchive(createDocumentBatchArchive([
      { fileName: '../../private/report<final>?.PDF', bytes: encode('one') },
      { fileName: 'C:\\temp\\bad\u0000name:part.txt', bytes: encode('two') },
      { fileName: '../<>.json', bytes: encode('three') },
      { fileName: '../../', bytes: encode('four') },
      { fileName: 'CON.txt', bytes: encode('five') }
    ]));

    expect(parsed.entries.map(entry => entry.name)).toEqual([
      'reportfinal.PDF',
      'badnamepart.txt',
      'translated-file.json',
      'translated-file',
      '_CON.txt'
    ]);
    for (const entry of parsed.entries) {
      expect(entry.name).not.toMatch(/[\\/]/);
      expect(entry.name).not.toContain('..');
      expect(Array.from(entry.name).some(character => {
        const code = character.charCodeAt(0);
        return code <= 0x1f
          || (code >= 0x7f && code <= 0x9f)
          || '<>:"|?*'.includes(character);
      })).toBe(false);
    }
  });

  it('deduplicates names case-insensitively with stable numeric suffixes', () => {
    const parsed = parseStoredArchive(createDocumentBatchArchive([
      { fileName: 'Report.txt', bytes: encode('one') },
      { fileName: 'report.TXT', bytes: encode('two') },
      { fileName: 'REPORT.txt', bytes: encode('three') },
      { fileName: 'folder/Report?.txt', bytes: encode('four') }
    ]));

    expect(parsed.entries.map(entry => entry.name)).toEqual([
      'Report.txt',
      'report (2).TXT',
      'REPORT (3).txt',
      'Report (4).txt'
    ]);
    expect(new Set(parsed.entries.map(entry => entry.name.toLowerCase())).size).toBe(4);
  });

  it('creates a valid empty ZIP archive', () => {
    const archive = createDocumentBatchArchive([]);
    const parsed = parseStoredArchive(archive);

    expect(archive).toHaveLength(22);
    expect(parsed).toEqual({
      entries: [],
      centralOffset: 0,
      centralSize: 0,
      entryCount: 0
    });
  });

  it('rejects file count, per-file size, and total input size limits', () => {
    const tooManyFiles = Array.from(
      { length: DOCUMENT_BATCH_ARCHIVE_MAX_FILES + 1 },
      (_, index) => ({ fileName: `${index}.txt`, bytes: new Uint8Array() })
    );
    expect(() => createDocumentBatchArchive(tooManyFiles)).toThrow(/more than 100 files/i);

    const oversized = new Uint8Array(DOCUMENT_BATCH_ARCHIVE_MAX_FILE_BYTES + 1);
    expect(() => createDocumentBatchArchive([
      { fileName: 'oversized.bin', bytes: oversized }
    ])).toThrow(/cannot exceed 67108864 bytes/i);

    const maximumSized = new Uint8Array(DOCUMENT_BATCH_ARCHIVE_MAX_FILE_BYTES);
    expect(() => createDocumentBatchArchive([
      { fileName: 'first.bin', bytes: maximumSized },
      { fileName: 'second.bin', bytes: maximumSized },
      { fileName: 'overflow.bin', bytes: new Uint8Array([1]) }
    ])).toThrow(/input cannot exceed 134217728 bytes/i);
  });

  it('rejects entries that cannot be represented without ZIP64-compatible fields', () => {
    expect(() => createDocumentBatchArchive([
      { fileName: `${'a'.repeat(0x10000)}.txt`, bytes: new Uint8Array() }
    ])).toThrow(/non-ZIP64 archive/i);
  });

  it('throws AbortError before work and at a file boundary', () => {
    const beforeStart = new AbortController();
    beforeStart.abort();
    expectAbortError(() => createDocumentBatchArchive([], beforeStart.signal));

    const atBoundary = new AbortController();
    const secondFile = {
      get fileName(): string {
        atBoundary.abort();
        return 'second.txt';
      },
      bytes: encode('second')
    };
    expectAbortError(() => createDocumentBatchArchive([
      { fileName: 'first.txt', bytes: encode('first') },
      secondFile
    ], atBoundary.signal));
  });
});
