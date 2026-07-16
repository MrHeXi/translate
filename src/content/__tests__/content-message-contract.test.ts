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
    const showError = jest.fn();

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
        setStylePreset: jest.fn(),
        showTooltip: jest.fn(),
        showAddToVocabularyOption: jest.fn(),
        showWordDetails: jest.fn(),
        showError,
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
      isLearningMode: false,
      isVideoSubtitleMode: false,
      isLiveCaptionMode: false,
      isImageTranslationMode: false
    });

    const settingsResponse = await sendDirectMessage({
      action: 'updateSettings',
      data: {
        siteTranslationRules: [{ pattern: 'localhost', translationEnabled: false }]
      }
    });
    expect(settingsResponse).toEqual({ success: true });

    const stoppedStatus = await sendDirectMessage({ action: 'getTranslationStatus' });
    expect(stoppedStatus).toEqual(expect.objectContaining({ success: true, isActive: false }));

    const blockedToggle = await sendDirectMessage({ action: 'toggleTranslation' });
    expect(blockedToggle).toEqual({ success: true, isActive: false });
    expect(showError).toHaveBeenCalledWith('Page translation is disabled for this site in settings.');
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
        setStylePreset: jest.fn(),
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
      isLearningMode: false,
      isVideoSubtitleMode: false,
      isLiveCaptionMode: false,
      isImageTranslationMode: false
    });
  });

  it('skips configured page translation exclude selectors after manual start', async () => {
    document.body.innerHTML = `
      <main>
        <p>Primary article text for translation.</p>
        <nav>Navigation text is included only in whole-page mode.</nav>
        <section class="comments">Comment text should stay original.</section>
        <section class="site-only">Site rule text should stay original.</section>
        <aside data-no-translate>Sponsored text should stay original.</aside>
      </main>
      <footer>Footer text should translate only in whole-page mode.</footer>
    `;

    const listeners: Array<(request: any, sender: any, sendResponse: (response: any) => void) => boolean> = [];
    const addListener = jest.fn((listener) => {
      listeners.push(listener);
    });
    const addTranslation = jest.fn();
    const setDisplayMode = jest.fn();
    const setStylePreset = jest.fn();
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
                pageTranslationExcludeSelectors: ['.comments', 'main >> invalid'],
                translationStyle: 'subtle',
                siteTranslationRules: [{
                  pattern: 'localhost',
                  translationEnabled: true,
                  displayMode: 'translation-only',
                  translationStyle: 'highlight',
                  translationScope: 'whole-page',
                  excludeSelectors: ['.site-only']
                }],
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
        addTranslation,
        removeAllTranslations: jest.fn(),
        setDisplayMode,
        setStylePreset,
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

    const directListener = listeners[listeners.length - 1]!;
    const sendDirectMessage = (request: any): Promise<any> => new Promise(resolve => {
      directListener(request, {}, resolve);
    });

    await sendDirectMessage({ action: 'toggleTranslation' });
    await flushPromises();

    const wholePageInfo = await sendDirectMessage({ action: 'getPageInfo' });
    expect(wholePageInfo.data).toEqual(expect.objectContaining({
      translationScope: 'whole-page',
      translationRootTag: 'body'
    }));

    const wholePageTexts = sendToBackground.mock.calls
      .map(call => call[0].data.text)
      .sort();
    expect(wholePageTexts).toEqual([
      'Footer text should translate only in whole-page mode.',
      'Navigation text is included only in whole-page mode.',
      'Primary article text for translation.'
    ].sort());
    expect(addTranslation).toHaveBeenCalledTimes(3);
    expect(addTranslation.mock.calls[0][0].textContent).toBe('Primary article text for translation.');
    expect(addTranslation.mock.calls[0][2]).toBe('translation-only');
    expect(setDisplayMode).toHaveBeenCalledWith('translation-only');
    expect(setStylePreset).toHaveBeenCalledWith('highlight');

    await sendDirectMessage({ action: 'toggleTranslation' });
    await sendDirectMessage({
      action: 'updateSettings',
      data: {
        siteTranslationRules: [{
          pattern: 'localhost',
          translationEnabled: true,
          translationScope: 'main-content',
          excludeSelectors: ['.site-only']
        }]
      }
    });
    sendToBackground.mockClear();
    addTranslation.mockClear();

    await sendDirectMessage({ action: 'toggleTranslation' });
    await flushPromises();

    expect(sendToBackground).toHaveBeenCalledTimes(1);
    expect(sendToBackground).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ text: 'Primary article text for translation.' })
    }));
    expect(addTranslation).toHaveBeenCalledTimes(1);
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
        setStylePreset: jest.fn(),
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
      isLearningMode: false,
      isVideoSubtitleMode: false,
      isLiveCaptionMode: false,
      isImageTranslationMode: false
    });

    warnSpy.mockRestore();
  });

  it('toggles subtitle, live-caption, and image translation through the direct runtime message contract', async () => {
    const listeners: Array<(request: any, sender: any, sendResponse: (response: any) => void) => boolean> = [];
    const registerHandlers = jest.fn();
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
        setStylePreset: jest.fn(),
        showTooltip: jest.fn(),
        showAddToVocabularyOption: jest.fn(),
        showWordDetails: jest.fn(),
        showError: jest.fn(),
        cleanup: jest.fn()
      }))
    }));

    jest.doMock('../../services/MessageManager', () => ({
      messageManager: {
        registerHandlers,
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

    const registeredHandlers = registerHandlers.mock.calls[0][0];
    await expect(registeredHandlers.translateVisibleImages()).resolves.toEqual({
      success: true,
      data: {
        isActive: false,
        visibleImageCount: 0,
        translatedImageCount: 0,
        unreadableImageCount: 0,
        failedImageCount: 0,
        message: 'Start image translation first'
      }
    });
    await expect(registeredHandlers.getLiveCaptionTranscriptStatus()).resolves.toEqual({
      success: true,
      data: {
        isActive: false,
        cueCount: 0,
        sessionStartedAt: null,
        message: 'No live caption transcript yet'
      }
    });

    const directListener = listeners[listeners.length - 1]!;
    const sendDirectMessage = (request: any): Promise<any> => new Promise(resolve => {
      directListener(request, {}, resolve);
    });

    const startResponse = await sendDirectMessage({ action: 'toggleVideoSubtitleTranslation' });
    expect(startResponse).toEqual({
      success: true,
      isActive: true,
      hasTrack: false,
      message: 'No caption track found'
    });

    const statusResponse = await sendDirectMessage({ action: 'getTranslationStatus' });
    expect(statusResponse).toEqual({
      success: true,
      isActive: false,
      isLearningMode: false,
      isVideoSubtitleMode: true,
      isLiveCaptionMode: false,
      isImageTranslationMode: false
    });

    const stopResponse = await sendDirectMessage({ action: 'toggleVideoSubtitleTranslation' });
    expect(stopResponse).toEqual({
      success: true,
      isActive: false,
      hasTrack: false,
      message: 'Video subtitle translation stopped'
    });

    const emptySubtitleExportResponse = await sendDirectMessage({ action: 'exportVideoSubtitles' });
    expect(emptySubtitleExportResponse).toEqual({
      success: true,
      cueCount: 0,
      filename: expect.stringMatching(/lexibridge\.srt$/),
      content: '',
      message: 'No translated subtitles to export yet'
    });

    const liveCaptionStartResponse = await sendDirectMessage({ action: 'toggleLiveCaptionTranslation' });
    expect(liveCaptionStartResponse).toEqual({
      success: true,
      isActive: true,
      hasCaption: false,
      cueCount: 0,
      message: 'Waiting for live captions'
    });

    const liveCaptionTranscriptStatus = await sendDirectMessage({ action: 'getLiveCaptionTranscriptStatus' });
    expect(liveCaptionTranscriptStatus).toEqual({
      success: true,
      isActive: true,
      cueCount: 0,
      sessionStartedAt: null,
      message: 'No live caption transcript yet'
    });

    const emptyTranscriptExport = await sendDirectMessage({
      action: 'exportLiveCaptionTranscript',
      data: { format: 'json' }
    });
    expect(emptyTranscriptExport).toEqual({
      success: true,
      format: 'json',
      cueCount: 0,
      filename: 'meeting-lexibridge-live-captions.json',
      content: '',
      message: 'No live caption transcript to export yet'
    });

    const clearTranscriptResponse = await sendDirectMessage({ action: 'clearLiveCaptionTranscript' });
    expect(clearTranscriptResponse).toEqual({
      success: true,
      isActive: true,
      cueCount: 0,
      sessionStartedAt: null,
      message: 'Live caption transcript cleared'
    });

    const liveCaptionStatusResponse = await sendDirectMessage({ action: 'getTranslationStatus' });
    expect(liveCaptionStatusResponse).toEqual({
      success: true,
      isActive: false,
      isLearningMode: false,
      isVideoSubtitleMode: false,
      isLiveCaptionMode: true,
      isImageTranslationMode: false
    });

    const liveCaptionStopResponse = await sendDirectMessage({ action: 'toggleLiveCaptionTranslation' });
    expect(liveCaptionStopResponse).toEqual({
      success: true,
      isActive: false,
      hasCaption: false,
      cueCount: 0,
      message: 'Live caption translation stopped'
    });

    const imageStartResponse = await sendDirectMessage({ action: 'toggleImageTranslation' });
    expect(imageStartResponse).toEqual({
      success: true,
      isActive: true,
      hasImage: false,
      message: 'No image found'
    });

    const visibleImageResponse = await sendDirectMessage({ action: 'translateVisibleImages' });
    expect(visibleImageResponse).toEqual({
      success: true,
      isActive: true,
      visibleImageCount: 0,
      translatedImageCount: 0,
      unreadableImageCount: 0,
      failedImageCount: 0,
      message: 'No visible images found'
    });

    const imageStatusResponse = await sendDirectMessage({ action: 'getTranslationStatus' });
    expect(imageStatusResponse).toEqual({
      success: true,
      isActive: false,
      isLearningMode: false,
      isVideoSubtitleMode: false,
      isLiveCaptionMode: false,
      isImageTranslationMode: true
    });

    const imageStopResponse = await sendDirectMessage({ action: 'toggleImageTranslation' });
    expect(imageStopResponse).toEqual({
      success: true,
      isActive: false,
      hasImage: false,
      message: 'Image translation stopped'
    });
  });
});
