const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

const setupPopupDom = (): void => {
  document.body.innerHTML = `
    <button id="toggleTranslation"></button>
    <button id="translateBtn"></button>
    <button id="vocabularyBtn"></button>
    <button id="reviewBtn"></button>
    <button id="settingsBtn"></button>
    <button id="optionsBtn"></button>
    <span id="translationStatus"></span>
    <textarea id="inputText"></textarea>
    <div id="translateResult"><div class="result-text"></div></div>
    <span id="totalWords"></span>
    <span id="todayReviewed"></span>
    <span id="reviewDue"></span>
    <span id="currentStreak"></span>
    <span id="reviewAccuracy"></span>
    <label class="dictionary-item"><input type="checkbox" value="gre"></label>
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

    errorSpy.mockRestore();
  });
});
