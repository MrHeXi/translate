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
    expect(provider.options).toHaveLength(29);
    expect(provider.value).toBe('openai');
    expect(target.value).toBe('fr');
    expect(Array.from(provider.options).find(option => option.value === 'openai')?.disabled).toBe(false);
    expect(Array.from(provider.options).find(option => option.value === 'ollama')?.disabled).toBe(true);
    expect(sendMessage.mock.calls.some(([message]) => message.action === 'translate')).toBe(false);
    expect(sendMessage.mock.calls.some(([message]) => message.action === 'processAiText')).toBe(false);

    const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;
    sourceText.value = 'Hello world';
    sourceText.dispatchEvent(new Event('input'));
    document.getElementById('translateText')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith({
      action: 'translate',
      data: {
        requestId: expect.stringMatching(/^sidepanel-translate:[A-Za-z0-9:_-]+$/),
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

  it('turns ordinary translation into a true Stop action and ignores late results', async () => {
    const translateCallbacks: Array<(response: any) => void> = [];
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: { translationProvider: 'google', defaultTargetLanguage: 'fr' }
        });
        return;
      }
      if (message.action === 'translate') {
        translateCallbacks.push(callback);
        return;
      }
      if (message.action === 'cancelTranslationRequest') {
        callback({ success: true, data: { cancelled: true } });
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

    const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;
    const translateButton = document.getElementById('translateText') as HTMLButtonElement;
    sourceText.value = 'Hello world';
    translateButton.click();

    const firstRequest = sendMessage.mock.calls.find(
      ([message]) => message.action === 'translate'
    )?.[0];
    expect(firstRequest.data.requestId).toMatch(/^sidepanel-translate:[A-Za-z0-9:_-]+$/);
    expect(translateButton.textContent).toBe('Stop');
    expect(translateButton.disabled).toBe(false);

    translateButton.click();
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'cancelTranslationRequest',
      data: { requestId: firstRequest.data.requestId }
    }, expect.any(Function));
    expect(translateButton.textContent).toBe('Translate');
    expect(document.getElementById('panelStatus')?.textContent).toBe('Stopped.');

    translateCallbacks[0]!({ success: true, data: { translatedText: 'Late result' } });
    await flushPromises();
    expect(document.getElementById('translationResult')?.textContent).not.toBe('Late result');

    sourceText.value = 'Second request';
    translateButton.click();
    const secondRequest = sendMessage.mock.calls
      .filter(([message]) => message.action === 'translate')[1]![0];
    document.getElementById('clearText')!.click();
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'cancelTranslationRequest',
      data: { requestId: secondRequest.data.requestId }
    }, expect.any(Function));
    expect(sourceText.value).toBe('');
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
        requestId: expect.stringMatching(/^sidepanel-ai:[A-Za-z0-9:_-]+$/),
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

  it('turns the AI run button into Stop, cancels once, and ignores the stopped result', async () => {
    const processCallbacks: Array<(response: any) => void> = [];
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [{ providerId: 'openai', configured: true }] });
        return;
      }
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: { translationProvider: 'openai', defaultTargetLanguage: 'zh-CN' }
        });
        return;
      }
      if (message.action === 'processAiText') {
        processCallbacks.push(callback);
        return;
      }
      if (message.action === 'cancelTranslationRequest') {
        callback({ success: true, data: { cancelled: true } });
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

    expect(sendMessage.mock.calls.some(([message]) => message.action === 'processAiText')).toBe(false);
    document.querySelector<HTMLButtonElement>('[data-mode="rewrite"]')!.click();
    const sourceText = document.getElementById('sourceText') as HTMLTextAreaElement;
    const runButton = document.getElementById('translateText') as HTMLButtonElement;
    const idleLabel = runButton.textContent;
    sourceText.value = 'Rewrite this sentence.';

    runButton.click();
    const firstProcessMessage = sendMessage.mock.calls.find(
      ([message]) => message.action === 'processAiText'
    )?.[0];
    expect(firstProcessMessage?.data.requestId).toMatch(/^sidepanel-ai:[A-Za-z0-9:_-]+$/);
    expect(runButton.textContent).toBe('Stop');
    expect(runButton.disabled).toBe(false);

    sourceText.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true
    }));
    expect(sendMessage.mock.calls.filter(([message]) => message.action === 'processAiText')).toHaveLength(1);

    runButton.click();
    expect(sendMessage.mock.calls.filter(([message]) => message.action === 'cancelTranslationRequest')).toEqual([
      [{
        action: 'cancelTranslationRequest',
        data: { requestId: firstProcessMessage.data.requestId }
      }, expect.any(Function)]
    ]);
    expect(sendMessage.mock.calls.filter(([message]) => message.action === 'processAiText')).toHaveLength(1);
    expect(runButton.textContent).toBe(idleLabel);
    expect(runButton.disabled).toBe(false);
    expect(document.getElementById('panelStatus')?.textContent).toBe('Stopped.');

    processCallbacks[0]!({ success: true, data: { outputText: 'Stale result' } });
    await flushPromises();
    expect(document.getElementById('translationResult')?.textContent).not.toBe('Stale result');

    runButton.click();
    const processMessages = sendMessage.mock.calls
      .filter(([message]) => message.action === 'processAiText')
      .map(([message]) => message);
    expect(processMessages).toHaveLength(2);
    expect(processMessages[1].data.requestId).not.toBe(firstProcessMessage.data.requestId);
    document.getElementById('clearText')!.click();
    expect(sourceText.value).toBe('');
    expect(sendMessage.mock.calls.filter(([message]) => message.action === 'cancelTranslationRequest'))
      .toHaveLength(2);

    sourceText.value = 'One final request.';
    runButton.click();
    const thirdProcessMessage = sendMessage.mock.calls
      .filter(([message]) => message.action === 'processAiText')[2]![0];
    window.dispatchEvent(new Event('pagehide'));
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'cancelTranslationRequest',
      data: { requestId: thirdProcessMessage.data.requestId }
    }, expect.any(Function));
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
