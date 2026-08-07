import { TextDecoder, TextEncoder } from 'util';

Object.assign(globalThis, { TextDecoder, TextEncoder });

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

const createFile = (name: string, text: string, type = 'text/plain'): File => {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    type,
    size: bytes.byteLength,
    text: async () => text,
    arrayBuffer: async () => bytes.slice().buffer
  } as File;
};

const setupDocumentDom = (): void => {
  document.body.innerHTML = `
    <p id="sourceUrlInfo" hidden></p>
    <button id="openOptions"></button>
    <select id="targetLanguage"></select>
    <select id="translationProvider"></select>
    <select id="displayMode"><option value="bilingual">Bilingual</option></select>
    <select id="ocrLanguage"></select>
    <input id="documentFile" type="file">
    <button id="translateDocument"></button>
    <button id="saveDocumentHistory" disabled></button>
    <button id="exportSubtitleFile" disabled></button>
    <button id="exportJsonFile" disabled></button>
    <button id="exportDocxFile" disabled></button>
    <button id="exportEpubFile" disabled></button>
    <button id="exportPdfFile" disabled></button>
    <button id="exportTextFile" disabled></button>
    <button id="clearDocument"></button>
    <textarea id="sourceText"></textarea>
    <p id="documentMessage"></p>
    <div id="progressBar"></div>
    <span id="progressText"></span>
    <select id="historyRetention"><option value="10">10</option></select>
    <button id="clearDocumentHistory" disabled></button>
    <section id="documentHistoryList"></section>
    <section id="pdfViewer" hidden></section>
    <section id="translationResults"></section>
    <input id="batchDocumentFiles" type="file" multiple>
    <select id="batchConcurrency">
      <option value="1">1</option><option value="2" selected>2</option><option value="3">3</option>
    </select>
    <button id="startDocumentBatch" disabled></button>
    <button id="cancelDocumentBatch" disabled></button>
    <button id="retryDocumentBatch" disabled></button>
    <button id="downloadDocumentBatch" disabled></button>
    <button id="clearDocumentBatch" disabled></button>
    <p id="batchDocumentSummary"></p>
    <p id="batchDocumentMessage"></p>
    <section id="batchDocumentQueue"></section>
  `;
};

const installChrome = (
  onMessage: (message: any, callback: (response: any) => void) => void
): jest.Mock => {
  const sendMessage = jest.fn((message: any, callback: (response: any) => void) => {
    if (message.action === 'getSettings') {
      callback({
        success: true,
        data: {
          defaultTargetLanguage: 'zh-CN',
          translationProvider: 'google',
          pageTranslationDisplayMode: 'bilingual',
          documentOcrLanguage: 'eng'
        }
      });
      return;
    }
    onMessage(message, callback);
  });
  const storageData: Record<string, unknown> = {};
  (global as any).chrome = {
    runtime: {
      lastError: null,
      openOptionsPage: jest.fn(),
      sendMessage
    },
    storage: {
      local: {
        get: jest.fn(async (key: string) => ({ [key]: storageData[key] })),
        set: jest.fn(async (items: Record<string, unknown>) => Object.assign(storageData, items)),
        remove: jest.fn(),
        clear: jest.fn()
      },
      sync: { get: jest.fn(), set: jest.fn(), remove: jest.fn(), clear: jest.fn() }
    }
  };
  return sendMessage;
};

const chooseBatchFiles = (files: File[]): void => {
  const input = document.getElementById('batchDocumentFiles') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change'));
};

const readBlobBytes = (blob: Blob): Promise<Uint8Array> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(blob);
});

const readBlobText = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

const readStoredZipNames = (bytes: Uint8Array): string[] => {
  const names: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const dataLength = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    names.push(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength)));
    offset += 30 + nameLength + extraLength + dataLength;
  }
  return names;
};

describe('document batch translation UI', () => {
  beforeEach(() => {
    jest.resetModules();
    setupDocumentDom();
    window.history.replaceState({}, '', '/document.html');
  });

  afterEach(() => jest.restoreAllMocks());

  it('waits for an explicit start, enforces concurrency, and downloads outputs in input order', async () => {
    const pending: Array<{ message: any; callback: (response: any) => void }> = [];
    const sendMessage = installChrome((message, callback) => {
      if (message.action === 'translate') pending.push({ message, callback });
      else callback({ success: true });
    });
    let exportedBlob: Blob | null = null;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn((blob: Blob) => {
        exportedBlob = blob;
        return 'blob:batch';
      })
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    chooseBatchFiles([
      createFile('first.txt', 'First'),
      createFile('second.txt', 'Second'),
      createFile('third.txt', 'Third')
    ]);
    await flushPromises();

    expect(sendMessage.mock.calls.map(call => call[0]).filter(message => message.action === 'translate')).toHaveLength(0);
    expect(document.querySelectorAll('.batch-item')).toHaveLength(3);
    expect((document.getElementById('startDocumentBatch') as HTMLButtonElement).disabled).toBe(false);

    document.getElementById('startDocumentBatch')!.dispatchEvent(new Event('click'));
    await flushPromises();
    expect(pending).toHaveLength(2);
    expect((document.getElementById('cancelDocumentBatch') as HTMLButtonElement).disabled).toBe(false);

    pending.shift()!.callback({ success: true, data: { translatedText: 'Translated first' } });
    await flushPromises();
    expect(sendMessage.mock.calls.map(call => call[0]).filter(message => message.action === 'translate')).toHaveLength(3);

    while (pending.length > 0) {
      const request = pending.shift()!;
      request.callback({ success: true, data: { translatedText: `Translated ${request.message.data.text}` } });
      await flushPromises();
    }
    await flushPromises();

    expect(document.getElementById('batchDocumentSummary')?.textContent).toContain('3 completed');
    const downloadButton = document.getElementById('downloadDocumentBatch') as HTMLButtonElement;
    expect(downloadButton.disabled).toBe(false);
    downloadButton.dispatchEvent(new Event('click'));
    expect(exportedBlob).not.toBeNull();
    expect(readStoredZipNames(await readBlobBytes(exportedBlob!))).toEqual([
      'first.translated.txt',
      'second.translated.txt',
      'third.translated.txt'
    ]);
  });

  it('cancels active provider requests immediately and never enables a partial archive', async () => {
    let pendingTranslation: { message: any; callback: (response: any) => void } | null = null;
    const sendMessage = installChrome((message, callback) => {
      if (message.action === 'translate') {
        pendingTranslation = { message, callback };
        return;
      }
      callback({ success: true, data: { cancelled: true } });
    });

    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    chooseBatchFiles([createFile('cancel.txt', 'Keep this pending')]);
    document.getElementById('startDocumentBatch')!.dispatchEvent(new Event('click'));
    await flushPromises();
    expect(pendingTranslation).not.toBeNull();

    document.getElementById('cancelDocumentBatch')!.dispatchEvent(new Event('click'));
    await flushPromises();
    await flushPromises();

    const translateMessage = (pendingTranslation as unknown as { message: any }).message;
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'cancelTranslationRequest',
      data: { requestId: translateMessage.data.requestId }
    }, expect.any(Function));
    expect(document.querySelector('.batch-item-status')?.textContent).toBe('Cancelled');
    expect(document.getElementById('batchDocumentSummary')?.textContent).toContain('1 cleaning up');
    expect((document.getElementById('batchDocumentFiles') as HTMLInputElement).disabled).toBe(true);
    expect((document.getElementById('downloadDocumentBatch') as HTMLButtonElement).disabled).toBe(true);

    (pendingTranslation as unknown as { callback: (response: any) => void }).callback({
      success: false,
      error: 'cancelled'
    });
    await flushPromises();
    expect((document.getElementById('batchDocumentFiles') as HTMLInputElement).disabled).toBe(false);
    expect((document.getElementById('downloadDocumentBatch') as HTMLButtonElement).disabled).toBe(true);
  });

  it('requeues failures without restarting until the user clicks start again', async () => {
    let shouldFail = true;
    const sendMessage = installChrome((message, callback) => {
      if (message.action === 'translate') {
        callback(shouldFail
          ? { success: false, error: 'Provider unavailable' }
          : { success: true, data: { translatedText: 'Recovered' } });
        return;
      }
      callback({ success: true });
    });

    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    chooseBatchFiles([createFile('retry.txt', 'Try again')]);
    document.getElementById('startDocumentBatch')!.dispatchEvent(new Event('click'));
    await flushPromises();
    await flushPromises();

    const translationCount = () => sendMessage.mock.calls
      .map(call => call[0])
      .filter(message => message.action === 'translate').length;
    expect(translationCount()).toBe(1);
    expect(document.querySelector('.batch-item-status')?.textContent).toBe('Failed');
    expect((document.getElementById('downloadDocumentBatch') as HTMLButtonElement).disabled).toBe(true);

    shouldFail = false;
    document.getElementById('retryDocumentBatch')!.dispatchEvent(new Event('click'));
    await flushPromises();
    expect(translationCount()).toBe(1);
    expect(document.querySelector('.batch-item-status')?.textContent).toBe('Waiting');
    expect((document.getElementById('startDocumentBatch') as HTMLButtonElement).disabled).toBe(false);

    document.getElementById('startDocumentBatch')!.dispatchEvent(new Event('click'));
    await flushPromises();
    await flushPromises();
    expect(translationCount()).toBe(2);
    expect(document.querySelector('.batch-item-status')?.textContent).toBe('Completed');
  });

  it('loads MOBI explicitly, translates only on click, and exports translated text', async () => {
    const sendMessage = installChrome((message, callback) => {
      if (message.action === 'translate') {
        callback({ success: true, data: { translatedText: `Translated ${message.data.text}` } });
        return;
      }
      callback({ success: true });
    });
    const { DocumentTextExtractor } = require('../../services/DocumentTextExtractor') as (
      typeof import('../../services/DocumentTextExtractor')
    );
    jest.spyOn(DocumentTextExtractor, 'extractBlocksFromMobiBytes').mockResolvedValue([
      {
        id: 1,
        originalText: 'MOBI chapter',
        mobi: { format: 'mobi', chapterId: 'chapter-1', chapterIndex: 0, blockIndex: 0, chunkIndex: 0 }
      }
    ]);
    let exportedBlob: Blob | null = null;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn((blob: Blob) => {
        exportedBlob = blob;
        return 'blob:mobi-text';
      })
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    const fileInput = document.getElementById('documentFile') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [createFile('reader.mobi', 'binary', 'application/x-mobipocket-ebook')]
    });
    fileInput.dispatchEvent(new Event('change'));
    await flushPromises();
    await flushPromises();

    expect((document.getElementById('sourceText') as HTMLTextAreaElement).value).toBe('MOBI chapter');
    expect(sendMessage.mock.calls.map(call => call[0]).filter(message => message.action === 'translate')).toHaveLength(0);
    document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
    await flushPromises();
    await flushPromises();
    document.getElementById('exportTextFile')!.dispatchEvent(new Event('click'));

    expect(exportedBlob).not.toBeNull();
    await expect(readBlobText(exportedBlob!)).resolves.toBe('Translated MOBI chapter\n');
  });
});
