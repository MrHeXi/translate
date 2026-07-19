import { TextDecoder, TextEncoder } from 'util';
import { DocumentTextExtractor } from '../../services/DocumentTextExtractor';

Object.assign(globalThis, {
  TextDecoder,
  TextEncoder
});

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

const readBlobText = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

const readBlobBytes = (blob: Blob): Promise<Uint8Array> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(blob);
});

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};

const writeUint16 = (bytes: Uint8Array, offset: number, value: number): void => {
  new DataView(bytes.buffer).setUint16(offset, value, true);
};

const writeUint32 = (bytes: Uint8Array, offset: number, value: number): void => {
  new DataView(bytes.buffer).setUint32(offset, value, true);
};

const createStoredZip = (files: Array<{ name: string; content: string }>): Uint8Array => {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const localHeader = new Uint8Array(30 + nameBytes.length);

    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 8, 0);
    writeUint32(localHeader, 18, dataBytes.length);
    writeUint32(localHeader, 22, dataBytes.length);
    writeUint16(localHeader, 26, nameBytes.length);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 10, 0);
    writeUint32(centralHeader, 20, dataBytes.length);
    writeUint32(centralHeader, 24, dataBytes.length);
    writeUint16(centralHeader, 28, nameBytes.length);
    writeUint32(centralHeader, 42, localOffset);
    centralHeader.set(nameBytes, 46);

    localChunks.push(localHeader, dataBytes);
    centralChunks.push(centralHeader);
    localOffset += localHeader.length + dataBytes.length;
  }

  const centralDirectory = concatBytes(centralChunks);
  const endOfCentralDirectory = new Uint8Array(22);
  writeUint32(endOfCentralDirectory, 0, 0x06054b50);
  writeUint16(endOfCentralDirectory, 8, files.length);
  writeUint16(endOfCentralDirectory, 10, files.length);
  writeUint32(endOfCentralDirectory, 12, centralDirectory.length);
  writeUint32(endOfCentralDirectory, 16, localOffset);

  return concatBytes([...localChunks, centralDirectory, endOfCentralDirectory]);
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const setupDocumentDom = (): void => {
  document.body.innerHTML = `
    <p id="sourceUrlInfo" hidden></p>
    <button id="openOptions"></button>
    <select id="targetLanguage"></select>
    <select id="translationProvider"></select>
    <select id="displayMode">
      <option value="bilingual">Bilingual</option>
      <option value="translation-only">Translation only</option>
      <option value="original-only">Original only</option>
    </select>
    <select id="ocrLanguage"></select>
    <input id="documentFile" type="file">
    <button id="translateDocument"></button>
    <button id="exportSubtitleFile" disabled></button>
    <button id="exportJsonFile" disabled></button>
    <button id="exportDocxFile" disabled></button>
    <button id="exportEpubFile" disabled></button>
    <button id="exportPdfFile" disabled></button>
    <button id="clearDocument"></button>
    <textarea id="sourceText"></textarea>
    <p id="documentMessage"></p>
    <div id="progressBar"></div>
    <span id="progressText"></span>
    <section id="pdfViewer" hidden></section>
    <section id="translationResults"></section>
  `;
};

describe('document translator page', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../../services/PdfDocumentService');
    setupDocumentDom();
    window.history.replaceState({}, '', '/document.html?sourceUrl=https%3A%2F%2Fexample.com%2Fpaper.pdf');

    (global as any).chrome = {
      runtime: {
        lastError: null,
        openOptionsPage: jest.fn(),
        sendMessage: jest.fn((message: any, callback: (response: any) => void) => {
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

          if (message.action === 'translate') {
            callback({
              success: true,
              data: {
                translatedText: `translated: ${message.data.text}`
              }
            });
            return;
          }

          callback({ success: true });
        })
      }
    };
  });

  it('translates pasted document blocks only after the user clicks translate', async () => {
    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const sourceUrlInfo = document.getElementById('sourceUrlInfo') as HTMLElement;
    const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;

    expect(sourceUrlInfo.hidden).toBe(false);
    expect(sourceUrlInfo.textContent).toBe('https://example.com/paper.pdf');
    expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'translate' }),
      expect.any(Function)
    );

    sourceText.value = 'First paragraph.\n\nSecond paragraph.';
    document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
    await flushPromises();
    await flushPromises();

    const blocks = document.querySelectorAll('.document-result-block');
    expect(blocks).toHaveLength(2);
    expect(document.getElementById('translationResults')?.textContent).toContain('translated: First paragraph.');
    expect(document.getElementById('progressText')?.textContent).toBe('2/2 blocks');
    const translationMessages = ((global as any).chrome.runtime.sendMessage as jest.Mock).mock.calls
      .map(call => call[0])
      .filter(message => message.action === 'translate');
    expect(translationMessages).toHaveLength(2);
    translationMessages.forEach(message => {
      expect(message.data.context).toContain('First paragraph.');
      expect(message.data.context).toContain('Second paragraph.');
    });
  });

  it('offers bundled PDF OCR languages and saves changes without translating', async () => {
    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const ocrLanguage = document.getElementById('ocrLanguage') as HTMLSelectElement;
    expect(Array.from(ocrLanguage.options).map(option => option.value)).toEqual([
      'eng',
      'chi_sim',
      'chi_tra',
      'jpn',
      'kor'
    ]);
    expect(ocrLanguage.value).toBe('eng');

    (global as any).chrome.runtime.sendMessage.mockClear();
    ocrLanguage.value = 'chi_sim';
    ocrLanguage.dispatchEvent(new Event('change'));
    await flushPromises();

    expect((global as any).chrome.runtime.sendMessage).toHaveBeenCalledWith(
      {
        action: 'updateSettings',
        data: { documentOcrLanguage: 'chi_sim' }
      },
      expect.any(Function)
    );
    expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'translate' }),
      expect.any(Function)
    );
  });

  it('filters document target languages by the selected provider capability', async () => {
    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const provider = document.getElementById('translationProvider') as HTMLSelectElement;
    const target = document.getElementById('targetLanguage') as HTMLSelectElement;
    expect(Array.from(provider.options).some(option => option.value === 'caiyun')).toBe(true);

    target.value = 'fr';
    provider.value = 'caiyun';
    provider.dispatchEvent(new Event('change'));

    expect(target.value).toBe('zh-CN');
    expect(Array.from(target.options).find(option => option.value === 'fr')?.disabled).toBe(true);
    expect(Array.from(target.options).find(option => option.value === 'ja')?.disabled).toBe(false);
  });

  it('applies translation-only display mode to rendered blocks', async () => {
    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;
    const displayMode = document.getElementById('displayMode') as HTMLSelectElement;

    sourceText.value = 'Only translation should remain visible.';
    document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
    await flushPromises();
    await flushPromises();

    displayMode.value = 'translation-only';
    displayMode.dispatchEvent(new Event('change'));

    const original = document.querySelector('.document-original') as HTMLElement;
    const translation = document.querySelector('.document-translation') as HTMLElement;

    expect(original.style.display).toBe('none');
    expect(translation.style.display).toBe('block');
  });

  it('keeps PDF layout metadata when translating loaded text-based PDFs', async () => {
    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const pdf = [
      '%PDF-1.4',
      'stream',
      'BT',
      '1 0 0 1 72 720 Tm',
      '(PDF heading) Tj',
      '1 0 0 1 72 690 Tm',
      '(PDF body) Tj',
      'ET',
      'endstream'
    ].join('\n');
    const file = new File([pdf], 'layout.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new Uint8Array([...pdf].map(character => character.charCodeAt(0))).buffer,
      configurable: true
    });
    const fileInput = document.getElementById('documentFile') as HTMLInputElement;

    Object.defineProperty(fileInput, 'files', {
      value: [file],
      configurable: true
    });

    fileInput.dispatchEvent(new Event('change'));
    await flushPromises();
    await flushPromises();

    expect((document.getElementById('sourceText') as HTMLTextAreaElement).value).toContain('PDF heading');
    expect(document.getElementById('documentMessage')?.textContent).toBe('layout.pdf loaded with PDF layout blocks (compatibility mode)');

    document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
    await flushPromises();
    await flushPromises();

    const blocks = document.querySelectorAll('.document-result-block--layout');
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as HTMLElement).dataset['page']).toBe('1');
    expect(blocks[0].querySelector('.block-index')?.textContent).toContain('Page 1 · Block 1 · x 72 · y 720');
    expect(document.getElementById('translationResults')?.textContent).toContain('translated: PDF heading');
  });

  it('renders PDF.js pages, positions translations, and exports a translated PDF', async () => {
    const renderPage = jest.fn(async (_pageNumber: number, canvas: HTMLCanvasElement) => {
      canvas.width = 810;
      canvas.height = 1080;
      return { pageNumber: 1, width: 600, height: 800, scale: 1.35 };
    });
    const exportTranslatedPdf = jest.fn(async () => new Uint8Array([37, 80, 68, 70]));
    const destroy = jest.fn(async () => undefined);
    const session = {
      analyze: jest.fn(async () => ({
        blocks: [
          {
            id: 1,
            originalText: 'PDF.js positioned heading',
            layout: {
              pageNumber: 1,
              x: 72,
              y: 80,
              width: 210,
              height: 20,
              pageWidth: 600,
              pageHeight: 800,
              contentKind: 'prose',
              readingOrder: 0,
              columnIndex: 1,
              columnCount: 2,
              regionX: 50,
              regionWidth: 230,
              source: 'pdf-text'
            }
          },
          {
            id: 2,
            originalText: 'E = mc²',
            layout: {
              pageNumber: 1,
              x: 90,
              y: 150,
              width: 80,
              height: 18,
              pageWidth: 600,
              pageHeight: 800,
              contentKind: 'formula',
              readingOrder: 1,
              columnIndex: 1,
              columnCount: 2,
              regionX: 50,
              regionWidth: 230,
              source: 'pdf-text'
            }
          }
        ],
        pages: [{
          pageNumber: 1,
          width: 600,
          height: 800,
          blockCount: 2,
          formulaBlockCount: 1,
          columnCount: 2,
          source: 'text'
        }],
        ocrPageCount: 0,
        bundledOcrPageCount: 0,
        unreadablePageCount: 0,
        formulaBlockCount: 1,
        multiColumnPageCount: 1
      })),
      renderPage,
      exportTranslatedPdf,
      destroy
    };
    const open = jest.fn(async () => session);
    jest.doMock('../../services/PdfDocumentService', () => ({
      pdfDocumentService: { open }
    }));

    let exportedBlob: Blob | null = null;
    const createObjectURL = jest.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:translated-pdf';
    });
    const revokeObjectURL = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

    try {
      require('../document');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();

      const file = new File(['real pdf bytes'], 'research.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3]).buffer,
        configurable: true
      });
      const fileInput = document.getElementById('documentFile') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event('change'));
      await flushPromises();
      await flushPromises();

      expect(open).toHaveBeenCalledWith(
        new Uint8Array([1, 2, 3]),
        expect.objectContaining({
          ocrLanguage: 'eng',
          onOcrProgress: expect.any(Function)
        })
      );
      expect(renderPage).toHaveBeenCalledTimes(2);
      expect(document.getElementById('pdfViewer')?.hidden).toBe(false);
      expect(document.querySelectorAll('.pdf-page-panel')).toHaveLength(2);
      expect(document.getElementById('documentMessage')?.textContent).toBe(
        'research.pdf loaded, 1 page, 2 positioned blocks, 1 preserved formula, 1 multi-column page'
      );
      expect((document.getElementById('exportPdfFile') as HTMLButtonElement).disabled).toBe(true);

      const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;
      const formulaText = sourceText.value.split('\n\n')[1]!;
      sourceText.value = sourceText.value.replace(
        'PDF.js positioned heading',
        'Edited PDF.js positioned heading'
      );
      document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      const overlay = document.querySelector('.pdf-translation-overlay') as HTMLElement;
      expect(overlay.textContent).toBe('translated: Edited PDF.js positioned heading');
      expect(overlay.style.left).toBe('12%');
      expect(parseFloat(overlay.style.width)).toBeLessThanOrEqual(35);
      expect(parseFloat(overlay.style.left) + parseFloat(overlay.style.width)).toBeLessThanOrEqual(46.67);
      expect(document.querySelectorAll('.pdf-translation-overlay')).toHaveLength(1);
      expect(document.querySelectorAll('.document-result-block--formula')).toHaveLength(1);
      const formulaBlock = document.querySelector('.document-result-block--formula') as HTMLElement;
      expect((formulaBlock.querySelector('.document-original') as HTMLElement).style.display).toBe('block');
      expect((formulaBlock.querySelector('.document-translation') as HTMLElement).style.display).toBe('none');
      const translationMessages = ((global as any).chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map(call => call[0])
        .filter(message => message.action === 'translate');
      expect(translationMessages).toHaveLength(1);
      expect(translationMessages[0].data.text).toBe('Edited PDF.js positioned heading');
      expect(translationMessages[0].data.context).toBe('Edited PDF.js positioned heading');
      expect(translationMessages[0].data.context).not.toContain(formulaText);
      expect(document.getElementById('documentMessage')?.textContent).toBe(
        'Translated 1 blocks and preserved 1 formulas'
      );
      expect((document.getElementById('exportPdfFile') as HTMLButtonElement).disabled).toBe(false);

      const displayMode = document.getElementById('displayMode') as HTMLSelectElement;
      displayMode.value = 'translation-only';
      displayMode.dispatchEvent(new Event('change'));
      expect((document.querySelector('.pdf-page-panel') as HTMLElement).style.display).toBe('none');
      expect((formulaBlock.querySelector('.document-original') as HTMLElement).style.display).toBe('none');
      expect((formulaBlock.querySelector('.document-translation') as HTMLElement).style.display).toBe('block');
      expect(formulaBlock.querySelector('.document-translation')?.textContent).toBe('E = mc²');

      document.getElementById('exportPdfFile')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect(exportTranslatedPdf).toHaveBeenCalledWith([
        expect.objectContaining({
          block: expect.objectContaining({
            id: 1,
            originalText: 'Edited PDF.js positioned heading',
            layout: expect.objectContaining({
              pageNumber: 1,
              x: 72,
              y: 80,
              width: 210,
              height: 20,
              pageWidth: 600,
              pageHeight: 800,
              contentKind: 'prose',
              readingOrder: 0,
              columnIndex: 1,
              columnCount: 2,
              regionX: 50,
              regionWidth: 230,
              source: 'pdf-text'
            })
          }),
          translatedText: 'translated: Edited PDF.js positioned heading'
        })
      ]);
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(exportedBlob).not.toBeNull();
      expect(Array.from(await readBlobBytes(exportedBlob!))).toEqual([37, 80, 68, 70]);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:translated-pdf');
      expect(document.getElementById('documentMessage')?.textContent).toBe(
        'Exported translated PDF with 1 positioned blocks'
      );

      (global as any).chrome.runtime.sendMessage.mockClear();
      sourceText.value = formulaText;
      document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      const formulaOnlyMessages = ((global as any).chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map(call => call[0])
        .filter(message => message.action === 'translate');
      expect(formulaOnlyMessages).toHaveLength(0);
      expect(document.querySelectorAll('.document-result-block--formula')).toHaveLength(1);
      expect(document.querySelector('.block-index')?.textContent).toContain('Block 2');
      expect((document.getElementById('exportPdfFile') as HTMLButtonElement).disabled).toBe(true);

      (global as any).chrome.runtime.sendMessage.mockClear();
      sourceText.value = `${formulaText}\n\nAdded prose without source geometry`;
      document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      const insertedProseMessages = ((global as any).chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map(call => call[0])
        .filter(message => message.action === 'translate');
      expect(insertedProseMessages).toHaveLength(1);
      expect(insertedProseMessages[0].data).toEqual(expect.objectContaining({
        text: 'Added prose without source geometry',
        context: 'Added prose without source geometry'
      }));
      expect(insertedProseMessages[0].data.context).not.toContain(formulaText);
      expect(document.querySelectorAll('.document-result-block--formula')).toHaveLength(1);
      expect(document.querySelectorAll('.document-result-block--layout')).toHaveLength(1);
      expect((document.getElementById('exportPdfFile') as HTMLButtonElement).disabled).toBe(true);

      document.getElementById('exportPdfFile')!.dispatchEvent(new Event('click'));
      await flushPromises();
      expect(exportTranslatedPdf).toHaveBeenCalledTimes(1);
      expect(document.getElementById('documentMessage')?.textContent).toBe(
        'PDF export is unavailable after adding text without source geometry.'
      );

      (global as any).chrome.runtime.sendMessage.mockClear();
      const ocrLanguage = document.getElementById('ocrLanguage') as HTMLSelectElement;
      ocrLanguage.value = 'jpn';
      ocrLanguage.dispatchEvent(new Event('change'));
      await flushPromises();
      await flushPromises();

      expect(open).toHaveBeenLastCalledWith(
        new Uint8Array([1, 2, 3]),
        expect.objectContaining({ ocrLanguage: 'jpn' })
      );
      expect(destroy).toHaveBeenCalledTimes(1);
      expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'translate' }),
        expect.any(Function)
      );
      expect((document.getElementById('exportPdfFile') as HTMLButtonElement).disabled).toBe(true);
      expect(document.querySelector('.pdf-translation-overlay')).toBeNull();
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('maps PDF block-count edits only onto known export geometry', async () => {
    const firstLayout = {
      pageNumber: 1,
      x: 40,
      y: 60,
      width: 180,
      height: 16,
      pageWidth: 500,
      pageHeight: 700,
      contentKind: 'prose' as const,
      readingOrder: 4,
      columnIndex: 1,
      columnCount: 1,
      regionX: 20,
      regionWidth: 460,
      source: 'pdf-text' as const
    };
    const secondLayout = {
      ...firstLayout,
      x: 55,
      y: 110,
      width: 240,
      readingOrder: 5
    };
    const exportTranslatedPdf = jest.fn(async (_results: unknown) => new Uint8Array([37, 80, 68, 70]));
    const session = {
      analyze: jest.fn(async () => ({
        blocks: [
          { id: 11, originalText: 'Original first block', layout: firstLayout },
          { id: 22, originalText: 'Original second block', layout: secondLayout }
        ],
        pages: [{
          pageNumber: 1,
          width: 500,
          height: 700,
          blockCount: 2,
          formulaBlockCount: 0,
          columnCount: 1,
          source: 'text'
        }],
        ocrPageCount: 0,
        bundledOcrPageCount: 0,
        unreadablePageCount: 0,
        formulaBlockCount: 0,
        multiColumnPageCount: 0
      })),
      renderPage: jest.fn(async () => ({
        pageNumber: 1,
        width: 500,
        height: 700,
        scale: 1
      })),
      exportTranslatedPdf,
      destroy: jest.fn(async () => undefined)
    };
    jest.doMock('../../services/PdfDocumentService', () => ({
      pdfDocumentService: { open: jest.fn(async () => session) }
    }));

    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      value: jest.fn(() => 'blob:edited-pdf'),
      configurable: true
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: jest.fn(),
      configurable: true
    });

    try {
      require('../document');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();

      const file = new File(['pdf bytes'], 'edited-layout.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3]).buffer,
        configurable: true
      });
      const fileInput = document.getElementById('documentFile') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event('change'));
      await flushPromises();
      await flushPromises();

      const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;
      (global as any).chrome.runtime.sendMessage.mockClear();
      sourceText.value = 'Edited first line\ncontinued\n\nEdited second block\n\nAdded tail block';
      expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalled();

      document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      const translationMessages = ((global as any).chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map(call => call[0])
        .filter(message => message.action === 'translate');
      expect(translationMessages.map(message => message.data.text)).toEqual([
        'Edited first line continued',
        'Edited second block\n\nAdded tail block'
      ]);
      const resultBlocks = document.querySelectorAll('.document-result-block--layout');
      expect(resultBlocks).toHaveLength(2);
      expect(resultBlocks[0].querySelector('.block-index')?.textContent).toContain('Block 11');
      expect(resultBlocks[0].querySelector('.block-index')?.textContent).toContain('x 40');
      expect(resultBlocks[1].querySelector('.block-index')?.textContent).toContain('Block 22');
      expect(resultBlocks[1].querySelector('.block-index')?.textContent).toContain('y 110');
      expect((document.getElementById('exportPdfFile') as HTMLButtonElement).disabled).toBe(false);

      document.getElementById('exportPdfFile')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect(exportTranslatedPdf).toHaveBeenCalledWith([
        expect.objectContaining({
          block: expect.objectContaining({
            id: 11,
            originalText: 'Edited first line continued',
            layout: firstLayout
          })
        }),
        expect.objectContaining({
          block: expect.objectContaining({
            id: 22,
            originalText: 'Edited second block\n\nAdded tail block',
            layout: secondLayout
          })
        })
      ]);

      (global as any).chrome.runtime.sendMessage.mockClear();
      sourceText.value = 'Only the first PDF slot remains';
      document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect(document.querySelectorAll('.document-result-block--layout')).toHaveLength(1);
      expect(document.querySelector('.block-index')?.textContent).toContain('Block 11');
      expect((document.getElementById('exportPdfFile') as HTMLButtonElement).disabled).toBe(false);

      document.getElementById('exportPdfFile')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect(exportTranslatedPdf).toHaveBeenLastCalledWith([
        expect.objectContaining({
          block: expect.objectContaining({
            id: 11,
            originalText: 'Only the first PDF slot remains',
            layout: firstLayout
          })
        })
      ]);
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('loads JSON files as readable string blocks without auto-translating', async () => {
    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const json = JSON.stringify({
      title: 'Product tour',
      steps: [
        'Open the extension popup.',
        'Click Start to translate manually.'
      ],
      nested: {
        note: 'Export learning data from settings.'
      }
    });
    const file = new File([json], 'guide.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: async () => json,
      configurable: true
    });
    const fileInput = document.getElementById('documentFile') as HTMLInputElement;

    Object.defineProperty(fileInput, 'files', {
      value: [file],
      configurable: true
    });

    fileInput.dispatchEvent(new Event('change'));
    await flushPromises();
    await flushPromises();

    const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;
    expect(sourceText.value).toContain('Product tour');
    expect(sourceText.value).toContain('Click Start to translate manually.');
    expect(sourceText.value).toContain('Export learning data from settings.');
    expect(sourceText.value).not.toContain('"steps"');
    expect(document.getElementById('documentMessage')?.textContent).toBe('guide.json loaded');
    expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'translate' }),
      expect.any(Function)
    );

    document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
    await flushPromises();
    await flushPromises();

    const blocks = document.querySelectorAll('.document-result-block');
    expect(blocks).toHaveLength(4);
    expect(document.getElementById('translationResults')?.textContent).toContain('translated: Product tour');
    expect(document.getElementById('translationResults')?.textContent).toContain('translated: Export learning data from settings.');
  });

  it('exports translated JSON files while preserving non-string structure', async () => {
    let exportedBlob: Blob | null = null;
    const createObjectURL = jest.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:translated-json';
    });
    const revokeObjectURL = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true
    });

    try {
      require('../document');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();

      const json = JSON.stringify({
        title: 'Product tour',
        steps: [
          'Open the extension popup.',
          'Click Start to translate manually.'
        ],
        metadata: {
          version: 2,
          published: true
        }
      });
      const file = new File([json], 'guide.json', { type: 'application/json' });
      Object.defineProperty(file, 'text', {
        value: async () => json,
        configurable: true
      });
      const fileInput = document.getElementById('documentFile') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true
      });

      fileInput.dispatchEvent(new Event('change'));
      await flushPromises();
      await flushPromises();

      expect((document.getElementById('exportJsonFile') as HTMLButtonElement).disabled).toBe(true);
      expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'translate' }),
        expect.any(Function)
      );

      document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect((document.getElementById('exportJsonFile') as HTMLButtonElement).disabled).toBe(false);

      document.getElementById('exportJsonFile')!.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(exportedBlob).not.toBeNull();
      await expect(readBlobText(exportedBlob!)).resolves.toEqual(JSON.stringify({
        title: 'translated: Product tour',
        steps: [
          'translated: Open the extension popup.',
          'translated: Click Start to translate manually.'
        ],
        metadata: {
          version: 2,
          published: true
        }
      }, null, 2) + '\n');
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:translated-json');
      expect(document.getElementById('documentMessage')?.textContent).toBe('Exported translated JSON with 3 string values');
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('exports translated DOCX files while preserving the document archive', async () => {
    let exportedBlob: Blob | null = null;
    const createObjectURL = jest.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:translated-docx';
    });
    const revokeObjectURL = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true
    });

    try {
      require('../document');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();

      const docxBytes = createStoredZip([
        {
          name: '[Content_Types].xml',
          content: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
        },
        {
          name: 'word/document.xml',
          content: [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
            '<w:body>',
            '<w:p><w:r><w:t>First DOCX paragraph.</w:t></w:r></w:p>',
            '<w:p><w:r><w:t>Second </w:t></w:r><w:r><w:t>paragraph &amp; details.</w:t></w:r></w:p>',
            '</w:body>',
            '</w:document>'
          ].join('')
        }
      ]);
      const file = new File([toArrayBuffer(docxBytes)], 'lesson.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => toArrayBuffer(docxBytes),
        configurable: true
      });
      const fileInput = document.getElementById('documentFile') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true
      });

      fileInput.dispatchEvent(new Event('change'));
      await flushPromises();
      await flushPromises();

      expect((document.getElementById('exportDocxFile') as HTMLButtonElement).disabled).toBe(true);
      expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'translate' }),
        expect.any(Function)
      );

      document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect((document.getElementById('exportDocxFile') as HTMLButtonElement).disabled).toBe(false);

      document.getElementById('exportDocxFile')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(exportedBlob).not.toBeNull();
      const exportedBytes = await readBlobBytes(exportedBlob!);
      const exportedBlocks = await DocumentTextExtractor.extractBlocksFromDocxBytes(exportedBytes);

      expect(exportedBlocks.map(block => block.originalText)).toEqual([
        'translated: First DOCX paragraph.',
        'translated: Second paragraph & details.'
      ]);
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:translated-docx');
      expect(document.getElementById('documentMessage')?.textContent).toBe('Exported translated DOCX with 2 paragraphs');
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('exports translated EPUB files while preserving the book archive', async () => {
    let exportedBlob: Blob | null = null;
    const createObjectURL = jest.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:translated-epub';
    });
    const revokeObjectURL = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true
    });

    try {
      require('../document');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();

      const epubBytes = createStoredZip([
        {
          name: 'mimetype',
          content: 'application/epub+zip'
        },
        {
          name: 'META-INF/container.xml',
          content: [
            '<?xml version="1.0"?>',
            '<container version="1.0">',
            '<rootfiles>',
            '<rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>',
            '</rootfiles>',
            '</container>'
          ].join('')
        },
        {
          name: 'OPS/package.opf',
          content: [
            '<package>',
            '<manifest>',
            '<item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>',
            '</manifest>',
            '<spine>',
            '<itemref idref="chapter1"/>',
            '</spine>',
            '</package>'
          ].join('')
        },
        {
          name: 'OPS/chapter1.xhtml',
          content: '<html><body><h1>Chapter One</h1><p>Open with &amp; details.</p></body></html>'
        }
      ]);
      const file = new File([toArrayBuffer(epubBytes)], 'book.epub', {
        type: 'application/epub+zip'
      });
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => toArrayBuffer(epubBytes),
        configurable: true
      });
      const fileInput = document.getElementById('documentFile') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true
      });

      fileInput.dispatchEvent(new Event('change'));
      await flushPromises();
      await flushPromises();

      expect((document.getElementById('exportEpubFile') as HTMLButtonElement).disabled).toBe(true);
      expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'translate' }),
        expect.any(Function)
      );

      document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect((document.getElementById('exportEpubFile') as HTMLButtonElement).disabled).toBe(false);

      document.getElementById('exportEpubFile')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(exportedBlob).not.toBeNull();
      const exportedBytes = await readBlobBytes(exportedBlob!);
      const exportedBlocks = await DocumentTextExtractor.extractBlocksFromEpubBytes(exportedBytes);

      expect(exportedBlocks.map(block => block.originalText)).toEqual([
        'translated: Chapter One',
        'translated: Open with & details.'
      ]);
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:translated-epub');
      expect(document.getElementById('documentMessage')?.textContent).toBe('Exported translated EPUB with 2 blocks');
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('exports translated subtitle files with the original timing preserved', async () => {
    let exportedBlob: Blob | null = null;
    const createObjectURL = jest.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:translated-subtitles';
    });
    const revokeObjectURL = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true
    });

    try {
      require('../document');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();

      const srt = [
        '1',
        '00:00:01,000 --> 00:00:03,000',
        'First caption line.',
        '',
        '2',
        '00:00:04,000 --> 00:00:06,000',
        'Second caption line.'
      ].join('\n');
      const file = new File([srt], 'lesson.srt', { type: 'application/x-subrip' });
      Object.defineProperty(file, 'text', {
        value: async () => srt,
        configurable: true
      });
      const fileInput = document.getElementById('documentFile') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true
      });

      fileInput.dispatchEvent(new Event('change'));
      await flushPromises();
      await flushPromises();

      expect((document.getElementById('exportSubtitleFile') as HTMLButtonElement).disabled).toBe(true);
      expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'translate' }),
        expect.any(Function)
      );

      document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect((document.getElementById('exportSubtitleFile') as HTMLButtonElement).disabled).toBe(false);

      document.getElementById('exportSubtitleFile')!.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(exportedBlob).not.toBeNull();
      await expect(readBlobText(exportedBlob!)).resolves.toBe([
        '1',
        '00:00:01,000 --> 00:00:03,000',
        'translated: First caption line.',
        '',
        '2',
        '00:00:04,000 --> 00:00:06,000',
        'translated: Second caption line.',
        ''
      ].join('\n'));
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:translated-subtitles');
      expect(document.getElementById('documentMessage')?.textContent).toBe('Exported 2 translated subtitle cues');
    } finally {
      clickSpy.mockRestore();
    }
  });
});
