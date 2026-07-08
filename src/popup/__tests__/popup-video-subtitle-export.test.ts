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
  `;
};

const installChromeMock = (exportResponse: any): jest.Mock => {
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

    if (message.action === 'exportVideoSubtitles') {
      callback(exportResponse);
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
      query: jest.fn().mockResolvedValue([{ id: 7, url: 'https://example.com/video' }]),
      create: jest.fn(),
      sendMessage
    },
    scripting: {
      insertCSS: jest.fn(),
      executeScript: jest.fn()
    }
  };

  return sendMessage;
};

describe('popup video subtitle export', () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    setupPopupDom();
    createObjectURL = jest.fn(() => 'blob:lexibridge-subtitles');
    revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true
    });
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clickSpy.mockRestore();
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('downloads translated video subtitles as an SRT file', async () => {
    const sendMessage = installChromeMock({
      success: true,
      cueCount: 1,
      filename: 'sample-lexibridge.srt',
      content: '1\n00:00:01,000 --> 00:00:02,000\nHello\n你好',
      message: 'Exported 1 subtitle cues'
    });

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    document.getElementById('exportVideoSubtitles')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(
      7,
      { action: 'exportVideoSubtitles' },
      expect.any(Function)
    );
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lexibridge-subtitles');
    expect(document.getElementById('exportVideoSubtitles')?.textContent).toBe('Export SRT');
  });

  it('does not create a download when there are no translated subtitles', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    installChromeMock({
      success: true,
      cueCount: 0,
      filename: 'empty-lexibridge.srt',
      content: '',
      message: 'No translated subtitles to export yet'
    });

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    document.getElementById('exportVideoSubtitles')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.error-message')?.textContent).toBe('No translated subtitles to export yet');
    errorSpy.mockRestore();
  });
});
