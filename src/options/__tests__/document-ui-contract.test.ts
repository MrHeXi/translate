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

export {};

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
    <input id="documentFile" type="file">
    <button id="translateDocument"></button>
    <button id="exportSubtitleFile" disabled></button>
    <button id="exportJsonFile" disabled></button>
    <button id="clearDocument"></button>
    <textarea id="sourceText"></textarea>
    <p id="documentMessage"></p>
    <div id="progressBar"></div>
    <span id="progressText"></span>
    <section id="translationResults"></section>
  `;
};

describe('document translator page', () => {
  beforeEach(() => {
    jest.resetModules();
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
                pageTranslationDisplayMode: 'bilingual'
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
    expect(document.getElementById('documentMessage')?.textContent).toBe('layout.pdf loaded with PDF layout blocks');

    document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
    await flushPromises();
    await flushPromises();

    const blocks = document.querySelectorAll('.document-result-block--layout');
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as HTMLElement).dataset['page']).toBe('1');
    expect(blocks[0].querySelector('.block-index')?.textContent).toContain('Page 1 · Block 1 · x 72 · y 720');
    expect(document.getElementById('translationResults')?.textContent).toContain('translated: PDF heading');
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
