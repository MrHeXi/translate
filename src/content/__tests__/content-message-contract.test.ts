describe('Content script direct runtime message contract', () => {
  const flushPromises = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  const timeoutAfter = (ms: number): Promise<{ timedOut: true }> => (
    new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), ms))
  );

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<main><p>Hello world for translation.</p></main>';
  });

  it('returns the updated translation status when popup toggles translation mode', async () => {
    const listeners: Array<(request: any, sender: any, sendResponse: (response: any) => void) => boolean> = [];
    const addListener = jest.fn((listener) => {
      listeners.push(listener);
    });

    (global as any).chrome = {
      runtime: {
        sendMessage: jest.fn((message, callback) => {
          if (message.action === 'getSettings') {
            callback({
              success: true,
              data: {
                defaultTargetLanguage: 'zh-CN',
                translationProvider: 'google',
                pageTranslationDisplayMode: 'bilingual',
                floatingIconPosition: { x: 20, y: 20 },
                learningModeEnabled: false,
                activeDictionaries: ['gre'],
                highlightColors: { gre: '#ff0000' },
                autoTranslate: false,
                showFloatingIcon: true
              }
            });
            return;
          }

          callback({ success: true });
        }),
        onMessage: {
          addListener,
          removeListener: jest.fn()
        }
      }
    };

    jest.doMock('../components/FloatingIcon', () => ({
      FloatingIcon: jest.fn().mockImplementation(() => ({
        create: jest.fn(),
        onToggle: jest.fn(),
        onLearningModeToggle: jest.fn(),
        updateState: jest.fn(),
        updateLearningModeState: jest.fn(),
        updatePosition: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        cleanup: jest.fn()
      }))
    }));

    jest.doMock('../components/SelectionHandler', () => ({
      SelectionHandler: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        onTextSelected: jest.fn(),
        cleanup: jest.fn()
      }))
    }));

    jest.doMock('../components/TranslationOverlay', () => ({
      TranslationOverlay: jest.fn().mockImplementation(() => ({
        addTranslation: jest.fn(),
        removeAllTranslations: jest.fn(),
        setDisplayMode: jest.fn(),
        showTooltip: jest.fn(),
        showAddToVocabularyOption: jest.fn(),
        showWordDetails: jest.fn(),
        showError: jest.fn(),
        cleanup: jest.fn()
      }))
    }));

    jest.doMock('../../services/MessageManager', () => ({
      messageManager: {
        registerHandlers: jest.fn(),
        sendToBackground: jest.fn(async (request) => ({
          success: true,
          data: {
            originalText: request.data.text,
            translatedText: `translated: ${request.data.text}`,
            sourceLang: 'en',
            targetLang: request.data.targetLang,
            confidence: 0.95
          }
        }))
      }
    }));

    jest.doMock('../../services/PerformanceManager', () => ({
      performanceManager: {
        startMonitoring: jest.fn(),
        recordRequest: jest.fn()
      }
    }));

    jest.doMock('../../services/ErrorHandler', () => ({
      ErrorType: { TRANSLATION_API_ERROR: 'TRANSLATION_API_ERROR' },
      ErrorSeverity: { MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
      errorHandler: {
        logError: jest.fn(),
        getUserFriendlyMessage: jest.fn(() => 'translation failed')
      }
    }));

    jest.doMock('../../services/OfflineManager', () => ({
      offlineManager: {
        isNetworkOnline: jest.fn(() => true),
        handleOfflineTranslation: jest.fn()
      }
    }));

    jest.doMock('../../services/LoadingManager', () => ({
      loadingManager: {
        showLoading: jest.fn(),
        showSimpleLoading: jest.fn(() => 'simple-loading'),
        showProgressLoading: jest.fn(() => 'progress-loading'),
        updateProgress: jest.fn(),
        hideLoading: jest.fn()
      }
    }));

    await import('../content');
    await flushPromises();

    expect(addListener).toHaveBeenCalled();
    const directListener = listeners[listeners.length - 1]!;

    const sendDirectMessage = (request: any): Promise<any> => new Promise(resolve => {
      directListener(request, {}, resolve);
    });

    const toggleResponse = await sendDirectMessage({ action: 'toggleTranslation' });
    expect(toggleResponse).toEqual({ success: true, isActive: true });

    const statusResponse = await sendDirectMessage({ action: 'getTranslationStatus' });
    expect(statusResponse).toEqual({
      success: true,
      isActive: true,
      isLearningMode: false
    });
  });

  it('lets popup close translation mode immediately while page translation is still running', async () => {
    const listeners: Array<(request: any, sender: any, sendResponse: (response: any) => void) => boolean> = [];
    const addListener = jest.fn((listener) => {
      listeners.push(listener);
    });
    const loadingManager = {
      showLoading: jest.fn(),
      showSimpleLoading: jest.fn(() => 'simple-loading'),
      showProgressLoading: jest.fn(() => 'progress-loading'),
      updateProgress: jest.fn(),
      hideLoading: jest.fn()
    };
    const neverFinishingTranslation = jest.fn(() => new Promise(() => undefined));

    (global as any).chrome = {
      runtime: {
        sendMessage: jest.fn((message, callback) => {
          if (message.action === 'getSettings') {
            callback({
              success: true,
              data: {
                defaultTargetLanguage: 'zh-CN',
                translationProvider: 'google',
                pageTranslationDisplayMode: 'bilingual',
                floatingIconPosition: { x: 20, y: 20 },
                learningModeEnabled: false,
                activeDictionaries: ['gre'],
                highlightColors: { gre: '#ff0000' },
                autoTranslate: false,
                showFloatingIcon: true
              }
            });
            return;
          }

          callback({ success: true });
        }),
        onMessage: {
          addListener,
          removeListener: jest.fn()
        }
      }
    };

    jest.doMock('../components/FloatingIcon', () => ({
      FloatingIcon: jest.fn().mockImplementation(() => ({
        create: jest.fn(),
        onToggle: jest.fn(),
        onLearningModeToggle: jest.fn(),
        updateState: jest.fn(),
        updateLearningModeState: jest.fn(),
        updatePosition: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        cleanup: jest.fn()
      }))
    }));

    jest.doMock('../components/SelectionHandler', () => ({
      SelectionHandler: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        onTextSelected: jest.fn(),
        cleanup: jest.fn()
      }))
    }));

    jest.doMock('../components/TranslationOverlay', () => ({
      TranslationOverlay: jest.fn().mockImplementation(() => ({
        addTranslation: jest.fn(),
        removeAllTranslations: jest.fn(),
        setDisplayMode: jest.fn(),
        showTooltip: jest.fn(),
        showAddToVocabularyOption: jest.fn(),
        showWordDetails: jest.fn(),
        showError: jest.fn(),
        cleanup: jest.fn()
      }))
    }));

    jest.doMock('../../services/MessageManager', () => ({
      messageManager: {
        registerHandlers: jest.fn(),
        sendToBackground: neverFinishingTranslation
      }
    }));

    jest.doMock('../../services/PerformanceManager', () => ({
      performanceManager: {
        startMonitoring: jest.fn(),
        recordRequest: jest.fn()
      }
    }));

    jest.doMock('../../services/ErrorHandler', () => ({
      ErrorType: { TRANSLATION_API_ERROR: 'TRANSLATION_API_ERROR' },
      ErrorSeverity: { MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
      errorHandler: {
        logError: jest.fn(),
        getUserFriendlyMessage: jest.fn(() => 'translation failed')
      }
    }));

    jest.doMock('../../services/OfflineManager', () => ({
      offlineManager: {
        isNetworkOnline: jest.fn(() => true),
        handleOfflineTranslation: jest.fn()
      }
    }));

    jest.doMock('../../services/LoadingManager', () => ({
      loadingManager
    }));

    await import('../content');
    await flushPromises();

    const directListener = listeners[listeners.length - 1]!;
    const sendDirectMessage = (request: any): Promise<any> => new Promise(resolve => {
      directListener(request, {}, resolve);
    });

    const openResponse = await Promise.race([
      sendDirectMessage({ action: 'toggleTranslation' }),
      timeoutAfter(50)
    ]);
    expect(openResponse).toEqual({ success: true, isActive: true });
    expect(loadingManager.showLoading).toHaveBeenCalledWith(
      expect.stringMatching(/^page_translation_/),
      expect.objectContaining({
        type: 'progress',
        position: 'top',
        overlay: false
      })
    );

    const closeResponse = await Promise.race([
      sendDirectMessage({ action: 'toggleTranslation' }),
      timeoutAfter(50)
    ]);
    expect(closeResponse).toEqual({ success: true, isActive: false });
    expect(loadingManager.hideLoading).toHaveBeenCalledWith(expect.stringMatching(/^page_translation_/));

    const statusResponse = await sendDirectMessage({ action: 'getTranslationStatus' });
    expect(statusResponse).toEqual({
      success: true,
      isActive: false,
      isLearningMode: false
    });
  });

  it('does not start page translation automatically when the content script initializes', async () => {
    const listeners: Array<(request: any, sender: any, sendResponse: (response: any) => void) => boolean> = [];
    const addListener = jest.fn((listener) => {
      listeners.push(listener);
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sendToBackground = jest.fn(async (request) => ({
      success: true,
      data: {
        originalText: request.data.text,
        translatedText: `translated: ${request.data.text}`,
        sourceLang: 'en',
        targetLang: request.data.targetLang,
        confidence: 0.95
      }
    }));

    (global as any).chrome = {
      runtime: {
        sendMessage: jest.fn((message, callback) => {
          if (message.action === 'getSettings') {
            callback({
              success: true,
              data: {
                defaultTargetLanguage: 'zh-CN',
                translationProvider: 'google',
                pageTranslationDisplayMode: 'bilingual',
                floatingIconPosition: { x: 20, y: 20 },
                learningModeEnabled: false,
                activeDictionaries: ['gre'],
                highlightColors: { gre: '#ff0000' },
                autoTranslate: true,
                showFloatingIcon: true
              }
            });
            return;
          }

          callback({ success: true });
        }),
        onMessage: {
          addListener,
          removeListener: jest.fn()
        }
      }
    };

    jest.doMock('../components/FloatingIcon', () => ({
      FloatingIcon: jest.fn().mockImplementation(() => ({
        create: jest.fn(),
        onToggle: jest.fn(),
        onLearningModeToggle: jest.fn(),
        updateState: jest.fn(),
        updateLearningModeState: jest.fn(),
        updatePosition: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        cleanup: jest.fn()
      }))
    }));

    jest.doMock('../components/SelectionHandler', () => ({
      SelectionHandler: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        onTextSelected: jest.fn(),
        cleanup: jest.fn()
      }))
    }));

    jest.doMock('../components/TranslationOverlay', () => ({
      TranslationOverlay: jest.fn().mockImplementation(() => ({
        addTranslation: jest.fn(),
        removeAllTranslations: jest.fn(),
        setDisplayMode: jest.fn(),
        showTooltip: jest.fn(),
        showAddToVocabularyOption: jest.fn(),
        showWordDetails: jest.fn(),
        showError: jest.fn(),
        cleanup: jest.fn()
      }))
    }));

    jest.doMock('../../services/MessageManager', () => ({
      messageManager: {
        registerHandlers: jest.fn(),
        sendToBackground
      }
    }));

    jest.doMock('../../services/PerformanceManager', () => ({
      performanceManager: {
        startMonitoring: jest.fn(),
        recordRequest: jest.fn()
      }
    }));

    jest.doMock('../../services/ErrorHandler', () => ({
      ErrorType: { TRANSLATION_API_ERROR: 'TRANSLATION_API_ERROR' },
      ErrorSeverity: { MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
      errorHandler: {
        logError: jest.fn(),
        getUserFriendlyMessage: jest.fn(() => 'translation failed')
      }
    }));

    jest.doMock('../../services/OfflineManager', () => ({
      offlineManager: {
        isNetworkOnline: jest.fn(() => true),
        handleOfflineTranslation: jest.fn()
      }
    }));

    jest.doMock('../../services/LoadingManager', () => ({
      loadingManager: {
        showLoading: jest.fn(),
        showSimpleLoading: jest.fn(() => 'simple-loading'),
        showProgressLoading: jest.fn(() => 'progress-loading'),
        updateProgress: jest.fn(),
        hideLoading: jest.fn()
      }
    }));

    await import('../content');
    await flushPromises();

    expect(warnSpy).not.toHaveBeenCalledWith('内容脚本尚未初始化完成');
    expect(sendToBackground).not.toHaveBeenCalledWith(expect.objectContaining({
      action: 'translate'
    }));

    const directListener = listeners[listeners.length - 1]!;
    const statusResponse = await new Promise<any>(resolve => {
      directListener({ action: 'getTranslationStatus' }, {}, resolve);
    });

    expect(statusResponse).toEqual({
      success: true,
      isActive: false,
      isLearningMode: false
    });

    warnSpy.mockRestore();
  });
});
