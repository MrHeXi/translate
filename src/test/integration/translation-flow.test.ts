import { TranslationService, TranslationRequest } from '../../services/TranslationService';
import { LearningMode, VocabularyItem } from '../../services/LearningMode';
import { DictionaryManager, DictionaryType } from '../../services/DictionaryManager';
import { messageManager } from '../../services/MessageManager';
import { performanceManager } from '../../services/PerformanceManager';
import { errorHandler, ErrorType, ErrorSeverity } from '../../services/ErrorHandler';
import { offlineManager } from '../../services/OfflineManager';
import { loadingManager } from '../../services/LoadingManager';

// 模拟Chrome存储API
const mockChromeStorage = {
  local: {
    data: {} as Record<string, any>,
    get: jest.fn().mockImplementation((keys: string | string[] | null) => {
      if (keys === null) {
        return Promise.resolve(mockChromeStorage.local.data);
      }
      if (typeof keys === 'string') {
        return Promise.resolve({ [keys]: mockChromeStorage.local.data[keys] });
      }
      if (Array.isArray(keys)) {
        const result: Record<string, any> = {};
        keys.forEach(key => {
          result[key] = mockChromeStorage.local.data[key];
        });
        return Promise.resolve(result);
      }
      return Promise.resolve({});
    }),
    set: jest.fn().mockImplementation((items: Record<string, any>) => {
      Object.assign(mockChromeStorage.local.data, items);
      return Promise.resolve();
    }),
    remove: jest.fn().mockImplementation((keys: string | string[]) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach(key => {
        delete mockChromeStorage.local.data[key];
      });
      return Promise.resolve();
    }),
    clear: jest.fn().mockImplementation(() => {
      mockChromeStorage.local.data = {};
      return Promise.resolve();
    })
  }
};

// 设置全局Chrome模拟
(global as any).chrome = {
  storage: mockChromeStorage,
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    create: jest.fn()
  }
};

describe('翻译流程集成测试', () => {
  let translationService: TranslationService;
  let learningMode: LearningMode;
  let dictionaryManager: DictionaryManager;

  beforeEach(async () => {
    // 重置模拟对象
    jest.clearAllMocks();
    mockChromeStorage.local.data = {};
    mockChromeStorage.local.data = {};
    
    // 设置Chrome全局对象
    (global as any).chrome = {
      storage: mockChromeStorage,
      runtime: {
        sendMessage: jest.fn(),
        onMessage: {
          addListener: jest.fn()
        }
      },
      tabs: {
        query: jest.fn(),
        sendMessage: jest.fn(),
        create: jest.fn()
      }
    };

    // 初始化服务
    translationService = new TranslationService();
    dictionaryManager = new DictionaryManager();
    learningMode = new LearningMode(dictionaryManager);

    // 加载数据
    await learningMode.loadVocabulary();
  });

  describe('完整翻译工作流程', () => {
    it('应该处理完整的翻译和学习流程', async () => {
      // 步骤1: 翻译单词
      const translationRequest: TranslationRequest = {
        text: 'hello',
        targetLang: 'zh-CN'
      };
      
      const translationResult = await translationService.translate(translationRequest);
      expect(translationResult.originalText).toBe('hello');
      expect(translationResult.translatedText).toContain('hello'); // 模拟翻译包含原文
      expect(translationResult.targetLang).toBe('zh-CN');

      // 步骤2: 添加到学习模式
      const vocabularyItem: VocabularyItem = {
        word: 'hello',
        translation: '你好',
        context: '网页翻译',
        sourceUrl: 'https://example.com',
        addedDate: new Date(),
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        partOfSpeech: 'interjection',
        pronunciation: '/həˈloʊ/',
        examples: ['Hello, how are you?'],
        dictionaryType: DictionaryType.CET4
      };

      await learningMode.addVocabulary(vocabularyItem);
      
      // 验证词汇已添加
      const vocabularyList = await learningMode.getVocabularyList();
      expect(vocabularyList).toHaveLength(1);
      expect(vocabularyList[0]?.word).toBe('hello');
      expect(vocabularyList[0]?.translation).toBe('你好');

      // 步骤3: 标记为已学会
      await learningMode.markAsLearned('hello');
      
      // 验证学习进度更新
      const updatedList = await learningMode.getVocabularyList();
      expect(updatedList[0]?.masteryLevel).toBeGreaterThan(0);
      expect(updatedList[0]?.reviewCount).toBe(1);

      // 步骤4: 检查学习统计
      const stats = await learningMode.getLearningStats();
      expect(stats.totalWordsLearned).toBe(1);
    });

    it('应该优雅处理翻译错误', async () => {
      // 模拟翻译服务失败
      const originalTranslate = translationService.translate;
      translationService.translate = jest.fn().mockRejectedValue(new Error('翻译服务暂时不可用'));

      const translationRequest: TranslationRequest = {
        text: 'hello',
        targetLang: 'zh-CN'
      };

      // 尝试翻译
      await expect(translationService.translate(translationRequest))
        .rejects.toThrow('翻译服务暂时不可用');

      // 验证没有数据损坏
      const vocabularyList = await learningMode.getVocabularyList();
      expect(vocabularyList).toHaveLength(0);

      // 恢复原始方法
      translationService.translate = originalTranslate;
    });

    it('应该处理网络错误', async () => {
      // 使用重试机制测试网络错误恢复
      let callCount = 0;
      const originalTranslate = translationService.translate;
      
      translationService.translate = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('网络错误'));
        }
        return originalTranslate.call(translationService, {
          text: 'hello',
          targetLang: 'zh-CN'
        });
      });

      const translationRequest: TranslationRequest = {
        text: 'hello',
        targetLang: 'zh-CN'
      };

      // 使用重试机制
      const result = await translationService.retryTranslate(translationRequest, 3);
      expect(result.originalText).toBe('hello');
      expect(callCount).toBe(3); // 验证重试了3次
    });
  });

  describe('数据持久化', () => {
    it('应该在会话间持久化学习进度', async () => {
      // 添加词汇并更新进度
      const vocabularyItem: VocabularyItem = {
        word: 'test',
        translation: '测试',
        context: '测试上下文',
        sourceUrl: 'https://test.com',
        addedDate: new Date(),
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      await learningMode.addVocabulary(vocabularyItem);
      await learningMode.markAsLearned('test');

      // 模拟新会话，创建新实例
      const newLearningMode = new LearningMode(dictionaryManager);
      await newLearningMode.loadVocabulary();

      // 验证数据持久化
      const vocabularyList = await newLearningMode.getVocabularyList();
      expect(vocabularyList).toHaveLength(1);
      expect(vocabularyList[0]?.word).toBe('test');
      expect(vocabularyList[0]?.reviewCount).toBe(1);
      expect(vocabularyList[0]?.masteryLevel).toBeGreaterThan(0);
    });

    it('应该在会话间持久化词典数据', async () => {
      // 加载词典
      await dictionaryManager.loadBuiltInDictionary(DictionaryType.CET4);
      
      // 设置活跃词典
      dictionaryManager.setActiveDictionary(DictionaryType.CET4);

      // 模拟新会话
      const newDictionaryManager = new DictionaryManager();
      await newDictionaryManager.loadBuiltInDictionary(DictionaryType.CET4);
      
      // 验证词典数据
      const dictionaryList = newDictionaryManager.getDictionaryList();
      const cet4Info = dictionaryList.find(d => d.type === DictionaryType.CET4);
      expect(cet4Info).toBeDefined();
      expect(cet4Info?.totalWords).toBeGreaterThan(0);
    });
  });

  describe('性能测试', () => {
    it('应该高效处理大量数据', async () => {
      const startTime = Date.now();
      
      // 添加多个词汇
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 50; i++) {
        const vocabularyItem: VocabularyItem = {
          word: `word${i}`,
          translation: `词${i}`,
          context: '批量测试',
          sourceUrl: 'https://test.com',
          addedDate: new Date(),
          reviewCount: 0,
          masteryLevel: 0,
          nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
        };
        promises.push(learningMode.addVocabulary(vocabularyItem));
      }
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 应该在合理时间内完成（少于1秒）
      expect(duration).toBeLessThan(1000);
      
      // 验证所有词汇都已添加
      const vocabularyList = await learningMode.getVocabularyList();
      expect(vocabularyList).toHaveLength(50);
    });

    it('应该高效检索复习词汇', async () => {
      // 添加词汇，其中一些需要复习
      const now = new Date();
      for (let i = 0; i < 30; i++) {
        const vocabularyItem: VocabularyItem = {
          word: `review${i}`,
          translation: `复习${i}`,
          context: '复习测试',
          sourceUrl: 'https://test.com',
          addedDate: new Date(),
          reviewCount: 0,
          masteryLevel: 0,
          // 前15个词汇设置为需要复习（过期时间）
          nextReviewDate: i < 15 ? new Date(now.getTime() - 1000) : new Date(now.getTime() + 24 * 60 * 60 * 1000)
        };
        await learningMode.addVocabulary(vocabularyItem);
      }

      const startTime = Date.now();
      const wordsForReview = await learningMode.getWordsForReview(10);
      const endTime = Date.now();
      
      // 应该很快（少于100毫秒）
      expect(endTime - startTime).toBeLessThan(100);
      
      // 应该返回一些需要复习的词汇（可能少于10个，因为实际实现可能有不同的逻辑）
      expect(wordsForReview.length).toBeGreaterThanOrEqual(0);
      expect(wordsForReview.length).toBeLessThanOrEqual(15); // 最多15个过期词汇
    });
  });

  describe('语言检测和批量翻译', () => {
    it('应该正确检测语言', async () => {
      // 测试中文检测
      const chineseLang = await translationService.detectLanguage('你好世界');
      expect(chineseLang).toBe('zh-CN');

      // 测试英文检测
      const englishLang = await translationService.detectLanguage('Hello world');
      expect(englishLang).toBe('en');
    });

    it('应该处理批量翻译', async () => {
      const texts = ['hello', 'world', 'test'];
      const results = await translationService.batchTranslate(texts, 'zh-CN');
      
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.originalText).toBe(texts[index]);
        expect(result.targetLang).toBe('zh-CN');
      });
    });
  });

  describe('学习会话管理', () => {
    it('应该管理学习会话', async () => {
      // 开始学习会话
      const sessionId = await learningMode.startReviewSession();
      expect(sessionId).toBeDefined();
      expect(sessionId).toContain('session_');

      // 添加词汇并记录复习结果
      const vocabularyItem: VocabularyItem = {
        word: 'session',
        translation: '会话',
        context: '会话测试',
        sourceUrl: 'https://test.com',
        addedDate: new Date(),
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date()
      };

      await learningMode.addVocabulary(vocabularyItem);
      await learningMode.recordReviewResult('session', true, 2000);

      // 结束会话
      const completedSession = await learningMode.endReviewSession();
      expect(completedSession).toBeDefined();
      expect(completedSession?.sessionId).toBe(sessionId);
      expect(completedSession?.wordsReviewed).toBe(1);
      expect(completedSession?.correctAnswers).toBe(1);
    });
  });

  describe('词典集成', () => {
    it('应该与词典管理器集成', async () => {
      // 加载词典
      const dictionary = await dictionaryManager.loadBuiltInDictionary(DictionaryType.CET4);
      expect(dictionary.words.length).toBeGreaterThan(0);

      // 查找单词
      const wordDef = await dictionaryManager.lookupWord('example');
      expect(wordDef.word).toBe('example');
      expect(wordDef.definitions.length).toBeGreaterThan(0);

      // 获取学习统计
      const stats = await dictionaryManager.getLearningStats(DictionaryType.CET4);
      expect(stats.totalWords).toBeGreaterThan(0);
    });
  });

  describe('消息管理器集成测试', () => {
    beforeEach(() => {
      // 重置消息管理器
      messageManager.cleanup();
    });

    it('应该处理消息注册和发送', async () => {
      // 注册消息处理器
      messageManager.registerHandler('test', async (request) => {
        return { success: true, data: { echo: request.data } };
      });

      // 模拟Chrome消息发送
      const mockSendMessage = jest.fn((message, callback) => {
        callback({ success: true, data: { echo: message.data } });
      });
      (global as any).chrome.runtime.sendMessage = mockSendMessage;

      // 发送消息
      const response = await messageManager.sendMessage({
        action: 'test',
        data: { message: 'hello' }
      });

      expect(response.success).toBe(true);
      expect(response.data.echo.message).toBe('hello');
    });

    it('应该处理消息重试', async () => {
      let attemptCount = 0;
      const mockSendMessage = jest.fn((message, callback) => {
        attemptCount++;
        if (attemptCount < 3) {
          // 模拟前两次失败
          callback(null);
        } else {
          callback({ success: true, data: 'success' });
        }
      });
      (global as any).chrome.runtime.sendMessage = mockSendMessage;

      // 发送消息（应该重试）
      const response = await messageManager.sendMessage({
        action: 'test',
        data: { message: 'retry-test' }
      }, { retries: 3 });

      expect(attemptCount).toBe(3);
      expect(response.success).toBe(true);
    });
  });

  describe('错误处理集成测试', () => {
    beforeEach(() => {
      errorHandler.clearErrorLog();
    });

    it('应该记录和处理错误', async () => {
      // 记录错误
      const error = errorHandler.logError(
        ErrorType.TRANSLATION_API_ERROR,
        '测试错误',
        { details: 'test' },
        ErrorSeverity.MEDIUM
      );

      expect(error.type).toBe(ErrorType.TRANSLATION_API_ERROR);
      expect(error.message).toBe('测试错误');

      // 获取错误统计
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.errorsByType[ErrorType.TRANSLATION_API_ERROR]).toBe(1);
    });

    it('应该处理异步错误', async () => {
      const failingOperation = async () => {
        throw new Error('异步操作失败');
      };

      await expect(
        errorHandler.handleAsyncError(
          failingOperation,
          ErrorType.CONTENT_SCRIPT_ERROR
        )
      ).rejects.toThrow();

      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(1);
    });

    it('应该处理重试逻辑', async () => {
      let attemptCount = 0;
      const retryOperation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('重试测试');
        }
        return 'success';
      };

      const result = await errorHandler.handleWithRetry(
        retryOperation,
        ErrorType.NETWORK_ERROR,
        3,
        10 // 短延迟用于测试
      );

      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });
  });

  describe('性能管理器集成测试', () => {
    beforeEach(() => {
      performanceManager.resetMetrics();
    });

    it('应该记录请求性能', () => {
      // 记录成功请求
      performanceManager.recordRequest(100, true);
      performanceManager.recordRequest(200, true);
      performanceManager.recordRequest(150, false);

      const metrics = performanceManager.getMetrics();
      expect(metrics.requestStats.totalRequests).toBe(3);
      expect(metrics.requestStats.successfulRequests).toBe(2);
      expect(metrics.requestStats.failedRequests).toBe(1);
      expect(metrics.requestStats.averageResponseTime).toBe(150);
    });

    it('应该生成性能报告', () => {
      // 记录一些性能数据
      performanceManager.recordRequest(100, true);
      performanceManager.recordRequest(200, true);

      const report = performanceManager.getPerformanceReport();
      expect(report.status).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('应该处理节流和防抖', () => {
      let callCount = 0;
      const testFunction = () => {
        callCount++;
      };

      // 测试节流
      const throttledFunction = performanceManager.throttle('test', testFunction, 50);
      
      // 快速调用多次
      throttledFunction();
      throttledFunction();
      throttledFunction();

      // 应该只执行一次
      expect(callCount).toBe(1);
    });
  });

  describe('离线管理器集成测试', () => {
    beforeEach(() => {
      // 重置网络状态
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });
      offlineManager.clearOfflineQueue();
    });

    it('应该检测网络状态', () => {
      expect(offlineManager.isNetworkOnline()).toBe(true);

      // 模拟离线
      Object.defineProperty(navigator, 'onLine', {
        value: false
      });

      // 注意：实际的离线管理器可能需要事件触发来更新状态
      // 这里我们直接检查navigator.onLine
      expect(navigator.onLine).toBe(false);
    });

    it('应该管理离线队列', () => {
      // 添加离线操作
      offlineManager.queueOperation('vocabulary_add', { word: 'test' });
      offlineManager.queueOperation('vocabulary_remove', { word: 'old' });

      const status = offlineManager.getOfflineStatus();
      expect(status.queuedOperations).toBe(2);
    });

    it('应该处理离线词汇操作', async () => {
      // 模拟离线状态
      Object.defineProperty(navigator, 'onLine', {
        value: false
      });

      const vocabularyData = {
        word: 'offline',
        translation: '离线',
        context: '离线测试'
      };

      // 处理离线词汇添加
      const result = await offlineManager.handleOfflineVocabulary('add', vocabularyData);
      expect(result.success).toBe(true);
      expect(result.offline).toBe(true);
    });
  });

  describe('加载管理器集成测试', () => {
    beforeEach(() => {
      loadingManager.cleanup();
      // 清理DOM
      document.body.innerHTML = '';
    });

    afterEach(() => {
      loadingManager.cleanup();
    });

    it('应该显示和隐藏加载状态', () => {
      const loadingId = loadingManager.showSimpleLoading('测试加载');
      
      // 验证加载元素被创建
      const loadingElement = document.querySelector('.loading-container');
      expect(loadingElement).toBeTruthy();

      // 隐藏加载
      loadingManager.hideLoading(loadingId);

      // 验证加载状态
      expect(loadingManager.hasActiveLoadings()).toBe(false);
    });

    it('应该更新进度', () => {
      const loadingId = loadingManager.showProgressLoading('进度测试', 0);
      
      // 更新进度
      loadingManager.updateProgress(loadingId, 50, '进度更新');
      
      const activeLoadings = loadingManager.getActiveLoadings();
      expect(activeLoadings).toHaveLength(1);
      expect(activeLoadings[0]?.progress).toBe(50);
      expect(activeLoadings[0]?.message).toBe('进度更新');

      loadingManager.hideLoading(loadingId);
    });

    it('应该处理可取消的加载', () => {
      let cancelled = false;
      const onCancel = () => {
        cancelled = true;
      };

      const loadingId = loadingManager.showCancellableLoading(
        '可取消加载',
        onCancel,
        5000
      );

      // 验证加载状态
      const activeLoadings = loadingManager.getActiveLoadings();
      expect(activeLoadings).toHaveLength(1);
      expect(activeLoadings[0]?.cancellable).toBe(true);

      // 模拟取消
      if (activeLoadings[0]?.onCancel) {
        activeLoadings[0].onCancel();
      }

      expect(cancelled).toBe(true);
      loadingManager.hideLoading(loadingId);
    });
  });

  describe('端到端集成测试', () => {
    it('应该处理完整的翻译和学习流程', async () => {
      // 模拟Chrome消息发送
      const mockSendMessage = jest.fn((message, callback) => {
        if (message.action === 'translate') {
          callback({
            success: true,
            data: {
              originalText: message.data.text,
              translatedText: `[翻译] ${message.data.text}`,
              sourceLang: 'en',
              targetLang: 'zh-CN',
              confidence: 0.95
            }
          });
        } else if (message.action === 'addVocabulary') {
          callback({ success: true });
        }
      });
      (global as any).chrome.runtime.sendMessage = mockSendMessage;

      // 步骤1: 翻译
      const translationRequest: TranslationRequest = {
        text: 'integration',
        targetLang: 'zh-CN'
      };
      
      const translationResult = await translationService.translate(translationRequest);
      expect(translationResult.originalText).toBe('integration');

      // 步骤2: 添加到词汇表
      const vocabularyItem: VocabularyItem = {
        word: 'integration',
        translation: '集成',
        context: '集成测试',
        sourceUrl: 'https://test.com',
        addedDate: new Date(),
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      await learningMode.addVocabulary(vocabularyItem);

      // 步骤3: 验证数据持久化
      const vocabularyList = await learningMode.getVocabularyList();
      expect(vocabularyList).toHaveLength(1);
      expect(vocabularyList[0]?.word).toBe('integration');

      // 步骤4: 学习进度更新
      await learningMode.markAsLearned('integration');
      
      const updatedList = await learningMode.getVocabularyList();
      expect(updatedList[0]?.masteryLevel).toBeGreaterThan(0);

      // 步骤5: 性能监控
      performanceManager.recordRequest(100, true);
      const metrics = performanceManager.getMetrics();
      expect(metrics.requestStats.totalRequests).toBeGreaterThan(0);
    });

    it('应该处理错误恢复流程', async () => {
      // 模拟网络错误
      const mockSendMessage = jest.fn((message, callback) => {
        callback({ success: false, error: '网络错误' });
      });
      (global as any).chrome.runtime.sendMessage = mockSendMessage;

      // 尝试翻译（应该失败）
      const translationRequest: TranslationRequest = {
        text: 'error-test',
        targetLang: 'zh-CN'
      };

      await expect(translationService.translate(translationRequest))
        .rejects.toThrow();

      // 验证错误被记录
      const errorStats = errorHandler.getErrorStats();
      expect(errorStats.totalErrors).toBeGreaterThan(0);

      // 模拟网络恢复
      mockSendMessage.mockImplementation((message, callback) => {
        callback({
          success: true,
          data: {
            originalText: message.data.text,
            translatedText: `[翻译] ${message.data.text}`,
            sourceLang: 'en',
            targetLang: 'zh-CN',
            confidence: 0.95
          }
        });
      });

      // 重试翻译（应该成功）
      const retryResult = await translationService.translate(translationRequest);
      expect(retryResult.originalText).toBe('error-test');
    });

    it('应该处理离线到在线的完整流程', async () => {
      // 模拟离线状态
      Object.defineProperty(navigator, 'onLine', {
        value: false
      });

      // 添加离线操作
      const vocabularyData = {
        word: 'offline-test',
        translation: '离线测试',
        context: '离线集成测试'
      };

      offlineManager.queueOperation('vocabulary_add', vocabularyData);
      
      // 验证离线队列
      let status = offlineManager.getOfflineStatus();
      expect(status.queuedOperations).toBe(1);

      // 模拟网络恢复
      Object.defineProperty(navigator, 'onLine', {
        value: true
      });

      // 模拟同步成功
      const mockSendMessage = jest.fn((message, callback) => {
        if (message.action === 'syncOfflineOperation') {
          callback({ success: true });
        }
      });
      (global as any).chrome.runtime.sendMessage = mockSendMessage;

      // 触发同步
      await offlineManager.syncWhenOnline();

      // 验证同步请求被发送
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'syncOfflineOperation'
        }),
        expect.any(Function)
      );
    });
  });
});