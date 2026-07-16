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
    <button id="exportVideoSubtitles"></button>
    <button id="toggleLiveCaptions"></button>
    <button id="toggleImageTranslation"></button>
    <button id="translateVisibleImages" disabled></button>
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
    <p id="imageTranslationMessage"></p>
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
  `;
};

describe('popup visible image translation', () => {
  beforeEach(() => {
    jest.resetModules();
    setupPopupDom();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('requires image mode, sends the manual batch command, and shows empty and success states', async () => {
    let visibleBatchCallCount = 0;
    const sendMessage = jest.fn((_tabId: number, message: any, callback: (response?: any) => void) => {
      if (message.action === 'getTranslationStatus') {
        callback({
          success: true,
          isActive: false,
          isVideoSubtitleMode: false,
          isLiveCaptionMode: false,
          isImageTranslationMode: false
        });
        return;
      }

      if (message.action === 'toggleImageTranslation') {
        callback({
          success: true,
          isActive: true,
          hasImage: true,
          message: 'Image translation started'
        });
        return;
      }

      if (message.action === 'translateVisibleImages') {
        visibleBatchCallCount += 1;
        callback(visibleBatchCallCount === 1
          ? {
            success: true,
            isActive: true,
            visibleImageCount: 0,
            translatedImageCount: 0,
            unreadableImageCount: 0,
            failedImageCount: 0,
            message: 'No visible images found'
          }
          : {
            success: true,
            isActive: true,
            visibleImageCount: 2,
            translatedImageCount: 2,
            unreadableImageCount: 0,
            failedImageCount: 0,
            message: 'Translated 2 visible images'
          });
        return;
      }

      callback({ success: true });
    });

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
            callback({ success: true, data: { activeDictionaries: ['gre'] } });
            return;
          }

          if (message.action === 'getVocabularyList') {
            callback({ success: true, data: [] });
            return;
          }

          callback({ success: true });
        })
      },
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 9, url: 'https://example.com/images' }]),
        create: jest.fn(),
        sendMessage
      },
      scripting: {
        insertCSS: jest.fn(),
        executeScript: jest.fn()
      }
    };

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const batchButton = document.getElementById('translateVisibleImages') as HTMLButtonElement;
    expect(batchButton.disabled).toBe(true);
    batchButton.click();
    expect(sendMessage).not.toHaveBeenCalledWith(9, { action: 'translateVisibleImages' }, expect.any(Function));

    document.getElementById('toggleImageTranslation')!.click();
    await flushPromises();

    expect(batchButton.disabled).toBe(false);
    expect(document.getElementById('imageTranslationMessage')?.textContent).toBe('Image translation started');

    batchButton.click();
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(9, { action: 'translateVisibleImages' }, expect.any(Function));
    expect(document.getElementById('imageTranslationMessage')?.textContent).toBe('No visible images found');

    batchButton.click();
    await flushPromises();

    expect(document.getElementById('imageTranslationMessage')?.textContent).toBe('Translated 2 visible images');
    expect(batchButton.textContent).toBe('Translate visible images');
    expect(batchButton.disabled).toBe(false);
  });
});
