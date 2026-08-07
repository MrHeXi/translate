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
    window.dispatchEvent(new Event('pagehide'));
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('requires image mode, sends the manual batch command, and shows empty and success states', async () => {
    let visibleBatchCallCount = 0;
    const sendMessage = jest.fn((_tabId: number, message: any, callback: (response?: any) => void) => {
      if (message.action === 'getTranslationStatus') {
        callback({
          success: true,
          isInitialized: true,
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

  it('keeps Stop available during a content-owned batch and ignores its late popup response', async () => {
    let batchCallback: ((response: any) => void) | null = null;
    let imageModeActive = false;
    const sendMessage = jest.fn((_tabId: number, message: any, callback: (response?: any) => void) => {
      if (message.action === 'getTranslationStatus') {
        callback({
          success: true,
          data: {
            isInitialized: true,
            isActive: false,
            isVideoSubtitleMode: false,
            isLiveCaptionMode: false,
            isImageTranslationMode: imageModeActive,
            imageTranslationStatus: {
              isActive: imageModeActive,
              isBatchRunning: false,
              operationId: null,
              processedImageCount: 0,
              totalImageCount: 0,
              message: imageModeActive ? 'Image translation active' : 'Image translation stopped'
            }
          }
        });
        return;
      }
      if (message.action === 'toggleImageTranslation') {
        imageModeActive = !imageModeActive;
        callback({
          success: true,
          data: {
            isActive: imageModeActive,
            hasImage: true,
            isBatchRunning: false,
            operationId: null,
            processedImageCount: 0,
            totalImageCount: 0,
            message: imageModeActive ? 'Image translation started' : 'Image translation stopped'
          }
        });
        return;
      }
      if (message.action === 'translateVisibleImages') {
        batchCallback = callback;
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
            callback({ success: true, data: {} });
            return;
          }
          if (message.action === 'getSettings') {
            callback({ success: true, data: { activeDictionaries: [] } });
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
        query: jest.fn().mockResolvedValue([{ id: 9, url: 'https://example.com/comic' }]),
        create: jest.fn(),
        sendMessage
      },
      scripting: { insertCSS: jest.fn(), executeScript: jest.fn() }
    };

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const toggleButton = document.getElementById('toggleImageTranslation') as HTMLButtonElement;
    const batchButton = document.getElementById('translateVisibleImages') as HTMLButtonElement;
    toggleButton.click();
    await flushPromises();
    expect(toggleButton.textContent).toBe('Stop');
    expect(batchButton.disabled).toBe(false);
    batchButton.click();
    batchButton.click();
    await flushPromises();

    expect(sendMessage.mock.calls.filter(([, message]) => message.action === 'translateVisibleImages'))
      .toHaveLength(1);
    expect(batchButton.textContent).toBe('Translating...');
    expect(batchButton.disabled).toBe(true);
    expect(toggleButton.textContent).toBe('Stop');
    expect(toggleButton.disabled).toBe(false);

    toggleButton.click();
    await flushPromises();
    expect(toggleButton.textContent).toBe('Start');
    expect(document.getElementById('imageTranslationMessage')?.textContent)
      .toBe('Image translation stopped');

    expect(batchCallback).not.toBeNull();
    (batchCallback as unknown as (response: any) => void)({
      success: true,
      data: {
        isActive: true,
        visibleImageCount: 1,
        translatedImageCount: 1,
        unreadableImageCount: 0,
        failedImageCount: 0,
        operationId: 'stale-operation',
        message: 'Translated 1 visible image'
      }
    });
    await flushPromises();

    expect(toggleButton.textContent).toBe('Start');
    expect(document.getElementById('imageTranslationMessage')?.textContent)
      .toBe('Image translation stopped');
    expect(batchButton.disabled).toBe(true);
  });

  it('restores a running content-owned image batch when the popup is reopened', async () => {
    const sendMessage = jest.fn((_tabId: number, message: any, callback: (response?: any) => void) => {
      if (message.action === 'getTranslationStatus') {
        callback({
          success: true,
          data: {
            isInitialized: true,
            isActive: false,
            isVideoSubtitleMode: false,
            isLiveCaptionMode: false,
            isImageTranslationMode: true,
            imageTranslationStatus: {
              isActive: true,
              hasImage: true,
              isBatchRunning: true,
              operationId: 'image-batch:restored:1',
              processedImageCount: 2,
              totalImageCount: 5,
              message: 'Translating image 3 of 5'
            }
          }
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
          if (message.action === 'getLearningStats') callback({ success: true, data: {} });
          else if (message.action === 'getSettings') callback({ success: true, data: { activeDictionaries: [] } });
          else if (message.action === 'getVocabularyList') callback({ success: true, data: [] });
          else callback({ success: true });
        })
      },
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 9, url: 'https://example.com/comic' }]),
        create: jest.fn(),
        sendMessage
      },
      scripting: { insertCSS: jest.fn(), executeScript: jest.fn() }
    };

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect(document.getElementById('imageTranslationStatus')?.textContent).toBe('On');
    expect(document.getElementById('toggleImageTranslation')?.textContent).toBe('Stop');
    expect(document.getElementById('imageTranslationMessage')?.textContent)
      .toBe('Translating image 3 of 5');
    expect((document.getElementById('translateVisibleImages') as HTMLButtonElement).textContent)
      .toBe('Translating...');
    expect((document.getElementById('translateVisibleImages') as HTMLButtonElement).disabled).toBe(true);
    window.dispatchEvent(new Event('pagehide'));
  });
});
