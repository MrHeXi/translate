const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

export {};

const setupDom = (): void => {
  document.body.innerHTML = `
    <button id="toggleTranslation"></button>
    <button id="toggleVideoSubtitles"></button>
    <button id="toggleLiveCaptions"></button>
    <button id="toggleImageTranslation"></button>
    <button id="translateVisibleImages"></button>
    <button id="scanComicChapter"></button>
    <button id="translateComicChapter"></button>
    <span id="translationStatus"></span>
    <span id="videoSubtitleStatus"></span>
    <span id="liveCaptionStatus"></span>
    <span id="imageTranslationStatus"></span>
    <p id="imageTranslationMessage"></p>
    <span id="totalWords"></span>
    <span id="todayReviewed"></span>
    <span id="reviewDue"></span>
    <span id="currentStreak"></span>
    <span id="reviewAccuracy"></span>
    <span id="activeDictionarySummary"></span>
    <ul id="recentWords"></ul>
    <p id="recentWordsEmpty"></p>
  `;
};

const runtimeResponse = (message: any, callback: (response: any) => void): void => {
  if (message.action === 'getLearningStats') callback({ success: true, data: {} });
  else if (message.action === 'getSettings') callback({ success: true, data: { activeDictionaries: [] } });
  else if (message.action === 'getVocabularyList') callback({ success: true, data: [] });
  else callback({ success: true });
};

describe('popup comic chapter workflow', () => {
  beforeEach(() => {
    jest.resetModules();
    setupDom();
  });

  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('requires separate Scan and Translate clicks and never starts during popup initialization', async () => {
    const sendMessage = jest.fn((_tabId: number, message: any, callback: (response: any) => void) => {
      if (message.action === 'getTranslationStatus') {
        callback({
          success: true,
          data: {
            isImageTranslationMode: true,
            imageTranslationStatus: {
              isActive: true,
              isBatchRunning: false,
              message: 'Image translation started'
            },
            comicChapterStatus: {
              phase: 'idle',
              discoveryId: null,
              operationId: null,
              candidateCount: 0,
              processedCount: 0,
              translatedCount: 0,
              message: 'No comic chapter scanned'
            }
          }
        });
      } else if (message.action === 'discoverComicChapter') {
        callback({
          success: true,
          data: {
            phase: 'awaiting-confirmation',
            discoveryId: 'comic-chapter:discovery:1',
            operationId: null,
            candidateCount: 2,
            processedCount: 0,
            translatedCount: 0,
            limitReached: true,
            message: 'Found 2 chapter images (scan limit reached)'
          }
        });
      } else if (message.action === 'startComicChapterTranslation') {
        callback({
          success: true,
          data: {
            phase: 'completed',
            discoveryId: 'comic-chapter:discovery:1',
            operationId: null,
            candidateCount: 2,
            processedCount: 2,
            translatedCount: 2,
            message: 'Translated 2 of 2 chapter images'
          }
        });
      } else {
        callback({ success: true });
      }
    });
    (global as any).chrome = {
      runtime: {
        lastError: null,
        getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
        openOptionsPage: jest.fn(),
        sendMessage: jest.fn(runtimeResponse)
      },
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 9, url: 'https://mangadex.org/chapter/one' }]),
        create: jest.fn(),
        sendMessage
      },
      scripting: { insertCSS: jest.fn(), executeScript: jest.fn() }
    };

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect(sendMessage.mock.calls.some(([, message]) => message.action === 'discoverComicChapter')).toBe(false);
    expect(sendMessage.mock.calls.some(([, message]) => message.action === 'startComicChapterTranslation')).toBe(false);
    expect((document.getElementById('scanComicChapter') as HTMLButtonElement).disabled).toBe(false);
    expect((document.getElementById('translateComicChapter') as HTMLButtonElement).disabled).toBe(true);

    document.getElementById('scanComicChapter')!.click();
    await flushPromises();
    expect(sendMessage.mock.calls.filter(([, message]) => message.action === 'discoverComicChapter')).toHaveLength(1);
    expect(sendMessage.mock.calls.some(([, message]) => message.action === 'startComicChapterTranslation')).toBe(false);
    expect(document.getElementById('translateComicChapter')?.textContent).toBe('Translate first 2 images');

    document.getElementById('translateComicChapter')!.click();
    await flushPromises();
    expect(sendMessage).toHaveBeenCalledWith(9, {
      action: 'startComicChapterTranslation',
      data: { discoveryId: 'comic-chapter:discovery:1' }
    }, expect.any(Function));
    expect(document.getElementById('imageTranslationMessage')?.textContent)
      .toBe('Translated 2 of 2 chapter images');
  });

  it('restores a running chapter as a Stop control', async () => {
    const sendMessage = jest.fn((_tabId: number, message: any, callback: (response: any) => void) => {
      if (message.action === 'getTranslationStatus') {
        callback({
          success: true,
          data: {
            isImageTranslationMode: true,
            imageTranslationStatus: {
              isActive: true,
              isBatchRunning: true,
              operationId: 'comic-chapter:run:1',
              message: 'Translating chapter image 2 of 5'
            },
            comicChapterStatus: {
              phase: 'running',
              discoveryId: 'comic-chapter:discovery:1',
              operationId: 'comic-chapter:run:1',
              candidateCount: 5,
              processedCount: 1,
              translatedCount: 1,
              message: 'Translating chapter image 2 of 5'
            }
          }
        });
      } else if (message.action === 'stopComicChapterTranslation') {
        callback({
          success: true,
          data: {
            phase: 'idle',
            discoveryId: null,
            operationId: null,
            candidateCount: 0,
            processedCount: 0,
            translatedCount: 0,
            message: 'Comic chapter translation stopped'
          }
        });
      } else {
        callback({ success: true });
      }
    });
    (global as any).chrome = {
      runtime: {
        lastError: null,
        getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
        openOptionsPage: jest.fn(),
        sendMessage: jest.fn(runtimeResponse)
      },
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 9, url: 'https://mangadex.org/chapter/one' }]),
        create: jest.fn(),
        sendMessage
      },
      scripting: { insertCSS: jest.fn(), executeScript: jest.fn() }
    };

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const command = document.getElementById('translateComicChapter') as HTMLButtonElement;
    expect(command.textContent).toBe('Stop chapter');
    expect(command.disabled).toBe(false);
    command.click();
    await flushPromises();

    expect(sendMessage.mock.calls.filter(([, message]) => message.action === 'stopComicChapterTranslation'))
      .toHaveLength(1);
    expect(sendMessage.mock.calls.some(([, message]) => message.action === 'startComicChapterTranslation')).toBe(false);
    expect(command.textContent).toBe('Translate chapter');
  });

  it('leaves the running state when chapter startup cannot find an active tab', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const sendMessage = jest.fn((_tabId: number, message: any, callback: (response: any) => void) => {
      if (message.action === 'getTranslationStatus') {
        callback({
          success: true,
          data: {
            isImageTranslationMode: true,
            imageTranslationStatus: { isActive: true, isBatchRunning: false },
            comicChapterStatus: {
              phase: 'awaiting-confirmation',
              discoveryId: 'comic-chapter:discovery:1',
              operationId: null,
              candidateCount: 3,
              processedCount: 0,
              translatedCount: 0,
              message: 'Found 3 chapter images'
            }
          }
        });
      } else {
        callback({ success: true });
      }
    });
    let hasActiveTab = true;
    const query = jest.fn(async () => (
      hasActiveTab ? [{ id: 9, url: 'https://mangadex.org/chapter/one' }] : []
    ));
    (global as any).chrome = {
      runtime: {
        lastError: null,
        getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
        openOptionsPage: jest.fn(),
        sendMessage: jest.fn(runtimeResponse)
      },
      tabs: { query, create: jest.fn(), sendMessage },
      scripting: { insertCSS: jest.fn(), executeScript: jest.fn() }
    };

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const command = document.getElementById('translateComicChapter') as HTMLButtonElement;
    expect(command.textContent).toBe('Translate 3 images');
    hasActiveTab = false;
    command.click();
    await flushPromises();

    expect(command.textContent).toBe('Translate chapter');
    expect(command.classList.contains('active')).toBe(false);
    expect(command.disabled).toBe(true);
    expect(sendMessage.mock.calls.some(([, message]) => message.action === 'startComicChapterTranslation'))
      .toBe(false);
  });

  it('leaves the Stop state when the stop command cannot find an active tab', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const sendMessage = jest.fn((_tabId: number, message: any, callback: (response: any) => void) => {
      if (message.action === 'getTranslationStatus') {
        callback({
          success: true,
          data: {
            isImageTranslationMode: true,
            imageTranslationStatus: { isActive: true, isBatchRunning: true },
            comicChapterStatus: {
              phase: 'running',
              discoveryId: 'comic-chapter:discovery:1',
              operationId: 'comic-chapter:run:1',
              candidateCount: 3,
              processedCount: 1,
              translatedCount: 1,
              message: 'Translating chapter image 2 of 3'
            }
          }
        });
      } else {
        callback({ success: true });
      }
    });
    let hasActiveTab = true;
    const query = jest.fn(async () => (
      hasActiveTab ? [{ id: 9, url: 'https://mangadex.org/chapter/one' }] : []
    ));
    (global as any).chrome = {
      runtime: {
        lastError: null,
        getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
        openOptionsPage: jest.fn(),
        sendMessage: jest.fn(runtimeResponse)
      },
      tabs: { query, create: jest.fn(), sendMessage },
      scripting: { insertCSS: jest.fn(), executeScript: jest.fn() }
    };

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const command = document.getElementById('translateComicChapter') as HTMLButtonElement;
    expect(command.textContent).toBe('Stop chapter');
    hasActiveTab = false;
    command.click();
    await flushPromises();

    expect(command.textContent).toBe('Translate chapter');
    expect(command.classList.contains('active')).toBe(false);
    expect(command.disabled).toBe(true);
    expect(sendMessage.mock.calls.some(([, message]) => message.action === 'stopComicChapterTranslation'))
      .toBe(false);
  });
});
