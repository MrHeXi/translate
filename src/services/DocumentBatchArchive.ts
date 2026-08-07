export interface DocumentBatchArchiveFile {
  fileName: string;
  bytes: Uint8Array;
}

export const DOCUMENT_BATCH_ARCHIVE_MAX_FILES = 100;
export const DOCUMENT_BATCH_ARCHIVE_MAX_FILE_BYTES = 64 * 1024 * 1024;
export const DOCUMENT_BATCH_ARCHIVE_MAX_TOTAL_BYTES = 128 * 1024 * 1024;

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORED_METHOD = 0;
const ZIP_FIXED_DOS_TIME = 0;
const ZIP_FIXED_DOS_DATE = 0x0021;
const ZIP_LOCAL_HEADER_LENGTH = 30;
const ZIP_CENTRAL_HEADER_LENGTH = 46;
const ZIP_END_OF_CENTRAL_DIRECTORY_LENGTH = 22;
const ZIP_UINT16_MAX = 0xffff;
const ZIP_UINT32_MAX = 0xffffffff;

interface PlannedArchiveFile extends DocumentBatchArchiveFile {
  archiveName: string;
  nameBytes: Uint8Array;
  localOffset: number;
  crc32: number;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
    table[index] = value >>> 0;
  }

  return table;
})();

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) return;

  if (typeof DOMException !== 'undefined') {
    throw new DOMException('Document archive creation was aborted', 'AbortError');
  }

  const error = new Error('Document archive creation was aborted');
  error.name = 'AbortError';
  throw error;
};

const removeUnsafeNameCharacters = (value: string): string => (
  value
    .split('')
    .filter(character => {
      const code = character.charCodeAt(0);
      return code > 0x1f && (code < 0x7f || code > 0x9f);
    })
    .join('')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .replace(/[. ]+$/g, '')
);

const splitReasonableExtension = (value: string): { stem: string; extension: string } => {
  const dotIndex = value.lastIndexOf('.');
  if (dotIndex <= 0) return { stem: value, extension: '' };

  const extension = value.slice(dotIndex);
  if (!/^\.[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/.test(extension)) {
    return { stem: value, extension: '' };
  }

  return {
    stem: value.slice(0, dotIndex),
    extension
  };
};

const avoidWindowsDeviceName = (value: string): string => {
  const firstSegment = value.split('.')[0];
  if (!/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(firstSegment)) {
    return value;
  }

  return `_${value}`;
};

/** Returns one safe ZIP entry name without retaining any input path. */
export const normalizeDocumentArchiveFileName = (fileName: string): string => {
  if (typeof fileName !== 'string') {
    throw new TypeError('Document archive fileName must be a string');
  }

  const leafName = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  const { stem: rawStem, extension } = splitReasonableExtension(leafName);
  const safeStem = removeUnsafeNameCharacters(rawStem);
  const safeExtension = extension === '' ? '' : removeUnsafeNameCharacters(extension);

  let normalized = `${safeStem}${safeExtension}`;
  if (safeStem === '' || normalized === '.' || normalized === '..') {
    normalized = `translated-file${safeExtension}`;
  }

  return avoidWindowsDeviceName(normalized);
};

const splitArchiveExtension = (fileName: string): { stem: string; extension: string } => {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return { stem: fileName, extension: '' };
  }

  return {
    stem: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex)
  };
};

const makeUniqueArchiveName = (fileName: string, usedNames: Set<string>): string => {
  const normalizedKey = fileName.toLowerCase();
  if (!usedNames.has(normalizedKey)) {
    usedNames.add(normalizedKey);
    return fileName;
  }

  const { stem, extension } = splitArchiveExtension(fileName);
  for (let suffix = 2; suffix <= ZIP_UINT16_MAX; suffix += 1) {
    const candidate = `${stem} (${suffix})${extension}`;
    const candidateKey = candidate.toLowerCase();
    if (!usedNames.has(candidateKey)) {
      usedNames.add(candidateKey);
      return candidate;
    }
  }

  throw new RangeError('Document archive contains too many duplicate file names');
};

const calculateCrc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (view: DataView, offset: number, value: number): void => {
  view.setUint16(offset, value, true);
};

const writeUint32 = (view: DataView, offset: number, value: number): void => {
  view.setUint32(offset, value >>> 0, true);
};

const assertZip32Value = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP_UINT32_MAX) {
    throw new RangeError(`${label} requires ZIP64, which is not supported`);
  }
};

const isUint8Array = (value: unknown): value is Uint8Array => (
  typeof value === 'object'
  && value !== null
  && ArrayBuffer.isView(value)
  && Object.prototype.toString.call(value) === '[object Uint8Array]'
);

export const createDocumentBatchArchive = (
  files: DocumentBatchArchiveFile[],
  signal?: AbortSignal
): Uint8Array => {
  throwIfAborted(signal);

  if (!Array.isArray(files)) {
    throw new TypeError('Document archive files must be an array');
  }
  if (files.length > DOCUMENT_BATCH_ARCHIVE_MAX_FILES) {
    throw new RangeError(
      `Document archive cannot contain more than ${DOCUMENT_BATCH_ARCHIVE_MAX_FILES} files`
    );
  }

  const encoder = new TextEncoder();
  const usedNames = new Set<string>();
  const plannedFiles: PlannedArchiveFile[] = [];
  let totalInputBytes = 0;
  let localDirectorySize = 0;
  let centralDirectorySize = 0;

  for (const file of files) {
    throwIfAborted(signal);

    if (!file || typeof file !== 'object') {
      throw new TypeError('Each document archive entry must be an object');
    }

    const { fileName, bytes } = file;
    if (!isUint8Array(bytes)) {
      throw new TypeError('Document archive entry bytes must be a Uint8Array');
    }
    if (bytes.byteLength > DOCUMENT_BATCH_ARCHIVE_MAX_FILE_BYTES) {
      throw new RangeError(
        `Document archive entries cannot exceed ${DOCUMENT_BATCH_ARCHIVE_MAX_FILE_BYTES} bytes`
      );
    }

    totalInputBytes += bytes.byteLength;
    if (totalInputBytes > DOCUMENT_BATCH_ARCHIVE_MAX_TOTAL_BYTES) {
      throw new RangeError(
        `Document archive input cannot exceed ${DOCUMENT_BATCH_ARCHIVE_MAX_TOTAL_BYTES} bytes`
      );
    }

    const archiveName = makeUniqueArchiveName(
      normalizeDocumentArchiveFileName(fileName),
      usedNames
    );
    const nameBytes = encoder.encode(archiveName);
    if (nameBytes.byteLength > ZIP_UINT16_MAX) {
      throw new RangeError('Document archive file name is too long for a non-ZIP64 archive');
    }

    assertZip32Value(localDirectorySize, 'Document archive entry offset');
    plannedFiles.push({
      fileName,
      bytes,
      archiveName,
      nameBytes,
      localOffset: localDirectorySize,
      crc32: 0
    });

    localDirectorySize += ZIP_LOCAL_HEADER_LENGTH + nameBytes.byteLength + bytes.byteLength;
    centralDirectorySize += ZIP_CENTRAL_HEADER_LENGTH + nameBytes.byteLength;
    assertZip32Value(localDirectorySize, 'Document archive local directory');
    assertZip32Value(centralDirectorySize, 'Document archive central directory');
    throwIfAborted(signal);
  }

  const archiveSize = localDirectorySize
    + centralDirectorySize
    + ZIP_END_OF_CENTRAL_DIRECTORY_LENGTH;
  assertZip32Value(archiveSize, 'Document archive size');

  for (const file of plannedFiles) {
    throwIfAborted(signal);
    file.crc32 = calculateCrc32(file.bytes);
    throwIfAborted(signal);
  }

  throwIfAborted(signal);
  const archive = new Uint8Array(archiveSize);
  const view = new DataView(archive.buffer);
  let localOffset = 0;

  for (const file of plannedFiles) {
    throwIfAborted(signal);
    writeUint32(view, localOffset, ZIP_LOCAL_FILE_HEADER_SIGNATURE);
    writeUint16(view, localOffset + 4, ZIP_VERSION);
    writeUint16(view, localOffset + 6, ZIP_UTF8_FLAG);
    writeUint16(view, localOffset + 8, ZIP_STORED_METHOD);
    writeUint16(view, localOffset + 10, ZIP_FIXED_DOS_TIME);
    writeUint16(view, localOffset + 12, ZIP_FIXED_DOS_DATE);
    writeUint32(view, localOffset + 14, file.crc32);
    writeUint32(view, localOffset + 18, file.bytes.byteLength);
    writeUint32(view, localOffset + 22, file.bytes.byteLength);
    writeUint16(view, localOffset + 26, file.nameBytes.byteLength);
    writeUint16(view, localOffset + 28, 0);
    archive.set(file.nameBytes, localOffset + ZIP_LOCAL_HEADER_LENGTH);
    archive.set(
      file.bytes,
      localOffset + ZIP_LOCAL_HEADER_LENGTH + file.nameBytes.byteLength
    );
    localOffset += ZIP_LOCAL_HEADER_LENGTH + file.nameBytes.byteLength + file.bytes.byteLength;
    throwIfAborted(signal);
  }

  let centralOffset = localDirectorySize;
  for (const file of plannedFiles) {
    throwIfAborted(signal);
    writeUint32(view, centralOffset, ZIP_CENTRAL_DIRECTORY_SIGNATURE);
    writeUint16(view, centralOffset + 4, ZIP_VERSION);
    writeUint16(view, centralOffset + 6, ZIP_VERSION);
    writeUint16(view, centralOffset + 8, ZIP_UTF8_FLAG);
    writeUint16(view, centralOffset + 10, ZIP_STORED_METHOD);
    writeUint16(view, centralOffset + 12, ZIP_FIXED_DOS_TIME);
    writeUint16(view, centralOffset + 14, ZIP_FIXED_DOS_DATE);
    writeUint32(view, centralOffset + 16, file.crc32);
    writeUint32(view, centralOffset + 20, file.bytes.byteLength);
    writeUint32(view, centralOffset + 24, file.bytes.byteLength);
    writeUint16(view, centralOffset + 28, file.nameBytes.byteLength);
    writeUint16(view, centralOffset + 30, 0);
    writeUint16(view, centralOffset + 32, 0);
    writeUint16(view, centralOffset + 34, 0);
    writeUint16(view, centralOffset + 36, 0);
    writeUint32(view, centralOffset + 38, 0);
    writeUint32(view, centralOffset + 42, file.localOffset);
    archive.set(file.nameBytes, centralOffset + ZIP_CENTRAL_HEADER_LENGTH);
    centralOffset += ZIP_CENTRAL_HEADER_LENGTH + file.nameBytes.byteLength;
    throwIfAborted(signal);
  }

  const endOffset = localDirectorySize + centralDirectorySize;
  writeUint32(view, endOffset, ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  writeUint16(view, endOffset + 4, 0);
  writeUint16(view, endOffset + 6, 0);
  writeUint16(view, endOffset + 8, plannedFiles.length);
  writeUint16(view, endOffset + 10, plannedFiles.length);
  writeUint32(view, endOffset + 12, centralDirectorySize);
  writeUint32(view, endOffset + 16, localDirectorySize);
  writeUint16(view, endOffset + 20, 0);
  throwIfAborted(signal);

  return archive;
};
