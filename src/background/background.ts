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
import { ReviewService } from '../services/ReviewService';
import { performanceManager } from '../services/PerformanceManager';
import { errorHandler, ErrorType, ErrorSeverity } from '../services/ErrorHandler';
import { offlineManager } from '../services/OfflineManager';
import { normalizeAiTranslationPreferences } from '../services/AiTranslationPreferences';
import { isAiWritingAction, normalizeAiWritingTask } from '../services/AiWritingAssistant';
import { getTranslationProvider, TRANSLATION_LANGUAGES } from '../services/TranslationProviderRegistry';
import { openTranslationSidePanel } from '../services/SidePanelManager';
import {
  MediaTranscriptionMetadata,
  MediaTranscriptionUpload,
  mediaTranscriptionService
} from '../services/MediaTranscriptionService';
import {
  isTrustedTabAudioCaptureSender,
  tabAudioCaptureService
} from '../services/TabAudioCaptureService';

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
  private reviewService: ReviewService;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void>;
  private initializationError: Error | null = null;

  constructor() {
    this.translationService = new TranslationService();
    this.dictionaryManager = new DictionaryManager();
    this.learningMode = new LearningMode(this.dictionaryManager);
    this.storageManager = new StorageManager();
    this.reviewService = new ReviewService(
      this.learningMode,
      this.dictionaryManager,
      this.storageManager
    );

    this.setupErrorHandling();
    this.registerMessageHandlers();
    this.initializeExtensionHandlers();
    this.setupPerformanceOptimization();
    this.setupOfflineSupport();

    this.initializationPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // 启动性能监控
      performanceManager.startMonitoring();

      // 初始化服务
      await this.loadUserData();
      await this.preloadDictionaries();

      this.isInitialized = true;
      console.log('后台服务初始化完成');
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error('后台服务初始化失败');
      errorHandler.logError(
        ErrorType.INITIALIZATION_ERROR,
        '后台服务初始化失败',
        error,
        ErrorSeverity.CRITICAL
      );
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    await this.initializationPromise;

    if (this.initializationError) {
      throw this.initializationError;
    }

    if (!this.isInitialized) {
      throw new Error('后台服务初始化失败');
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
    // 后台只保留一条主消息路由，避免多个监听器抢同一条响应。
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

    chrome.commands?.onCommand?.addListener(command => {
      if (command === 'openTranslationSidePanel') {
        void openTranslationSidePanel()
          .then(opened => {
            if (!opened) {
              chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
            }
          })
          .catch(error => {
            console.error('Could not open translation side panel:', error);
          });
      }
    });
  }

  private async handleMessage(
    request: MessageRequest, 
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      await this.ensureInitialized();

      let response: MessageResponse;
      
      switch (request.action) {
        case 'translate':
          response = await this.handleTranslateRequest(request);
          break;

        case 'processAiText':
          response = await this.handleProcessAiTextRequest(request);
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

        case 'getTranslationProviderConfigs':
          response = await this.handleGetTranslationProviderConfigsRequest();
          break;

        case 'getTabAudioCaptureStreamId':
          response = await this.handleGetTabAudioCaptureStreamIdRequest(request, sender);
          break;

        case 'updateTranslationProviderConfig':
          response = await this.handleUpdateTranslationProviderConfigRequest(request);
          break;

        case 'removeTranslationProviderConfig':
          response = await this.handleRemoveTranslationProviderConfigRequest(request);
          break;
        
        case 'getLearningStats':
          response = await this.handleGetLearningStatsRequest(request);
          break;
        
        case 'getDictionaryProgress':
          response = await this.handleGetDictionaryProgressRequest(request);
          break;
        
        case 'getDueReviewCount':
          response = await this.handleGetDueReviewCountRequest(request);
          break;
        
        case 'getReviewItems':
          response = await this.handleGetReviewItemsRequest(request);
          break;
        
        case 'saveReviewResults':
          response = await this.handleSaveReviewResultsRequest(request);
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

        case 'openSettings':
          response = await this.handleOpenSettingsRequest(request);
          break;

        case 'openVocabulary':
          response = await this.handleOpenVocabularyRequest(request);
          break;

        case 'openReview':
          response = await this.handleOpenReviewRequest(request);
          break;

        case 'openDocumentTranslator':
          response = await this.handleOpenDocumentTranslatorRequest(request);
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
    if (port.name === 'lexibridge-media-transcription') {
      this.handleMediaTranscriptionConnection(port);
      return;
    }

    console.log('建立连接:', port.name);
    
    port.onMessage.addListener((message) => {
      // 处理长连接消息
      console.log('收到连接消息:', message);
    });

    port.onDisconnect.addListener(() => {
      console.log('连接断开:', port.name);
    });
  }

  private handleMediaTranscriptionConnection(port: chrome.runtime.Port): void {
    let upload: MediaTranscriptionUpload | null = null;
    let abortController: AbortController | null = null;
    let processing = false;
    let canceled = false;
    let disconnected = false;

    const postMessage = (message: Record<string, unknown>): void => {
      if (disconnected) return;
      try {
        port.postMessage(message);
      } catch {
        disconnected = true;
      }
    };
    const clearUpload = (): void => {
      upload?.clear();
      upload = null;
    };

    port.onMessage.addListener(message => {
      void (async () => {
        try {
          switch (message?.type) {
            case 'initialize': {
              if (processing) throw new Error('A media transcription is already running.');
              clearUpload();
              canceled = false;
              upload = new MediaTranscriptionUpload(message.metadata as MediaTranscriptionMetadata);
              postMessage({ type: 'ready', totalBytes: upload.metadata.totalBytes });
              break;
            }
            case 'chunk': {
              if (!upload || processing) throw new Error('Initialize the media upload first.');
              const progress = upload.appendBase64Chunk(message.index, message.data);
              postMessage({
                type: 'chunk-accepted',
                index: message.index,
                ...progress
              });
              break;
            }
            case 'complete': {
              if (!upload || processing) throw new Error('The media upload is not ready to transcribe.');
              const activeUpload = upload;
              processing = true;
              abortController = new AbortController();
              postMessage({ type: 'transcribing' });
              try {
                const providerConfig = await this.storageManager.getTranslationProviderConfig(
                  activeUpload.metadata.providerId
                );
                const result = await mediaTranscriptionService.transcribe(
                  activeUpload,
                  providerConfig,
                  abortController.signal
                );
                if (!canceled) postMessage({ type: 'transcription-complete', result });
              } finally {
                activeUpload.clear();
                if (upload === activeUpload) upload = null;
                abortController = null;
                processing = false;
              }
              break;
            }
            case 'cancel': {
              canceled = true;
              abortController?.abort();
              clearUpload();
              postMessage({ type: 'canceled' });
              break;
            }
            default:
              throw new Error('Unknown media transcription message.');
          }
        } catch (error) {
          if (!canceled) {
            postMessage({
              type: 'error',
              error: error instanceof Error ? error.message : 'Media transcription failed.'
            });
          }
          if (!processing) clearUpload();
        }
      })();
    });

    port.onDisconnect.addListener(() => {
      disconnected = true;
      canceled = true;
      abortController?.abort();
      clearUpload();
    });
  }

  private async handleGetTabAudioCaptureStreamIdRequest(
    request: MessageRequest,
    sender: chrome.runtime.MessageSender
  ): Promise<MessageResponse> {
    const subtitlePageUrl = chrome.runtime.getURL('subtitles.html');
    if (!isTrustedTabAudioCaptureSender(sender, chrome.runtime.id, subtitlePageUrl)) {
      throw new Error('Tab audio capture can start only from the subtitle generator.');
    }

    const targetTabId = Number(request.data?.targetTabId);
    const consumerTabId = sender.tab?.id;
    if (!consumerTabId) {
      throw new Error('The subtitle generator tab is unavailable.');
    }
    const streamId = await tabAudioCaptureService.createStreamId({
      targetTabId,
      consumerTabId
    });
    return { success: true, data: { streamId } };
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
          pageTranslationDisplayMode: 'bilingual',
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
      const provider = request.data.provider as string | undefined;
      const providerConfig = provider
        ? await this.storageManager.getTranslationProviderConfig(provider)
        : undefined;
      const settings = getTranslationProvider(provider)?.supportsAiPreferences
        ? await this.storageManager.getSettings()
        : null;
      const aiPreferences = settings
        ? normalizeAiTranslationPreferences({
          contextEnabled: settings.aiContextEnabled,
          domain: settings.aiTranslationDomain,
          glossary: settings.translationGlossary,
          customPrompt: settings.aiCustomPrompt
        })
        : undefined;
      const { aiWritingTask: _ignoredAiWritingTask, ...translationData } = request.data;
      const translationRequest = {
        ...translationData,
        context: aiPreferences?.contextEnabled ? request.data.context : undefined,
        aiPreferences,
        providerConfig
      };
      const translate = () => this.translationService.translate(translationRequest);
      const result = provider && !['google', 'mymemory'].includes(provider)
        ? await translate()
        : await errorHandler.handleWithRetry(
        translate,
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

  private async handleProcessAiTextRequest(request: MessageRequest): Promise<MessageResponse> {
    const startTime = Date.now();
    try {
      const text = typeof request.data?.text === 'string' ? request.data.text.trim() : '';
      if (!text) throw new Error('Enter text for the AI writing task.');
      if (text.length > 20000) throw new Error('AI writing input must be 20,000 characters or fewer.');

      const providerId = typeof request.data?.provider === 'string' ? request.data.provider : '';
      const provider = getTranslationProvider(providerId);
      if (!provider || provider.status !== 'available' || !provider.supportsAiPreferences) {
        throw new Error('Choose a configured AI provider for writing tasks.');
      }

      const action = request.data?.task?.action;
      if (!isAiWritingAction(action)) throw new Error('Unknown AI writing action.');

      const targetLang = typeof request.data?.targetLang === 'string'
        ? request.data.targetLang
        : 'same';
      const isKnownLanguage = targetLang === 'same'
        || TRANSLATION_LANGUAGES.some(language => language.code === targetLang);
      if (!isKnownLanguage) throw new Error('Choose a supported output language.');

      const providerConfig = await this.storageManager.getTranslationProviderConfig(providerId);
      const aiWritingTask = normalizeAiWritingTask(request.data.task);
      const result = await this.translationService.translate({
        text,
        sourceLang: 'auto',
        targetLang,
        provider: providerId,
        providerConfig,
        aiWritingTask
      });

      performanceManager.recordRequest(Date.now() - startTime, true);
      return {
        success: true,
        data: {
          ...result,
          outputText: result.translatedText,
          action: aiWritingTask.action
        }
      };
    } catch (error) {
      performanceManager.recordRequest(Date.now() - startTime, false);
      errorHandler.logError(
        ErrorType.TRANSLATION_API_ERROR,
        'AI writing request failed',
        error,
        ErrorSeverity.MEDIUM,
        { component: 'background', action: 'processAiText' }
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
    this.translationService.clearCache();
    await this.broadcastSettingsUpdate(request.data);
    return { success: true };
  }

  private async broadcastSettingsUpdate(settings: Record<string, unknown>): Promise<void> {
    if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) return;

    try {
      const tabs = await new Promise<chrome.tabs.Tab[]>(resolve => {
        chrome.tabs.query({}, resolve);
      });

      await Promise.all(tabs.map(tab => new Promise<void>(resolve => {
        if (tab.id === undefined) {
          resolve();
          return;
        }

        try {
          chrome.tabs.sendMessage(tab.id, { action: 'updateSettings', data: settings }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        } catch {
          resolve();
        }
      })));
    } catch {
      // Settings are already saved; tabs without a content script can refresh later.
    }
  }

  private async handleGetTranslationProviderConfigsRequest(): Promise<MessageResponse> {
    const summaries = await this.storageManager.getTranslationProviderConfigSummaries();
    return { success: true, data: summaries };
  }

  private async handleUpdateTranslationProviderConfigRequest(request: MessageRequest): Promise<MessageResponse> {
    const providerId = String(request.data?.providerId || '');
    const summary = await this.storageManager.saveTranslationProviderConfig(
      providerId,
      request.data?.config || {}
    );
    this.translationService.clearCache();
    return { success: true, data: summary };
  }

  private async handleRemoveTranslationProviderConfigRequest(request: MessageRequest): Promise<MessageResponse> {
    const providerId = String(request.data?.providerId || '');
    await this.storageManager.removeTranslationProviderConfig(providerId);
    this.translationService.clearCache();
    return { success: true };
  }

  private async handleGetLearningStatsRequest(request: MessageRequest): Promise<MessageResponse> {
    const stats = await this.learningMode.getLearningStats();
    return { success: true, data: stats };
  }

  private async handleGetDictionaryProgressRequest(request: MessageRequest): Promise<MessageResponse> {
    const summaries = await this.dictionaryManager.getDictionaryProgressSummaries();

    for (const dictionaryType of Object.values(DictionaryType)) {
      const learnedWords = (await this.learningMode.getVocabularyList(dictionaryType))
        .filter(item => item.masteryLevel >= 0.8)
        .length;
      const summary = summaries[dictionaryType];

      summary.learnedWords = learnedWords;
      summary.masteryRate = summary.totalWords > 0 ? learnedWords / summary.totalWords : 0;
    }

    if (request.data?.dictionaryType) {
      return { success: true, data: summaries[request.data.dictionaryType as DictionaryType] || null };
    }

    return { success: true, data: summaries };
  }

  private async handleGetDueReviewCountRequest(request: MessageRequest): Promise<MessageResponse> {
    const count = await this.reviewService.getDueReviewCount();
    return { success: true, data: count };
  }

  private async handleGetReviewItemsRequest(request: MessageRequest): Promise<MessageResponse> {
    const items = await this.reviewService.getReviewItems({
      type: request.data?.type || 'due',
      count: request.data?.count,
      word: request.data?.word
    });

    return { success: true, data: items };
  }

  private async handleSaveReviewResultsRequest(request: MessageRequest): Promise<MessageResponse> {
    await this.reviewService.saveReviewResults({
      results: request.data?.results || [],
      sessionDuration: request.data?.sessionDuration
    });

    return { success: true };
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
      pageTranslationDisplayMode: 'bilingual' as const,
      translationStyle: 'subtle' as const,
      pageTranslationScope: 'main-content' as const,
      documentOcrLanguage: 'eng' as const,
      aiContextEnabled: false,
      aiTranslationDomain: 'general' as const,
      translationGlossary: [],
      aiCustomPrompt: '',
      autoTranslate: false,
      showFloatingIcon: true,
      pageTranslationExcludeSelectors: [],
      siteTranslationRules: [],
      floatingIconPosition: { x: 9999, y: 9999 },
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
    await this.broadcastSettingsUpdate(defaultSettings);
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
      pageTranslationDisplayMode: 'bilingual' as const,
      translationStyle: 'subtle' as const,
      pageTranslationScope: 'main-content' as const,
      documentOcrLanguage: 'eng' as const,
      aiContextEnabled: false,
      aiTranslationDomain: 'general' as const,
      translationGlossary: [],
      aiCustomPrompt: '',
      autoTranslate: false,
      showFloatingIcon: true,
      pageTranslationExcludeSelectors: [],
      siteTranslationRules: [],
      floatingIconPosition: { x: 9999, y: 9999 },
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
    await this.broadcastSettingsUpdate(defaultSettings);
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

  private async handleOpenDocumentTranslatorRequest(request: MessageRequest): Promise<MessageResponse> {
    const sourceUrl = request.data?.sourceUrl;
    const query = sourceUrl ? `?sourceUrl=${encodeURIComponent(sourceUrl)}` : '';

    chrome.tabs.create({
      url: chrome.runtime.getURL(`document.html${query}`)
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
