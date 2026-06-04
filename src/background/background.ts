// Chrome扩展后台脚本 - Service Worker
// 负责插件的核心逻辑和服务协调

// Service Worker 环境检查和兼容性设置
if (typeof (self as any).importScripts === 'function') {
  // 在Service Worker环境中
  console.log('Chrome翻译插件 Service Worker 已启动');
}

import { TranslationService } from '../services/TranslationService';
import { DictionaryManager, DictionaryType } from '../services/DictionaryManager';
import { LearningMode } from '../services/LearningMode';
import { StorageManager } from '../services/StorageManager';
import { messageManager, MessageRequest as MsgRequest, MessageResponse as MsgResponse } from '../services/MessageManager';
import { performanceManager } from '../services/PerformanceManager';
import { errorHandler, ErrorType, ErrorSeverity } from '../services/ErrorHandler';
import { offlineManager } from '../services/OfflineManager';

// 消息类型定义（保留兼容性）
interface MessageRequest {
  action: string;
  data?: any;
  tabId?: number;
}

interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}

class BackgroundService {
  private translationService: TranslationService;
  private dictionaryManager: DictionaryManager;
  private learningMode: LearningMode;
  private storageManager: StorageManager;
  private isInitialized: boolean = false;

  constructor() {
    this.translationService = new TranslationService();
    this.dictionaryManager = new DictionaryManager();
    this.learningMode = new LearningMode(this.dictionaryManager);
    this.storageManager = new StorageManager();
    
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // 启动性能监控
      performanceManager.startMonitoring();
      
      // 设置错误处理
      this.setupErrorHandling();
      
      // 初始化服务
      await this.loadUserData();
      await this.preloadDictionaries();
      
      // 注册消息处理器
      this.registerMessageHandlers();
      
      // 设置扩展安装和更新处理
      this.initializeExtensionHandlers();
      
      // 设置性能优化
      this.setupPerformanceOptimization();
      
      // 设置离线模式支持
      this.setupOfflineSupport();
      
      this.isInitialized = true;
      console.log('后台服务初始化完成');
    } catch (error) {
      errorHandler.logError(
        ErrorType.INITIALIZATION_ERROR,
        '后台服务初始化失败',
        error,
        ErrorSeverity.CRITICAL
      );
    }
  }

  private async loadUserData(): Promise<void> {
    try {
      // 加载用户数据和学习进度
      await this.learningMode.loadVocabulary();
      console.log('用户数据加载完成');
    } catch (error) {
      console.warn('加载用户数据失败:', error);
    }
  }

  private async preloadDictionaries(): Promise<void> {
    try {
      // 预加载常用词库
      const commonDictionaries = [DictionaryType.GRE, DictionaryType.TOEFL];
      for (const dictType of commonDictionaries) {
        await this.dictionaryManager.loadBuiltInDictionary(dictType);
      }
      console.log('词库预加载完成');
    } catch (error) {
      console.warn('词库预加载失败:', error);
    }
  }

  private registerMessageHandlers(): void {
    // 注册所有消息处理器到统一管理器
    messageManager.registerHandlers({
      // 翻译相关
      'translate': this.handleTranslateRequest.bind(this),
      'detectLanguage': this.handleDetectLanguageRequest.bind(this),
      
      // 词汇管理
      'addVocabulary': this.handleAddVocabularyRequest.bind(this),
      'removeVocabulary': this.handleRemoveVocabularyRequest.bind(this),
      'getVocabularyList': this.handleGetVocabularyListRequest.bind(this),
      'markAsLearned': this.handleMarkAsLearnedRequest.bind(this),
      'updateVocabularyMastery': this.handleUpdateVocabularyMasteryRequest.bind(this),
      
      // 词典管理
      'loadDictionary': this.handleLoadDictionaryRequest.bind(this),
      'lookupWord': this.handleLookupWordRequest.bind(this),
      
      // 设置管理
      'getSettings': this.handleGetSettingsRequest.bind(this),
      'updateSettings': this.handleUpdateSettingsRequest.bind(this),
      
      // 学习统计
      'getLearningStats': this.handleGetLearningStatsRequest.bind(this),
      'getDictionaryProgress': this.handleGetDictionaryProgressRequest.bind(this),
      
      // 复习会话
      'startReviewSession': this.handleStartReviewSessionRequest.bind(this),
      'endReviewSession': this.handleEndReviewSessionRequest.bind(this),
      'recordReviewResult': this.handleRecordReviewResultRequest.bind(this),
      
      // 数据管理
      'exportData': this.handleExportDataRequest.bind(this),
      'importData': this.handleImportDataRequest.bind(this),
      'syncData': this.handleSyncDataRequest.bind(this),
      
      // 系统操作
      'resetSettings': this.handleResetSettingsRequest.bind(this),
      'exportUserData': this.handleExportUserDataRequest.bind(this),
      'importUserData': this.handleImportUserDataRequest.bind(this),
      'forceSync': this.handleForceSyncRequest.bind(this),
      'clearVocabulary': this.handleClearVocabularyRequest.bind(this),
      'resetAllSettings': this.handleResetAllSettingsRequest.bind(this),
      'clearAllData': this.handleClearAllDataRequest.bind(this),
      
      // 性能和系统
      'ping': this.handlePingRequest.bind(this),
      'getPerformanceMetrics': this.handleGetPerformanceMetricsRequest.bind(this),
      'optimizeCache': this.handleOptimizeCacheRequest.bind(this),
      'cleanupExpiredCache': this.handleCleanupExpiredCacheRequest.bind(this),
      'performanceEvent': this.handlePerformanceEventRequest.bind(this),
      
      // UI操作
      'openSettings': this.handleOpenSettingsRequest.bind(this),
      'openVocabulary': this.handleOpenVocabularyRequest.bind(this),
      'openReview': this.handleOpenReviewRequest.bind(this),
      
      // 错误处理和离线支持
      'reportError': this.handleReportErrorRequest.bind(this),
      'syncOfflineOperation': this.handleSyncOfflineOperationRequest.bind(this),
      'networkStatusChanged': this.handleNetworkStatusChangedRequest.bind(this)
    });

    // 保持原有的消息监听器以确保兼容性
    chrome.runtime.onMessage.addListener((request: MessageRequest, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // 保持消息通道开放以支持异步响应
    });

    // 监听来自content script的连接
    chrome.runtime.onConnect.addListener((port) => {
      this.handleConnection(port);
    });
  }

  private initializeExtensionHandlers(): void {
    // 扩展安装时的处理
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleExtensionInstalled(details);
    });

    // 扩展启动时的处理
    chrome.runtime.onStartup.addListener(() => {
      this.handleExtensionStartup();
    });
  }

  private async handleMessage(
    request: MessageRequest, 
    _sender: chrome.runtime.MessageSender, 
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    if (!this.isInitialized) {
      sendResponse({ success: false, error: '服务尚未初始化完成' });
      return;
    }

    try {
      let response: MessageResponse;
      
      switch (request.action) {
        case 'translate':
          response = await this.handleTranslateRequest(request);
          break;
        
        case 'detectLanguage':
          response = await this.handleDetectLanguageRequest(request);
          break;
        
        case 'addVocabulary':
          response = await this.handleAddVocabularyRequest(request);
          break;
        
        case 'removeVocabulary':
          response = await this.handleRemoveVocabularyRequest(request);
          break;
        
        case 'getVocabularyList':
          response = await this.handleGetVocabularyListRequest(request);
          break;
        
        case 'markAsLearned':
          response = await this.handleMarkAsLearnedRequest(request);
          break;

        case 'updateVocabularyMastery':
          response = await this.handleUpdateVocabularyMasteryRequest(request);
          break;
        
        case 'loadDictionary':
          response = await this.handleLoadDictionaryRequest(request);
          break;
        
        case 'lookupWord':
          response = await this.handleLookupWordRequest(request);
          break;
        
        case 'getSettings':
          response = await this.handleGetSettingsRequest(request);
          break;
        
        case 'updateSettings':
          response = await this.handleUpdateSettingsRequest(request);
          break;
        
        case 'getLearningStats':
          response = await this.handleGetLearningStatsRequest(request);
          break;
        
        case 'getDictionaryProgress':
          response = await this.handleGetDictionaryProgressRequest(request);
          break;
        
        case 'startReviewSession':
          response = await this.handleStartReviewSessionRequest(request);
          break;
        
        case 'endReviewSession':
          response = await this.handleEndReviewSessionRequest(request);
          break;
        
        case 'recordReviewResult':
          response = await this.handleRecordReviewResultRequest(request);
          break;
        
        case 'exportData':
          response = await this.handleExportDataRequest(request);
          break;
        
        case 'importData':
          response = await this.handleImportDataRequest(request);
          break;
        
        case 'syncData':
          response = await this.handleSyncDataRequest(request);
          break;
        
        case 'resetSettings':
          response = await this.handleResetSettingsRequest(request);
          break;
        
        case 'exportUserData':
          response = await this.handleExportUserDataRequest(request);
          break;
        
        case 'importUserData':
          response = await this.handleImportUserDataRequest(request);
          break;
        
        case 'forceSync':
          response = await this.handleForceSyncRequest(request);
          break;
        
        case 'clearVocabulary':
          response = await this.handleClearVocabularyRequest(request);
          break;
        
        case 'resetAllSettings':
          response = await this.handleResetAllSettingsRequest(request);
          break;
        
        case 'clearAllData':
          response = await this.handleClearAllDataRequest(request);
          break;
        
        default:
          response = { success: false, error: `未知的操作类型: ${request.action}` };
      }
      
      sendResponse(response);
    } catch (error) {
      console.error(`处理消息失败 [${request.action}]:`, error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : '未知错误' 
      });
    }
  }

  private handleConnection(port: chrome.runtime.Port): void {
    console.log('建立连接:', port.name);
    
    port.onMessage.addListener((message) => {
      // 处理长连接消息
      console.log('收到连接消息:', message);
    });

    port.onDisconnect.addListener(() => {
      console.log('连接断开:', port.name);
    });
  }

  private async handleExtensionInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
    console.log('扩展安装事件:', details.reason);
    
    if (details.reason === 'install') {
      // 首次安装时的初始化
      console.log('首次安装，进行初始化设置');
      
      // 可以在这里设置默认设置或显示欢迎页面
      try {
        await this.storageManager.saveSettings({
          defaultTargetLanguage: 'zh-CN',
          translationProvider: 'google',
          learningModeEnabled: true
        });
      } catch (error) {
        console.error('初始化设置失败:', error);
      }
    } else if (details.reason === 'update') {
      // 更新时的处理
      console.log('扩展更新，检查数据迁移');
    }
  }

  private handleExtensionStartup(): void {
    console.log('扩展启动');
    // 可以在这里进行启动时的清理或初始化工作
  }

  private setupPerformanceOptimization(): void {
    // 配置性能管理器
    performanceManager.updateConfig({
      maxMemoryUsage: 150, // 150MB
      maxCacheSize: 2000,  // 2000个缓存项
      maxCacheAge: 48 * 60 * 60 * 1000, // 48小时
      requestTimeout: 15000, // 15秒
      batchSize: 20,
      throttleDelay: 200
    });

    // 定期清理过期缓存
    setInterval(() => {
      this.cleanupExpiredCaches();
    }, 60 * 60 * 1000); // 每小时清理一次

    // 监听内存警告
    chrome.runtime.onMessage.addListener((request) => {
      if (request.action === 'performanceEvent' && request.data.type === 'memory-warning') {
        this.handleMemoryWarning(request.data.data);
      }
    });
  }

  private setupErrorHandling(): void {
    // 注册错误处理回调
    errorHandler.onError(ErrorType.TRANSLATION_API_ERROR, (error) => {
      console.warn('翻译API错误:', error);
      // 可以在这里切换到备用翻译服务
    });

    errorHandler.onError(ErrorType.STORAGE_ERROR, (error) => {
      console.warn('存储错误:', error);
      // 可以在这里尝试清理存储空间
    });

    errorHandler.onError(ErrorType.NETWORK_ERROR, (error) => {
      console.warn('网络错误:', error);
      // 启用离线模式
      if (!offlineManager.isNetworkOnline()) {
        offlineManager.showOfflineNotification();
      }
    });

    // 设置全局错误恢复策略
    errorHandler.registerRecoveryStrategy(ErrorType.TRANSLATION_API_ERROR, {
      canRecover: true,
      retryable: true,
      maxRetries: 3,
      userMessage: '翻译服务暂时不可用，正在重试...',
      recoveryAction: async () => {
        // 清理翻译缓存，强制重新请求
        this.translationService.clearCache();
      }
    });
  }

  private setupOfflineSupport(): void {
    // 监听网络状态变化
    chrome.runtime.onMessage.addListener((request) => {
      if (request.action === 'networkStatusChanged') {
        const { isOnline } = request.data;
        console.log(`网络状态变化: ${isOnline ? '在线' : '离线'}`);
        
        if (isOnline) {
          // 网络恢复时同步离线数据
          offlineManager.syncWhenOnline();
        }
      }
    });
  }

  private async cleanupExpiredCaches(): Promise<void> {
    try {
      // 清理翻译服务缓存
      this.translationService.cleanExpiredCache();
      
      // 清理词典管理器缓存
      this.dictionaryManager.clearWordCache();
      
      console.log('定期缓存清理完成');
    } catch (error) {
      console.error('缓存清理失败:', error);
    }
  }

  private handleMemoryWarning(data: any): void {
    console.warn('内存使用警告:', data);
    
    // 执行紧急内存清理
    this.cleanupExpiredCaches();
    
    // 通知用户（如果需要）
    if (data.usage > 95) {
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '翻译插件内存警告',
        message: '内存使用率过高，已自动清理缓存'
      });
    }
  }

  // 具体的消息处理方法
  private async handleTranslateRequest(request: MessageRequest): Promise<MessageResponse> {
    const startTime = Date.now();
    try {
      // 检查网络状态
      if (!offlineManager.isNetworkOnline()) {
        // 尝试离线翻译
        const offlineResult = await offlineManager.handleOfflineTranslation(
          request.data.text, 
          request.data.targetLang
        );
        
        if (offlineResult.success) {
          const responseTime = Date.now() - startTime;
          performanceManager.recordRequest(responseTime, true);
          return offlineResult;
        } else {
          // 离线翻译失败，返回错误
          throw new Error(offlineResult.error);
        }
      }

      // 在线翻译，使用错误处理包装
      const result = await errorHandler.handleWithRetry(
        () => this.translationService.translate(request.data),
        ErrorType.TRANSLATION_API_ERROR,
        3, // 最多重试3次
        1000, // 1秒延迟
        { component: 'background', action: 'translate' }
      );

      const responseTime = Date.now() - startTime;
      performanceManager.recordRequest(responseTime, true);
      return { success: true, data: result };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      performanceManager.recordRequest(responseTime, false);
      
      // 记录错误
      errorHandler.logError(
        ErrorType.TRANSLATION_API_ERROR,
        '翻译请求失败',
        error,
        ErrorSeverity.MEDIUM,
        { component: 'background', action: 'translate' }
      );
      
      throw error;
    }
  }

  private async handleDetectLanguageRequest(request: MessageRequest): Promise<MessageResponse> {
    const result = await this.translationService.detectLanguage(request.data.text);
    return { success: true, data: result };
  }

  private async handleAddVocabularyRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.learningMode.addVocabulary(request.data);
    return { success: true };
  }

  private async handleRemoveVocabularyRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.learningMode.removeVocabulary(request.data.word);
    return { success: true };
  }

  private async handleGetVocabularyListRequest(request: MessageRequest): Promise<MessageResponse> {
    const vocabularyList = await this.learningMode.getVocabularyList(request.data?.dictionaryType);
    return { success: true, data: vocabularyList };
  }

  private async handleMarkAsLearnedRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.learningMode.markAsLearned(request.data.word);
    return { success: true };
  }

  private async handleUpdateVocabularyMasteryRequest(request: MessageRequest): Promise<MessageResponse> {
    const word = request.data?.word;
    const masteryLevel = request.data?.masteryLevel;

    if (!word || typeof masteryLevel !== 'number') {
      return { success: false, error: 'word and numeric masteryLevel are required' };
    }

    await this.learningMode.updateVocabularyMastery(word, masteryLevel);
    return { success: true };
  }

  private async handleLoadDictionaryRequest(request: MessageRequest): Promise<MessageResponse> {
    const dictionary = await this.dictionaryManager.loadBuiltInDictionary(request.data.type);
    return { success: true, data: dictionary };
  }

  private async handleLookupWordRequest(request: MessageRequest): Promise<MessageResponse> {
    const wordDefinition = await this.dictionaryManager.lookupWord(request.data.word);
    return { success: true, data: wordDefinition };
  }

  private async handleGetSettingsRequest(request: MessageRequest): Promise<MessageResponse> {
    const settings = await this.storageManager.getSettings();
    return { success: true, data: settings };
  }

  private async handleUpdateSettingsRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.storageManager.saveSettings(request.data);
    return { success: true };
  }

  private async handleGetLearningStatsRequest(request: MessageRequest): Promise<MessageResponse> {
    const stats = await this.learningMode.getLearningStats();
    return { success: true, data: stats };
  }

  private async handleGetDictionaryProgressRequest(request: MessageRequest): Promise<MessageResponse> {
    const progress = request.data?.dictionaryType 
      ? await this.learningMode.getDictionaryProgress(request.data.dictionaryType)
      : await this.learningMode.getAllDictionaryProgress();
    return { success: true, data: progress };
  }

  private async handleStartReviewSessionRequest(request: MessageRequest): Promise<MessageResponse> {
    const sessionId = await this.learningMode.startReviewSession();
    return { success: true, data: { sessionId } };
  }

  private async handleEndReviewSessionRequest(request: MessageRequest): Promise<MessageResponse> {
    const session = await this.learningMode.endReviewSession();
    return { success: true, data: session };
  }

  private async handleRecordReviewResultRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.learningMode.recordReviewResult(
      request.data.word, 
      request.data.isCorrect, 
      request.data.responseTime
    );
    return { success: true };
  }

  private async handleExportDataRequest(request: MessageRequest): Promise<MessageResponse> {
    const exportedData = await this.storageManager.exportData();
    return { success: true, data: exportedData };
  }

  private async handleImportDataRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.storageManager.importData(request.data.jsonData);
    // 重新加载数据
    await this.learningMode.loadVocabulary();
    return { success: true };
  }

  private async handleSyncDataRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.storageManager.syncData();
    return { success: true };
  }

  private async handleResetSettingsRequest(request: MessageRequest): Promise<MessageResponse> {
    // 重置为默认设置
    const defaultSettings = {
      defaultTargetLanguage: 'zh-CN',
      translationProvider: 'google',
      autoTranslate: false,
      showFloatingIcon: true,
      floatingIconPosition: { x: 50, y: 50 },
      learningModeEnabled: true,
      activeDictionaries: ['gre', 'toefl'],
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
    };
    
    await this.storageManager.saveSettings(defaultSettings);
    return { success: true };
  }

  private async handleExportUserDataRequest(request: MessageRequest): Promise<MessageResponse> {
    const exportedData = await this.storageManager.exportData();
    return { success: true, data: exportedData };
  }

  private async handleImportUserDataRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.storageManager.importData(request.data);
    // 重新加载数据
    await this.learningMode.loadVocabulary();
    return { success: true };
  }

  private async handleForceSyncRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.storageManager.syncData();
    return { success: true };
  }

  private async handleClearVocabularyRequest(request: MessageRequest): Promise<MessageResponse> {
    // 清空生词本
    await this.learningMode.clearVocabulary();
    return { success: true };
  }

  private async handleResetAllSettingsRequest(request: MessageRequest): Promise<MessageResponse> {
    // 重置所有设置但保留生词本
    const defaultSettings = {
      defaultTargetLanguage: 'zh-CN',
      translationProvider: 'google',
      autoTranslate: false,
      showFloatingIcon: true,
      floatingIconPosition: { x: 50, y: 50 },
      learningModeEnabled: true,
      activeDictionaries: ['gre', 'toefl'],
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
    };
    
    await this.storageManager.saveSettings(defaultSettings);
    return { success: true };
  }

  private async handleClearAllDataRequest(request: MessageRequest): Promise<MessageResponse> {
    // 清空所有数据
    await this.storageManager.clearAllData();
    await this.learningMode.clearVocabulary();
    
    // 重新初始化默认设置
    await this.handleResetSettingsRequest(request);
    
    return { success: true };
  }

  // 新增的性能和系统相关处理方法
  private async handlePingRequest(request: MessageRequest): Promise<MessageResponse> {
    return { success: true, data: { timestamp: Date.now(), status: 'ok' } };
  }

  private async handleGetPerformanceMetricsRequest(request: MessageRequest): Promise<MessageResponse> {
    const metrics = performanceManager.getMetrics();
    const report = performanceManager.getPerformanceReport();
    return { success: true, data: { metrics, report } };
  }

  private async handleOptimizeCacheRequest(request: MessageRequest): Promise<MessageResponse> {
    const maxSize = request.data?.maxSize || 1000;
    
    // 优化翻译缓存
    if (this.translationService.getCacheSize() > maxSize) {
      this.translationService.cleanExpiredCache();
    }
    
    // 优化词典缓存
    this.dictionaryManager.clearWordCache();
    
    return { success: true, data: { optimized: true } };
  }

  private async handleCleanupExpiredCacheRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.cleanupExpiredCaches();
    return { success: true };
  }

  private async handlePerformanceEventRequest(request: MessageRequest): Promise<MessageResponse> {
    const { type, data } = request.data;
    console.log(`性能事件: ${type}`, data);
    
    // 根据事件类型执行相应操作
    switch (type) {
      case 'memory-warning':
        this.handleMemoryWarning(data);
        break;
      case 'cache-overflow':
        await this.handleOptimizeCacheRequest(request);
        break;
    }
    
    return { success: true };
  }

  // UI操作处理方法
  private async handleOpenSettingsRequest(request: MessageRequest): Promise<MessageResponse> {
    chrome.runtime.openOptionsPage();
    return { success: true };
  }

  private async handleOpenVocabularyRequest(request: MessageRequest): Promise<MessageResponse> {
    chrome.tabs.create({
      url: chrome.runtime.getURL('vocabulary.html')
    });
    return { success: true };
  }

  private async handleOpenReviewRequest(request: MessageRequest): Promise<MessageResponse> {
    chrome.tabs.create({
      url: chrome.runtime.getURL('review.html')
    });
    return { success: true };
  }

  // 错误处理和离线支持相关处理方法
  private async handleReportErrorRequest(request: MessageRequest): Promise<MessageResponse> {
    try {
      const error = request.data;
      console.error('收到错误报告:', error);
      
      // 这里可以将错误发送到错误收集服务
      // 例如发送到分析服务或日志系统
      
      return { success: true };
    } catch (error) {
      return { success: false, error: '错误报告处理失败' };
    }
  }

  private async handleSyncOfflineOperationRequest(request: MessageRequest): Promise<MessageResponse> {
    try {
      const operation = request.data;
      
      // 根据操作类型执行相应的同步
      switch (operation.action) {
        case 'vocabulary_add':
          await this.learningMode.addVocabulary(operation.data);
          break;
        case 'vocabulary_remove':
          await this.learningMode.removeVocabulary(operation.data.word);
          break;
        case 'vocabulary_update':
          await this.learningMode.addVocabulary(operation.data);
          break;
        default:
          console.warn(`未知的离线操作类型: ${operation.action}`);
      }
      
      return { success: true };
    } catch (error) {
      errorHandler.logError(
        ErrorType.STORAGE_ERROR,
        '离线操作同步失败',
        error,
        ErrorSeverity.MEDIUM
      );
      return { success: false, error: '同步失败' };
    }
  }

  private async handleNetworkStatusChangedRequest(request: MessageRequest): Promise<MessageResponse> {
    const { isOnline } = request.data;
    console.log(`网络状态变化: ${isOnline ? '在线' : '离线'}`);
    
    if (isOnline) {
      // 网络恢复时同步离线数据
      await offlineManager.syncWhenOnline();
    }
    
    return { success: true };
  }
}

// 初始化后台服务
new BackgroundService();
