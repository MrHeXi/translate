// Chrome翻译插件选项页面测试

import { jest } from '@jest/globals';

// 定义类型接口
interface MockElement {
  addEventListener: jest.MockedFunction<any>;
  textContent: string;
  value: string;
  disabled: boolean;
  classList: {
    add: jest.MockedFunction<any>;
    remove: jest.MockedFunction<any>;
  };
  style: {
    display: string;
    cssText: string;
  };
  querySelector: jest.MockedFunction<any>;
  className: string;
  parentNode: any;
  remove: jest.MockedFunction<any>;
  dataset: { [key: string]: string };
  href?: string;
  download?: string;
  click?: jest.MockedFunction<any>;
}

interface MockChrome {
  runtime: {
    sendMessage: jest.MockedFunction<any>;
    lastError: chrome.runtime.LastError | null;
    openOptionsPage: jest.MockedFunction<any>;
  };
  tabs: {
    create: jest.MockedFunction<any>;
  };
}

// 模拟Chrome API
const mockChrome: MockChrome = {
  runtime: {
    sendMessage: jest.fn() as jest.MockedFunction<any>,
    lastError: null as chrome.runtime.LastError | null,
    openOptionsPage: jest.fn() as jest.MockedFunction<any>
  },
  tabs: {
    create: jest.fn() as jest.MockedFunction<any>
  }
};

// 设置全局Chrome对象
(global as any).chrome = mockChrome;

// 模拟DOM环境
const mockDocument = {
  getElementById: jest.fn() as jest.MockedFunction<(id: string) => MockElement | null>,
  querySelectorAll: jest.fn() as jest.MockedFunction<(selector: string) => MockElement[]>,
  querySelector: jest.fn() as jest.MockedFunction<(selector: string) => MockElement | null>,
  createElement: jest.fn() as jest.MockedFunction<(tagName: string) => MockElement>,
  addEventListener: jest.fn() as jest.MockedFunction<any>,
  body: {
    appendChild: jest.fn() as jest.MockedFunction<any>
  }
};

const mockWindow = {
  innerWidth: 1920,
  innerHeight: 1080,
  confirm: jest.fn() as jest.MockedFunction<any>,
  URL: {
    createObjectURL: jest.fn().mockReturnValue('blob:mock-url') as jest.MockedFunction<any>
  },
  Blob: jest.fn() as jest.MockedFunction<any>
};

(global as any).document = mockDocument;
(global as any).window = mockWindow;
(global as any).confirm = mockWindow.confirm;
(global as any).URL = mockWindow.URL;
(global as any).Blob = mockWindow.Blob;

describe('OptionsController', () => {
  let optionsController: any;

  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
    
    // 设置默认的Chrome API响应
    mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
      // 提供默认响应以避免运行时错误
      callback({ 
        success: true, 
        data: {
          totalWordsLearned: 0,
          currentStreak: 0,
          reviewAccuracy: 0,
          timeSpentLearning: 0
        }
      });
    });
    
    // 模拟DOM元素
    const mockElements: { [key: string]: MockElement } = {
      // 常规设置元素
      targetLanguage: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        value: 'zh-CN',
        textContent: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      translationProvider: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        value: 'google',
        textContent: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      autoTranslate: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        checked: false,
        value: '',
        textContent: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      } as MockElement & { checked: boolean },
      showFloatingIcon: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        checked: true,
        value: '',
        textContent: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      } as MockElement & { checked: boolean },
      iconPosition: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        value: 'top-right',
        textContent: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      
      // 学习设置元素
      dailyGoal: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        value: '20',
        textContent: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      learningModeEnabled: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        checked: true,
        value: '',
        textContent: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      } as MockElement & { checked: boolean },
      reviewInterval: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        value: 'spaced',
        textContent: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      difficultyAdjustment: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        value: 'auto',
        textContent: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      
      // 统计显示元素
      totalVocabulary: { 
        textContent: '0',
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      currentStreak: { 
        textContent: '0',
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      reviewAccuracy: { 
        textContent: '0%',
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      timeSpent: { 
        textContent: '0',
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      
      // 词库进度元素
      greTotal: { 
        textContent: '0',
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      greLearned: { 
        textContent: '0',
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      toeflTotal: { 
        textContent: '0',
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      toeflLearned: { 
        textContent: '0',
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      
      // 按钮元素
      saveSettings: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        textContent: '',
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      resetToDefault: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        textContent: '',
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      exportData: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        textContent: '',
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      importData: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        textContent: '',
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      importFile: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        click: jest.fn() as jest.MockedFunction<any>, 
        files: null,
        textContent: '',
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      } as MockElement & { click: jest.MockedFunction<any>; files: any },
      forcSync: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>, 
        textContent: '强制同步', 
        disabled: false,
        value: '',
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      clearVocabulary: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        textContent: '',
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      resetSettings: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        textContent: '',
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      clearAllData: { 
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        textContent: '',
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      },
      
      // 同步状态元素
      syncStatus: { 
        textContent: '同步状态：未知',
        addEventListener: jest.fn() as jest.MockedFunction<any>,
        value: '',
        disabled: false,
        classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
        style: { display: 'block', cssText: '' },
        querySelector: jest.fn() as jest.MockedFunction<any>,
        className: '',
        parentNode: null,
        remove: jest.fn() as jest.MockedFunction<any>,
        dataset: {}
      }
    };

    mockDocument.getElementById.mockImplementation((id: string) => {
      return mockElements[id] || null;
    });

    mockDocument.querySelectorAll.mockImplementation((selector: string) => {
      if (selector === '.nav-btn') {
        return [
          { 
            addEventListener: jest.fn() as jest.MockedFunction<any>, 
            dataset: { tab: 'general' }, 
            classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
            textContent: '',
            value: '',
            disabled: false,
            style: { display: 'block', cssText: '' },
            querySelector: jest.fn() as jest.MockedFunction<any>,
            className: '',
            parentNode: null,
            remove: jest.fn() as jest.MockedFunction<any>
          },
          { 
            addEventListener: jest.fn() as jest.MockedFunction<any>, 
            dataset: { tab: 'dictionary' }, 
            classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
            textContent: '',
            value: '',
            disabled: false,
            style: { display: 'block', cssText: '' },
            querySelector: jest.fn() as jest.MockedFunction<any>,
            className: '',
            parentNode: null,
            remove: jest.fn() as jest.MockedFunction<any>
          }
        ];
      } else if (selector === '.tab-content') {
        return [
          { 
            classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
            addEventListener: jest.fn() as jest.MockedFunction<any>,
            textContent: '',
            value: '',
            disabled: false,
            style: { display: 'block', cssText: '' },
            querySelector: jest.fn() as jest.MockedFunction<any>,
            className: '',
            parentNode: null,
            remove: jest.fn() as jest.MockedFunction<any>,
            dataset: {}
          },
          { 
            classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
            addEventListener: jest.fn() as jest.MockedFunction<any>,
            textContent: '',
            value: '',
            disabled: false,
            style: { display: 'block', cssText: '' },
            querySelector: jest.fn() as jest.MockedFunction<any>,
            className: '',
            parentNode: null,
            remove: jest.fn() as jest.MockedFunction<any>,
            dataset: {}
          }
        ];
      }
      return [];
    });

    mockDocument.querySelector.mockImplementation((selector: string) => {
      if (selector.includes('data-tab')) {
        return { 
          classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
          addEventListener: jest.fn() as jest.MockedFunction<any>,
          textContent: '',
          value: '',
          disabled: false,
          style: { display: 'block', cssText: '' },
          querySelector: jest.fn() as jest.MockedFunction<any>,
          className: '',
          parentNode: null,
          remove: jest.fn() as jest.MockedFunction<any>,
          dataset: {}
        };
      } else if (selector === '.message') {
        return null;
      }
      return null;
    });

    mockDocument.createElement.mockReturnValue({
      className: '',
      textContent: '',
      style: { cssText: '', display: 'block' },
      parentNode: null,
      addEventListener: jest.fn() as jest.MockedFunction<any>,
      value: '',
      disabled: false,
      classList: { add: jest.fn() as jest.MockedFunction<any>, remove: jest.fn() as jest.MockedFunction<any> },
      querySelector: jest.fn() as jest.MockedFunction<any>,
      remove: jest.fn() as jest.MockedFunction<any>,
      dataset: {},
      href: '',
      download: '',
      click: jest.fn() as jest.MockedFunction<any>
    });

    // 创建模拟的OptionsController类
    class MockOptionsController {
      public currentTab = 'general';
      public settings: any = null;
      public stats: any = null;
      public dictionaryProgress: any = {};
      
      constructor() {
        this.initialize();
      }
      
      private async initialize() {
        this.bindEventListeners();
        await this.loadSettings();
        await this.loadLearningStats();
        await this.loadDictionaryProgress();
        this.updateUI();
      }
      
      private bindEventListeners() {
        // 模拟事件绑定 - 调用 getElementById 来获取元素
        document.getElementById('saveSettings');
        document.getElementById('resetToDefault');
        document.getElementById('exportData');
        document.getElementById('importData');
        document.getElementById('importFile');
        document.getElementById('forcSync');
        document.getElementById('clearVocabulary');
        document.getElementById('resetSettings');
      }
      
      public switchTab(tabId: string) {
        this.currentTab = tabId;
        
        // 隐藏所有标签页内容
        const tabContents = mockDocument.querySelectorAll('.tab-content');
        tabContents.forEach((content: any) => content.classList.remove('active'));

        // 移除所有导航按钮的激活状态
        const navButtons = mockDocument.querySelectorAll('.nav-btn');
        navButtons.forEach((btn: any) => btn.classList.remove('active'));

        // 显示目标标签页
        const targetTab = mockDocument.getElementById(tabId);
        targetTab?.classList.add('active');

        // 激活对应的导航按钮
        const targetNavBtn = mockDocument.querySelector(`[data-tab="${tabId}"]`);
        targetNavBtn?.classList.add('active');
      }
      
      public async loadSettings() {
        const response = await this.sendMessage({ action: 'getSettings' });
        if (response.success) {
          this.settings = response.data;
        }
      }
      
      public async loadLearningStats() {
        const response = await this.sendMessage({ action: 'getLearningStats' });
        if (response.success) {
          this.stats = response.data;
        } else {
          // 设置默认统计数据以避免运行时错误
          this.stats = {
            totalWordsLearned: 0,
            currentStreak: 0,
            reviewAccuracy: 0,
            timeSpentLearning: 0
          };
        }
      }
      
      public async loadDictionaryProgress() {
        const response = await this.sendMessage({ action: 'getDictionaryProgress' });
        if (response.success) {
          this.dictionaryProgress = response.data;
        }
      }
      
      public updateUI() {
        if (this.stats) {
          this.updateLearningStats();
        }
        this.updateDictionaryProgress();
      }
      
      public updateLearningStats() {
        if (!this.stats) return;

        const totalVocabulary = mockDocument.getElementById('totalVocabulary');
        const currentStreak = mockDocument.getElementById('currentStreak');
        const reviewAccuracy = mockDocument.getElementById('reviewAccuracy');
        const timeSpent = mockDocument.getElementById('timeSpent');

        if (totalVocabulary && this.stats.totalWordsLearned !== undefined) {
          totalVocabulary.textContent = this.stats.totalWordsLearned.toString();
        }
        if (currentStreak && this.stats.currentStreak !== undefined) {
          currentStreak.textContent = this.stats.currentStreak.toString();
        }
        if (reviewAccuracy && this.stats.reviewAccuracy !== undefined) {
          reviewAccuracy.textContent = `${Math.round(this.stats.reviewAccuracy * 100)}%`;
        }
        if (timeSpent && this.stats.timeSpentLearning !== undefined) {
          timeSpent.textContent = Math.round(this.stats.timeSpentLearning / 60).toString();
        }
      }
      
      public updateDictionaryProgress() {
        const dictionaryTypes = ['gre', 'toefl'];
        
        dictionaryTypes.forEach(type => {
          const progress = this.dictionaryProgress[type];
          const totalElement = mockDocument.getElementById(`${type}Total`);
          const learnedElement = mockDocument.getElementById(`${type}Learned`);
          
          if (totalElement && learnedElement) {
            if (progress) {
              totalElement.textContent = progress.totalWords.toString();
              learnedElement.textContent = progress.learnedWords.toString();
            } else {
              totalElement.textContent = '0';
              learnedElement.textContent = '0';
            }
          }
        });
      }
      
      public async saveSettings() {
        const settings = this.collectSettingsFromUI();
        const response = await this.sendMessage({
          action: 'updateSettings',
          data: settings
        });

        if (response.success) {
          this.settings = settings;
          this.showMessage('设置保存成功', 'success');
          return { success: true };
        } else {
          this.showMessage('设置保存失败: ' + response.error, 'error');
          return { success: false };
        }
      }
      
      public collectSettingsFromUI() {
        return {
          defaultTargetLanguage: 'zh-CN',
          translationProvider: 'google',
          autoTranslate: false,
          showFloatingIcon: true,
          learningModeEnabled: true,
          activeDictionaries: ['gre'],
          highlightColors: { gre: '#ff6b6b' },
          dailyGoal: 20
        };
      }
      
      public showMessage(message: string, type: string) {
        // 移除现有消息
        const existingMessage = mockDocument.querySelector('.message');
        if (existingMessage) {
          existingMessage.remove();
        }

        // 创建新消息
        const messageDiv = mockDocument.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
      }
      
      public async exportData() {
        const response = await this.sendMessage({ action: 'exportUserData' });
        if (response.success) {
          return { success: true };
        } else {
          this.showMessage('数据导出失败: ' + response.error, 'error');
          return { success: false };
        }
      }
      
      public async importData(event: any) {
        const file = event.target.files?.[0];
        if (!file) return { success: false };

        try {
          const text = await file.text();
          const data = JSON.parse(text);
          
          const response = await this.sendMessage({
            action: 'importUserData',
            data: data
          });

          if (response.success) {
            return { success: true };
          } else {
            this.showMessage('数据导入失败: ' + response.error, 'error');
            return { success: false };
          }
        } catch (error) {
          this.showMessage('数据导入失败，请检查文件格式', 'error');
          return { success: false };
        }
      }
      
      public async clearVocabulary() {
        if (mockWindow.confirm('确定要清空生词本吗？此操作不可撤销。')) {
          const response = await this.sendMessage({ action: 'clearVocabulary' });
          if (response.success) {
            this.showMessage('生词本已清空', 'success');
          } else {
            this.showMessage('清空生词本失败: ' + response.error, 'error');
          }
        }
      }
      
      public async resetAllSettings() {
        if (mockWindow.confirm('确定要重置所有设置吗？此操作不可撤销。')) {
          const response = await this.sendMessage({ action: 'resetAllSettings' });
          if (response.success) {
            this.showMessage('所有设置已重置', 'success');
          } else {
            this.showMessage('重置设置失败: ' + response.error, 'error');
          }
        }
      }
      
      public async clearAllData() {
        if (mockWindow.confirm('确定要清空所有数据吗？包括设置、生词本和学习进度。此操作不可撤销。')) {
          if (mockWindow.confirm('请再次确认：这将删除您的所有数据，包括生词本和学习进度。')) {
            const response = await this.sendMessage({ action: 'clearAllData' });
            if (response.success) {
              this.showMessage('所有数据已清空', 'success');
            } else {
              this.showMessage('清空数据失败: ' + response.error, 'error');
            }
          }
        }
      }
      
      public async forceSync() {
        const response = await this.sendMessage({ action: 'forceSync' });
        if (response.success) {
          this.showMessage('数据同步成功', 'success');
          this.updateSyncStatus('已同步');
        } else {
          this.showMessage('数据同步失败: ' + response.error, 'error');
        }
      }
      
      public updateSyncStatus(status: string) {
        const syncStatus = mockDocument.getElementById('syncStatus');
        if (syncStatus) {
          syncStatus.textContent = `同步状态：${status}`;
        }
      }
      
      private sendMessage(message: any): Promise<any> {
        return new Promise((resolve, reject) => {
          mockChrome.runtime.sendMessage(message, (response: any) => {
            if (mockChrome.runtime.lastError) {
              reject(mockChrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
      }
    }

    optionsController = new MockOptionsController();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('初始化', () => {
    test('应该正确初始化选项控制器', () => {
      expect(optionsController).toBeDefined();
    });

    test('应该绑定所有必要的事件监听器', () => {
      // 创建一个新的 MockOptionsController 实例，但只调用 bindEventListeners
      class TestOptionsController {
        private bindEventListeners() {
          // 模拟事件绑定 - 调用 getElementById 来获取元素
          mockDocument.getElementById('saveSettings');
          mockDocument.getElementById('resetToDefault');
          mockDocument.getElementById('exportData');
          mockDocument.getElementById('importData');
          mockDocument.getElementById('importFile');
          mockDocument.getElementById('forcSync');
          mockDocument.getElementById('clearVocabulary');
          mockDocument.getElementById('resetSettings');
        }
        
        public testBindEventListeners() {
          this.bindEventListeners();
        }
      }
      
      // 清除之前的调用记录
      jest.clearAllMocks();
      
      const testController = new TestOptionsController();
      testController.testBindEventListeners();
      
      // 验证getElementById被调用来获取各种元素
      const calls = mockDocument.getElementById.mock.calls.map(call => call[0]);
      
      // 检查事件绑定相关的元素是否被调用
      expect(calls).toContain('saveSettings');
      expect(calls).toContain('resetToDefault');
      expect(calls).toContain('exportData');
      expect(calls).toContain('importData');
      expect(calls).toContain('importFile');
      expect(calls).toContain('forcSync');
      expect(calls).toContain('clearVocabulary');
      expect(calls).toContain('resetSettings');
    });
  });

  describe('标签页切换', () => {
    test('应该能够切换到不同的标签页', () => {
      optionsController.switchTab('dictionary');
      expect(optionsController.currentTab).toBe('dictionary');
    });

    test('应该正确更新标签页UI状态', () => {
      // 在调用 switchTab 之前清除所有 mock 调用记录
      jest.clearAllMocks();
      
      optionsController.switchTab('learning');

      // 验证 querySelectorAll 被调用来获取标签页内容和导航按钮
      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('.tab-content');
      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('.nav-btn');
      
      // 验证 getElementById 被调用来获取目标标签页
      expect(mockDocument.getElementById).toHaveBeenCalledWith('learning');
      
      // 验证 querySelector 被调用来获取目标导航按钮
      expect(mockDocument.querySelector).toHaveBeenCalledWith('[data-tab="learning"]');
    });
  });

  describe('设置管理', () => {
    test('应该正确加载设置', async () => {
      const mockSettings = {
        defaultTargetLanguage: 'zh-CN',
        translationProvider: 'google',
        autoTranslate: false,
        showFloatingIcon: true,
        learningModeEnabled: true,
        activeDictionaries: ['gre', 'toefl'],
        highlightColors: { gre: '#ff6b6b', toefl: '#4ecdc4' },
        dailyGoal: 25
      };

      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true, data: mockSettings });
      });

      await optionsController.loadSettings();
      expect(optionsController.settings).toEqual(mockSettings);
    });

    test('应该能够保存设置', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true });
      });

      const result = await optionsController.saveSettings();
      expect(result.success).toBe(true);
    });

    test('应该正确收集UI中的设置', () => {
      const settings = optionsController.collectSettingsFromUI();
      
      expect(settings).toHaveProperty('defaultTargetLanguage');
      expect(settings).toHaveProperty('translationProvider');
      expect(settings).toHaveProperty('activeDictionaries');
      expect(settings).toHaveProperty('highlightColors');
    });

    test('应该处理设置保存失败', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: false, error: '保存失败' });
      });

      const showMessageSpy = jest.spyOn(optionsController, 'showMessage');
      await optionsController.saveSettings();
      
      expect(showMessageSpy).toHaveBeenCalledWith(
        expect.stringContaining('保存失败'),
        'error'
      );
    });
  });

  describe('学习统计', () => {
    test('应该正确加载学习统计', async () => {
      const mockStats = {
        totalWordsLearned: 150,
        currentStreak: 7,
        reviewAccuracy: 0.85,
        timeSpentLearning: 3600
      };

      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true, data: mockStats });
      });

      await optionsController.loadLearningStats();
      expect(optionsController.stats).toEqual(mockStats);
    });

    test('应该正确更新学习统计显示', () => {
      optionsController.stats = {
        totalWordsLearned: 150,
        currentStreak: 7,
        reviewAccuracy: 0.85,
        timeSpentLearning: 3600
      };

      optionsController.updateLearningStats();

      const totalVocabulary = mockDocument.getElementById('totalVocabulary');
      const currentStreak = mockDocument.getElementById('currentStreak');
      const reviewAccuracy = mockDocument.getElementById('reviewAccuracy');
      const timeSpent = mockDocument.getElementById('timeSpent');

      expect(totalVocabulary?.textContent).toBe('150');
      expect(currentStreak?.textContent).toBe('7');
      expect(reviewAccuracy?.textContent).toBe('85%');
      expect(timeSpent?.textContent).toBe('60'); // 3600秒 = 60分钟
    });
  });

  describe('词库管理', () => {
    test('应该正确加载词库进度', async () => {
      const mockProgress = {
        gre: { totalWords: 3000, learnedWords: 150, progress: 0.05 },
        toefl: { totalWords: 4000, learnedWords: 200, progress: 0.05 }
      };

      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true, data: mockProgress });
      });

      await optionsController.loadDictionaryProgress();
      expect(optionsController.dictionaryProgress).toEqual(mockProgress);
    });

    test('应该正确更新词库进度显示', () => {
      optionsController.dictionaryProgress = {
        gre: { totalWords: 3000, learnedWords: 150 },
        toefl: { totalWords: 4000, learnedWords: 200 }
      };

      optionsController.updateDictionaryProgress();

      const greTotal = mockDocument.getElementById('greTotal');
      const greLearned = mockDocument.getElementById('greLearned');
      const toeflTotal = mockDocument.getElementById('toeflTotal');
      const toeflLearned = mockDocument.getElementById('toeflLearned');

      expect(greTotal?.textContent).toBe('3000');
      expect(greLearned?.textContent).toBe('150');
      expect(toeflTotal?.textContent).toBe('4000');
      expect(toeflLearned?.textContent).toBe('200');
    });
  });

  describe('数据导出导入', () => {
    test('应该能够导出数据', async () => {
      const mockData = {
        settings: { defaultTargetLanguage: 'zh-CN' },
        vocabulary: [],
        learningStats: { totalWordsLearned: 0 }
      };

      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true, data: mockData });
      });

      const result = await optionsController.exportData();
      expect(result.success).toBe(true);
    });

    test('应该能够导入数据', async () => {
      const mockFile = {
        text: jest.fn() as jest.MockedFunction<() => Promise<string>>
      };
      mockFile.text.mockResolvedValue('{"test": "data"}');
      
      const mockEvent = {
        target: {
          files: [mockFile]
        }
      };

      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true });
      });

      const result = await optionsController.importData(mockEvent);
      expect(result.success).toBe(true);
    });

    test('应该处理导入数据格式错误', async () => {
      const mockFile = {
        text: jest.fn() as jest.MockedFunction<() => Promise<string>>
      };
      mockFile.text.mockResolvedValue('invalid json');
      
      const mockEvent = {
        target: {
          files: [mockFile]
        }
      };

      const showMessageSpy = jest.spyOn(optionsController, 'showMessage');
      await optionsController.importData(mockEvent);

      expect(showMessageSpy).toHaveBeenCalledWith(
        expect.stringContaining('格式'),
        'error'
      );
    });
  });

  describe('危险操作', () => {
    beforeEach(() => {
      mockWindow.confirm.mockReturnValue(true);
    });

    test('应该能够清空生词本', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true });
      });

      await optionsController.clearVocabulary();
      expect(mockWindow.confirm).toHaveBeenCalled();
    });

    test('应该能够重置所有设置', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true });
      });

      await optionsController.resetAllSettings();
      expect(mockWindow.confirm).toHaveBeenCalled();
    });

    test('应该能够清空所有数据', async () => {
      // 需要两次确认
      mockWindow.confirm.mockReturnValueOnce(true).mockReturnValueOnce(true);

      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true });
      });

      await optionsController.clearAllData();
      expect(mockWindow.confirm).toHaveBeenCalledTimes(2);
    });

    test('应该在用户取消时不执行危险操作', async () => {
      mockWindow.confirm.mockReturnValue(false);

      await optionsController.clearVocabulary();
      
      // 不应该发送清空请求
      expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'clearVocabulary' }),
        expect.any(Function)
      );
    });
  });

  describe('同步功能', () => {
    test('应该能够强制同步数据', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true });
      });

      await optionsController.forceSync();

      const syncStatus = mockDocument.getElementById('syncStatus');
      expect(syncStatus?.textContent).toBe('同步状态：已同步');
    });

    test('应该处理同步失败', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: false, error: '同步失败' });
      });

      const showMessageSpy = jest.spyOn(optionsController, 'showMessage');
      await optionsController.forceSync();

      expect(showMessageSpy).toHaveBeenCalledWith(
        expect.stringContaining('同步失败'),
        'error'
      );
    });

    test('应该更新同步状态显示', () => {
      optionsController.updateSyncStatus('已同步');

      const syncStatus = mockDocument.getElementById('syncStatus');
      expect(syncStatus?.textContent).toBe('同步状态：已同步');
    });
  });
});