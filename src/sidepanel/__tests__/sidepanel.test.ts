import { readFileSync } from 'fs';
import path from 'path';

const sidePanelHtml = readFileSync(
  path.join(__dirname, '..', 'sidepanel.html'),
  'utf8'
);
const body = sidePanelHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || sidePanelHtml;

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('translation side panel', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = body;
  });

  it('loads configured providers without translating until the user submits text', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({
          success: true,
          data: [{ providerId: 'openai', configured: true }]
        });
        return;
      }
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: { translationProvider: 'openai', defaultTargetLanguage: 'fr' }
        });
        return;
      }
      if (message.action === 'translate') {
        callback({ success: true, data: { translatedText: 'Bonjour le monde' } });
        return;
      }
      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: {
        sendMessage,
        lastError: null,
        openOptionsPage: jest.fn()
      }
    };

    require('../sidepanel');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    await flushPromises();

    const provider = document.getElementById('translationProvider') as HTMLSelectElement;
    const target = document.getElementById('targetLanguage') as HTMLSelectElement;
    expect(provider.options).toHaveLength(26);
    expect(provider.value).toBe('openai');
    expect(target.value).toBe('fr');
    expect(Array.from(provider.options).find(option => option.value === 'openai')?.disabled).toBe(false);
    expect(Array.from(provider.options).find(option => option.value === 'ollama')?.disabled).toBe(true);
    expect(sendMessage.mock.calls.some(([message]) => message.action === 'translate')).toBe(false);

    const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;
    sourceText.value = 'Hello world';
    sourceText.dispatchEvent(new Event('input'));
    document.getElementById('translateText')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith({
      action: 'translate',
      data: {
        text: 'Hello world',
        sourceLang: 'auto',
        targetLang: 'fr',
        provider: 'openai'
      }
    }, expect.any(Function));
    expect(document.getElementById('translationResult')?.textContent).toBe('Bonjour le monde');
    expect((document.getElementById('resultSection') as HTMLElement).hidden).toBe(false);
    expect(document.getElementById('characterCount')?.textContent).toBe('11 characters');
  });

  it('filters target languages and supports copy, clear, settings, and Ctrl+Enter', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    const openOptionsPage = jest.fn();
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({
          success: true,
          data: [{ providerId: 'caiyun', configured: true }]
        });
        return;
      }
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: { translationProvider: 'caiyun', defaultTargetLanguage: 'fr' }
        });
        return;
      }
      if (message.action === 'translate') {
        callback({ success: true, data: { translatedText: 'Translated result' } });
        return;
      }
      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: { sendMessage, lastError: null, openOptionsPage }
    };

    require('../sidepanel');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    await flushPromises();

    const target = document.getElementById('targetLanguage') as HTMLSelectElement;
    expect(target.value).toBe('zh-CN');
    expect(Array.from(target.options).find(option => option.value === 'fr')?.disabled).toBe(true);
    expect(Array.from(target.options).find(option => option.value === 'ko')?.disabled).toBe(false);

    const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;
    sourceText.value = 'Hello';
    sourceText.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await flushPromises();

    expect(sendMessage.mock.calls.filter(([message]) => message.action === 'translate')).toHaveLength(1);
    document.getElementById('copyTranslation')!.dispatchEvent(new Event('click'));
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('Translated result');

    document.getElementById('openSettings')!.dispatchEvent(new Event('click'));
    expect(openOptionsPage).toHaveBeenCalledTimes(1);

    document.getElementById('clearText')!.dispatchEvent(new Event('click'));
    expect(sourceText.value).toBe('');
    expect((document.getElementById('resultSection') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('copyTranslation') as HTMLButtonElement).disabled).toBe(true);
  });

  it('runs AI reply only after submission and restricts writing modes to configured AI providers', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'openai', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: { translationProvider: 'google', defaultTargetLanguage: 'fr' }
        });
        return;
      }
      if (message.action === 'processAiText') {
        callback({
          success: true,
          data: { outputText: 'Tuesday works well. Thank you.' }
        });
        return;
      }
      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: {
        sendMessage,
        lastError: null,
        openOptionsPage: jest.fn()
      }
    };

    require('../sidepanel');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    await flushPromises();

    const replyTab = document.querySelector<HTMLButtonElement>('[data-mode="reply"]')!;
    replyTab.click();

    const provider = document.getElementById('translationProvider') as HTMLSelectElement;
    const target = document.getElementById('targetLanguage') as HTMLSelectElement;
    expect((document.getElementById('aiControls') as HTMLElement).hidden).toBe(false);
    expect(provider.value).toBe('openai');
    expect(Array.from(provider.options).find(option => option.value === 'google')?.disabled).toBe(true);
    expect(target.value).toBe('same');
    expect(sendMessage.mock.calls.some(([message]) => message.action === 'processAiText')).toBe(false);

    (document.getElementById('writingTone') as HTMLSelectElement).value = 'professional';
    (document.getElementById('writingLength') as HTMLSelectElement).value = 'shorter';
    (document.getElementById('writingInstruction') as HTMLInputElement).value = 'Suggest next Tuesday.';
    const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;
    sourceText.value = 'Can you meet tomorrow?';
    document.getElementById('translateText')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith({
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
    }, expect.any(Function));
    expect(document.getElementById('resultHeading')?.textContent).toBe('Reply draft');
    expect(document.getElementById('translationResult')?.textContent).toBe('Tuesday works well. Thank you.');

    document.getElementById('useResultAsInput')!.dispatchEvent(new Event('click'));
    expect(sourceText.value).toBe('Tuesday works well. Thank you.');

    document.querySelector<HTMLButtonElement>('[data-mode="translate"]')!.click();
    expect(provider.value).toBe('google');
    expect(target.value).toBe('fr');
  });

  it('keeps writing submission disabled when no AI provider is configured', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: { translationProvider: 'google', defaultTargetLanguage: 'zh-CN' }
        });
        return;
      }
      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: {
        sendMessage,
        lastError: null,
        openOptionsPage: jest.fn()
      }
    };

    require('../sidepanel');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    await flushPromises();

    document.querySelector<HTMLButtonElement>('[data-mode="polish"]')!.click();
    expect((document.getElementById('translationProvider') as HTMLSelectElement).value).toBe('');
    expect((document.getElementById('translateText') as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById('panelStatus')?.textContent).toContain('Configure an AI provider');
    expect(sendMessage.mock.calls.some(([message]) => message.action === 'processAiText')).toBe(false);
  });
});
