const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

export {};

const setupPopupDom = (): void => {
  document.body.innerHTML = `
    <button id="toggleTranslation"></button>
    <button id="toggleVideoSubtitles"></button>
    <button id="openSubtitleGenerator"></button>
    <button id="toggleLiveCaptions"></button>
    <button id="toggleImageTranslation"></button>
    <button id="translateBtn"></button>
    <button id="vocabularyBtn"></button>
    <button id="reviewBtn"></button>
    <button id="documentTranslatorBtn"></button>
    <button id="settingsBtn"></button>
    <button id="optionsBtn"></button>
    <span id="translationStatus"></span>
    <span id="videoSubtitleStatus"></span>
    <span id="liveCaptionStatus"></span>
    <span id="imageTranslationStatus"></span>
    <textarea id="inputText"></textarea>
    <div id="translateResult"><div class="result-text"></div></div>
    <span id="totalWords"></span>
    <span id="todayReviewed"></span>
    <span id="reviewDue"></span>
    <span id="currentStreak"></span>
    <span id="reviewAccuracy"></span>
    <span id="activeDictionarySummary"></span>
    <ul id="recentWords"></ul>
    <p id="recentWordsEmpty"></p>
    <label class="dictionary-item"><input type="checkbox" value="gre"></label>
    <label class="dictionary-item"><input type="checkbox" value="toefl"></label>
  `;
};

describe('Popup current tab state', () => {
  beforeEach(() => {
    jest.resetModules();
    setupPopupDom();

    (global as any).chrome = {
      runtime: {
        lastError: null,
        getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
        openOptionsPage: jest.fn(),
        sendMessage: jest.fn((message: any, callback: (response: any) => void) => {
          if (message.action === 'getLearningStats') {
            callback({
              success: true,
              data: {
                totalWordsLearned: 0,
                todayReviewedCount: 0,
                reviewDueCount: 0,
                currentStreak: 0,
                reviewAccuracy: 0
              }
            });
            return;
          }

          if (message.action === 'getSettings') {
            callback({
              success: true,
              data: { activeDictionaries: ['gre'] }
            });
            return;
          }

          if (message.action === 'getVocabularyList') {
            callback({
              success: true,
              data: [
                {
                  word: 'ability',
                  translation: 'capacity to do something',
                  addedDate: new Date('2026-07-05T10:00:00.000Z').toISOString()
                },
                {
                  word: 'bridge',
                  translation: 'connect',
                  addedDate: new Date('2026-07-04T10:00:00.000Z').toISOString()
                }
              ]
            });
            return;
          }

          callback({ success: true });
        })
      },
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
        create: jest.fn(),
        sendMessage: jest.fn((_tabId: number, _message: any, callback: (response?: any) => void) => {
          (global as any).chrome.runtime.lastError = {
            message: 'Could not establish connection. Receiving end does not exist.'
          };
          callback();
          (global as any).chrome.runtime.lastError = null;
        })
      },
      scripting: {
        insertCSS: jest.fn(),
        executeScript: jest.fn()
      }
    };
  });

  it('treats a missing content-script receiver as inactive without logging a popup error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect(console.error).not.toHaveBeenCalledWith(
      'Could not load current state:',
      expect.any(Error)
    );
    expect(document.getElementById('translationStatus')?.textContent).toBe('Off');
    expect(document.getElementById('toggleTranslation')?.textContent).toBe('Start');
    expect(document.getElementById('toggleTranslation')?.classList.contains('active')).toBe(false);
    expect(document.getElementById('videoSubtitleStatus')?.textContent).toBe('Off');
    expect(document.getElementById('toggleVideoSubtitles')?.textContent).toBe('Start');
    expect(document.getElementById('toggleVideoSubtitles')?.classList.contains('active')).toBe(false);
    expect(document.getElementById('liveCaptionStatus')?.textContent).toBe('Off');
    expect(document.getElementById('toggleLiveCaptions')?.textContent).toBe('Start');
    expect(document.getElementById('toggleLiveCaptions')?.classList.contains('active')).toBe(false);
    expect(document.getElementById('imageTranslationStatus')?.textContent).toBe('Off');
    expect(document.getElementById('toggleImageTranslation')?.textContent).toBe('Start');
    expect(document.getElementById('toggleImageTranslation')?.classList.contains('active')).toBe(false);
    expect(document.getElementById('activeDictionarySummary')?.textContent).toBe('1 enabled');
    expect(document.querySelectorAll('#recentWords li')).toHaveLength(2);
    expect(document.getElementById('recentWords')?.textContent).toContain('ability');
    expect(document.getElementById('recentWords')?.textContent).toContain('capacity to do something');
    expect(document.getElementById('recentWordsEmpty')?.style.display).toBe('none');

    errorSpy.mockRestore();
  });

  it.each([
    ['JSON', 'locale.json'],
    ['DOCX', 'handbook.docx'],
    ['EPUB', 'book.epub']
  ])('passes %s document URLs through to the document translator', async (_label, fileName) => {
    (global as any).chrome.tabs.query = jest.fn().mockResolvedValue([
      { id: 1, url: `https://example.com/${fileName}?download=1` }
    ]);

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    document.getElementById('documentTranslatorBtn')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect((global as any).chrome.tabs.create).toHaveBeenCalledWith({
      url: `chrome-extension://test/document.html?sourceUrl=https%3A%2F%2Fexample.com%2F${encodeURIComponent(fileName)}%3Fdownload%3D1`
    });
  });

  it('opens the local media subtitle generator only after its popup button is clicked', async () => {
    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect((global as any).chrome.tabs.create).not.toHaveBeenCalled();

    document.getElementById('openSubtitleGenerator')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect((global as any).chrome.runtime.getURL).toHaveBeenCalledWith('subtitles.html');
    expect((global as any).chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/subtitles.html?sourceTabId=1'
    });
  });
});
