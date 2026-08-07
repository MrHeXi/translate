import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ImageWorkspaceController } from '../image';
import {
  LocalImageTranslationEngine,
  LocalImageTranslationOptions,
  LocalImageTranslationResult
} from '../../services/LocalImageTranslationService';

const html = readFileSync(resolve(__dirname, '..', 'image.html'), 'utf8');

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolvePromise => setTimeout(resolvePromise, 0));
};

const createResult = (): LocalImageTranslationResult => {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  return {
    canvas,
    sourceTexts: ['Hello'],
    translatedTexts: ['Bonjour'],
    reconstructedBlockCount: 1,
    overlayBlockCount: 0
  };
};

describe('ImageWorkspaceController', () => {
  let sendMessage: jest.Mock;
  let storageSet: jest.Mock;
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let originalImage: typeof Image;

  beforeEach(() => {
    document.documentElement.innerHTML = html;
    originalImage = global.Image;
    let objectUrlSequence = 0;
    createObjectURL = jest.fn(() => `blob:image-${++objectUrlSequence}`);
    revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    (global as any).Image = jest.fn(() => {
      const image = document.createElement('img');
      let source = '';
      Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 160 });
      Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 90 });
      Object.defineProperty(image, 'src', {
        configurable: true,
        get: () => source,
        set: value => {
          source = String(value);
          queueMicrotask(() => image.onload?.(new Event('load')));
        }
      });
      return image;
    });
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: jest.fn()
    } as unknown as CanvasRenderingContext2D);

    sendMessage = jest.fn((message: any, callback: (response: any) => void) => {
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: {
            translationProvider: 'google',
            defaultTargetLanguage: 'fr',
            documentOcrLanguage: 'eng'
          }
        });
      } else if (message.action === 'translate') {
        callback({ success: true, data: { translatedText: 'Bonjour' } });
      } else {
        callback({ success: true });
      }
    });
    storageSet = jest.fn((_value: unknown, callback: () => void) => callback());
    (global as any).chrome = {
      runtime: {
        lastError: null,
        sendMessage,
        openOptionsPage: jest.fn()
      },
      storage: {
        local: {
          get: jest.fn((_key: string, callback: (value: unknown) => void) => callback({})),
          set: storageSet,
          remove: jest.fn((_keys: string[], callback: () => void) => callback())
        }
      }
    };
  });

  afterEach(() => {
    global.Image = originalImage;
    jest.restoreAllMocks();
  });

  it('loads a preview without OCR and starts translation only after a user click', async () => {
    const translate = jest.fn(async (_canvas: HTMLCanvasElement, options: LocalImageTranslationOptions) => {
      await options.translateText('Hello', {
        requestId: 'image-workspace:test:1',
        signal: options.signal
      });
      return createResult();
    });
    const controller = new ImageWorkspaceController({ translate } as LocalImageTranslationEngine);
    await controller.initialize();

    expect(translate).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls.filter(call => call[0].action === 'translate')).toHaveLength(0);
    await controller.addFiles([new File(['image'], 'screen.png', { type: 'image/png' })]);
    expect(translate).not.toHaveBeenCalled();
    expect(document.getElementById('queueCount')?.textContent).toBe('1');

    (document.getElementById('translateImage') as HTMLButtonElement).click();
    await flushPromises();

    expect(translate).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls.filter(call => call[0].action === 'translate')).toHaveLength(1);
    expect((document.getElementById('showTranslation') as HTMLButtonElement).disabled).toBe(false);
    expect(document.getElementById('imageStatus')?.textContent).toContain('1 text block translated');
  });

  it('treats image paste as loading only and ignores ordinary text paste', async () => {
    const translate = jest.fn(async () => createResult());
    const controller = new ImageWorkspaceController({ translate } as LocalImageTranslationEngine);
    await controller.initialize();
    const file = new File(['image'], 'pasted.webp', { type: 'image/webp' });
    const imagePaste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(imagePaste, 'clipboardData', {
      value: {
        items: [{ kind: 'file', type: 'image/webp', getAsFile: () => file }]
      }
    });
    document.dispatchEvent(imagePaste);
    await flushPromises();

    expect(imagePaste.defaultPrevented).toBe(true);
    expect(document.getElementById('queueCount')?.textContent).toBe('1');
    expect(translate).not.toHaveBeenCalled();

    const textPaste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(textPaste, 'clipboardData', {
      value: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] }
    });
    document.dispatchEvent(textPaste);
    await flushPromises();
    expect(textPaste.defaultPrevented).toBe(false);
    expect(document.getElementById('queueCount')?.textContent).toBe('1');
  });

  it('changes the active command to Stop and rejects a late result after stopping', async () => {
    const pending: {
      resolve?: (result: LocalImageTranslationResult) => void;
      signal?: AbortSignal;
    } = {};
    const translate = jest.fn((_canvas: HTMLCanvasElement, options: LocalImageTranslationOptions) => {
      pending.signal = options.signal;
      return new Promise<LocalImageTranslationResult>(resolve => {
        pending.resolve = resolve;
      });
    });
    const controller = new ImageWorkspaceController({ translate } as LocalImageTranslationEngine);
    await controller.initialize();
    await controller.addFiles([new File(['image'], 'menu.jpg', { type: 'image/jpeg' })]);

    const command = document.getElementById('translateImage') as HTMLButtonElement;
    command.click();
    await Promise.resolve();
    expect(command.textContent).toBe('Stop');
    command.click();

    expect(pending.signal?.aborted).toBe(true);
    expect(command.textContent).toBe('Translate image');
    expect(document.getElementById('workspaceStatus')?.textContent).toBe('Translation stopped');
    pending.resolve?.(createResult());
    await flushPromises();
    expect((document.getElementById('showTranslation') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends background cancellation and ignores a late provider response after Stop', async () => {
    const provider: { reply?: (response: any) => void } = {};
    sendMessage.mockImplementation((message: any, callback: (response: any) => void) => {
      if (message.action === 'getSettings') {
        callback({ success: true, data: {} });
      } else if (message.action === 'translate') {
        provider.reply = callback;
      } else {
        callback({ success: true });
      }
    });
    const translate = jest.fn(async (_canvas: HTMLCanvasElement, options: LocalImageTranslationOptions) => {
      await options.translateText('Hello', {
        requestId: 'image-workspace:provider:1',
        signal: options.signal
      });
      return createResult();
    });
    const controller = new ImageWorkspaceController({ translate } as LocalImageTranslationEngine);
    await controller.initialize();
    await controller.addFiles([new File(['image'], 'provider.png', { type: 'image/png' })]);
    const command = document.getElementById('translateImage') as HTMLButtonElement;
    command.click();
    await Promise.resolve();
    await Promise.resolve();
    command.click();

    expect(sendMessage.mock.calls.some(call => call[0].action === 'cancelTranslationRequest')).toBe(true);
    provider.reply?.({ success: true, data: { translatedText: 'Late translation' } });
    await flushPromises();
    expect((document.getElementById('showTranslation') as HTMLButtonElement).disabled).toBe(true);
  });

  it('stores quality feedback locally without source text or file names', async () => {
    const controller = new ImageWorkspaceController({
      translate: jest.fn(async () => createResult())
    });
    await controller.initialize();
    await controller.addFiles([new File(['image'], 'private-menu.png', { type: 'image/png' })]);
    (document.getElementById('translateImage') as HTMLButtonElement).click();
    await flushPromises();
    (document.getElementById('qualityGood') as HTMLButtonElement).click();
    await flushPromises();

    expect(storageSet).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(storageSet.mock.calls[0][0]);
    expect(serialized).toContain('"rating":"good"');
    expect(serialized).not.toContain('Hello');
    expect(serialized).not.toContain('private-menu');
  });

  it('cancels an unfinished decode and revokes its object URL on Clear', async () => {
    (global as any).Image = jest.fn(() => {
      const image = document.createElement('img');
      Object.defineProperty(image, 'src', {
        configurable: true,
        get: () => 'blob:pending',
        set: () => {}
      });
      return image;
    });
    const controller = new ImageWorkspaceController({
      translate: jest.fn(async () => createResult())
    });
    await controller.initialize();
    const loading = controller.addFiles([new File(['image'], 'pending.png', { type: 'image/png' })]);
    await Promise.resolve();
    (document.getElementById('clearImages') as HTMLButtonElement).click();
    await loading;

    expect(document.getElementById('queueCount')?.textContent).toBe('0');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-1');
  });

  it('continues a Translate all batch after one image fails', async () => {
    const translate = jest.fn()
      .mockRejectedValueOnce(new Error('Unreadable image'))
      .mockResolvedValueOnce(createResult());
    const controller = new ImageWorkspaceController({ translate } as LocalImageTranslationEngine);
    await controller.initialize();
    await controller.addFiles([
      new File(['first'], 'first.png', { type: 'image/png' }),
      new File(['second'], 'second.png', { type: 'image/png' })
    ]);
    (document.getElementById('translateAllImages') as HTMLButtonElement).click();
    await flushPromises();

    expect(translate).toHaveBeenCalledTimes(2);
    expect(document.getElementById('workspaceStatus')?.textContent).toBe('1 translated; 1 failed');
    expect(document.querySelectorAll('.queue-item-status')).toHaveLength(2);
  });

  it('serializes concurrent file additions so queue limits cannot be bypassed', async () => {
    const controller = new ImageWorkspaceController({
      translate: jest.fn(async () => createResult())
    });
    await controller.initialize();
    const additions = Array.from({ length: 13 }, (_item, index) => controller.addFiles([
      new File(['image'], `image-${index}.png`, { type: 'image/png' })
    ]));
    await Promise.all(additions);

    expect(document.getElementById('queueCount')?.textContent).toBe('12');
    expect(createObjectURL).toHaveBeenCalledTimes(12);
  });

  it('downloads a completed result only after a click and revokes the download URL', async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      callback(new Blob(['png'], { type: 'image/png' }));
    });
    const controller = new ImageWorkspaceController({
      translate: jest.fn(async () => createResult())
    });
    await controller.initialize();
    await controller.addFiles([new File(['image'], 'menu.png', { type: 'image/png' })]);
    expect(click).not.toHaveBeenCalled();
    (document.getElementById('translateImage') as HTMLButtonElement).click();
    await flushPromises();
    (document.getElementById('downloadTranslation') as HTMLButtonElement).click();
    await flushPromises();

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-2');
  });

  it('cancels a pending PNG encoding when Retranslate starts', async () => {
    const pendingPng: { callback?: BlobCallback } = {};
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      pendingPng.callback = callback;
    });
    const pendingRetranslation: { resolve?: (result: LocalImageTranslationResult) => void } = {};
    const translate = jest.fn()
      .mockResolvedValueOnce(createResult())
      .mockImplementationOnce(() => new Promise<LocalImageTranslationResult>(resolve => {
        pendingRetranslation.resolve = resolve;
      }));
    const controller = new ImageWorkspaceController({ translate } as LocalImageTranslationEngine);
    await controller.initialize();
    await controller.addFiles([new File(['image'], 'menu.png', { type: 'image/png' })]);
    (document.getElementById('translateImage') as HTMLButtonElement).click();
    await flushPromises();
    (document.getElementById('downloadTranslation') as HTMLButtonElement).click();
    await Promise.resolve();
    (document.getElementById('translateImage') as HTMLButtonElement).click();
    pendingPng.callback?.(new Blob(['late'], { type: 'image/png' }));
    await flushPromises();

    expect(click).not.toHaveBeenCalled();
    expect((document.getElementById('translateImage') as HTMLButtonElement).textContent).toBe('Stop');
    (document.getElementById('translateImage') as HTMLButtonElement).click();
    pendingRetranslation.resolve?.(createResult());
  });

  it('serializes rapid quality updates under one per-image storage key', async () => {
    const pendingWrites: Array<() => void> = [];
    storageSet.mockImplementation((_value: unknown, callback: () => void) => pendingWrites.push(callback));
    const controller = new ImageWorkspaceController({
      translate: jest.fn(async () => createResult())
    });
    await controller.initialize();
    await controller.addFiles([new File(['image'], 'rating.png', { type: 'image/png' })]);
    (document.getElementById('translateImage') as HTMLButtonElement).click();
    await flushPromises();
    (document.getElementById('qualityGood') as HTMLButtonElement).click();
    (document.getElementById('qualityPoor') as HTMLButtonElement).click();
    await Promise.resolve();

    expect(storageSet).toHaveBeenCalledTimes(1);
    pendingWrites.shift()?.();
    await flushPromises();
    expect(storageSet).toHaveBeenCalledTimes(2);
    const firstKey = Object.keys(storageSet.mock.calls[0][0])[0];
    const secondKey = Object.keys(storageSet.mock.calls[1][0])[0];
    expect(firstKey).toBe(secondKey);
    pendingWrites.shift()?.();
    await flushPromises();
    expect(document.getElementById('imageStatus')?.textContent).toBe('Poor result saved locally');
  });
});
