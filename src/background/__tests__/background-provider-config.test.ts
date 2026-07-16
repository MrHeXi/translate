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
      saveSettings: jest.fn().mockResolvedValue(undefined),
      getSettings: jest.fn().mockResolvedValue({
        aiContextEnabled: true,
        aiTranslationDomain: 'legal',
        translationGlossary: [{ source: 'agreement', target: 'accord' }],
        aiCustomPrompt: 'Keep clause numbers.'
      }),
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
        openOptionsPage: jest.fn(),
        lastError: null
      },
      tabs: {
        query: jest.fn((_query, callback) => callback([{ id: 42 }, {}])),
        sendMessage: jest.fn((_tabId, _message, callback) => callback())
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
      data: {
        text: 'Hello',
        context: 'This paragraph belongs to an agreement.',
        targetLang: 'fr',
        provider: 'openai'
      }
    });
    expect(mockStorageManager.getTranslationProviderConfig).toHaveBeenCalledWith('openai');
    expect(mockTranslationService.translate).toHaveBeenCalledWith({
      text: 'Hello',
      context: 'This paragraph belongs to an agreement.',
      targetLang: 'fr',
      provider: 'openai',
      aiPreferences: {
        contextEnabled: true,
        domain: 'legal',
        glossary: [{ source: 'agreement', target: 'accord' }],
        customPrompt: 'Keep clause numbers.'
      },
      providerConfig
    });
    expect(translateResponse).toEqual({ success: true, data: translationResult });
    expect(JSON.stringify(translateResponse)).not.toContain('server-side-secret');

    mockStorageManager.getSettings.mockResolvedValue({
      aiContextEnabled: false,
      aiTranslationDomain: 'general',
      translationGlossary: [],
      aiCustomPrompt: ''
    });
    await send({
      action: 'translate',
      data: {
        text: 'Context stays private by default',
        context: 'This must be removed.',
        targetLang: 'fr',
        provider: 'openai'
      }
    });
    expect(mockTranslationService.translate).toHaveBeenLastCalledWith(expect.objectContaining({
      text: 'Context stays private by default',
      context: undefined,
      aiPreferences: {
        contextEnabled: false,
        domain: 'general',
        glossary: [],
        customPrompt: ''
      }
    }));

    const writingResponse = await send({
      action: 'processAiText',
      data: {
        text: 'Can you meet tomorrow?',
        targetLang: 'same',
        provider: 'openai',
        task: {
          action: 'reply',
          tone: 'professional',
          length: 'shorter',
          instruction: 'Suggest next Tuesday.'
        }
      }
    });
    expect(mockStorageManager.getTranslationProviderConfig).toHaveBeenLastCalledWith('openai');
    expect(mockTranslationService.translate).toHaveBeenLastCalledWith({
      text: 'Can you meet tomorrow?',
      sourceLang: 'auto',
      targetLang: 'same',
      provider: 'openai',
      providerConfig,
      aiWritingTask: {
        action: 'reply',
        tone: 'professional',
        length: 'shorter',
        instruction: 'Suggest next Tuesday.'
      }
    });
    expect(writingResponse).toEqual({
      success: true,
      data: {
        ...translationResult,
        outputText: 'Bonjour',
        action: 'reply'
      }
    });
    expect(JSON.stringify(writingResponse)).not.toContain('server-side-secret');

    const callsBeforeRejectedWritingRequest = mockTranslationService.translate.mock.calls.length;
    const rejectedWritingResponse = await send({
      action: 'processAiText',
      data: {
        text: 'Write this',
        targetLang: 'en',
        provider: 'google',
        task: { action: 'compose' }
      }
    });
    expect(rejectedWritingResponse).toEqual({
      success: false,
      error: 'Choose a configured AI provider for writing tasks.'
    });
    expect(mockTranslationService.translate).toHaveBeenCalledTimes(callsBeforeRejectedWritingRequest);

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

    const settings = {
      translationStyle: 'highlight',
      siteTranslationRules: [{ pattern: 'docs.example.com', translationEnabled: false }]
    };
    const settingsResponse = await send({ action: 'updateSettings', data: settings });
    expect(mockStorageManager.saveSettings).toHaveBeenCalledWith(settings);
    expect((global as any).chrome.tabs.sendMessage).toHaveBeenCalledWith(
      42,
      { action: 'updateSettings', data: settings },
      expect.any(Function)
    );
    expect(settingsResponse).toEqual({ success: true });
    expect(mockTranslationService.clearCache).toHaveBeenCalledTimes(3);

    const resetResponse = await send({ action: 'resetSettings' });
    expect(mockStorageManager.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      documentOcrLanguage: 'eng',
      aiContextEnabled: false,
      aiTranslationDomain: 'general',
      translationGlossary: [],
      aiCustomPrompt: '',
      autoTranslate: false
    }));
    expect(resetResponse).toEqual({ success: true });

    const resetAllResponse = await send({ action: 'resetAllSettings' });
    expect(mockStorageManager.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      documentOcrLanguage: 'eng',
      aiContextEnabled: false,
      aiTranslationDomain: 'general',
      translationGlossary: [],
      aiCustomPrompt: '',
      autoTranslate: false
    }));
    expect(resetAllResponse).toEqual({ success: true });
  });
});
