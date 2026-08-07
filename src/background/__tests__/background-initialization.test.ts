export {};

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const flushPromises = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('BackgroundService initialization', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useRealTimers();
  });

  it('registers its main message listener before async initialization completes', async () => {
    const listeners: Array<(
      request: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: any) => void
    ) => boolean | void> = [];
    const commandListeners: Array<(command: string) => void> = [];
    const installedListeners: Array<(details: chrome.runtime.InstalledDetails) => void> = [];
    const contextMenuListeners: Array<(
      info: chrome.contextMenus.OnClickData,
      tab?: chrome.tabs.Tab
    ) => void> = [];
    const openSidePanel = jest.fn().mockResolvedValue(undefined);
    const createContextMenu = jest.fn((_properties, callback?: () => void) => callback?.());
    const removeContextMenu = jest.fn((_id, callback?: () => void) => callback?.());
    let readinessCheckCount = 0;
    const sendTabMessage = jest.fn((_tabId, message, _options, callback?: (response: any) => void) => {
      if (message.action === 'getTranslationStatus') {
        readinessCheckCount += 1;
        callback?.(readinessCheckCount === 1
          ? undefined
          : { success: true, data: { isInitialized: true } });
        return;
      }
      callback?.({ success: true });
    });
    const executeScript = jest.fn().mockResolvedValue([]);
    const vocabularyLoad = createDeferred<void>();
    const reviewItems = [{
      word: 'ability',
      translation: '能力',
      context: 'ability example.',
      sourceUrl: 'built-in:cet4',
      addedDate: new Date(),
      reviewCount: 0,
      masteryLevel: 0,
      nextReviewDate: new Date()
    }];

    (global as any).chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn((listener) => {
            listeners.push(listener);
          })
        },
        onConnect: { addListener: jest.fn() },
        onInstalled: {
          addListener: jest.fn(listener => installedListeners.push(listener))
        },
        onStartup: { addListener: jest.fn() },
        openOptionsPage: jest.fn()
      },
      commands: {
        onCommand: {
          addListener: jest.fn(listener => commandListeners.push(listener))
        }
      },
      contextMenus: {
        create: createContextMenu,
        remove: removeContextMenu,
        onClicked: {
          addListener: jest.fn(listener => contextMenuListeners.push(listener))
        }
      },
      tabs: {
        sendMessage: sendTabMessage
      },
      scripting: {
        executeScript
      },
      sidePanel: { open: openSidePanel },
      windows: { WINDOW_ID_CURRENT: -2 },
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(undefined)
        },
        sync: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(undefined)
        },
        onChanged: { addListener: jest.fn() }
      }
    };

    const mockDictionaryType = {
      GRE: 'gre',
      TOEFL: 'toefl',
      IELTS: 'ielts',
      CET4: 'cet4',
      CET6: 'cet6'
    };
    const mockDictionaryManager = {
      loadBuiltInDictionary: jest.fn().mockResolvedValue({ words: [], totalCount: 0 })
    };
    const mockLearningMode = {
      loadVocabulary: jest.fn().mockReturnValue(vocabularyLoad.promise)
    };
    const mockReviewService = {
      getReviewItems: jest.fn().mockResolvedValue(reviewItems),
      getDueReviewCount: jest.fn().mockResolvedValue(0),
      saveReviewResults: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('../../services/TranslationService', () => ({
      TranslationService: jest.fn().mockImplementation(() => ({}))
    }));
    jest.doMock('../../services/DictionaryManager', () => ({
      DictionaryType: mockDictionaryType,
      DictionaryManager: jest.fn().mockImplementation(() => mockDictionaryManager)
    }));
    jest.doMock('../../services/LearningMode', () => ({
      LearningMode: jest.fn().mockImplementation(() => mockLearningMode)
    }));
    jest.doMock('../../services/StorageManager', () => ({
      StorageManager: jest.fn().mockImplementation(() => ({}))
    }));
    jest.doMock('../../services/ReviewService', () => ({
      ReviewService: jest.fn().mockImplementation(() => mockReviewService)
    }));
    jest.doMock('../../services/PerformanceManager', () => ({
      performanceManager: {
        startMonitoring: jest.fn(),
        updateConfig: jest.fn(),
        recordRequest: jest.fn(),
        getMetrics: jest.fn(),
        getPerformanceReport: jest.fn()
      }
    }));
    jest.doMock('../../services/ErrorHandler', () => ({
      ErrorType: {
        INITIALIZATION_ERROR: 'initialization',
        TRANSLATION_API_ERROR: 'translation',
        STORAGE_ERROR: 'storage',
        NETWORK_ERROR: 'network'
      },
      ErrorSeverity: {
        CRITICAL: 'critical',
        MEDIUM: 'medium'
      },
      errorHandler: {
        logError: jest.fn(),
        onError: jest.fn(),
        registerRecoveryStrategy: jest.fn(),
        handleWithRetry: jest.fn()
      }
    }));
    jest.doMock('../../services/OfflineManager', () => ({
      offlineManager: {
        isNetworkOnline: jest.fn().mockReturnValue(true),
        syncWhenOnline: jest.fn(),
        showOfflineNotification: jest.fn()
      }
    }));

    require('../background');

    expect(removeContextMenu).not.toHaveBeenCalled();
    expect(createContextMenu).not.toHaveBeenCalled();
    expect(installedListeners).toHaveLength(1);
    installedListeners[0]!({ reason: 'update' } as chrome.runtime.InstalledDetails);
    expect(removeContextMenu).toHaveBeenCalledWith('lexibridge-translate-image', expect.any(Function));
    expect(createContextMenu).toHaveBeenCalledWith({
      id: 'lexibridge-translate-image',
      title: 'Translate text in this image',
      contexts: ['image'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    }, expect.any(Function));
    expect(sendTabMessage).not.toHaveBeenCalled();

    const mainListener = listeners[0];
    expect(mainListener).toBeDefined();

    const sendResponse = jest.fn();
    const keepChannelOpen = mainListener!(
      { action: 'getReviewItems', data: { type: 'new', count: 1 } },
      {},
      sendResponse
    );

    await flushPromises();
    expect(keepChannelOpen).toBe(true);
    expect(sendResponse).not.toHaveBeenCalled();

    vocabularyLoad.resolve();
    await flushPromises();
    await flushPromises();

    expect(mockReviewService.getReviewItems).toHaveBeenCalledWith({
      type: 'new',
      count: 1,
      word: undefined
    });
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: reviewItems
    });

    const settingsResponse = jest.fn();
    mainListener!(
      { action: 'openSettings' },
      {},
      settingsResponse
    );

    await flushPromises();

    expect((global as any).chrome.runtime.openOptionsPage).toHaveBeenCalled();
    expect(settingsResponse).toHaveBeenCalledWith({ success: true });

    expect(commandListeners).toHaveLength(1);
    commandListeners[0]!('openTranslationSidePanel');
    await flushPromises();
    expect(openSidePanel).toHaveBeenCalledWith({ windowId: -2 });

    expect(contextMenuListeners).toHaveLength(1);
    contextMenuListeners[0]!({
      menuItemId: 'lexibridge-translate-image',
      frameId: 7,
      srcUrl: 'https://example.com/comic.png'
    } as chrome.contextMenus.OnClickData, { id: 42 } as chrome.tabs.Tab);
    contextMenuListeners[0]!({
      menuItemId: 'lexibridge-translate-image',
      frameId: 7,
      srcUrl: 'https://example.com/comic.png'
    } as chrome.contextMenus.OnClickData, { id: 42 } as chrome.tabs.Tab);
    await flushPromises();
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 42, frameIds: [7] },
      files: ['content.js']
    });
    expect(sendTabMessage).toHaveBeenCalledTimes(3);
    expect(sendTabMessage).toHaveBeenNthCalledWith(1, 42, {
      action: 'getTranslationStatus'
    }, { frameId: 7 }, expect.any(Function));
    expect(sendTabMessage).toHaveBeenCalledWith(42, {
      action: 'translateImageFromContextMenu',
      data: { srcUrl: 'https://example.com/comic.png' }
    }, { frameId: 7 }, expect.any(Function));
  });
});
