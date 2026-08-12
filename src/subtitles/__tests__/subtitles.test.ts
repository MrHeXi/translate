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
    runtime: { sendMessage, connect, lastError: null, openOptionsPage: jest.fn() },
    tabCapture: { getMediaStreamId: jest.fn() }
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
    expect((document.getElementById('transcriptionModel') as HTMLSelectElement).value)
      .toBe('whisper-large-v3-turbo');
    expect(Array.from(speechProvider.options).find(option => option.value === 'openai')?.disabled).toBe(true);
    expect((document.getElementById('translationProvider') as HTMLSelectElement).value).toBe('google');
    expect((document.getElementById('targetLanguage') as HTMLSelectElement).value).toBe('fr');
    expect((document.getElementById('generateSubtitles') as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById('toggleTabCapture') as HTMLButtonElement).disabled).toBe(true);
    expect(connect).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls.some(([message]) => message.action === 'translate')).toBe(false);
    expect((document.getElementById('applyToSourceVideo') as HTMLButtonElement).hidden).toBe(true);
    expect((document.getElementById('clearSourceVideo') as HTMLButtonElement).hidden).toBe(true);
  });

  it('streams partial OpenAI text only after Generate and ignores late partials after Cancel', async () => {
    const harness = createPortHarness();
    const connect = jest.fn(() => harness.port);
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'openai', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({ success: true, data: { translationProvider: 'google' } });
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

    const model = document.getElementById('transcriptionModel') as HTMLSelectElement;
    expect(Array.from(model.options).map(option => option.value)).toEqual([
      'whisper-1',
      'gpt-4o-transcribe',
      'gpt-4o-mini-transcribe'
    ]);
    model.value = 'gpt-4o-mini-transcribe';
    model.dispatchEvent(new Event('change'));
    (document.getElementById('translateCaptions') as HTMLInputElement).checked = false;
    document.getElementById('translateCaptions')!.dispatchEvent(new Event('change'));
    setMediaFile(document.getElementById('mediaFile') as HTMLInputElement);

    expect(connect).not.toHaveBeenCalled();
    expect(document.getElementById('partialTranscript')?.hidden).toBe(true);
    document.getElementById('generateSubtitles')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(harness.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'initialize',
      metadata: expect.objectContaining({
        providerId: 'openai',
        transcriptionModel: 'gpt-4o-mini-transcribe'
      })
    }));
    harness.emitMessage({ type: 'transcribing' });
    harness.emitMessage({ type: 'transcription-partial', text: '<img src=x onerror=alert(1)> Hello' });
    const preview = document.getElementById('partialTranscript')!;
    expect(preview.hidden).toBe(false);
    expect(preview.textContent).toBe('<img src=x onerror=alert(1)> Hello');
    expect(preview.querySelector('img')).toBeNull();

    document.getElementById('cancelGeneration')!.dispatchEvent(new Event('click'));
    expect(preview.hidden).toBe(true);
    harness.emitMessage({ type: 'transcription-partial', text: 'late partial' });
    expect(preview.hidden).toBe(true);
    expect(preview.textContent).toBe('');
    expect(sendMessage.mock.calls.some(([message]) => message.action === 'translate')).toBe(false);
  });

  it('applies and clears generated cues in the source video only after explicit clicks', async () => {
    window.history.replaceState(
      {},
      '',
      '/subtitles.html?sourceTabId=12&sourceNavigationToken=v1%3A12345678%3A17'
    );
    const harness = createPortHarness();
    const connect = jest.fn(() => harness.port);
    let applyCount = 0;
    const sendTabMessage = jest.fn((tabId, message, callback) => {
      expect(tabId).toBe(12);
      if (message.action === 'applyGeneratedVideoSubtitles') {
        applyCount++;
        callback(applyCount === 1
          ? { success: true, data: { message: 'Applied 1 generated subtitle cue' } }
          : { success: false, error: 'Source video rejected the captions.' });
        return;
      }
      if (message.action === 'clearGeneratedVideoSubtitles') {
        callback({ success: true, data: { message: 'Generated video subtitles cleared' } });
        return;
      }
      callback({ success: false, error: 'Unexpected source message.' });
    });
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'groq', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({ success: true, data: { translationProvider: 'google', defaultTargetLanguage: 'zh-CN' } });
        return;
      }
      callback({ success: true });
    });
    (global as any).chrome = {
      runtime: { sendMessage, connect, lastError: null, openOptionsPage: jest.fn() },
      tabs: { sendMessage: sendTabMessage }
    };

    try {
      require('../subtitles');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushPromises();
      await flushPromises();

      const applyButton = document.getElementById('applyToSourceVideo') as HTMLButtonElement;
      const clearButton = document.getElementById('clearSourceVideo') as HTMLButtonElement;
      expect(applyButton.hidden).toBe(false);
      expect(applyButton.disabled).toBe(true);
      expect(clearButton.hidden).toBe(false);
      expect(clearButton.disabled).toBe(false);
      expect(sendTabMessage).not.toHaveBeenCalled();

      const translateCaptions = document.getElementById('translateCaptions') as HTMLInputElement;
      translateCaptions.checked = false;
      translateCaptions.dispatchEvent(new Event('change'));
      setMediaFile(document.getElementById('mediaFile') as HTMLInputElement);
      document.getElementById('generateSubtitles')!.dispatchEvent(new Event('click'));
      await flushPromises();
      harness.emitMessage({ type: 'ready', totalBytes: 3 });
      await flushPromises();
      harness.emitMessage({ type: 'chunk-accepted', index: 0, receivedBytes: 3, totalBytes: 3 });
      await flushPromises();
      harness.emitMessage({
        type: 'transcription-complete',
        result: {
          text: 'Generated source',
          language: 'en',
          duration: 2,
          segments: [{ id: 1, start: 0.25, end: 1.75, text: 'Generated source' }]
        }
      });
      await flushPromises();
      await flushPromises();

      expect(sendTabMessage).not.toHaveBeenCalled();
      expect(applyButton.disabled).toBe(false);
      applyButton.click();
      await flushPromises();
      expect(sendTabMessage).toHaveBeenNthCalledWith(1, 12, {
        action: 'applyGeneratedVideoSubtitles',
        data: {
          expectedNavigationToken: 'v1:12345678:17',
          cues: [{
            start: 0.25,
            end: 1.75,
            originalText: 'Generated source',
            translatedText: ''
          }]
        }
      }, expect.any(Function));
      expect(document.getElementById('generationStatus')?.textContent)
        .toBe('Applied 1 generated subtitle cue');

      applyButton.click();
      await flushPromises();
      expect(document.getElementById('generationStatus')?.textContent)
        .toBe('Source video rejected the captions.');
      expect(document.getElementById('generationStatus')?.classList.contains('error')).toBe(true);

      clearButton.click();
      await flushPromises();
      expect(sendTabMessage).toHaveBeenNthCalledWith(3, 12, {
        action: 'clearGeneratedVideoSubtitles'
      }, expect.any(Function));
      expect(document.getElementById('generationStatus')?.textContent)
        .toBe('Generated video subtitles cleared');
      expect(document.getElementById('generationStatus')?.classList.contains('error')).toBe(false);
    } finally {
      window.history.replaceState({}, '', '/subtitles.html');
    }
  });

  it('disables unsupported current-tab capture and keeps local media available', async () => {
    window.history.replaceState({}, '', '/subtitles.html?sourceTabId=12');
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'groq', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({ success: true, data: { translationProvider: 'google', defaultTargetLanguage: 'zh-CN' } });
        return;
      }
      callback({ success: true });
    });
    (global as any).chrome = {
      runtime: { sendMessage, connect: jest.fn(), lastError: null, openOptionsPage: jest.fn() }
    };

    require('../subtitles');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    await flushPromises();

    const captureButton = document.getElementById('toggleTabCapture') as HTMLButtonElement;
    const fileInput = document.getElementById('mediaFile') as HTMLInputElement;
    expect(captureButton.disabled).toBe(true);
    expect(captureButton.textContent).toBe('Current-tab capture unavailable');
    expect(captureButton.title).toContain('Choose a local media file instead');
    expect(fileInput.disabled).toBe(false);

    captureButton.dispatchEvent(new Event('click'));
    await flushPromises();
    expect(sendMessage.mock.calls.some(([message]) => message.action === 'getTabAudioCaptureStreamId')).toBe(false);
    expect(document.getElementById('generationStatus')?.textContent)
      .toBe('Current-tab audio capture is not supported in this browser. Choose a local media file instead.');
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
      runtime: { sendMessage, connect, lastError: null, openOptionsPage: jest.fn() },
      tabCapture: { getMediaStreamId: jest.fn() }
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
          transcriptionModel: 'whisper-large-v3-turbo',
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
          provider: 'google',
          requestId: expect.stringMatching(/^subtitle:[A-Za-z0-9:_-]+:1:1$/)
        }
      }, expect.any(Function));
      expect(document.querySelectorAll('.cue-row')).toHaveLength(1);
      const originalInput = document.querySelector('.cue-original') as HTMLTextAreaElement;
      const translationInput = document.querySelector('.cue-translation') as HTMLTextAreaElement;
      const timeInputs = Array.from(document.querySelectorAll('.cue-time-input')) as HTMLInputElement[];
      expect(originalInput.value).toBe('Hello world');
      expect(translationInput.value).toBe('你好，世界');
      expect(document.getElementById('generationStatus')?.textContent).toBe('Generated 1 captions');
      expect((document.getElementById('generationProgress') as HTMLProgressElement).value).toBe(100);

      timeInputs[0]!.value = '1.250';
      timeInputs[0]!.dispatchEvent(new Event('change'));
      timeInputs[1]!.value = '3.750';
      timeInputs[1]!.dispatchEvent(new Event('change'));
      originalInput.value = 'Edited source';
      originalInput.dispatchEvent(new Event('input'));
      translationInput.value = '编辑后的译文';
      translationInput.dispatchEvent(new Event('input'));

      document.getElementById('exportSrt')!.dispatchEvent(new Event('click'));
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(exportedBlob).not.toBeNull();
      expect(await readBlobText(exportedBlob!)).toBe(
        '1\n00:00:01,250 --> 00:00:03,750\nEdited source\n编辑后的译文'
      );
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:captions');
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('shifts, splits, merges, and deletes generated cues locally without new requests', async () => {
    const harness = createPortHarness();
    const connect = jest.fn(() => harness.port);
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'groq', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({ success: true, data: { translationProvider: 'google' } });
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

    const translateCaptions = document.getElementById('translateCaptions') as HTMLInputElement;
    translateCaptions.checked = false;
    translateCaptions.dispatchEvent(new Event('change'));
    setMediaFile(document.getElementById('mediaFile') as HTMLInputElement);
    document.getElementById('generateSubtitles')!.dispatchEvent(new Event('click'));
    await flushPromises();
    harness.emitMessage({ type: 'ready', totalBytes: 3 });
    await flushPromises();
    harness.emitMessage({ type: 'chunk-accepted', index: 0, receivedBytes: 3, totalBytes: 3 });
    await flushPromises();
    harness.emitMessage({
      type: 'transcription-complete',
      result: {
        text: 'Alpha beta Gamma',
        language: 'en',
        duration: 6,
        segments: [
          { id: 1, start: 1, end: 3, text: 'Alpha beta' },
          { id: 2, start: 4, end: 6, text: 'Gamma' }
        ],
        timingMode: 'provider-segments'
      }
    });
    await flushPromises();
    await flushPromises();

    expect(document.querySelectorAll('.cue-row')).toHaveLength(2);
    expect(document.querySelectorAll('.timeline-cue')).toHaveLength(2);
    expect(document.getElementById('timelineDuration')?.textContent).toBe('00:06');
    expect(document.getElementById('cueEditToolbar')?.hidden).toBe(false);
    const firstRow = document.querySelector<HTMLElement>('.cue-row')!;
    const scrollIntoView = jest.fn();
    Object.defineProperty(firstRow, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    (document.querySelector('.timeline-cue') as HTMLButtonElement).click();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(document.activeElement).toBe(firstRow.querySelector('.cue-time-input'));
    const undoButton = document.getElementById('undoTimelineEdit') as HTMLButtonElement;
    const secondEndInput = Array.from(
      document.querySelectorAll<HTMLInputElement>('.cue-time-input')
    )[3]!;
    secondEndInput.value = '6';
    secondEndInput.dispatchEvent(new Event('change'));
    expect(undoButton.disabled).toBe(true);
    secondEndInput.value = '';
    secondEndInput.dispatchEvent(new Event('change'));
    expect(secondEndInput.value).toBe('6.000');
    expect(undoButton.disabled).toBe(true);
    secondEndInput.value = '5.4';
    secondEndInput.dispatchEvent(new Event('change'));
    expect(undoButton.disabled).toBe(false);
    expect(document.getElementById('resultSummary')?.textContent).toContain('00:05');
    expect(document.getElementById('timelineDuration')?.textContent).toBe('00:05');
    undoButton.click();
    expect(document.getElementById('timelineDuration')?.textContent).toBe('00:06');
    const connectionBaseline = connect.mock.calls.length;
    const portMessageBaseline = harness.postMessage.mock.calls.length;
    const runtimeMessageBaseline = sendMessage.mock.calls.length;

    const shiftInput = document.getElementById('timelineShift') as HTMLInputElement;
    shiftInput.value = '-1';
    document.getElementById('applyTimelineShift')!.dispatchEvent(new Event('click'));
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('.cue-time-input')).map(input => input.value))
      .toEqual(['0.000', '2.000', '3.000', '5.000']);
    expect(document.getElementById('generationStatus')?.textContent)
      .toBe('Shifted 2 captions by -1.000 seconds');

    const firstOriginal = document.querySelector('.cue-original') as HTMLTextAreaElement;
    firstOriginal.setSelectionRange(5, 5);
    (document.querySelector('.cue-row button[title^="Split"]') as HTMLButtonElement).click();
    expect(document.querySelectorAll('.cue-row')).toHaveLength(3);
    expect(document.querySelectorAll('.timeline-cue')).toHaveLength(3);
    expect(Array.from(document.querySelectorAll<HTMLTextAreaElement>('.cue-original')).map(input => input.value))
      .toEqual(['Alpha', ' beta', 'Gamma']);

    (document.querySelector('.cue-row button[title*="next caption"]') as HTMLButtonElement).click();
    expect(document.querySelectorAll('.cue-row')).toHaveLength(2);
    expect(document.querySelectorAll('.timeline-cue')).toHaveLength(2);
    expect((document.querySelector('.cue-original') as HTMLTextAreaElement).value).toBe('Alpha\n beta');

    const deleteButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cue-row button[title^="Delete"]')
    );
    deleteButtons[1]!.click();
    expect(document.querySelectorAll('.cue-row')).toHaveLength(1);
    expect(document.querySelectorAll('.timeline-cue')).toHaveLength(1);
    expect(document.getElementById('resultSummary')?.textContent).toContain('1 captions');

    const redoButton = document.getElementById('redoTimelineEdit') as HTMLButtonElement;
    expect(undoButton.disabled).toBe(false);
    undoButton.click();
    expect(document.querySelectorAll('.cue-row')).toHaveLength(2);
    expect(document.querySelectorAll('.timeline-cue')).toHaveLength(2);
    expect(redoButton.disabled).toBe(false);
    redoButton.click();
    expect(document.querySelectorAll('.cue-row')).toHaveLength(1);
    expect(document.querySelectorAll('.timeline-cue')).toHaveLength(1);

    expect(connect).toHaveBeenCalledTimes(connectionBaseline);
    expect(harness.postMessage).toHaveBeenCalledTimes(portMessageBaseline);
    expect(sendMessage).toHaveBeenCalledTimes(runtimeMessageBaseline);
    expect(sendMessage.mock.calls.some(([message]) => message.action === 'translate')).toBe(false);
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

  it('cancels the active caption translation request', async () => {
    const harness = createPortHarness();
    let pendingTranslationCallback: ((response?: any) => void) | null = null;
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'groq', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({ success: true, data: { translationProvider: 'google', defaultTargetLanguage: 'zh-CN' } });
        return;
      }
      if (message.action === 'cancelTranslationRequest') {
        callback({ success: true, data: { cancelled: true } });
        return;
      }
      if (message.action === 'translate') pendingTranslationCallback = callback;
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
    harness.emitMessage({ type: 'ready', totalBytes: 3 });
    await flushPromises();
    harness.emitMessage({ type: 'chunk-accepted', index: 0, receivedBytes: 3, totalBytes: 3 });
    await flushPromises();
    harness.emitMessage({
      type: 'transcription-complete',
      result: {
        text: 'Pending translation',
        language: 'en',
        duration: 2,
        segments: [{ id: 1, start: 0, end: 2, text: 'Pending translation' }]
      }
    });
    await flushPromises();

    document.getElementById('cancelGeneration')!.dispatchEvent(new Event('click'));
    await flushPromises();

    const translationRequest = sendMessage.mock.calls.find(([message]) => message.action === 'translate');
    const translationRequestId = translationRequest?.[0]?.data?.requestId;
    expect(translationRequestId).toEqual(expect.stringMatching(/^subtitle:[A-Za-z0-9:_-]+:1:1$/));
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'cancelTranslationRequest',
      data: { requestId: translationRequestId }
    }, expect.any(Function));
    expect(document.getElementById('generationStatus')?.textContent).toBe('Canceled');
    expect((document.getElementById('cancelGeneration') as HTMLButtonElement).hidden).toBe(true);

    const rejectLateTranslation = pendingTranslationCallback as ((response?: any) => void) | null;
    expect(rejectLateTranslation).not.toBeNull();
    (chrome.runtime as any).lastError = { message: 'The translation channel closed.' };
    rejectLateTranslation?.();
    (chrome.runtime as any).lastError = null;
    await flushPromises();

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
      runtime: { sendMessage, connect, lastError: null, openOptionsPage: jest.fn() },
      tabCapture: { getMediaStreamId: jest.fn() }
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
    const captureOrder: string[] = [];
    const getUserMedia = jest.fn().mockImplementation(async () => {
      captureOrder.push('media-stream');
      return mediaStream;
    });
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
      runtime: { sendMessage, connect, lastError: null, openOptionsPage: jest.fn() },
      tabCapture: { getMediaStreamId: jest.fn() },
      tabs: {
        sendMessage: jest.fn((_tabId, message, callback) => {
          if (message.action === 'getVideoPlaybackPosition') {
            captureOrder.push('playback-position');
            callback({ success: true, data: { currentTime: 120.5 } });
          }
        })
      }
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
      expect(captureOrder).toEqual(['media-stream', 'playback-position']);
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
          transcriptionModel: 'whisper-large-v3-turbo',
          fileName: expect.stringMatching(/^tab-audio-.+\.webm$/),
          mimeType: 'audio/webm;codecs=opus',
          totalBytes: 3
        })
      }));
      expect(recorderInstance!.ondataavailable).toBeNull();
      expect(recorderInstance!.onerror).toBeNull();
      expect(recorderInstance!.onstop).toBeNull();

      harness.emitMessage({ type: 'transcribing' });
      expect((document.getElementById('generationProgress') as HTMLProgressElement).hasAttribute('value')).toBe(false);
      expect(document.getElementById('progressText')?.textContent).toBe('Processing');
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

      const generatedTimes = Array.from(document.querySelectorAll('.cue-time-input')) as HTMLInputElement[];
      expect(generatedTimes.map(input => input.value)).toEqual(['120.500', '121.500']);

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
