import { readFileSync } from 'fs';
import path from 'path';

const subtitleHtml = readFileSync(path.join(__dirname, '..', 'subtitles.html'), 'utf8');
const body = subtitleHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || subtitleHtml;

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

const readBlobText = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

interface PortHarness {
  port: chrome.runtime.Port;
  postMessage: jest.Mock;
  disconnect: jest.Mock;
  emitMessage(message: any): void;
}

const createPortHarness = (): PortHarness => {
  let messageListener: ((message: any) => void) | null = null;
  let disconnectListener: (() => void) | null = null;
  const postMessage = jest.fn();
  const disconnect = jest.fn(() => disconnectListener?.());
  const port = {
    name: 'lexibridge-media-transcription',
    postMessage,
    disconnect,
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
  return {
    port,
    postMessage,
    disconnect,
    emitMessage: message => messageListener?.(message)
  };
};

const setMediaFile = (fileInput: HTMLInputElement, bytes: number[] = [1, 2, 3]): File => {
  const file = new File([new Uint8Array(bytes)], 'lecture.webm', { type: 'audio/webm' });
  Object.defineProperty(file, 'slice', {
    configurable: true,
    value: (start: number, end: number) => ({
      arrayBuffer: async () => {
        const chunk = new Uint8Array(bytes.slice(start, end));
        return chunk.buffer;
      }
    })
  });
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
  fileInput.dispatchEvent(new Event('change'));
  return file;
};

interface TabCaptureHarness {
  connect: jest.Mock;
  stopTrack: jest.Mock;
  audioContext: {
    close: jest.Mock;
  };
  recorder: {
    state: RecordingState;
    ondataavailable: ((event: BlobEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onstop: (() => void) | null;
    stop: jest.Mock;
  };
}

const startTabCapture = async (): Promise<TabCaptureHarness> => {
  window.history.replaceState({}, '', '/subtitles.html?sourceTabId=12');
  const connect = jest.fn();
  const sendMessage = jest.fn((message, callback) => {
    if (message.action === 'getTranslationProviderConfigs') {
      callback({ success: true, data: [{ providerId: 'groq', configured: true }] });
      return;
    }
    if (message.action === 'getSettings') {
      callback({ success: true, data: { translationProvider: 'google', defaultTargetLanguage: 'zh-CN' } });
      return;
    }
    if (message.action === 'getTabAudioCaptureStreamId') {
      callback({ success: true, data: { streamId: 'tab-stream-id' } });
      return;
    }
    callback({ success: true });
  });
  const stopTrack = jest.fn();
  const mediaStream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  const playbackSource = { connect: jest.fn(), disconnect: jest.fn() };
  const audioContext = {
    destination: {},
    createMediaStreamSource: jest.fn(() => playbackSource),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  };
  let recorder: TabCaptureHarness['recorder'] | null = null;
  class MockMediaRecorder {
    static isTypeSupported = jest.fn().mockReturnValue(true);
    state: RecordingState = 'inactive';
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onstop: (() => void) | null = null;
    start = jest.fn(() => {
      this.state = 'recording';
    });
    stop = jest.fn(() => {
      this.state = 'inactive';
    });
    mimeType = 'audio/webm;codecs=opus';

    constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {
      recorder = this;
    }
  }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: jest.fn().mockResolvedValue(mediaStream) }
  });
  Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: MockMediaRecorder });
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: jest.fn(() => audioContext)
  });
  (global as any).chrome = {
    runtime: { sendMessage, connect, lastError: null, openOptionsPage: jest.fn() }
  };

  require('../subtitles');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flushPromises();
  await flushPromises();
  document.getElementById('toggleTabCapture')!.dispatchEvent(new Event('click'));
  await flushPromises();
  await flushPromises();

  if (!recorder) throw new Error('Expected MediaRecorder to be created');
  return { connect, stopTrack, audioContext, recorder };
};

describe('AI subtitle generator', () => {
  beforeEach(() => {
    jest.resetModules();
    window.history.replaceState({}, '', '/subtitles.html');
    document.body.innerHTML = body;
  });

  it('loads configured providers without opening an upload connection', async () => {
    const connect = jest.fn();
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'groq', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: { translationProvider: 'google', defaultTargetLanguage: 'fr' }
        });
        return;
      }
      callback({ success: true });
    });
    (global as any).chrome = {
      runtime: { sendMessage, connect, lastError: null, openOptionsPage: jest.fn() }
    };

    require('../subtitles');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    await flushPromises();

    const speechProvider = document.getElementById('transcriptionProvider') as HTMLSelectElement;
    expect(speechProvider.value).toBe('groq');
    expect(Array.from(speechProvider.options).find(option => option.value === 'openai')?.disabled).toBe(true);
    expect((document.getElementById('translationProvider') as HTMLSelectElement).value).toBe('google');
    expect((document.getElementById('targetLanguage') as HTMLSelectElement).value).toBe('fr');
    expect((document.getElementById('generateSubtitles') as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById('toggleTabCapture') as HTMLButtonElement).disabled).toBe(true);
    expect(connect).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls.some(([message]) => message.action === 'translate')).toBe(false);
  });

  it('uploads only after Generate, translates timed cues, and exports bilingual SRT', async () => {
    const harness = createPortHarness();
    const connect = jest.fn(() => harness.port);
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'groq', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: { translationProvider: 'google', defaultTargetLanguage: 'zh-CN' }
        });
        return;
      }
      if (message.action === 'translate') {
        callback({ success: true, data: { translatedText: '你好，世界' } });
        return;
      }
      callback({ success: true });
    });
    let exportedBlob: Blob | null = null;
    const createObjectURL = jest.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:captions';
    });
    const revokeObjectURL = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    (global as any).chrome = {
      runtime: { sendMessage, connect, lastError: null, openOptionsPage: jest.fn() }
    };

    try {
      require('../subtitles');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();
      await flushPromises();

      const fileInput = document.getElementById('mediaFile') as HTMLInputElement;
      setMediaFile(fileInput);
      expect(connect).not.toHaveBeenCalled();
      expect((document.getElementById('generateSubtitles') as HTMLButtonElement).disabled).toBe(false);

      document.getElementById('generateSubtitles')!.dispatchEvent(new Event('click'));
      await flushPromises();
      expect(connect).toHaveBeenCalledWith({ name: 'lexibridge-media-transcription' });
      expect(harness.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'initialize',
        metadata: expect.objectContaining({
          providerId: 'groq',
          fileName: 'lecture.webm',
          totalBytes: 3
        })
      }));

      harness.emitMessage({ type: 'ready', totalBytes: 3 });
      await flushPromises();
      expect(harness.postMessage).toHaveBeenCalledWith({
        type: 'chunk',
        index: 0,
        data: 'AQID'
      });

      harness.emitMessage({ type: 'chunk-accepted', index: 0, receivedBytes: 3, totalBytes: 3 });
      await flushPromises();
      expect(harness.postMessage).toHaveBeenCalledWith({ type: 'complete' });

      harness.emitMessage({
        type: 'transcription-complete',
        result: {
          text: 'Hello world',
          language: 'en',
          duration: 2.4,
          segments: [{ id: 1, start: 0, end: 2.4, text: 'Hello world' }]
        }
      });
      await flushPromises();
      await flushPromises();

      expect(sendMessage).toHaveBeenCalledWith({
        action: 'translate',
        data: {
          text: 'Hello world',
          context: 'Hello world',
          sourceLang: 'en',
          targetLang: 'zh-CN',
          provider: 'google'
        }
      }, expect.any(Function));
      expect(document.querySelectorAll('.cue-row')).toHaveLength(1);
      expect(document.getElementById('cueList')?.textContent).toContain('Hello world');
      expect(document.getElementById('cueList')?.textContent).toContain('你好，世界');
      expect(document.getElementById('generationStatus')?.textContent).toBe('Generated 1 captions');
      expect((document.getElementById('generationProgress') as HTMLProgressElement).value).toBe(100);

      document.getElementById('exportSrt')!.dispatchEvent(new Event('click'));
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(exportedBlob).not.toBeNull();
      expect(await readBlobText(exportedBlob!)).toBe(
        '1\n00:00:00,000 --> 00:00:02,400\nHello world\n你好，世界'
      );
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:captions');
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('cancels an active upload and clears the working state', async () => {
    const harness = createPortHarness();
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'openai', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({ success: true, data: { translationProvider: 'google', defaultTargetLanguage: 'zh-CN' } });
        return;
      }
      callback({ success: true });
    });
    (global as any).chrome = {
      runtime: {
        sendMessage,
        connect: jest.fn(() => harness.port),
        lastError: null,
        openOptionsPage: jest.fn()
      }
    };

    require('../subtitles');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    await flushPromises();
    setMediaFile(document.getElementById('mediaFile') as HTMLInputElement);
    document.getElementById('generateSubtitles')!.dispatchEvent(new Event('click'));
    await flushPromises();

    document.getElementById('cancelGeneration')!.dispatchEvent(new Event('click'));
    expect(harness.postMessage).toHaveBeenCalledWith({ type: 'cancel' });
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
    expect(document.getElementById('generationStatus')?.textContent).toBe('Canceled');
    expect((document.getElementById('cancelGeneration') as HTMLButtonElement).hidden).toBe(true);
  });

  it('does not open a media stream when Chrome denies the source-tab capture', async () => {
    window.history.replaceState({}, '', '/subtitles.html?sourceTabId=12');
    const getUserMedia = jest.fn();
    const connect = jest.fn();
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'groq', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({ success: true, data: { translationProvider: 'google', defaultTargetLanguage: 'zh-CN' } });
        return;
      }
      if (message.action === 'getTabAudioCaptureStreamId') {
        callback({ success: false, error: 'Chrome denied source-tab capture.' });
        return;
      }
      callback({ success: true });
    });
    class AvailableMediaRecorder {
      static isTypeSupported = jest.fn().mockReturnValue(true);
    }
    const audioContext = {
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: AvailableMediaRecorder
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: jest.fn(() => audioContext)
    });
    (global as any).chrome = {
      runtime: { sendMessage, connect, lastError: null, openOptionsPage: jest.fn() }
    };

    require('../subtitles');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    await flushPromises();

    document.getElementById('toggleTabCapture')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage.mock.calls.some(([message]) => message.action === 'getTabAudioCaptureStreamId')).toBe(true);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(audioContext.close).toHaveBeenCalledTimes(1);
    expect(document.getElementById('generationStatus')?.textContent).toBe('Chrome denied source-tab capture.');
  });

  it('captures the source tab only after a click and uploads after Stop and generate', async () => {
    window.history.replaceState({}, '', '/subtitles.html?sourceTabId=12');
    const harness = createPortHarness();
    const connect = jest.fn(() => harness.port);
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'groq', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({ success: true, data: { translationProvider: 'google', defaultTargetLanguage: 'zh-CN' } });
        return;
      }
      if (message.action === 'getTabAudioCaptureStreamId') {
        callback({ success: true, data: { streamId: 'tab-stream-id' } });
        return;
      }
      callback({ success: true });
    });
    const stopTrack = jest.fn();
    const mediaStream = {
      getTracks: () => [{ stop: stopTrack }]
    } as unknown as MediaStream;
    const getUserMedia = jest.fn().mockResolvedValue(mediaStream);
    const playbackSource = { connect: jest.fn(), disconnect: jest.fn() };
    const audioContext = {
      destination: {},
      createMediaStreamSource: jest.fn(() => playbackSource),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    };
    let recorderInstance: {
      state: RecordingState;
      mimeType: string;
      ondataavailable: ((event: BlobEvent) => void) | null;
      onerror: ((event: Event) => void) | null;
      onstop: (() => void) | null;
      start: jest.Mock;
      stop: jest.Mock;
    } | null = null;
    class MockMediaRecorder {
      static isTypeSupported = jest.fn().mockReturnValue(true);
      state: RecordingState = 'inactive';
      mimeType: string;
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onstop: (() => void) | null = null;
      start = jest.fn((_timeslice?: number) => {
        this.state = 'recording';
      });
      stop = jest.fn(() => {
        this.state = 'inactive';
        this.onstop?.();
      });

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        this.mimeType = options?.mimeType || 'audio/webm';
        recorderInstance = this;
      }
    }
    const MockAudioContext = jest.fn(() => audioContext);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: MockMediaRecorder
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: MockAudioContext
    });
    (global as any).chrome = {
      runtime: { sendMessage, connect, lastError: null, openOptionsPage: jest.fn() }
    };

    try {
      require('../subtitles');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();
      await flushPromises();

      const captureButton = document.getElementById('toggleTabCapture') as HTMLButtonElement;
      const translateCaptions = document.getElementById('translateCaptions') as HTMLInputElement;
      translateCaptions.checked = false;
      translateCaptions.dispatchEvent(new Event('change'));
      expect(captureButton.disabled).toBe(false);
      expect(connect).not.toHaveBeenCalled();

      captureButton.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect(sendMessage).toHaveBeenCalledWith({
        action: 'getTabAudioCaptureStreamId',
        data: { targetTabId: 12 }
      }, expect.any(Function));
      expect(getUserMedia).toHaveBeenCalledWith({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: 'tab-stream-id'
          }
        },
        video: false
      });
      expect(recorderInstance).not.toBeNull();
      expect(recorderInstance!.start).toHaveBeenCalledWith(1000);
      expect(captureButton.textContent).toBe('Stop and generate');
      expect(connect).not.toHaveBeenCalled();

      recorderInstance!.ondataavailable?.({
        data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })
      } as BlobEvent);
      captureButton.dispatchEvent(new Event('click'));
      await flushPromises();
      await flushPromises();

      expect(recorderInstance!.stop).toHaveBeenCalledTimes(1);
      expect(stopTrack).toHaveBeenCalledTimes(1);
      expect(audioContext.close).toHaveBeenCalledTimes(1);
      expect(connect).toHaveBeenCalledWith({ name: 'lexibridge-media-transcription' });
      expect(harness.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'initialize',
        metadata: expect.objectContaining({
          providerId: 'groq',
          fileName: expect.stringMatching(/^tab-audio-.+\.webm$/),
          mimeType: 'audio/webm;codecs=opus',
          totalBytes: 3
        })
      }));
      expect(recorderInstance!.ondataavailable).toBeNull();
      expect(recorderInstance!.onerror).toBeNull();
      expect(recorderInstance!.onstop).toBeNull();

      harness.emitMessage({ type: 'transcribing' });
      harness.emitMessage({
        type: 'transcription-complete',
        result: {
          text: 'Captured speech',
          language: 'en',
          duration: 1,
          segments: [{ id: 1, start: 0, end: 1, text: 'Captured speech' }]
        }
      });
      await flushPromises();
      await flushPromises();

      document.getElementById('generateSubtitles')!.dispatchEvent(new Event('click'));
      await flushPromises();
      expect(connect).toHaveBeenCalledTimes(1);
    } finally {
      window.dispatchEvent(new Event('pagehide'));
      window.history.replaceState({}, '', '/subtitles.html');
    }
  });

  it('discards recorder errors and ignores late data after stop without uploading', async () => {
    const { recorder, connect, stopTrack, audioContext } = await startTabCapture();
    const lateDataHandler = recorder.ondataavailable;
    const stopHandler = recorder.onstop;

    recorder.onerror?.({ error: { message: 'Recorder failed.' } } as unknown as Event);
    lateDataHandler?.({ data: new Blob([new Uint8Array([1, 2, 3])]) } as BlobEvent);
    stopHandler?.();
    await flushPromises();

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(audioContext.close).toHaveBeenCalledTimes(1);
    expect(recorder.ondataavailable).toBeNull();
    expect(recorder.onerror).toBeNull();
    expect(recorder.onstop).toBeNull();
    expect(document.getElementById('generationStatus')?.textContent).toBe('Recorder failed.');
    expect(connect).not.toHaveBeenCalled();

    lateDataHandler?.({ data: new Blob([new Uint8Array([4, 5, 6])]) } as BlobEvent);
    await flushPromises();
    expect(connect).not.toHaveBeenCalled();
    expect((document.getElementById('generateSubtitles') as HTMLButtonElement).disabled).toBe(true);
  });

  it('stops and discards a tab capture chunk exceeding 25 MB without uploading', async () => {
    const { recorder, connect, stopTrack, audioContext } = await startTabCapture();
    const stopHandler = recorder.onstop;

    recorder.ondataavailable?.({
      data: { size: (25 * 1024 * 1024) + 1 } as Blob
    } as BlobEvent);
    stopHandler?.();
    await flushPromises();

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(audioContext.close).toHaveBeenCalledTimes(1);
    expect(document.getElementById('generationStatus')?.textContent)
      .toBe('Tab audio exceeded 25 MB and was discarded.');
    expect(connect).not.toHaveBeenCalled();
    expect((document.getElementById('generateSubtitles') as HTMLButtonElement).disabled).toBe(true);
  });

  it('releases active tab capture resources on pagehide without uploading', async () => {
    const { recorder, connect, stopTrack, audioContext } = await startTabCapture();

    recorder.ondataavailable?.({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })
    } as BlobEvent);
    window.dispatchEvent(new Event('pagehide'));
    await flushPromises();

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(audioContext.close).toHaveBeenCalledTimes(1);
    expect(recorder.ondataavailable).toBeNull();
    expect(recorder.onerror).toBeNull();
    expect(recorder.onstop).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect((document.getElementById('generateSubtitles') as HTMLButtonElement).disabled).toBe(true);
  });
});
