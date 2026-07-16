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
    const openSidePanel = jest.fn().mockResolvedValue(undefined);
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
        onInstalled: { addListener: jest.fn() },
        onStartup: { addListener: jest.fn() },
        openOptionsPage: jest.fn()
      },
      commands: {
        onCommand: {
          addListener: jest.fn(listener => commandListeners.push(listener))
        }
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
  });
});
