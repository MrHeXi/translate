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
      <select id="translationProvider"><option value="google" selected>Google</option></select>
      <select id="pageTranslationDisplayMode">
        <option value="bilingual" selected>Bilingual</option>
        <option value="translation-only">Translation only</option>
        <option value="original-only">Original only</option>
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

  beforeEach(() => {
    jest.resetModules();
    setupDom();
  });

  it('preserves an unchecked floating icon toggle when saving settings', async () => {
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
    document.getElementById('saveSettings')!.dispatchEvent(new Event('click'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'updateSettings',
        data: expect.objectContaining({ showFloatingIcon: false })
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
    const translationProvider = document.getElementById('translationProvider') as HTMLSelectElement;
    const displayMode = document.getElementById('pageTranslationDisplayMode') as HTMLSelectElement;

    expect(targetLanguage.options.length).toBeGreaterThanOrEqual(100);
    expect(targetLanguage.value).toBe('es');
    expect(Array.from(translationProvider.options).some(option => option.value === 'deepl' && option.disabled)).toBe(true);
    expect(translationProvider.value).toBe('google');
    expect(displayMode.value).toBe('translation-only');
  });
});
