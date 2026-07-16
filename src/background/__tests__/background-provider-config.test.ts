export {};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('BackgroundService provider configuration messages', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('injects local credentials into translation and only returns masked configuration summaries', async () => {
    const listeners: Array<(
      request: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: any) => void
    ) => boolean | void> = [];
    const providerConfig = {
      apiKey: 'server-side-secret',
      endpoint: 'https://gateway.example.com/v1/chat/completions',
      model: 'translation-model'
    };
    const providerSummary = {
      providerId: 'openai',
      configured: true,
      apiKeyHint: 'serv...cret',
      endpoint: providerConfig.endpoint,
      model: providerConfig.model,
      region: ''
    };
    const translationResult = {
      originalText: 'Hello',
      translatedText: 'Bonjour',
      sourceLang: 'en',
      targetLang: 'fr',
      confidence: 0.9,
      alternatives: []
    };

    const mockTranslationService = {
      translate: jest.fn().mockResolvedValue(translationResult),
      clearCache: jest.fn(),
      cleanExpiredCache: jest.fn(),
      getCacheSize: jest.fn().mockReturnValue(0)
    };
    const mockDictionaryManager = {
      loadBuiltInDictionary: jest.fn().mockResolvedValue({ words: [], totalCount: 0 }),
      clearWordCache: jest.fn()
    };
    const mockLearningMode = {
      loadVocabulary: jest.fn().mockResolvedValue(undefined)
    };
    const mockStorageManager = {
      getTranslationProviderConfig: jest.fn().mockResolvedValue(providerConfig),
      getTranslationProviderConfigSummaries: jest.fn().mockResolvedValue([providerSummary]),
      saveTranslationProviderConfig: jest.fn().mockResolvedValue(providerSummary),
      removeTranslationProviderConfig: jest.fn().mockResolvedValue(undefined)
    };
    const mockReviewService = {};
    const mockPerformanceManager = {
      startMonitoring: jest.fn(),
      updateConfig: jest.fn(),
      recordRequest: jest.fn(),
      getMetrics: jest.fn(),
      getPerformanceReport: jest.fn()
    };
    const mockErrorHandler = {
      logError: jest.fn(),
      onError: jest.fn(),
      registerRecoveryStrategy: jest.fn(),
      handleWithRetry: jest.fn()
    };

    (global as any).chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn((listener) => listeners.push(listener))
        },
        onConnect: { addListener: jest.fn() },
        onInstalled: { addListener: jest.fn() },
        onStartup: { addListener: jest.fn() },
        openOptionsPage: jest.fn()
      }
    };

    jest.doMock('../../services/TranslationService', () => ({
      TranslationService: jest.fn().mockImplementation(() => mockTranslationService)
    }));
    jest.doMock('../../services/DictionaryManager', () => ({
      DictionaryType: {
        GRE: 'gre',
        TOEFL: 'toefl',
        IELTS: 'ielts',
        CET4: 'cet4',
        CET6: 'cet6'
      },
      DictionaryManager: jest.fn().mockImplementation(() => mockDictionaryManager)
    }));
    jest.doMock('../../services/LearningMode', () => ({
      LearningMode: jest.fn().mockImplementation(() => mockLearningMode)
    }));
    jest.doMock('../../services/StorageManager', () => ({
      StorageManager: jest.fn().mockImplementation(() => mockStorageManager)
    }));
    jest.doMock('../../services/ReviewService', () => ({
      ReviewService: jest.fn().mockImplementation(() => mockReviewService)
    }));
    jest.doMock('../../services/PerformanceManager', () => ({
      performanceManager: mockPerformanceManager
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
      errorHandler: mockErrorHandler
    }));
    jest.doMock('../../services/OfflineManager', () => ({
      offlineManager: {
        isNetworkOnline: jest.fn().mockReturnValue(true),
        syncWhenOnline: jest.fn(),
        showOfflineNotification: jest.fn()
      }
    }));

    require('../background');
    await flushPromises();
    await flushPromises();

    const mainListener = listeners[0];
    expect(mainListener).toBeDefined();
    const send = (request: any): Promise<any> => new Promise(resolve => {
      expect(mainListener!(request, {}, resolve)).toBe(true);
    });

    const translateResponse = await send({
      action: 'translate',
      data: { text: 'Hello', targetLang: 'fr', provider: 'openai' }
    });
    expect(mockStorageManager.getTranslationProviderConfig).toHaveBeenCalledWith('openai');
    expect(mockTranslationService.translate).toHaveBeenCalledWith({
      text: 'Hello',
      targetLang: 'fr',
      provider: 'openai',
      providerConfig
    });
    expect(translateResponse).toEqual({ success: true, data: translationResult });
    expect(JSON.stringify(translateResponse)).not.toContain('server-side-secret');

    const getResponse = await send({ action: 'getTranslationProviderConfigs' });
    expect(getResponse).toEqual({ success: true, data: [providerSummary] });
    expect(JSON.stringify(getResponse)).not.toContain('server-side-secret');

    const updateResponse = await send({
      action: 'updateTranslationProviderConfig',
      data: { providerId: 'openai', config: providerConfig }
    });
    expect(mockStorageManager.saveTranslationProviderConfig).toHaveBeenCalledWith('openai', providerConfig);
    expect(updateResponse).toEqual({ success: true, data: providerSummary });

    const removeResponse = await send({
      action: 'removeTranslationProviderConfig',
      data: { providerId: 'openai' }
    });
    expect(mockStorageManager.removeTranslationProviderConfig).toHaveBeenCalledWith('openai');
    expect(removeResponse).toEqual({ success: true });
    expect(mockTranslationService.clearCache).toHaveBeenCalledTimes(2);
  });
});
