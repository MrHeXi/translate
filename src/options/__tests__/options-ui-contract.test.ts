describe('options UI settings contract', () => {
  const setupDom = (): void => {
    document.body.innerHTML = `
      <button id="saveSettings"></button>
      <button id="resetToDefault"></button>
      <button id="exportData"></button>
      <button id="importData"></button>
      <input id="importFile" type="file">
      <button id="forcSync"></button>
      <button id="clearVocabulary"></button>
      <button id="resetSettings"></button>
      <button id="clearAllData"></button>
      <button id="viewVocabulary"></button>
      <button id="startReview"></button>
      <select id="targetLanguage"><option value="zh-CN" selected>Chinese</option></select>
      <select id="documentOcrLanguage"><option value="eng" selected>English</option></select>
      <input id="aiContextEnabled" type="checkbox">
      <select id="aiTranslationDomain"><option value="general" selected>General</option></select>
      <textarea id="translationGlossary"></textarea>
      <textarea id="aiCustomPrompt"></textarea>
      <select id="translationProvider"><option value="google" selected>Google</option></select>
      <section id="providerConfigPanel" hidden>
        <h4 id="providerConfigTitle"></h4>
        <p id="providerConfigStatus"></p>
        <button id="removeProviderConfig" type="button" disabled></button>
        <label id="providerApiKeyField"><input id="providerApiKey" type="password"></label>
        <label id="providerEndpointField"><input id="providerEndpoint" type="url"></label>
        <label id="providerModelField"><input id="providerModel" type="text"></label>
        <label id="providerRegionField"><input id="providerRegion" type="text"></label>
        <p id="providerConfigMessage"></p>
        <button id="saveProviderConfig" type="button"></button>
      </section>
      <select id="pageTranslationDisplayMode">
        <option value="bilingual" selected>Bilingual</option>
        <option value="translation-only">Translation only</option>
        <option value="original-only">Original only</option>
      </select>
      <select id="translationStyle">
        <option value="subtle" selected>Subtle</option>
        <option value="highlight">Highlight</option>
        <option value="plain">Plain text</option>
      </select>
      <select id="pageTranslationScope">
        <option value="main-content" selected>Main content</option>
        <option value="whole-page">Whole page</option>
      </select>
      <select id="iconPosition">
        <option value="top-left" selected>Top left</option>
        <option value="top-right">Top right</option>
        <option value="bottom-right">Bottom right</option>
        <option value="bottom-left">Bottom left</option>
      </select>
      <input id="autoTranslate" type="checkbox">
      <input id="showFloatingIcon" type="checkbox">
      <textarea id="pageTranslationExcludeSelectors"></textarea>
      <input id="siteRulePattern">
      <input id="siteRuleTranslationEnabled" type="checkbox" checked>
      <select id="siteRuleDisplayMode">
        <option value="" selected>Use global</option>
        <option value="bilingual">Bilingual</option>
        <option value="translation-only">Translation only</option>
        <option value="original-only">Original only</option>
      </select>
      <select id="siteRuleTranslationStyle">
        <option value="" selected>Use global</option>
        <option value="subtle">Subtle</option>
        <option value="highlight">Highlight</option>
        <option value="plain">Plain text</option>
      </select>
      <select id="siteRuleTranslationScope">
        <option value="" selected>Use global</option>
        <option value="main-content">Main content</option>
        <option value="whole-page">Whole page</option>
      </select>
      <textarea id="siteRuleExcludeSelectors"></textarea>
      <p id="siteRuleMessage"></p>
      <button id="saveSiteRule" type="button">Add rule</button>
      <button id="cancelSiteRule" type="button" hidden>Cancel</button>
      <div id="siteRuleList"></div>
      <input id="learningModeEnabled" type="checkbox">
      <input id="dailyGoal" value="20">
      <input id="greEnabled" type="checkbox" checked>
      <input id="toeflEnabled" type="checkbox">
      <input id="ieltsEnabled" type="checkbox">
      <input id="cet4Enabled" type="checkbox">
      <input id="cet6Enabled" type="checkbox">
      <input id="greColor" value="#ff6b6b">
      <input id="toeflColor" value="#4ecdc4">
      <input id="ieltsColor" value="#45b7d1">
      <input id="cet4Color" value="#96ceb4">
      <input id="cet6Color" value="#feca57">
      <select id="reviewInterval"><option value="spaced" selected>Spaced</option></select>
      <select id="difficultyAdjustment"><option value="auto" selected>Auto</option></select>
      <span id="totalVocabulary"></span>
      <span id="currentStreak"></span>
      <span id="reviewAccuracy"></span>
      <span id="timeSpent"></span>
      <span id="greTotal"></span>
      <span id="greLearned"></span>
      <span id="toeflTotal"></span>
      <span id="toeflLearned"></span>
      <span id="ieltsTotal"></span>
      <span id="ieltsLearned"></span>
      <span id="cet4Total"></span>
      <span id="cet4Learned"></span>
      <span id="cet6Total"></span>
      <span id="cet6Learned"></span>
    `;
  };

  const flushPromises = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  const createSettings = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    defaultTargetLanguage: 'zh-CN',
    documentOcrLanguage: 'eng',
    aiContextEnabled: false,
    aiTranslationDomain: 'general',
    translationGlossary: [],
    aiCustomPrompt: '',
    translationProvider: 'google',
    pageTranslationDisplayMode: 'bilingual',
    pageTranslationScope: 'main-content',
    autoTranslate: false,
    showFloatingIcon: true,
    floatingIconPosition: { x: 72, y: 96 },
    learningModeEnabled: false,
    activeDictionaries: ['gre'],
    highlightColors: {
      gre: '#ff6b6b',
      toefl: '#4ecdc4',
      ielts: '#45b7d1',
      cet4: '#96ceb4',
      cet6: '#feca57'
    },
    dailyGoal: 20,
    reviewInterval: 'spaced',
    difficultyAdjustment: 'auto',
    ...overrides
  });

  const createStats = (): Record<string, number> => ({
    totalWordsLearned: 0,
    dailyGoal: 20,
    currentStreak: 0,
    longestStreak: 0,
    reviewAccuracy: 0,
    timeSpentLearning: 0
  });

  beforeEach(() => {
    jest.resetModules();
    setupDom();
  });

  it('saves floating-icon, OCR, and AI translation controls together', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: {
            defaultTargetLanguage: 'zh-CN',
            translationProvider: 'google',
            pageTranslationDisplayMode: 'bilingual',
            autoTranslate: false,
            showFloatingIcon: true,
            floatingIconPosition: { x: 72, y: 96 },
            learningModeEnabled: false,
            activeDictionaries: ['gre'],
            highlightColors: {
              gre: '#ff6b6b',
              toefl: '#4ecdc4',
              ielts: '#45b7d1',
              cet4: '#96ceb4',
              cet6: '#feca57'
            },
            dailyGoal: 20,
            reviewInterval: 'spaced',
            difficultyAdjustment: 'auto'
          }
        });
        return;
      }

      if (message.action === 'getLearningStats') {
        callback({
          success: true,
          data: {
            totalWordsLearned: 0,
            dailyGoal: 20,
            currentStreak: 0,
            longestStreak: 0,
            reviewAccuracy: 0,
            timeSpentLearning: 0
          }
        });
        return;
      }

      if (message.action === 'getDictionaryProgress') {
        callback({ success: true, data: {} });
        return;
      }

      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: {
        sendMessage,
        lastError: null
      }
    };

    require('../options');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const showFloatingIcon = document.getElementById('showFloatingIcon') as HTMLInputElement;
    showFloatingIcon.checked = false;
    (document.getElementById('documentOcrLanguage') as HTMLSelectElement).value = 'chi_sim';
    (document.getElementById('aiContextEnabled') as HTMLInputElement).checked = true;
    (document.getElementById('aiTranslationDomain') as HTMLSelectElement).value = 'legal';
    (document.getElementById('translationGlossary') as HTMLTextAreaElement).value = [
      'force majeure => 不可抗力',
      'API => 应用程序接口'
    ].join('\n');
    (document.getElementById('aiCustomPrompt') as HTMLTextAreaElement).value = 'Keep clause numbering.';
    document.getElementById('saveSettings')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'updateSettings',
        data: expect.objectContaining({
          showFloatingIcon: false,
          documentOcrLanguage: 'chi_sim',
          aiContextEnabled: true,
          aiTranslationDomain: 'legal',
          translationGlossary: [
            { source: 'force majeure', target: '不可抗力' },
            { source: 'API', target: '应用程序接口' }
          ],
          aiCustomPrompt: 'Keep clause numbering.'
        })
      }),
      expect.any(Function)
    );
  });

  it('saves the selected page translation display mode', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: {
            defaultTargetLanguage: 'zh-CN',
            translationProvider: 'google',
            pageTranslationDisplayMode: 'bilingual',
            autoTranslate: false,
            showFloatingIcon: true,
            floatingIconPosition: { x: 72, y: 96 },
            learningModeEnabled: false,
            activeDictionaries: ['gre'],
            highlightColors: {
              gre: '#ff6b6b',
              toefl: '#4ecdc4',
              ielts: '#45b7d1',
              cet4: '#96ceb4',
              cet6: '#feca57'
            },
            dailyGoal: 20,
            reviewInterval: 'spaced',
            difficultyAdjustment: 'auto'
          }
        });
        return;
      }

      if (message.action === 'getLearningStats') {
        callback({
          success: true,
          data: {
            totalWordsLearned: 0,
            dailyGoal: 20,
            currentStreak: 0,
            longestStreak: 0,
            reviewAccuracy: 0,
            timeSpentLearning: 0
          }
        });
        return;
      }

      if (message.action === 'getDictionaryProgress') {
        callback({ success: true, data: {} });
        return;
      }

      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: {
        sendMessage,
        lastError: null
      }
    };

    require('../options');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const displayMode = document.getElementById('pageTranslationDisplayMode') as HTMLSelectElement;
    displayMode.value = 'translation-only';
    document.getElementById('saveSettings')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'updateSettings',
        data: expect.objectContaining({ pageTranslationDisplayMode: 'translation-only' })
      }),
      expect.any(Function)
    );
  });

  it('saves page translation exclude selectors from newline and comma separated input', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: {
            defaultTargetLanguage: 'zh-CN',
            translationProvider: 'google',
            pageTranslationDisplayMode: 'bilingual',
            autoTranslate: false,
            showFloatingIcon: true,
            pageTranslationExcludeSelectors: ['aside'],
            floatingIconPosition: { x: 72, y: 96 },
            learningModeEnabled: false,
            activeDictionaries: ['gre'],
            highlightColors: {
              gre: '#ff6b6b',
              toefl: '#4ecdc4',
              ielts: '#45b7d1',
              cet4: '#96ceb4',
              cet6: '#feca57'
            },
            dailyGoal: 20,
            reviewInterval: 'spaced',
            difficultyAdjustment: 'auto'
          }
        });
        return;
      }

      if (message.action === 'getLearningStats') {
        callback({
          success: true,
          data: {
            totalWordsLearned: 0,
            dailyGoal: 20,
            currentStreak: 0,
            longestStreak: 0,
            reviewAccuracy: 0,
            timeSpentLearning: 0
          }
        });
        return;
      }

      if (message.action === 'getDictionaryProgress') {
        callback({ success: true, data: {} });
        return;
      }

      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: {
        sendMessage,
        lastError: null
      }
    };

    require('../options');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const excludeSelectors = document.getElementById('pageTranslationExcludeSelectors') as HTMLTextAreaElement;
    expect(excludeSelectors.value).toBe('aside');

    excludeSelectors.value = 'nav, footer\n.comments\nnav\n[data-no-translate]';
    document.getElementById('saveSettings')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'updateSettings',
        data: expect.objectContaining({
          pageTranslationExcludeSelectors: ['nav', 'footer', '.comments', '[data-no-translate]']
        })
      }),
      expect.any(Function)
    );
  });

  it('saves the selected floating button corner as clampable page coordinates', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: {
            defaultTargetLanguage: 'zh-CN',
            translationProvider: 'google',
            pageTranslationDisplayMode: 'bilingual',
            autoTranslate: false,
            showFloatingIcon: true,
            floatingIconPosition: { x: 24, y: 24 },
            learningModeEnabled: false,
            activeDictionaries: ['gre'],
            highlightColors: {
              gre: '#ff6b6b',
              toefl: '#4ecdc4',
              ielts: '#45b7d1',
              cet4: '#96ceb4',
              cet6: '#feca57'
            },
            dailyGoal: 20,
            reviewInterval: 'spaced',
            difficultyAdjustment: 'auto'
          }
        });
        return;
      }

      if (message.action === 'getLearningStats') {
        callback({
          success: true,
          data: {
            totalWordsLearned: 0,
            dailyGoal: 20,
            currentStreak: 0,
            longestStreak: 0,
            reviewAccuracy: 0,
            timeSpentLearning: 0
          }
        });
        return;
      }

      if (message.action === 'getDictionaryProgress') {
        callback({ success: true, data: {} });
        return;
      }

      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: {
        sendMessage,
        lastError: null
      }
    };

    require('../options');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const iconPosition = document.getElementById('iconPosition') as HTMLSelectElement;
    iconPosition.value = 'bottom-right';
    document.getElementById('saveSettings')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'updateSettings',
        data: expect.objectContaining({
          floatingIconPosition: { x: 9999, y: 9999 }
        })
      }),
      expect.any(Function)
    );
  });

  it('renders the provider roadmap and 100-plus language choices in settings', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: {
            defaultTargetLanguage: 'es',
            documentOcrLanguage: 'jpn',
            aiContextEnabled: true,
            aiTranslationDomain: 'software',
            translationGlossary: [{ source: 'worker', target: '工作线程' }],
            aiCustomPrompt: 'Preserve code identifiers.',
            translationProvider: 'deepl',
            pageTranslationDisplayMode: 'translation-only',
            autoTranslate: false,
            showFloatingIcon: true,
            floatingIconPosition: { x: 9999, y: 9999 },
            learningModeEnabled: false,
            activeDictionaries: ['gre'],
            highlightColors: {
              gre: '#ff6b6b',
              toefl: '#4ecdc4',
              ielts: '#45b7d1',
              cet4: '#96ceb4',
              cet6: '#feca57'
            },
            dailyGoal: 20,
            reviewInterval: 'spaced',
            difficultyAdjustment: 'auto'
          }
        });
        return;
      }

      if (message.action === 'getLearningStats') {
        callback({
          success: true,
          data: {
            totalWordsLearned: 0,
            dailyGoal: 20,
            currentStreak: 0,
            longestStreak: 0,
            reviewAccuracy: 0,
            timeSpentLearning: 0
          }
        });
        return;
      }

      if (message.action === 'getDictionaryProgress') {
        callback({ success: true, data: {} });
        return;
      }

      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: {
        sendMessage,
        lastError: null
      }
    };

    require('../options');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement;
    const documentOcrLanguage = document.getElementById('documentOcrLanguage') as HTMLSelectElement;
    const aiTranslationDomain = document.getElementById('aiTranslationDomain') as HTMLSelectElement;
    const translationProvider = document.getElementById('translationProvider') as HTMLSelectElement;
    const displayMode = document.getElementById('pageTranslationDisplayMode') as HTMLSelectElement;

    expect(targetLanguage.options.length).toBeGreaterThanOrEqual(100);
    expect(targetLanguage.value).toBe('es');
    expect(Array.from(documentOcrLanguage.options).map(option => option.value)).toEqual([
      'eng',
      'chi_sim',
      'chi_tra',
      'jpn',
      'kor'
    ]);
    expect(documentOcrLanguage.value).toBe('jpn');
    expect(Array.from(aiTranslationDomain.options).map(option => option.value)).toEqual([
      'general',
      'academic',
      'technical',
      'software',
      'business',
      'finance',
      'legal',
      'medical',
      'creative'
    ]);
    expect(aiTranslationDomain.value).toBe('software');
    expect((document.getElementById('aiContextEnabled') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('translationGlossary') as HTMLTextAreaElement).value).toBe(
      'worker => 工作线程'
    );
    expect((document.getElementById('aiCustomPrompt') as HTMLTextAreaElement).value).toBe(
      'Preserve code identifiers.'
    );
    expect(Array.from(translationProvider.options).some(option => option.value === 'deepl' && !option.disabled)).toBe(true);
    expect(Array.from(translationProvider.options).some(option => option.value === 'microsoft' && !option.disabled)).toBe(true);
    expect(Array.from(translationProvider.options).some(option => option.value === 'openai' && !option.disabled)).toBe(true);
    expect(Array.from(translationProvider.options).some(option => option.value === 'gemini' && !option.disabled)).toBe(true);
    expect(translationProvider.value).toBe('deepl');
    expect(displayMode.value).toBe('translation-only');
    expect(aiTranslationDomain.disabled).toBe(true);
    translationProvider.value = 'openai';
    translationProvider.dispatchEvent(new Event('change'));
    expect(aiTranslationDomain.disabled).toBe(false);
  });

  it('shows only a masked key summary and the fields required by the selected provider', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getSettings') {
        callback({ success: true, data: createSettings({ translationProvider: 'openai' }) });
        return;
      }
      if (message.action === 'getTranslationProviderConfigs') {
        callback({
          success: true,
          data: [{
            providerId: 'openai',
            configured: true,
            apiKeyHint: 'sk-s...5678',
            endpoint: 'https://gateway.example.com/v1/chat/completions',
            model: 'translation-model',
            region: ''
          }]
        });
        return;
      }
      if (message.action === 'getLearningStats') {
        callback({ success: true, data: createStats() });
        return;
      }
      if (message.action === 'getDictionaryProgress') {
        callback({ success: true, data: {} });
        return;
      }
      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: { sendMessage, lastError: null }
    };

    require('../options');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const panel = document.getElementById('providerConfigPanel') as HTMLElement;
    const apiKey = document.getElementById('providerApiKey') as HTMLInputElement;
    expect(panel.hidden).toBe(false);
    expect(document.getElementById('providerConfigStatus')?.textContent).toContain('sk-s...5678');
    expect(apiKey.value).toBe('');
    expect(apiKey.placeholder).toContain('sk-s...5678');
    expect((document.getElementById('providerEndpointField') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('providerModelField') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('providerRegionField') as HTMLElement).hidden).toBe(true);
    expect(document.body.textContent).not.toContain('openai-secret-value');

    const provider = document.getElementById('translationProvider') as HTMLSelectElement;
    provider.value = 'microsoft';
    provider.dispatchEvent(new Event('change'));
    expect((document.getElementById('providerEndpointField') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('providerModelField') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('providerRegionField') as HTMLElement).hidden).toBe(false);

    provider.value = 'gemini';
    provider.dispatchEvent(new Event('change'));
    expect((document.getElementById('providerEndpointField') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('providerModelField') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('providerRegionField') as HTMLElement).hidden).toBe(true);
  });

  it('requests exact host access and saves an OpenAI-compatible endpoint locally', async () => {
    const savedSummary = {
      providerId: 'openai',
      configured: true,
      apiKeyHint: 'sk-c...7890',
      endpoint: 'https://gateway.example.com/v1/chat/completions',
      model: 'translation-model',
      region: ''
    };
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getSettings') {
        callback({ success: true, data: createSettings() });
        return;
      }
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [] });
        return;
      }
      if (message.action === 'getLearningStats') {
        callback({ success: true, data: createStats() });
        return;
      }
      if (message.action === 'getDictionaryProgress') {
        callback({ success: true, data: {} });
        return;
      }
      if (message.action === 'updateTranslationProviderConfig') {
        callback({ success: true, data: savedSummary });
        return;
      }
      callback({ success: true });
    });
    const request = jest.fn((_permissions, callback) => callback(true));

    (global as any).chrome = {
      runtime: { sendMessage, lastError: null },
      permissions: { request }
    };

    require('../options');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const provider = document.getElementById('translationProvider') as HTMLSelectElement;
    provider.value = 'openai';
    provider.dispatchEvent(new Event('change'));
    (document.getElementById('providerApiKey') as HTMLInputElement).value = 'sk-custom-secret-7890';
    (document.getElementById('providerEndpoint') as HTMLInputElement).value = savedSummary.endpoint;
    (document.getElementById('providerModel') as HTMLInputElement).value = savedSummary.model;
    document.getElementById('saveProviderConfig')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(request).toHaveBeenCalledWith(
      { origins: ['https://gateway.example.com/*'] },
      expect.any(Function)
    );
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'updateTranslationProviderConfig',
      data: {
        providerId: 'openai',
        config: {
          apiKey: 'sk-custom-secret-7890',
          endpoint: savedSummary.endpoint,
          model: savedSummary.model,
          region: ''
        }
      }
    }, expect.any(Function));
    expect((document.getElementById('providerApiKey') as HTMLInputElement).value).toBe('');
    expect(document.getElementById('providerConfigMessage')?.textContent).toContain('saved locally');
  });

  it('removes saved provider credentials through the background message channel', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getSettings') {
        callback({ success: true, data: createSettings({ translationProvider: 'deepl' }) });
        return;
      }
      if (message.action === 'getTranslationProviderConfigs') {
        callback({
          success: true,
          data: [{
            providerId: 'deepl',
            configured: true,
            apiKeyHint: 'deep...7890',
            endpoint: 'https://api-free.deepl.com/v2/translate',
            model: '',
            region: ''
          }]
        });
        return;
      }
      if (message.action === 'getLearningStats') {
        callback({ success: true, data: createStats() });
        return;
      }
      if (message.action === 'getDictionaryProgress') {
        callback({ success: true, data: {} });
        return;
      }
      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: { sendMessage, lastError: null }
    };

    require('../options');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    const removeButton = document.getElementById('removeProviderConfig') as HTMLButtonElement;
    expect(removeButton.disabled).toBe(false);
    removeButton.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith({
      action: 'removeTranslationProviderConfig',
      data: { providerId: 'deepl' }
    }, expect.any(Function));
    expect(removeButton.disabled).toBe(true);
    expect(document.getElementById('providerConfigMessage')?.textContent).toContain('removed');
  });

  it('normalizes, edits, persists, and deletes site translation rules', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getSettings') {
        callback({
          success: true,
          data: createSettings({
            translationStyle: 'highlight',
            pageTranslationScope: 'whole-page',
            siteTranslationRules: [{
              pattern: 'Docs.Example.com',
              translationEnabled: true,
              displayMode: 'bilingual',
              translationStyle: 'plain',
              translationScope: 'main-content',
              excludeSelectors: ['aside']
            }]
          })
        });
        return;
      }
      if (message.action === 'getTranslationProviderConfigs') {
        callback({ success: true, data: [] });
        return;
      }
      if (message.action === 'getLearningStats') {
        callback({ success: true, data: createStats() });
        return;
      }
      if (message.action === 'getDictionaryProgress') {
        callback({ success: true, data: {} });
        return;
      }
      callback({ success: true });
    });

    (global as any).chrome = {
      runtime: { sendMessage, lastError: null }
    };

    require('../options');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect((document.getElementById('translationStyle') as HTMLSelectElement).value).toBe('highlight');
    expect((document.getElementById('pageTranslationScope') as HTMLSelectElement).value).toBe('whole-page');
    expect(document.getElementById('siteRuleList')?.textContent).toContain('docs.example.com');

    const editButton = document.querySelector<HTMLButtonElement>('button[data-site-rule-action="edit"]')!;
    editButton.dispatchEvent(new Event('click', { bubbles: true }));
    expect((document.getElementById('siteRulePattern') as HTMLInputElement).value).toBe('docs.example.com');
    expect((document.getElementById('siteRuleTranslationStyle') as HTMLSelectElement).value).toBe('plain');
    expect((document.getElementById('siteRuleTranslationScope') as HTMLSelectElement).value).toBe('main-content');

    (document.getElementById('siteRulePattern') as HTMLInputElement).value = '*.Example.com';
    (document.getElementById('siteRuleTranslationEnabled') as HTMLInputElement).checked = false;
    (document.getElementById('siteRuleDisplayMode') as HTMLSelectElement).value = 'translation-only';
    (document.getElementById('siteRuleTranslationStyle') as HTMLSelectElement).value = 'highlight';
    (document.getElementById('siteRuleTranslationScope') as HTMLSelectElement).value = 'whole-page';
    (document.getElementById('siteRuleExcludeSelectors') as HTMLTextAreaElement).value = 'nav, .comments\nnav';
    document.getElementById('saveSiteRule')!.dispatchEvent(new Event('click'));
    await flushPromises();

    const updateMessages = sendMessage.mock.calls
      .map(call => call[0])
      .filter(message => message.action === 'updateSettings');
    expect(updateMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          translationStyle: 'highlight',
          pageTranslationScope: 'whole-page',
          siteTranslationRules: [{
            pattern: '*.example.com',
            translationEnabled: false,
            displayMode: 'translation-only',
            translationStyle: 'highlight',
            translationScope: 'whole-page',
            excludeSelectors: ['nav', '.comments']
          }]
        })
      })
    ]));
    expect(document.getElementById('siteRuleList')?.textContent).toContain('*.example.com');

    const deleteButton = document.querySelector<HTMLButtonElement>('button[data-site-rule-action="delete"]')!;
    deleteButton.dispatchEvent(new Event('click', { bubbles: true }));
    await flushPromises();

    const deleteMessages = sendMessage.mock.calls
      .map(call => call[0])
      .filter(message => message.action === 'updateSettings');
    expect(deleteMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({ siteTranslationRules: [] })
      })
    ]));
    expect(document.getElementById('siteRuleList')?.textContent).toContain('No site rules');
  });
});
