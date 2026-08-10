export {};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const deferred = <T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
    const initializationGate = deferred<void>();
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
    const experts = [
      {
        definition: {
          schemaVersion: 1,
          id: 'general',
          name: 'General',
          version: '1.0.0',
          description: 'General translation.',
          instruction: 'Use natural, neutral language.',
          source: { name: 'LexiBridge' }
        },
        enabled: true,
        builtIn: true
      },
      {
        definition: {
          schemaVersion: 1,
          id: 'legal',
          name: 'Legal',
          version: '1.0.0',
          description: 'Legal translation.',
          instruction: 'Preserve legal meaning.',
          source: { name: 'LexiBridge' }
        },
        enabled: true,
        builtIn: true
      }
    ];
    const promptTemplates = [{
      template: {
        schemaVersion: 1,
        id: 'lexibridge-default',
        name: 'LexiBridge Default Translation',
        version: 1,
        source: 'built-in:lexibridge',
        systemPrompt: '{{domainInstruction}}',
        variables: []
      },
      builtIn: true
    }];

    const mockTranslationService = {
      translate: jest.fn().mockResolvedValue(translationResult),
      clearCache: jest.fn(),
      cleanExpiredCache: jest.fn(),
      getCacheSize: jest.fn().mockReturnValue(0)
    };
    const mockDictionaryManager = {
      loadBuiltInDictionary: jest.fn()
        .mockImplementationOnce(() => initializationGate.promise)
        .mockResolvedValue({ words: [], totalCount: 0 }),
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
        aiCustomPrompt: 'Keep clause numbers.',
        sensitiveDataMaskingEnabled: false
      }),
      getAiExperts: jest.fn().mockResolvedValue(experts),
      installAiExpert: jest.fn().mockResolvedValue(experts[1]),
      setAiExpertEnabled: jest.fn().mockResolvedValue({ ...experts[1], enabled: false }),
      removeAiExpert: jest.fn().mockResolvedValue(true),
      getPromptTemplates: jest.fn().mockResolvedValue(promptTemplates),
      installPromptTemplate: jest.fn().mockResolvedValue(promptTemplates[0]),
      removePromptTemplate: jest.fn().mockResolvedValue(true),
      getTranslationProviderConfig: jest.fn().mockResolvedValue(providerConfig),
      getTranslationProviderConfigSummaries: jest.fn().mockResolvedValue([providerSummary]),
      saveTranslationProviderConfig: jest.fn().mockResolvedValue(providerSummary),
      saveTranslationProviderLanguageCapabilities: jest.fn().mockResolvedValue({
        ...providerSummary,
        supportedTargetLanguages: ['fr'],
        languagesDiscoveredAt: '2026-08-10T00:00:00.000Z'
      }),
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
    const discoveredCapabilities = {
      endpoint: providerConfig.endpoint,
      discoveredAt: '2026-08-10T00:00:00.000Z',
      sourceLanguages: ['en'],
      targetLanguages: ['fr'],
      languagePairs: [{ source: 'en', target: 'fr' }]
    };
    const discover = jest.fn().mockResolvedValue(discoveredCapabilities);
    jest.doMock('../../services/ProviderLanguageDiscoveryService', () => ({
      providerLanguageDiscoveryService: { discover }
    }));

    require('../background');
    const mainListener = listeners[0];
    expect(mainListener).toBeDefined();
    const send = (request: any): Promise<any> => new Promise(resolve => {
      expect(mainListener!(request, {}, resolve)).toBe(true);
    });

    const initializationRaceRequestId = 'document-batch:initializing:block-1';
    const initializingTranslation = send({
      action: 'translate',
      data: {
        text: 'Cancel before initialization completes',
        targetLang: 'fr',
        provider: 'openai',
        requestId: initializationRaceRequestId
      }
    });
    await expect(send({
      action: 'cancelTranslationRequest',
      data: { requestId: initializationRaceRequestId }
    })).resolves.toEqual({ success: true, data: { cancelled: false } });
    initializationGate.resolve();
    await expect(initializingTranslation).resolves.toEqual({
      success: false,
      error: 'Translation request was cancelled'
    });
    expect(mockTranslationService.translate).not.toHaveBeenCalled();
    await flushPromises();
    await flushPromises();

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
        customPrompt: 'Keep clause numbers.',
        expertInstruction: 'Preserve legal meaning.',
        promptTemplate: promptTemplates[0].template,
        promptVariables: {}
      },
      providerConfig
    });
    expect(translateResponse).toEqual({ success: true, data: translationResult });
    expect(JSON.stringify(translateResponse)).not.toContain('server-side-secret');

    mockTranslationService.translate.mockImplementationOnce((translationRequest: any) => (
      new Promise((_resolve, reject) => {
        translationRequest.signal.addEventListener('abort', () => {
          const error = new Error('cancelled');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      })
    ));
    const activeTranslation = send({
      action: 'translate',
      data: {
        text: 'Long batch block',
        targetLang: 'fr',
        provider: 'openai',
        requestId: 'document-batch:task-1:block-1'
      }
    });
    for (let attempt = 0; attempt < 10 && mockTranslationService.translate.mock.calls.length < 2; attempt++) {
      await flushPromises();
    }
    expect(mockTranslationService.translate).toHaveBeenCalledTimes(2);

    const cancelResponse = await send({
      action: 'cancelTranslationRequest',
      data: { requestId: 'document-batch:task-1:block-1' }
    });
    expect(cancelResponse).toEqual({ success: true, data: { cancelled: true } });
    expect(mockTranslationService.translate).toHaveBeenLastCalledWith(expect.objectContaining({
      text: 'Long batch block',
      signal: expect.objectContaining({ aborted: true })
    }));
    await expect(activeTranslation).resolves.toEqual({ success: false, error: 'cancelled' });
    await expect(send({
      action: 'cancelTranslationRequest',
      data: { requestId: 'document-batch:unknown' }
    })).resolves.toEqual({ success: true, data: { cancelled: false } });
    mockTranslationService.translate.mockResolvedValue(translationResult);

    mockStorageManager.getSettings.mockResolvedValue({
      aiContextEnabled: false,
      aiTranslationDomain: 'general',
      translationGlossary: [],
      aiCustomPrompt: '',
      sensitiveDataMaskingEnabled: false
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
        customPrompt: '',
        expertInstruction: 'Use natural, neutral language.',
        promptTemplate: promptTemplates[0].template,
        promptVariables: {}
      }
    }));

    mockStorageManager.getSettings.mockResolvedValue({
      aiContextEnabled: false,
      aiTranslationDomain: 'general',
      translationGlossary: [],
      aiCustomPrompt: '',
      sensitiveDataMaskingEnabled: true
    });
    mockTranslationService.translate.mockImplementationOnce((translationRequest: any) => {
      expect(translationRequest.text).not.toContain('alice@example.com');
      const placeholder = translationRequest.text.match(/\[\[LEXIBRIDGE_MASK_[A-Z0-9]+_[A-Z0-9]+\]\]/)?.[0];
      expect(placeholder).toBeDefined();
      return Promise.resolve({
        ...translationResult,
        originalText: translationRequest.text,
        translatedText: `Email: ${placeholder}`,
        alternatives: []
      });
    });
    const maskedResponse = await send({
      action: 'translate',
      data: {
        text: 'Email alice@example.com',
        targetLang: 'fr',
        provider: 'openai'
      }
    });
    expect(maskedResponse).toEqual({
      success: true,
      data: expect.objectContaining({
        originalText: 'Email alice@example.com',
        translatedText: 'Email: alice@example.com'
      })
    });
    expect(JSON.stringify(mockTranslationService.translate.mock.calls.at(-1))).not.toContain(
      'alice@example.com'
    );

    mockTranslationService.translate.mockResolvedValueOnce({
      ...translationResult,
      originalText: 'masked',
      translatedText: 'Provider removed the placeholder.',
      alternatives: []
    });
    const ambiguousResponse = await send({
      action: 'translate',
      data: {
        text: 'Email bob@example.com',
        targetLang: 'fr',
        provider: 'openai'
      }
    });
    expect(ambiguousResponse).toEqual({
      success: false,
      error: expect.stringContaining('could not be restored safely')
    });
    expect(JSON.stringify(mockTranslationService.translate.mock.calls.at(-1))).not.toContain(
      'bob@example.com'
    );

    mockStorageManager.getSettings.mockResolvedValue({
      aiContextEnabled: false,
      aiTranslationDomain: 'general',
      translationGlossary: [],
      aiCustomPrompt: '',
      sensitiveDataMaskingEnabled: false
    });

    const callsBeforeInvalidWritingRequests = mockTranslationService.translate.mock.calls.length;
    await expect(send({
      action: 'processAiText',
      data: {
        text: 'Write this',
        targetLang: 'same',
        provider: 'openai',
        task: { action: 'compose' }
      }
    })).resolves.toEqual({
      success: false,
      error: 'AI writing request ID is required.'
    });
    await expect(send({
      action: 'processAiText',
      data: {
        requestId: ' sidepanel-ai:invalid ',
        text: 'Write this',
        targetLang: 'same',
        provider: 'openai',
        task: { action: 'compose' }
      }
    })).resolves.toEqual({
      success: false,
      error: 'Invalid AI writing request ID.'
    });
    await expect(send({
      action: 'processAiText',
      data: {
        requestId: 42,
        text: 'Write this',
        targetLang: 'same',
        provider: 'openai',
        task: { action: 'compose' }
      }
    })).resolves.toEqual({
      success: false,
      error: 'Invalid AI writing request ID.'
    });
    expect(mockTranslationService.translate).toHaveBeenCalledTimes(callsBeforeInvalidWritingRequests);

    const writingResponse = await send({
      action: 'processAiText',
      data: {
        requestId: 'sidepanel-ai:reply-1',
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
      },
      signal: expect.objectContaining({ aborted: false })
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

    const settingsGate = deferred<any>();
    mockStorageManager.getSettings.mockImplementationOnce(() => settingsGate.promise);
    const translationCallsBeforeSettingsCancellation = mockTranslationService.translate.mock.calls.length;
    const settingsPendingWriting = send({
      action: 'processAiText',
      data: {
        requestId: 'sidepanel-ai:settings-pending',
        text: 'Do not send this to the provider',
        targetLang: 'same',
        provider: 'openai',
        task: { action: 'polish' }
      }
    });
    await flushPromises();
    await expect(send({
      action: 'cancelTranslationRequest',
      data: { requestId: 'sidepanel-ai:settings-pending' }
    })).resolves.toEqual({ success: true, data: { cancelled: true } });
    settingsGate.resolve({
      aiContextEnabled: false,
      aiTranslationDomain: 'general',
      translationGlossary: [],
      aiCustomPrompt: '',
      sensitiveDataMaskingEnabled: false
    });
    await expect(settingsPendingWriting).resolves.toEqual({
      success: false,
      error: 'Translation request was cancelled'
    });
    expect(mockTranslationService.translate).toHaveBeenCalledTimes(
      translationCallsBeforeSettingsCancellation
    );

    mockTranslationService.translate.mockImplementationOnce((translationRequest: any) => (
      new Promise((_resolve, reject) => {
        translationRequest.signal.addEventListener('abort', () => {
          const error = new Error('cancelled');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      })
    ));
    const callsBeforeActiveWritingCancellation = mockTranslationService.translate.mock.calls.length;
    const activeWriting = send({
      action: 'processAiText',
      data: {
        requestId: 'sidepanel-ai:active-writing',
        text: 'A long writing request',
        targetLang: 'same',
        provider: 'openai',
        task: { action: 'rewrite' }
      }
    });
    for (
      let attempt = 0;
      attempt < 10 && mockTranslationService.translate.mock.calls.length === callsBeforeActiveWritingCancellation;
      attempt++
    ) {
      await flushPromises();
    }
    expect(mockTranslationService.translate).toHaveBeenCalledTimes(
      callsBeforeActiveWritingCancellation + 1
    );
    await expect(send({
      action: 'processAiText',
      data: {
        requestId: 'sidepanel-ai:active-writing',
        text: 'A duplicate writing request',
        targetLang: 'same',
        provider: 'openai',
        task: { action: 'rewrite' }
      }
    })).resolves.toEqual({
      success: false,
      error: 'AI writing request ID is already active.'
    });
    expect(mockTranslationService.translate).toHaveBeenCalledTimes(
      callsBeforeActiveWritingCancellation + 1
    );
    await expect(send({
      action: 'cancelTranslationRequest',
      data: { requestId: 'sidepanel-ai:active-writing' }
    })).resolves.toEqual({ success: true, data: { cancelled: true } });
    expect(mockTranslationService.translate).toHaveBeenLastCalledWith(expect.objectContaining({
      signal: expect.objectContaining({ aborted: true })
    }));
    await expect(activeWriting).resolves.toEqual({ success: false, error: 'cancelled' });
    mockTranslationService.translate.mockResolvedValue(translationResult);

    mockStorageManager.getSettings.mockResolvedValue({
      aiContextEnabled: false,
      aiTranslationDomain: 'general',
      translationGlossary: [],
      aiCustomPrompt: '',
      sensitiveDataMaskingEnabled: true
    });
    mockTranslationService.translate.mockImplementationOnce((translationRequest: any) => {
      const serialized = JSON.stringify(translationRequest);
      expect(serialized).not.toContain('writer@example.com');
      expect(serialized).not.toContain('+1 415 555 2671');
      const placeholder = translationRequest.text.match(
        /\[\[LEXIBRIDGE_MASK_[A-Z0-9]+_[A-Z0-9]+\]\]/
      )?.[0];
      return Promise.resolve({
        ...translationResult,
        originalText: translationRequest.text,
        translatedText: `Reply to ${placeholder}`,
        alternatives: []
      });
    });
    const maskedWritingResponse = await send({
      action: 'processAiText',
      data: {
        requestId: 'sidepanel-ai:masked-writing',
        text: 'Contact writer@example.com',
        targetLang: 'same',
        provider: 'openai',
        task: {
          action: 'reply',
          tone: 'professional',
          length: 'shorter',
          instruction: 'Call +1 415 555 2671.'
        }
      }
    });
    expect(maskedWritingResponse).toEqual({
      success: true,
      data: expect.objectContaining({
        originalText: 'Contact writer@example.com',
        outputText: 'Reply to writer@example.com'
      })
    });

    mockStorageManager.getSettings.mockResolvedValue({
      aiContextEnabled: false,
      aiTranslationDomain: 'general',
      translationGlossary: [],
      aiCustomPrompt: '',
      sensitiveDataMaskingEnabled: false
    });

    const callsBeforeRejectedWritingRequest = mockTranslationService.translate.mock.calls.length;
    const rejectedWritingResponse = await send({
      action: 'processAiText',
      data: {
        requestId: 'sidepanel-ai:rejected-provider',
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
    expect(discover).not.toHaveBeenCalled();

    const refreshResponse = await send({
      action: 'refreshTranslationProviderLanguages',
      data: { providerId: 'libretranslate' }
    });
    expect(discover).toHaveBeenCalledWith('libretranslate', providerConfig);
    expect(mockStorageManager.saveTranslationProviderLanguageCapabilities)
      .toHaveBeenCalledWith('libretranslate', discoveredCapabilities, providerConfig);
    expect(refreshResponse).toEqual({
      success: true,
      data: expect.objectContaining({ supportedTargetLanguages: ['fr'] })
    });

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
    expect(mockTranslationService.clearCache).toHaveBeenCalledTimes(4);

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

    const translationCallsBeforeLibraryManagement = mockTranslationService.translate.mock.calls.length;
    await expect(send({ action: 'getAiExperts' })).resolves.toEqual({
      success: true,
      data: experts
    });
    await expect(send({
      action: 'installAiExpert',
      data: { definition: experts[1].definition }
    })).resolves.toEqual({ success: true, data: experts[1] });
    expect(mockStorageManager.installAiExpert).toHaveBeenCalledWith(experts[1].definition);
    await expect(send({
      action: 'setAiExpertEnabled',
      data: { id: 'legal', enabled: false }
    })).resolves.toEqual({
      success: true,
      data: { ...experts[1], enabled: false }
    });
    await expect(send({
      action: 'removeAiExpert',
      data: { id: 'legal' }
    })).resolves.toEqual({ success: true, data: { removed: true } });

    await expect(send({ action: 'getPromptTemplates' })).resolves.toEqual({
      success: true,
      data: promptTemplates
    });
    await expect(send({
      action: 'installPromptTemplate',
      data: { template: promptTemplates[0].template }
    })).resolves.toEqual({ success: true, data: promptTemplates[0] });
    await expect(send({
      action: 'removePromptTemplate',
      data: { id: 'custom-template' }
    })).resolves.toEqual({ success: true, data: { removed: true } });
    expect(mockTranslationService.translate).toHaveBeenCalledTimes(
      translationCallsBeforeLibraryManagement
    );
  });
});
