describe('content input-language integration', () => {
  const flushPromises = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('passes per-input targets through translation and isolates the interactive cache', async () => {
    jest.resetModules();
    document.body.innerHTML = '<main><p>Content for the integration test.</p></main>';

    let inputCallback: ((text: string, targetLanguage?: string) => Promise<string>) | undefined;
    let selectionCallback: ((text: string, position: { x: number; y: number }) => void) | undefined;
    const inputInitialize = jest.fn((callback: typeof inputCallback) => {
      inputCallback = callback;
    });
    const selectionSpeak = jest.fn();
    const showSelectionTooltip = jest.fn();
    const registerHandlers = jest.fn();
    const sendToBackground = jest.fn(async (request: { data: { text: string; targetLang: string } }) => ({
      success: true,
      data: {
        originalText: request.data.text,
        translatedText: `${request.data.targetLang}: ${request.data.text}`,
        sourceLang: request.data.text === '\u6771\u4eac' ? 'ja' : 'auto',
        targetLang: request.data.targetLang,
        confidence: 0.99
      }
    }));

    (global as any).chrome = {
      runtime: {
        sendMessage: jest.fn((message: { action: string }, callback: (response: unknown) => void) => {
          if (message.action === 'getSettings') {
            callback({
              success: true,
              data: {
                defaultTargetLanguage: 'zh-CN',
                translationProvider: 'google',
                pageTranslationDisplayMode: 'bilingual',
                floatingIconPosition: { x: 20, y: 20 },
                learningModeEnabled: false,
                activeDictionaries: [],
                highlightColors: {},
                autoTranslate: false,
                showFloatingIcon: false
              }
            });
          }
        }),
        onMessage: { addListener: jest.fn(), removeListener: jest.fn() }
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
    jest.doMock('../components/TranslationOverlay', () => ({
      TranslationOverlay: jest.fn().mockImplementation(() => ({
        addTranslation: jest.fn(),
        removeAllTranslations: jest.fn(),
        setDisplayMode: jest.fn(),
        setStylePreset: jest.fn(),
        showTooltip: showSelectionTooltip,
        showAddToVocabularyOption: jest.fn(),
        showWordDetails: jest.fn(),
        showError: jest.fn(),
        cleanup: jest.fn()
      }))
    }));
    jest.doMock('../components/SelectionHandler', () => ({
      SelectionHandler: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        onTextSelected: jest.fn((callback: typeof selectionCallback) => {
          selectionCallback = callback;
        }),
        speakText: selectionSpeak,
        setEnabled: jest.fn(),
        cleanup: jest.fn()
      }))
    }));
    jest.doMock('../components/HoverTranslator', () => ({
      HoverTranslator: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        cleanup: jest.fn()
      }))
    }));
    jest.doMock('../components/InputBoxTranslator', () => ({
      InputBoxTranslator: jest.fn().mockImplementation(() => ({
        initialize: inputInitialize,
        cleanup: jest.fn()
      }))
    }));
    jest.doMock('../components/DocumentPagePrompt', () => ({
      DocumentPagePrompt: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        cleanup: jest.fn()
      }))
    }));
    jest.doMock('../components/VideoSubtitleTranslator', () => ({
      VideoSubtitleTranslator: jest.fn().mockImplementation(() => ({
        getStatus: jest.fn(() => ({ isActive: false })),
        cleanup: jest.fn()
      }))
    }));
    jest.doMock('../components/LiveCaptionTranslator', () => ({
      LiveCaptionTranslator: jest.fn().mockImplementation(() => ({
        getStatus: jest.fn(() => ({ isActive: false })),
        cleanup: jest.fn()
      }))
    }));
    jest.doMock('../components/ImageTranslator', () => ({
      ImageTranslator: jest.fn().mockImplementation(() => ({
        getStatus: jest.fn(() => ({ isActive: false })),
        cleanup: jest.fn()
      }))
    }));
    jest.doMock('../../services/MessageManager', () => ({
      messageManager: { registerHandlers, sendToBackground }
    }));
    jest.doMock('../../services/PerformanceManager', () => ({
      performanceManager: { startMonitoring: jest.fn(), recordRequest: jest.fn() }
    }));
    jest.doMock('../../services/LoadingManager', () => ({
      loadingManager: {
        showLoading: jest.fn(),
        showSimpleLoading: jest.fn(() => 'selection-loading'),
        updateProgress: jest.fn(),
        hideLoading: jest.fn()
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
      offlineManager: { isNetworkOnline: jest.fn(() => true), handleOfflineTranslation: jest.fn() }
    }));

    await import('../content');
    await flushPromises();

    expect(inputInitialize).toHaveBeenCalledTimes(1);
    expect(inputCallback).toBeDefined();

    await expect(inputCallback!('Hello world')).resolves.toBe('zh-CN: Hello world');
    await expect(inputCallback!('Hello world')).resolves.toBe('zh-CN: Hello world');
    await expect(inputCallback!('Hello world', 'ja')).resolves.toBe('ja: Hello world');
    await expect(inputCallback!('Hello world', 'ja')).resolves.toBe('ja: Hello world');

    expect(sendToBackground).toHaveBeenCalledTimes(2);
    expect(sendToBackground.mock.calls.map(call => call[0].data)).toEqual([
      expect.objectContaining({ text: 'Hello world', targetLang: 'zh-CN' }),
      expect.objectContaining({ text: 'Hello world', targetLang: 'ja' })
    ]);

    expect(selectionCallback).toBeDefined();
    selectionCallback!('\u6771\u4eac', { x: 80, y: 120 });
    await flushPromises();

    expect(selectionSpeak).not.toHaveBeenCalled();
    expect(showSelectionTooltip).toHaveBeenCalledWith(
      '\u6771\u4eac',
      'zh-CN: \u6771\u4eac',
      { x: 80, y: 120 },
      expect.objectContaining({ onSpeak: expect.any(Function) })
    );

    const tooltipActions = showSelectionTooltip.mock.calls[0]![3] as { onSpeak: () => void };
    tooltipActions.onSpeak();
    expect(selectionSpeak).toHaveBeenCalledWith('\u6771\u4eac', 'ja');

    selectionCallback!('\u6771\u4eac', { x: 90, y: 130 });
    await flushPromises();

    expect(sendToBackground).toHaveBeenCalledTimes(3);
    const cachedTooltipActions = showSelectionTooltip.mock.calls[1]![3] as { onSpeak: () => void };
    cachedTooltipActions.onSpeak();
    expect(selectionSpeak).toHaveBeenLastCalledWith('\u6771\u4eac', 'ja');

    window.dispatchEvent(new Event('beforeunload'));
  });
});
