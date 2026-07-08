const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

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
    <button id="clearDocument"></button>
    <textarea id="sourceText"></textarea>
    <p id="documentMessage"></p>
    <div id="progressBar"></div>
    <span id="progressText"></span>
    <section id="translationResults"></section>
  `;
};

describe('document translator HTML files', () => {
  beforeEach(() => {
    jest.resetModules();
    setupDocumentDom();
    window.history.replaceState({}, '', '/document.html');

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

  it('loads HTML files as readable document text without auto-translating', async () => {
    require('../document');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const html = [
      '<!doctype html>',
      '<html>',
      '<head><script>Hidden script text</script></head>',
      '<body>',
      '<main>',
      '<h1>HTML guide</h1>',
      '<p>Translate this paragraph.</p>',
      '<ul><li>First list item.</li><li>Second list item.</li></ul>',
      '</main>',
      '</body>',
      '</html>'
    ].join('');
    const file = new File([html], 'guide.html', { type: 'text/html' });
    Object.defineProperty(file, 'text', {
      value: async () => html,
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
    expect(sourceText.value).toContain('HTML guide');
    expect(sourceText.value).toContain('Translate this paragraph.');
    expect(sourceText.value).toContain('First list item.');
    expect(sourceText.value).not.toContain('Hidden script text');
    expect(sourceText.value).not.toContain('<p>');
    expect(document.getElementById('documentMessage')?.textContent).toBe('guide.html loaded');
    expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'translate' }),
      expect.any(Function)
    );

    document.getElementById('translateDocument')!.dispatchEvent(new Event('click'));
    await flushPromises();
    await flushPromises();

    const blocks = document.querySelectorAll('.document-result-block');
    expect(blocks).toHaveLength(4);
    expect(document.getElementById('translationResults')?.textContent).toContain('translated: HTML guide');
    expect(document.getElementById('translationResults')?.textContent).toContain('translated: Second list item.');
  });
});
