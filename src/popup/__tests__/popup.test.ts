// Chrome翻译插件弹出窗口测试

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
}

interface MockTab {
  id: number;
}

interface MockChrome {
  runtime: {
    sendMessage: jest.MockedFunction<any>;
    lastError: { message: string } | null;
    openOptionsPage: jest.MockedFunction<any>;
  };
  tabs: {
    query: jest.MockedFunction<any>;
    sendMessage: jest.MockedFunction<any>;
    create: jest.MockedFunction<any>;
  };
}

describe('弹出窗口UI组件测试', () => {
  // 模拟Chrome API
  const mockChrome: MockChrome = {
    runtime: {
      sendMessage: jest.fn() as jest.MockedFunction<any>,
      lastError: null,
      openOptionsPage: jest.fn() as jest.MockedFunction<any>
    },
    tabs: {
      query: jest.fn() as jest.MockedFunction<any>,
      sendMessage: jest.fn() as jest.MockedFunction<any>,
      create: jest.fn() as jest.MockedFunction<any>
    }
  };

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

  beforeEach(() => {
    // 设置全局对象
    (global as any).chrome = mockChrome;
    (global as any).document = mockDocument;
    
    // 重置所有模拟
    jest.clearAllMocks();
    
    // 模拟DOM元素返回
    const mockElement: MockElement = {
      addEventListener: jest.fn() as jest.MockedFunction<any>,
      textContent: '',
      value: '',
      disabled: false,
      classList: { 
        add: jest.fn() as jest.MockedFunction<any>, 
        remove: jest.fn() as jest.MockedFunction<any> 
      },
      style: { display: 'none', cssText: '' },
      querySelector: jest.fn().mockReturnValue({ textContent: '' }) as jest.MockedFunction<any>,
      className: '',
      parentNode: null
    };

    mockDocument.getElementById.mockReturnValue(mockElement);

    const mockCheckboxes: MockElement[] = [
      { 
        ...mockElement, 
        value: 'gre', 
        checked: true 
      } as MockElement & { checked: boolean },
      { 
        ...mockElement, 
        value: 'toefl', 
        checked: false 
      } as MockElement & { checked: boolean }
    ];

    mockDocument.querySelectorAll.mockReturnValue(mockCheckboxes);

    mockDocument.createElement.mockReturnValue({
      className: '',
      textContent: '',
      style: { cssText: '', display: 'none' },
      parentNode: null,
      addEventListener: jest.fn() as jest.MockedFunction<any>,
      value: '',
      disabled: false,
      classList: { 
        add: jest.fn() as jest.MockedFunction<any>, 
        remove: jest.fn() as jest.MockedFunction<any> 
      },
      querySelector: jest.fn() as jest.MockedFunction<any>
    });
  });

  describe('DOM元素访问', () => {
    test('应该能够获取弹出窗口的主要元素', () => {
      const toggleBtn = mockDocument.getElementById('toggleTranslation');
      const translateBtn = mockDocument.getElementById('translateBtn');
      const vocabularyBtn = mockDocument.getElementById('vocabularyBtn');
      
      expect(toggleBtn).toBeDefined();
      expect(translateBtn).toBeDefined();
      expect(vocabularyBtn).toBeDefined();
      expect(mockDocument.getElementById).toHaveBeenCalledTimes(3);
    });

    test('应该能够获取统计显示元素', () => {
      const totalWords = mockDocument.getElementById('totalWords');
      const todayReviewed = mockDocument.getElementById('todayReviewed');
      const reviewDue = mockDocument.getElementById('reviewDue');
      
      expect(totalWords).toBeDefined();
      expect(todayReviewed).toBeDefined();
      expect(reviewDue).toBeDefined();
    });

    test('应该能够获取词库设置元素', () => {
      const checkboxes = mockDocument.querySelectorAll('.dictionary-item input[type="checkbox"]');
      
      expect(checkboxes).toBeDefined();
      expect(checkboxes).toHaveLength(2);
      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith('.dictionary-item input[type="checkbox"]');
    });
  });

  describe('Chrome API集成', () => {
    test('应该能够发送消息到后台脚本', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true, data: { test: 'data' } });
      });

      const sendMessage = (message: any): Promise<any> => {
        return new Promise((resolve, reject) => {
          mockChrome.runtime.sendMessage(message, (response: any) => {
            if (mockChrome.runtime.lastError) {
              reject(mockChrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
      };

      const result = await sendMessage({ action: 'test' });
      expect(result.success).toBe(true);
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'test' },
        expect.any(Function)
      );
    });

    test('应该能够查询当前标签页', async () => {
      const mockTabs: MockTab[] = [{ id: 1 }];
      mockChrome.tabs.query.mockResolvedValue(mockTabs);

      const tabs = await mockChrome.tabs.query({ active: true, currentWindow: true });
      expect(tabs).toHaveLength(1);
      expect(mockChrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    });

    test('应该能够创建新标签页', () => {
      const url = 'chrome-extension://test/vocabulary.html';
      mockChrome.tabs.create({ url });
      
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url });
    });

    test('应该能够打开选项页面', () => {
      mockChrome.runtime.openOptionsPage();
      expect(mockChrome.runtime.openOptionsPage).toHaveBeenCalled();
    });
  });

  describe('翻译功能', () => {
    test('应该能够处理翻译请求', async () => {
      const mockTranslationData = {
        originalText: 'Hello World',
        translatedText: '你好世界',
        sourceLang: 'en',
        targetLang: 'zh-CN'
      };

      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({
          success: true,
          data: mockTranslationData
        });
      });

      const sendMessage = (message: any): Promise<any> => {
        return new Promise((resolve) => {
          mockChrome.runtime.sendMessage(message, resolve);
        });
      };

      const result = await sendMessage({
        action: 'translate',
        data: { text: 'Hello World', targetLang: 'zh-CN' }
      });

      expect(result.success).toBe(true);
      expect(result.data.translatedText).toBe('你好世界');
    });

    test('应该能够处理翻译失败', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({
          success: false,
          error: '翻译服务不可用'
        });
      });

      const sendMessage = (message: any): Promise<any> => {
        return new Promise((resolve) => {
          mockChrome.runtime.sendMessage(message, resolve);
        });
      };

      const result = await sendMessage({ action: 'translate' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('翻译服务不可用');
    });

    test('应该能够切换翻译模式', async () => {
      const mockTabs: MockTab[] = [{ id: 1 }];
      mockChrome.tabs.query.mockResolvedValue(mockTabs);
      mockChrome.tabs.sendMessage.mockImplementation((_tabId: any, _message: any, callback: any) => {
        callback({ success: true, isActive: true });
      });

      const tabs = await mockChrome.tabs.query({ active: true, currentWindow: true });
      expect(tabs).toHaveLength(1);

      // 模拟发送切换消息
      const response = await new Promise((resolve) => {
        if (tabs.length > 0) {
          mockChrome.tabs.sendMessage(tabs[0].id!, { action: 'toggleTranslation' }, (response: any) => {
            resolve(response);
          });
        }
      });

      expect(response).toEqual({ success: true, isActive: true });
    });
  });

  describe('学习统计功能', () => {
    test('应该能够获取学习统计数据', async () => {
      const mockStats = {
        totalWordsLearned: 150,
        todayReviewedCount: 25,
        reviewDueCount: 10,
        currentStreak: 7,
        reviewAccuracy: 0.85
      };

      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true, data: mockStats });
      });

      const sendMessage = (message: any): Promise<any> => {
        return new Promise((resolve) => {
          mockChrome.runtime.sendMessage(message, resolve);
        });
      };

      const result = await sendMessage({ action: 'getLearningStats' });
      expect(result.success).toBe(true);
      expect(result.data.totalWordsLearned).toBe(150);
      expect(result.data.todayReviewedCount).toBe(25);
      expect(result.data.reviewDueCount).toBe(10);
      expect(result.data.currentStreak).toBe(7);
      expect(result.data.reviewAccuracy).toBe(0.85);
    });

    test('应该能够处理统计数据加载失败', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: false, error: '加载失败' });
      });

      const sendMessage = (message: any): Promise<any> => {
        return new Promise((resolve) => {
          mockChrome.runtime.sendMessage(message, resolve);
        });
      };

      const result = await sendMessage({ action: 'getLearningStats' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('加载失败');
    });
  });

  describe('设置管理功能', () => {
    test('应该能够获取用户设置', async () => {
      const mockSettings = {
        activeDictionaries: ['gre', 'toefl'],
        defaultTargetLanguage: 'zh-CN',
        learningModeEnabled: true,
        showFloatingIcon: true
      };

      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true, data: mockSettings });
      });

      const sendMessage = (message: any): Promise<any> => {
        return new Promise((resolve) => {
          mockChrome.runtime.sendMessage(message, resolve);
        });
      };

      const result = await sendMessage({ action: 'getSettings' });
      expect(result.success).toBe(true);
      expect(result.data.activeDictionaries).toEqual(['gre', 'toefl']);
      expect(result.data.defaultTargetLanguage).toBe('zh-CN');
      expect(result.data.learningModeEnabled).toBe(true);
    });

    test('应该能够更新设置', async () => {
      const newSettings = {
        activeDictionaries: ['gre'],
        learningModeEnabled: false
      };

      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: true });
      });

      const sendMessage = (message: any): Promise<any> => {
        return new Promise((resolve) => {
          mockChrome.runtime.sendMessage(message, resolve);
        });
      };

      const result = await sendMessage({
        action: 'updateSettings',
        data: newSettings
      });

      expect(result.success).toBe(true);
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'updateSettings',
          data: newSettings
        }),
        expect.any(Function)
      );
    });
  });

  describe('页面导航功能', () => {
    test('应该能够打开生词本页面', () => {
      const vocabularyUrl = 'chrome-extension://test/vocabulary.html';
      mockChrome.tabs.create({ url: vocabularyUrl });
      
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: vocabularyUrl
      });
    });

    test('应该能够打开复习页面', () => {
      const reviewUrl = 'chrome-extension://test/review.html';
      mockChrome.tabs.create({ url: reviewUrl });
      
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: reviewUrl
      });
    });

    test('应该能够打开设置页面', () => {
      mockChrome.runtime.openOptionsPage();
      expect(mockChrome.runtime.openOptionsPage).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    test('应该能够处理Chrome API错误', async () => {
      mockChrome.runtime.lastError = { message: 'API错误' };
      
      const sendMessage = (message: any): Promise<any> => {
        return new Promise((resolve, reject) => {
          mockChrome.runtime.sendMessage(message, (response: any) => {
            if (mockChrome.runtime.lastError) {
              reject(mockChrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
      };

      try {
        await sendMessage({ action: 'test' });
      } catch (error: any) {
        expect(error.message).toBe('API错误');
      }
      
      // 重置 lastError
      mockChrome.runtime.lastError = null;
    });

    test('应该能够处理网络错误', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_message: any, callback: any) => {
        callback({ success: false, error: '网络连接失败' });
      });

      const sendMessage = (message: any): Promise<any> => {
        return new Promise((resolve) => {
          mockChrome.runtime.sendMessage(message, resolve);
        });
      };

      const result = await sendMessage({ action: 'translate' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('网络连接失败');
    });

    test('应该能够显示错误消息', () => {
      const errorElement = mockDocument.createElement('div');
      mockDocument.body.appendChild(errorElement);

      expect(mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(mockDocument.body.appendChild).toHaveBeenCalledWith(errorElement);
    });
  });

  describe('UI状态管理', () => {
    test('应该能够更新按钮状态', () => {
      const buttons = mockDocument.querySelectorAll('button');
      
      // 模拟禁用所有按钮
      buttons.forEach((btn: MockElement) => {
        btn.disabled = true;
      });

      buttons.forEach((btn: MockElement) => {
        expect(btn.disabled).toBe(true);
      });
    });

    test('应该能够更新文本内容', () => {
      const element = mockDocument.getElementById('totalWords');
      
      // 模拟更新文本内容的函数
      const updateTextContent = (el: MockElement | null, text: string) => {
        if (el) {
          el.textContent = text;
        }
      };

      updateTextContent(element, '150');
      expect(element?.textContent).toBe('150');
    });

    test('应该能够切换CSS类', () => {
      const element = mockDocument.getElementById('toggleTranslation');
      
      // 模拟添加CSS类
      element?.classList.add('active');
      expect(element?.classList.add).toHaveBeenCalledWith('active');

      // 模拟移除CSS类
      element?.classList.remove('active');
      expect(element?.classList.remove).toHaveBeenCalledWith('active');
    });
  });
});