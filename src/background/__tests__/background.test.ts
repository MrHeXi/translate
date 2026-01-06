// 后台脚本单元测试

import { TranslationService } from '../../services/TranslationService';
import { DictionaryManager, DictionaryType } from '../../services/DictionaryManager';
import { LearningMode } from '../../services/LearningMode';
import { StorageManager } from '../../services/StorageManager';

// 模拟Chrome API
const mockChromeRuntime = {
  onMessage: {
    addListener: jest.fn()
  },
  onConnect: {
    addListener: jest.fn()
  },
  onInstalled: {
    addListener: jest.fn()
  },
  onStartup: {
    addListener: jest.fn()
  }
};

const mockChromeStorage = {
  sync: {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({}),
    clear: jest.fn().mockResolvedValue(undefined)
  },
  local: {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({}),
    clear: jest.fn().mockResolvedValue(undefined)
  },
  onChanged: {
    addListener: jest.fn()
  }
};

// 设置全局Chrome对象
(global as any).chrome = {
  runtime: mockChromeRuntime,
  storage: mockChromeStorage
};

// 模拟服务类
jest.mock('../../services/TranslationService');
jest.mock('../../services/DictionaryManager');
jest.mock('../../services/LearningMode');
jest.mock('../../services/StorageManager');

describe('BackgroundService', () => {
  let mockTranslationService: jest.Mocked<TranslationService>;
  let mockDictionaryManager: jest.Mocked<DictionaryManager>;
  let mockLearningMode: jest.Mocked<LearningMode>;
  let mockStorageManager: jest.Mocked<StorageManager>;
  let messageHandler: (request: any, sender: any, sendResponse: any) => boolean;

  beforeEach(() => {
    // 重置所有mock
    jest.clearAllMocks();
    
    // 创建mock实例
    mockTranslationService = new TranslationService() as jest.Mocked<TranslationService>;
    mockDictionaryManager = new DictionaryManager() as jest.Mocked<DictionaryManager>;
    mockLearningMode = new LearningMode(mockDictionaryManager) as jest.Mocked<LearningMode>;
    mockStorageManager = new StorageManager() as jest.Mocked<StorageManager>;

    // 设置默认的mock返回值
    mockLearningMode.loadVocabulary.mockResolvedValue();
    mockDictionaryManager.loadBuiltInDictionary.mockResolvedValue({
      type: DictionaryType.GRE,
      name: 'GRE词汇',
      words: [],
      totalCount: 0
    });

    // 动态导入并初始化BackgroundService
    require('../background');

    // 获取注册的消息处理器
    expect(mockChromeRuntime.onMessage.addListener).toHaveBeenCalled();
    messageHandler = mockChromeRuntime.onMessage.addListener.mock.calls[0][0];
  });

  describe('消息处理', () => {
    it('应该处理翻译请求', async () => {
      const mockTranslateResult = {
        originalText: 'hello',
        translatedText: '你好',
        sourceLang: 'en',
        targetLang: 'zh-CN',
        confidence: 0.95
      };
      
      mockTranslationService.translate.mockResolvedValue(mockTranslateResult);

      const request = {
        action: 'translate',
        data: {
          text: 'hello',
          targetLanguage: 'zh-CN'
        }
      };

      const mockSendResponse = jest.fn();
      const sender = {};

      // 等待消息处理完成
      await new Promise<void>((resolve) => {
        mockSendResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          expect(response.data).toEqual(mockTranslateResult);
          resolve();
        });

        messageHandler(request, sender, mockSendResponse);
      });

      expect(mockTranslationService.translate).toHaveBeenCalledWith(request.data);
    });

    it('应该处理语言检测请求', async () => {
      const mockDetectResult = 'en';
      mockTranslationService.detectLanguage.mockResolvedValue(mockDetectResult);

      const request = {
        action: 'detectLanguage',
        data: { text: 'hello world' }
      };

      const mockSendResponse = jest.fn();
      const sender = {};

      await new Promise<void>((resolve) => {
        mockSendResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          expect(response.data).toBe(mockDetectResult);
          resolve();
        });

        messageHandler(request, sender, mockSendResponse);
      });

      expect(mockTranslationService.detectLanguage).toHaveBeenCalledWith('hello world');
    });

    it('应该处理添加词汇请求', async () => {
      mockLearningMode.addVocabulary.mockResolvedValue();

      const vocabularyItem = {
        word: 'example',
        translation: '例子',
        context: 'This is an example.',
        sourceUrl: 'https://example.com',
        addedDate: new Date(),
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date()
      };

      const request = {
        action: 'addVocabulary',
        data: vocabularyItem
      };

      const mockSendResponse = jest.fn();
      const sender = {};

      await new Promise<void>((resolve) => {
        mockSendResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          resolve();
        });

        messageHandler(request, sender, mockSendResponse);
      });

      expect(mockLearningMode.addVocabulary).toHaveBeenCalledWith(vocabularyItem);
    });

    it('应该处理获取学习统计请求', async () => {
      const mockStats = {
        totalWordsLearned: 100,
        dailyGoal: 20,
        currentStreak: 5,
        longestStreak: 10,
        reviewAccuracy: 0.85,
        timeSpentLearning: 3600,
        todayReviewedCount: 15,
        reviewDueCount: 8
      };

      mockLearningMode.getLearningStats.mockResolvedValue(mockStats);

      const request = {
        action: 'getLearningStats'
      };

      const mockSendResponse = jest.fn();
      const sender = {};

      await new Promise<void>((resolve) => {
        mockSendResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          expect(response.data).toEqual(mockStats);
          resolve();
        });

        messageHandler(request, sender, mockSendResponse);
      });

      expect(mockLearningMode.getLearningStats).toHaveBeenCalled();
    });

    it('应该处理设置相关请求', async () => {
      const mockSettings = {
        defaultTargetLanguage: 'zh-CN',
        translationProvider: 'google',
        floatingIconPosition: { x: 20, y: 20 },
        learningModeEnabled: true,
        activeDictionaries: ['gre'],
        highlightColors: { gre: '#ff0000' },
        autoTranslate: false,
        showFloatingIcon: true
      };

      mockStorageManager.getSettings.mockResolvedValue(mockSettings);
      mockStorageManager.saveSettings.mockResolvedValue();

      // 测试获取设置
      const getRequest = { action: 'getSettings' };
      const mockGetResponse = jest.fn();

      await new Promise<void>((resolve) => {
        mockGetResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          expect(response.data).toEqual(mockSettings);
          resolve();
        });

        messageHandler(getRequest, {}, mockGetResponse);
      });

      // 测试更新设置
      const updateRequest = {
        action: 'updateSettings',
        data: { defaultTargetLanguage: 'en' }
      };
      const mockUpdateResponse = jest.fn();

      await new Promise<void>((resolve) => {
        mockUpdateResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          resolve();
        });

        messageHandler(updateRequest, {}, mockUpdateResponse);
      });

      expect(mockStorageManager.getSettings).toHaveBeenCalled();
      expect(mockStorageManager.saveSettings).toHaveBeenCalledWith({ defaultTargetLanguage: 'en' });
    });

    it('应该处理词库相关请求', async () => {
      const mockDictionary = {
        type: DictionaryType.GRE,
        name: 'GRE词汇',
        words: [
          {
            word: 'example',
            pronunciation: '/ɪɡˈzæmpəl/',
            partOfSpeech: 'noun',
            definitions: ['例子'],
            examples: ['This is an example.'],
            difficulty: 3,
            frequency: 85
          }
        ],
        totalCount: 1
      };

      const mockWordDefinition = mockDictionary.words[0];

      mockDictionaryManager.loadBuiltInDictionary.mockResolvedValue(mockDictionary);
      mockDictionaryManager.lookupWord.mockResolvedValue(mockWordDefinition!);

      // 测试加载词库
      const loadRequest = {
        action: 'loadDictionary',
        data: { type: DictionaryType.GRE }
      };
      const mockLoadResponse = jest.fn();

      await new Promise<void>((resolve) => {
        mockLoadResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          expect(response.data).toEqual(mockDictionary);
          resolve();
        });

        messageHandler(loadRequest, {}, mockLoadResponse);
      });

      // 测试查词
      const lookupRequest = {
        action: 'lookupWord',
        data: { word: 'example' }
      };
      const mockLookupResponse = jest.fn();

      await new Promise<void>((resolve) => {
        mockLookupResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          expect(response.data).toEqual(mockWordDefinition);
          resolve();
        });

        messageHandler(lookupRequest, {}, mockLookupResponse);
      });

      expect(mockDictionaryManager.loadBuiltInDictionary).toHaveBeenCalledWith(DictionaryType.GRE);
      expect(mockDictionaryManager.lookupWord).toHaveBeenCalledWith('example');
    });

    it('应该处理未知操作类型', async () => {
      const request = {
        action: 'unknownAction',
        data: {}
      };

      const mockSendResponse = jest.fn();
      const sender = {};

      await new Promise<void>((resolve) => {
        mockSendResponse.mockImplementation((response) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('未知的操作类型');
          resolve();
        });

        messageHandler(request, sender, mockSendResponse);
      });
    });

    it('应该处理服务错误', async () => {
      const errorMessage = '翻译服务错误';
      mockTranslationService.translate.mockRejectedValue(new Error(errorMessage));

      const request = {
        action: 'translate',
        data: { text: 'hello', targetLanguage: 'zh-CN' }
      };

      const mockSendResponse = jest.fn();
      const sender = {};

      await new Promise<void>((resolve) => {
        mockSendResponse.mockImplementation((response) => {
          expect(response.success).toBe(false);
          expect(response.error).toBe(errorMessage);
          resolve();
        });

        messageHandler(request, sender, mockSendResponse);
      });
    });
  });

  describe('扩展生命周期', () => {
    it('应该注册所有必要的事件监听器', () => {
      expect(mockChromeRuntime.onMessage.addListener).toHaveBeenCalled();
      expect(mockChromeRuntime.onConnect.addListener).toHaveBeenCalled();
      expect(mockChromeRuntime.onInstalled.addListener).toHaveBeenCalled();
      expect(mockChromeRuntime.onStartup.addListener).toHaveBeenCalled();
    });

    it('应该在初始化时加载用户数据', () => {
      expect(mockLearningMode.loadVocabulary).toHaveBeenCalled();
    });

    it('应该在初始化时预加载词库', () => {
      expect(mockDictionaryManager.loadBuiltInDictionary).toHaveBeenCalledWith(DictionaryType.GRE);
      expect(mockDictionaryManager.loadBuiltInDictionary).toHaveBeenCalledWith(DictionaryType.TOEFL);
    });
  });

  describe('数据管理', () => {
    it('应该处理数据导出请求', async () => {
      const mockExportData = JSON.stringify({
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: { settings: {}, vocabulary: [], learningStats: {} }
      });

      mockStorageManager.exportData.mockResolvedValue(mockExportData);

      const request = { action: 'exportData' };
      const mockSendResponse = jest.fn();

      await new Promise<void>((resolve) => {
        mockSendResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          expect(response.data).toBe(mockExportData);
          resolve();
        });

        messageHandler(request, {}, mockSendResponse);
      });

      expect(mockStorageManager.exportData).toHaveBeenCalled();
    });

    it('应该处理数据导入请求', async () => {
      const importData = JSON.stringify({
        version: '1.0',
        data: { settings: {}, vocabulary: [], learningStats: {} }
      });

      mockStorageManager.importData.mockResolvedValue();
      mockLearningMode.loadVocabulary.mockResolvedValue();

      const request = {
        action: 'importData',
        data: { jsonData: importData }
      };
      const mockSendResponse = jest.fn();

      await new Promise<void>((resolve) => {
        mockSendResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          resolve();
        });

        messageHandler(request, {}, mockSendResponse);
      });

      expect(mockStorageManager.importData).toHaveBeenCalledWith(importData);
      expect(mockLearningMode.loadVocabulary).toHaveBeenCalledTimes(2); // 初始化时一次，导入后一次
    });

    it('应该处理数据同步请求', async () => {
      mockStorageManager.syncData.mockResolvedValue();

      const request = { action: 'syncData' };
      const mockSendResponse = jest.fn();

      await new Promise<void>((resolve) => {
        mockSendResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          resolve();
        });

        messageHandler(request, {}, mockSendResponse);
      });

      expect(mockStorageManager.syncData).toHaveBeenCalled();
    });
  });

  describe('学习会话管理', () => {
    it('应该处理复习会话的开始和结束', async () => {
      const mockSessionId = 'session_123_abc';
      const mockSession = {
        sessionId: mockSessionId,
        startTime: new Date(),
        endTime: new Date(),
        wordsReviewed: 10,
        correctAnswers: 8,
        averageResponseTime: 2500
      };

      mockLearningMode.startReviewSession.mockResolvedValue(mockSessionId);
      mockLearningMode.endReviewSession.mockResolvedValue(mockSession);

      // 测试开始会话
      const startRequest = { action: 'startReviewSession' };
      const mockStartResponse = jest.fn();

      await new Promise<void>((resolve) => {
        mockStartResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          expect(response.data.sessionId).toBe(mockSessionId);
          resolve();
        });

        messageHandler(startRequest, {}, mockStartResponse);
      });

      // 测试结束会话
      const endRequest = { action: 'endReviewSession' };
      const mockEndResponse = jest.fn();

      await new Promise<void>((resolve) => {
        mockEndResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          expect(response.data).toEqual(mockSession);
          resolve();
        });

        messageHandler(endRequest, {}, mockEndResponse);
      });

      expect(mockLearningMode.startReviewSession).toHaveBeenCalled();
      expect(mockLearningMode.endReviewSession).toHaveBeenCalled();
    });

    it('应该处理复习结果记录', async () => {
      mockLearningMode.recordReviewResult.mockResolvedValue();

      const request = {
        action: 'recordReviewResult',
        data: {
          word: 'example',
          isCorrect: true,
          responseTime: 2000
        }
      };
      const mockSendResponse = jest.fn();

      await new Promise<void>((resolve) => {
        mockSendResponse.mockImplementation((response) => {
          expect(response.success).toBe(true);
          resolve();
        });

        messageHandler(request, {}, mockSendResponse);
      });

      expect(mockLearningMode.recordReviewResult).toHaveBeenCalledWith('example', true, 2000);
    });
  });
});