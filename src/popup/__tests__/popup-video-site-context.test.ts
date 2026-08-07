const flushPromises = async (): Promise<void> => {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  for (let index = 0; index < 4; index++) {
    await Promise.resolve();
  }
};

export {};

interface ChromeMockOptions {
  tab?: Pick<chrome.tabs.Tab, 'id' | 'url' | 'title'>;
  videoSubtitleStatus?: Record<string, unknown>;
  handleTabMessage?: (
    message: any,
    callback: (response?: any) => void
  ) => boolean;
}

const setupPopupDom = (): void => {
  document.body.innerHTML = `
    <button id="toggleTranslation"></button>
    <button id="toggleVideoSubtitles"></button>
    <button id="exportVideoSubtitles"></button>
    <button id="openSubtitleGenerator">Generate from media</button>
    <button id="toggleLiveCaptions"></button>
    <button id="exportLiveCaptionTranscript"></button>
    <button id="clearLiveCaptionTranscript"></button>
    <button id="toggleImageTranslation"></button>
    <button id="translateVisibleImages"></button>
    <button id="translateBtn"></button>
    <button id="vocabularyBtn"></button>
    <button id="reviewBtn"></button>
    <button id="documentTranslatorBtn"></button>
    <button id="openSidePanelBtn"></button>
    <button id="settingsBtn"></button>
    <button id="optionsBtn"></button>
    <span id="translationStatus"></span>
    <span id="videoSubtitleStatus"></span>
    <p id="videoSubtitleContextStatus"></p>
    <span id="liveCaptionStatus"></span>
    <span id="liveCaptionTranscriptStatus"></span>
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

const installChromeMock = (options: ChromeMockOptions = {}) => {
  const tab = options.tab || {
    id: 17,
    url: 'https://example.com/video',
    title: 'Example video'
  };
  const tabMessages: string[] = [];
  const sendMessage = jest.fn((_tabId: number, message: any, callback: (response?: any) => void) => {
    tabMessages.push(message.action);
    if (options.handleTabMessage?.(message, callback)) return;

    if (message.action === 'getTranslationStatus') {
      callback({
        success: true,
        data: {
          isActive: false,
          isVideoSubtitleMode: false,
          isLiveCaptionMode: false,
          isImageTranslationMode: false,
          videoSubtitleStatus: options.videoSubtitleStatus
        }
      });
      return;
    }

    if (message.action === 'getLiveCaptionTranscriptStatus') {
      callback({ success: true, cueCount: 0 });
      return;
    }

    callback({ success: true, isActive: true });
  });

  const chromeMock = {
    runtime: {
      lastError: null as { message: string } | null,
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
      query: jest.fn().mockResolvedValue([tab]),
      create: jest.fn(),
      sendMessage
    },
    tabCapture: {
      getMediaStreamId: jest.fn()
    },
    scripting: {
      insertCSS: jest.fn().mockResolvedValue(undefined),
      executeScript: jest.fn().mockResolvedValue(undefined)
    }
  };

  (global as any).chrome = chromeMock;
  return { chromeMock, sendMessage, tabMessages };
};

describe('popup video site context and explicit actions', () => {
  beforeEach(() => {
    setupPopupDom();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('loads current state without toggling, capturing, or opening the generator', async () => {
    const { chromeMock, tabMessages } = installChromeMock();

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect(tabMessages).toEqual([
      'getTranslationStatus',
      'getLiveCaptionTranscriptStatus'
    ]);
    expect(tabMessages).not.toContain('toggleVideoSubtitleTranslation');
    expect(chromeMock.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      url: 'https://www.youtube.com/watch?v=watch-123',
      pageType: 'standard',
      label: 'Generate for this YouTube video'
    },
    {
      url: 'https://www.youtube.com/live/live-123',
      pageType: 'live',
      label: 'Generate for this YouTube live'
    },
    {
      url: 'https://www.youtube.com/shorts/short-123',
      pageType: 'shorts',
      label: 'Generate for this YouTube short'
    }
  ])('shows and opens the explicit YouTube $pageType generator entry', async ({ url, pageType, label }) => {
    const longTitle = `  ${'A'.repeat(180)}   YouTube  `;
    const { chromeMock } = installChromeMock({
      tab: { id: 23, url, title: longTitle }
    });

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const button = document.getElementById('openSubtitleGenerator') as HTMLButtonElement;
    expect(button.textContent).toBe(label);
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.tabCapture.getMediaStreamId).not.toHaveBeenCalled();

    button.click();
    await flushPromises();

    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
    const createdUrl = new URL(chromeMock.tabs.create.mock.calls[0][0].url);
    expect(createdUrl.pathname).toBe('/subtitles.html');
    expect(createdUrl.searchParams.get('sourceTabId')).toBe('23');
    expect(createdUrl.searchParams.get('sourceSite')).toBe('YouTube');
    expect(createdUrl.searchParams.get('sourcePageType')).toBe(pageType);
    expect(Array.from(createdUrl.searchParams.get('sourceTitle') || '')).toHaveLength(160);
    expect(chromeMock.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
  });

  it('renders the content-reported adapter and caption-track status', async () => {
    const { chromeMock } = installChromeMock({
      tab: {
        id: 29,
        url: 'https://www.youtube.com/watch?v=status-123',
        title: 'Status test'
      },
      videoSubtitleStatus: {
        adapterId: 'youtube',
        adapterVersion: 3,
        siteLabel: 'YouTube',
        pageType: 'live',
        hasTrack: true
      }
    });

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect(document.getElementById('videoSubtitleContextStatus')?.textContent)
      .toBe('YouTube / Live / adapter v3 / track available');
    const generatorButton = document.getElementById('openSubtitleGenerator') as HTMLButtonElement;
    expect(generatorButton.textContent).toBe('Generate for this YouTube live');

    generatorButton.click();
    await flushPromises();

    const generatedUrl = new URL(chromeMock.tabs.create.mock.calls[0][0].url);
    expect(generatedUrl.searchParams.get('sourcePageType')).toBe('live');
  });

  it('does not inject content.js for a non-receiver messaging error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { chromeMock } = installChromeMock({
      handleTabMessage: (message, callback) => {
        if (message.action !== 'toggleVideoSubtitleTranslation') return false;
        chromeMock.runtime.lastError = { message: 'The message port closed before a response was received.' };
        callback();
        chromeMock.runtime.lastError = null;
        return true;
      }
    });

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    document.getElementById('toggleVideoSubtitles')!.click();
    await flushPromises();

    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
    expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
    expect(document.querySelector('.error-message')?.textContent)
      .toBe('The message port closed before a response was received.');
    errorSpy.mockRestore();
  });

  it('injects once for a missing receiver, waits, and retries the toggle once', async () => {
    let toggleAttempts = 0;
    const { chromeMock, sendMessage } = installChromeMock({
      handleTabMessage: (message, callback) => {
        if (message.action !== 'toggleVideoSubtitleTranslation') return false;
        toggleAttempts += 1;
        if (toggleAttempts === 1) {
          chromeMock.runtime.lastError = {
            message: 'Could not establish connection. Receiving end does not exist.'
          };
          callback();
          chromeMock.runtime.lastError = null;
        } else {
          callback({ success: true, isActive: true });
        }
        return true;
      }
    });

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const button = document.getElementById('toggleVideoSubtitles') as HTMLButtonElement;
    button.click();
    button.click();
    await flushPromises();

    expect(chromeMock.scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 17 },
      files: ['content.js']
    });
    expect(toggleAttempts).toBe(2);
    expect(sendMessage.mock.calls.filter(([, message]) => (
      message.action === 'toggleVideoSubtitleTranslation'
    ))).toHaveLength(2);
    expect(button.textContent).toBe('Stop');
  });

  it('coalesces repeated video toggle clicks while the first request is pending', async () => {
    let pendingToggleCallback: ((response?: any) => void) | null = null;
    let toggleAttempts = 0;
    const { chromeMock } = installChromeMock({
      handleTabMessage: (message, callback) => {
        if (message.action !== 'toggleVideoSubtitleTranslation') return false;
        toggleAttempts += 1;
        pendingToggleCallback = callback;
        return true;
      }
    });

    require('../popup');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const button = document.getElementById('toggleVideoSubtitles') as HTMLButtonElement;
    button.click();
    button.click();
    await Promise.resolve();

    expect(toggleAttempts).toBe(1);
    expect(button.disabled).toBe(true);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();

    const resolvePendingToggle = pendingToggleCallback as ((response?: any) => void) | null;
    expect(resolvePendingToggle).not.toBeNull();
    resolvePendingToggle?.({ success: true, isActive: true });
    await flushPromises();

    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Stop');
  });
});
