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
    <select id="liveCaptionExportFormat">
      <option value="txt">TXT</option>
      <option value="srt">SRT</option>
      <option value="vtt">VTT</option>
      <option value="json">JSON</option>
    </select>
    <button id="exportLiveCaptionTranscript" disabled></button>
    <button id="clearLiveCaptionTranscript" disabled></button>
    <span id="liveCaptionTranscriptStatus"></span>
    <button id="toggleImageTranslation"></button>
    <button id="translateVisibleImages" disabled></button>
    <p id="imageTranslationMessage"></p>
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

describe('popup live caption transcript', () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    setupPopupDom();
    createObjectURL = jest.fn(() => 'blob:live-caption-transcript');
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

  it('loads cue state, exports the selected format, and clears the page session', async () => {
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

      if (message.action === 'getLiveCaptionTranscriptStatus') {
        callback({
          success: true,
          isActive: false,
          cueCount: 2,
          sessionStartedAt: '2026-07-16T08:00:00.000Z',
          message: '2 live caption cues captured'
        });
        return;
      }

      if (message.action === 'exportLiveCaptionTranscript') {
        callback({
          success: true,
          format: 'srt',
          cueCount: 2,
          filename: 'weekly-sync-lexibridge-live-captions.srt',
          content: '1\n00:00:00,000 --> 00:00:01,500\nMina: Hello\nMina: 你好\n',
          message: 'Exported 2 live caption cues'
        });
        return;
      }

      if (message.action === 'clearLiveCaptionTranscript') {
        callback({
          success: true,
          isActive: false,
          cueCount: 0,
          sessionStartedAt: null,
          message: 'Live caption transcript cleared'
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
        query: jest.fn().mockResolvedValue([{ id: 11, url: 'https://meet.example.com/room' }]),
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

    const format = document.getElementById('liveCaptionExportFormat') as HTMLSelectElement;
    const exportButton = document.getElementById('exportLiveCaptionTranscript') as HTMLButtonElement;
    const clearButton = document.getElementById('clearLiveCaptionTranscript') as HTMLButtonElement;

    expect(document.getElementById('liveCaptionTranscriptStatus')?.textContent).toBe('2 cues captured');
    expect(exportButton.disabled).toBe(false);
    expect(clearButton.disabled).toBe(false);

    format.value = 'srt';
    exportButton.click();
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(
      11,
      { action: 'exportLiveCaptionTranscript', data: { format: 'srt' } },
      expect.any(Function)
    );
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/x-subrip;charset=utf-8' }));
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:live-caption-transcript');
    expect(document.getElementById('liveCaptionTranscriptStatus')?.textContent).toBe('Exported 2 live caption cues');

    clearButton.click();
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(11, { action: 'clearLiveCaptionTranscript' }, expect.any(Function));
    expect(document.getElementById('liveCaptionTranscriptStatus')?.textContent).toBe('Live caption transcript cleared');
    expect(exportButton.disabled).toBe(true);
    expect(clearButton.disabled).toBe(true);
  });
});
