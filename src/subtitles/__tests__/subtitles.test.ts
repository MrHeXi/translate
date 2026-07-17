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

describe('AI subtitle generator', () => {
  beforeEach(() => {
    jest.resetModules();
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
});
