export {};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

interface UploadDouble {
  metadata: Record<string, unknown>;
  appendBase64Chunk: jest.Mock;
  clear: jest.Mock;
}

interface PortHarness {
  postMessage: jest.Mock;
  send(message: Record<string, unknown>): void;
  disconnect(): void;
}

interface BackgroundHarness {
  uploads: UploadDouble[];
  getTranslationProviderConfig: jest.Mock;
  createTabAudioStreamId: jest.Mock;
  connect(): PortHarness;
  sendRuntimeMessage(
    message: Record<string, unknown>,
    sender: chrome.runtime.MessageSender
  ): Promise<any>;
}

const transcriptionResult = {
  text: 'Hello world',
  language: 'en',
  duration: 2,
  segments: [{ id: 1, start: 0, end: 2, text: 'Hello world' }]
};

const loadBackgroundHarness = (transcribe: jest.Mock): BackgroundHarness => {
  let connectionListener: ((port: chrome.runtime.Port) => void) | null = null;
  let runtimeMessageListener: ((
    request: Record<string, unknown>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => boolean) | null = null;
  const uploads: UploadDouble[] = [];
  const providerConfig = {
    apiKey: 'background-only-secret',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'chat-model'
  };
  const getTranslationProviderConfig = jest.fn().mockResolvedValue(providerConfig);
  const createTabAudioStreamId = jest.fn().mockResolvedValue('tab-stream-id');

  (global as any).chrome = {
    runtime: {
      id: 'extension-id',
      getURL: jest.fn((path: string) => `chrome-extension://extension-id/${path}`),
      onMessage: {
        addListener: jest.fn(listener => {
          if (!runtimeMessageListener) runtimeMessageListener = listener;
        })
      },
      onConnect: {
        addListener: jest.fn(listener => {
          connectionListener = listener;
        })
      },
      onInstalled: { addListener: jest.fn() },
      onStartup: { addListener: jest.fn() },
      openOptionsPage: jest.fn()
    }
  };

  jest.doMock('../../services/MediaTranscriptionService', () => ({
    MediaTranscriptionUpload: jest.fn().mockImplementation(metadata => {
      let receivedBytes = 0;
      let nextChunkIndex = 0;
      const upload: UploadDouble = {
        metadata,
        appendBase64Chunk: jest.fn((index: number, data: string) => {
          if (index !== nextChunkIndex) throw new Error(`Expected media chunk ${nextChunkIndex}.`);
          receivedBytes += atob(data).length;
          nextChunkIndex++;
          return { receivedBytes, totalBytes: metadata.totalBytes };
        }),
        clear: jest.fn()
      };
      uploads.push(upload);
      return upload;
    }),
    mediaTranscriptionService: { transcribe }
  }));
  jest.doMock('../../services/TabAudioCaptureService', () => ({
    isTrustedTabAudioCaptureSender: jest.fn().mockReturnValue(true),
    tabAudioCaptureService: { createStreamId: createTabAudioStreamId }
  }));
  jest.doMock('../../services/TranslationService', () => ({
    TranslationService: jest.fn().mockImplementation(() => ({
      cleanExpiredCache: jest.fn(),
      clearCache: jest.fn()
    }))
  }));
  jest.doMock('../../services/DictionaryManager', () => ({
    DictionaryType: { GRE: 'gre', TOEFL: 'toefl' },
    DictionaryManager: jest.fn().mockImplementation(() => ({
      loadBuiltInDictionary: jest.fn().mockResolvedValue({ words: [], totalCount: 0 }),
      clearWordCache: jest.fn()
    }))
  }));
  jest.doMock('../../services/LearningMode', () => ({
    LearningMode: jest.fn().mockImplementation(() => ({
      loadVocabulary: jest.fn().mockResolvedValue(undefined)
    }))
  }));
  jest.doMock('../../services/StorageManager', () => ({
    StorageManager: jest.fn().mockImplementation(() => ({ getTranslationProviderConfig }))
  }));
  jest.doMock('../../services/ReviewService', () => ({
    ReviewService: jest.fn().mockImplementation(() => ({}))
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
    ErrorSeverity: { CRITICAL: 'critical', MEDIUM: 'medium' },
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
  if (!connectionListener) throw new Error('Background connection listener was not registered.');
  if (!runtimeMessageListener) throw new Error('Background message listener was not registered.');

  return {
    uploads,
    getTranslationProviderConfig,
    createTabAudioStreamId,
    connect: () => {
      let messageListener: ((message: Record<string, unknown>) => void) | null = null;
      let disconnectListener: (() => void) | null = null;
      const postMessage = jest.fn();
      const port = {
        name: 'lexibridge-media-transcription',
        postMessage,
        onMessage: {
          addListener: jest.fn(listener => {
            messageListener = listener;
          })
        },
        onDisconnect: {
          addListener: jest.fn(listener => {
            disconnectListener = listener;
          })
        }
      } as unknown as chrome.runtime.Port;
      connectionListener!(port);
      if (!messageListener || !disconnectListener) {
        throw new Error('Media transcription port listeners were not registered.');
      }
      return {
        postMessage,
        send: message => messageListener!(message),
        disconnect: () => disconnectListener!()
      };
    },
    sendRuntimeMessage: (message, sender) => new Promise(resolve => {
      runtimeMessageListener!(message, sender, resolve);
    })
  };
};

const initializeUpload = async (port: PortHarness): Promise<void> => {
  port.send({
    type: 'initialize',
    metadata: {
      providerId: 'groq',
      fileName: 'clip.webm',
      mimeType: 'audio/webm',
      totalBytes: 3,
      language: 'en'
    }
  });
  await flushPromises();
  port.send({ type: 'chunk', index: 0, data: 'AQID' });
  await flushPromises();
};

describe('BackgroundService media transcription port', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts chunks, injects local credentials, clears media, and returns only transcript data', async () => {
    const transcribe = jest.fn().mockResolvedValue(transcriptionResult);
    const harness = loadBackgroundHarness(transcribe);
    const port = harness.connect();

    await initializeUpload(port);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'ready', totalBytes: 3 });
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'chunk-accepted',
      index: 0,
      receivedBytes: 3,
      totalBytes: 3
    });

    port.send({ type: 'complete' });
    await flushPromises();
    await flushPromises();

    expect(harness.getTranslationProviderConfig).toHaveBeenCalledWith('groq');
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ providerId: 'groq' }) }),
      expect.objectContaining({ apiKey: 'background-only-secret' }),
      expect.any(AbortSignal)
    );
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'transcribing' });
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'transcription-complete',
      result: transcriptionResult
    });
    expect(harness.uploads[0]?.appendBase64Chunk).toHaveBeenCalledWith(0, 'AQID');
    expect(harness.uploads[0]?.clear).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(port.postMessage.mock.calls)).not.toContain('background-only-secret');
  });

  it.each(['cancel', 'disconnect'] as const)(
    'aborts and clears a provider request after %s',
    async action => {
      let resolveTranscription: ((value: typeof transcriptionResult) => void) | null = null;
      const transcribe = jest.fn().mockImplementation(() => new Promise(resolve => {
        resolveTranscription = resolve;
      }));
      const harness = loadBackgroundHarness(transcribe);
      const port = harness.connect();
      await initializeUpload(port);

      port.send({ type: 'complete' });
      await flushPromises();
      const signal = transcribe.mock.calls[0]?.[2] as AbortSignal;
      expect(signal.aborted).toBe(false);

      if (action === 'cancel') port.send({ type: 'cancel' });
      else port.disconnect();
      await flushPromises();

      expect(signal.aborted).toBe(true);
      expect(harness.uploads[0]?.clear).toHaveBeenCalled();
      if (action === 'cancel') {
        expect(port.postMessage).toHaveBeenCalledWith({ type: 'canceled' });
      }

      resolveTranscription!(transcriptionResult);
      await flushPromises();
      await flushPromises();
      expect(port.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        type: 'transcription-complete'
      }));
    }
  );

  it('clears buffered media and reports a provider error', async () => {
    const transcribe = jest.fn().mockRejectedValue(new Error('Speech service unavailable.'));
    const harness = loadBackgroundHarness(transcribe);
    const port = harness.connect();
    await initializeUpload(port);

    port.send({ type: 'complete' });
    await flushPromises();
    await flushPromises();

    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'error',
      error: 'Speech service unavailable.'
    });
    expect(harness.uploads[0]?.clear).toHaveBeenCalledTimes(1);
  });

  it('routes a trusted subtitle-page request to tab audio capture', async () => {
    const harness = loadBackgroundHarness(jest.fn());
    await flushPromises();

    const response = await harness.sendRuntimeMessage({
      action: 'getTabAudioCaptureStreamId',
      data: { targetTabId: 12 }
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/subtitles.html?sourceTabId=12',
      tab: { id: 44 } as chrome.tabs.Tab
    });

    expect(harness.createTabAudioStreamId).toHaveBeenCalledWith({
      targetTabId: 12,
      consumerTabId: 44
    });
    expect(response).toEqual({ success: true, data: { streamId: 'tab-stream-id' } });
  });
});
