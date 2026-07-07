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
});
