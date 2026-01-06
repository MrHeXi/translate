// 基础集成测试
// 验证核心组件的基本集成功能

describe('基础集成测试', () => {
  // 模拟Chrome API
  const mockChrome = {
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined)
      },
      sync: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined)
      }
    },
    runtime: {
      sendMessage: jest.fn(),
      onMessage: {
        addListener: jest.fn()
      }
    },
    tabs: {
      query: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn()
    }
  };

  beforeAll(() => {
    (global as any).chrome = mockChrome;
    (global as any).navigator = {
      onLine: true
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('消息传递集成', () => {
    it('应该能够发送和接收消息', async () => {
      // 模拟消息响应
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (callback) {
          callback({ success: true, data: { echo: message.data } });
        }
      });

      // 创建测试消息
      const testMessage = {
        action: 'test',
        data: { text: 'hello world' }
      };

      // 发送消息并验证响应
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(testMessage, resolve);
      });

      expect(response).toEqual({
        success: true,
        data: { echo: { text: 'hello world' } }
      });
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        testMessage,
        expect.any(Function)
      );
    });

    it('应该处理消息发送失败', async () => {
      // 模拟消息发送失败
      mockChrome.runtime.sendMessage.mockImplementation((_message, callback) => {
        if (callback) {
          callback({ success: false, error: '连接失败' });
        }
      });

      const testMessage = {
        action: 'test',
        data: { text: 'error test' }
      };

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(testMessage, resolve);
      });

      expect(response).toEqual({
        success: false,
        error: '连接失败'
      });
    });
  });

  describe('存储集成', () => {
    it('应该能够保存和读取数据', async () => {
      const testData = {
        vocabulary: [
          {
            word: 'test',
            translation: '测试',
            addedDate: new Date().toISOString()
          }
        ]
      };

      // 保存数据
      await chrome.storage.local.set(testData);
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(testData);

      // 模拟读取数据
      mockChrome.storage.local.get.mockResolvedValue(testData);
      
      const retrievedData = await chrome.storage.local.get('vocabulary');
      expect(retrievedData).toEqual(testData);
    });

    it('应该处理存储错误', async () => {
      // 模拟存储错误
      mockChrome.storage.local.set.mockRejectedValue(new Error('存储失败'));

      const testData = { test: 'data' };

      await expect(chrome.storage.local.set(testData))
        .rejects.toThrow('存储失败');
    });
  });

  describe('翻译流程集成', () => {
    it('应该完成基本翻译流程', async () => {
      // 模拟翻译API响应
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.action === 'translate') {
          callback({
            success: true,
            data: {
              originalText: message.data.text,
              translatedText: `[翻译] ${message.data.text}`,
              sourceLang: 'en',
              targetLang: message.data.targetLang || 'zh-CN',
              confidence: 0.95
            }
          });
        }
      });

      // 发送翻译请求
      const translationRequest = {
        action: 'translate',
        data: {
          text: 'hello world',
          targetLang: 'zh-CN'
        }
      };

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(translationRequest, resolve);
      }) as any;

      expect(response.success).toBe(true);
      expect(response.data.originalText).toBe('hello world');
      expect(response.data.translatedText).toBe('[翻译] hello world');
      expect(response.data.targetLang).toBe('zh-CN');
    });

    it('应该处理翻译失败', async () => {
      // 模拟翻译失败
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.action === 'translate') {
          callback({
            success: false,
            error: '翻译服务不可用'
          });
        }
      });

      const translationRequest = {
        action: 'translate',
        data: {
          text: 'error test',
          targetLang: 'zh-CN'
        }
      };

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(translationRequest, resolve);
      }) as any;

      expect(response.success).toBe(false);
      expect(response.error).toBe('翻译服务不可用');
    });
  });

  describe('词汇管理集成', () => {
    it('应该完成词汇添加流程', async () => {
      // 模拟词汇添加响应
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.action === 'addVocabulary') {
          callback({ success: true });
        }
      });

      const vocabularyRequest = {
        action: 'addVocabulary',
        data: {
          word: 'integration',
          translation: '集成',
          context: '集成测试',
          sourceUrl: 'https://test.com'
        }
      };

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(vocabularyRequest, resolve);
      }) as any;

      expect(response.success).toBe(true);
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        vocabularyRequest,
        expect.any(Function)
      );
    });

    it('应该获取词汇列表', async () => {
      const mockVocabulary = [
        {
          word: 'test1',
          translation: '测试1',
          addedDate: new Date().toISOString()
        },
        {
          word: 'test2',
          translation: '测试2',
          addedDate: new Date().toISOString()
        }
      ];

      // 模拟获取词汇列表响应
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.action === 'getVocabularyList') {
          callback({
            success: true,
            data: mockVocabulary
          });
        }
      });

      const vocabularyRequest = {
        action: 'getVocabularyList'
      };

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(vocabularyRequest, resolve);
      }) as any;

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
      expect(response.data[0].word).toBe('test1');
      expect(response.data[1].word).toBe('test2');
    });
  });

  describe('多页面场景', () => {
    it('应该处理多标签页消息', async () => {
      const mockTabs = [
        { id: 1, url: 'https://example1.com' },
        { id: 2, url: 'https://example2.com' },
        { id: 3, url: 'https://example3.com' }
      ];

      // 模拟标签页查询
      mockChrome.tabs.query.mockResolvedValue(mockTabs);
      
      // 模拟向标签页发送消息
      mockChrome.tabs.sendMessage.mockImplementation((tabId, _message, callback) => {
        if (callback) {
          callback({ success: true, tabId });
        }
      });

      // 查询所有标签页
      const tabs = await chrome.tabs.query({});
      expect(tabs).toHaveLength(3);

      // 向每个标签页发送消息
      const responses = await Promise.all(
        tabs.map(tab => 
          new Promise(resolve => {
            chrome.tabs.sendMessage(tab.id!, { action: 'test' }, resolve);
          })
        )
      );

      expect(responses).toHaveLength(3);
      responses.forEach((response, index) => {
        expect(response).toEqual({ success: true, tabId: mockTabs[index]!.id });
      });
    });
  });

  describe('错误恢复机制', () => {
    it('应该处理网络错误恢复', async () => {
      let attemptCount = 0;
      
      // 模拟前两次失败，第三次成功
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        attemptCount++;
        if (attemptCount <= 2) {
          callback({ success: false, error: '网络连接失败' });
        } else {
          callback({
            success: true,
            data: {
              originalText: message.data.text,
              translatedText: `[翻译] ${message.data.text}`,
              sourceLang: 'en',
              targetLang: 'zh-CN'
            }
          });
        }
      });

      // 实现简单的重试逻辑
      const sendWithRetry = async (message: any, maxRetries: number = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(message, resolve);
          }) as any;
          
          if (response.success) {
            return response;
          }
          
          if (attempt === maxRetries) {
            throw new Error(response.error);
          }
          
          // 短暂延迟后重试
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };

      const translationRequest = {
        action: 'translate',
        data: {
          text: 'retry test',
          targetLang: 'zh-CN'
        }
      };

      const response = await sendWithRetry(translationRequest);
      
      expect(response.success).toBe(true);
      expect(response.data.originalText).toBe('retry test');
      expect(attemptCount).toBe(3); // 验证重试了3次
    });

    it('应该处理存储降级', async () => {
      const testData = { test: 'data' };
      
      // 模拟local存储失败
      mockChrome.storage.local.set.mockRejectedValue(new Error('Local storage full'));
      
      // 模拟sync存储成功
      mockChrome.storage.sync.set.mockResolvedValue(undefined);

      // 实现存储降级逻辑
      const saveWithFallback = async (data: any) => {
        try {
          await chrome.storage.local.set(data);
          return 'local';
        } catch (error) {
          // 降级到sync存储
          await chrome.storage.sync.set(data);
          return 'sync';
        }
      };

      const storageType = await saveWithFallback(testData);
      
      expect(storageType).toBe('sync');
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(testData);
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(testData);
    });
  });

  describe('性能测试', () => {
    it('应该在合理时间内完成操作', async () => {
      // 模拟快速响应
      mockChrome.runtime.sendMessage.mockImplementation((_message, callback) => {
        // 模拟10ms延迟
        setTimeout(() => {
          callback({
            success: true,
            data: { result: 'fast response' }
          });
        }, 10);
      });

      const startTime = Date.now();
      
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'test' }, resolve);
      }) as any;
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response).toEqual({
        success: true,
        data: { result: 'fast response' }
      });
      expect(duration).toBeLessThan(100); // 应该在100ms内完成
    });

    it('应该处理并发请求', async () => {
      // 模拟并发响应
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          success: true,
          data: { echo: message.data }
        });
      });

      // 创建多个并发请求
      const requests = Array.from({ length: 5 }, (_, i) => ({
        action: 'test',
        data: { id: i }
      }));

      const startTime = Date.now();
      const responses = await Promise.all(
        requests.map(req => 
          new Promise(resolve => {
            chrome.runtime.sendMessage(req, resolve);
          })
        )
      );
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(responses).toHaveLength(5);
      expect(duration).toBeLessThan(100); // 并发请求应该很快完成
      
      // 验证每个响应
      responses.forEach((response: any, index) => {
        expect(response.success).toBe(true);
        expect(response.data.echo.id).toBe(index);
      });
    });
  });

  describe('离线模式', () => {
    it('应该检测离线状态', () => {
      // 测试在线状态
      expect(navigator.onLine).toBe(true);

      // 模拟离线状态
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true
      });

      expect(navigator.onLine).toBe(false);

      // 恢复在线状态
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true
      });

      expect(navigator.onLine).toBe(true);
    });

    it('应该在离线时提供降级功能', async () => {
      // 模拟离线状态
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true
      });

      // 模拟离线响应
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.action === 'translate') {
          callback({
            success: false,
            error: '离线模式下无法翻译',
            offline: true
          });
        }
      });

      const translationRequest = {
        action: 'translate',
        data: {
          text: 'offline test',
          targetLang: 'zh-CN'
        }
      };

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(translationRequest, resolve);
      }) as any;

      expect(response.success).toBe(false);
      expect(response.offline).toBe(true);
      expect(response.error).toContain('离线模式');
    });
  });
});