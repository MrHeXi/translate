// Chrome扩展后台脚本
// 负责插件的核心逻辑和服务协调

import { TranslationService } from '../services/TranslationService';
import { DictionaryManager, DictionaryType } from '../services/DictionaryManager';
import { LearningMode } from '../services/LearningMode';
import { StorageManager } from '../services/StorageManager';

// 消息类型定义
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
      // 初始化服务
      await this.loadUserData();
      await this.preloadDictionaries();
      
      // 设置消息处理器
      this.initializeMessageHandlers();
      
      // 设置扩展安装和更新处理
      this.initializeExtensionHandlers();
      
      this.isInitialized = true;
      console.log('后台服务初始化完成');
    } catch (error) {
      console.error('后台服务初始化失败:', error);
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

  private initializeMessageHandlers(): void {
    // 监听来自content script和popup的消息
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
      switch (request.action) {
        case 'translate':
          await this.handleTranslateRequest(request, sendResponse);
          break;
        
        case 'detectLanguage':
          await this.handleDetectLanguageRequest(request, sendResponse);
          break;
        
        case 'addVocabulary':
          await this.handleAddVocabularyRequest(request, sendResponse);
          break;
        
        case 'removeVocabulary':
          await this.handleRemoveVocabularyRequest(request, sendResponse);
          break;
        
        case 'getVocabularyList':
          await this.handleGetVocabularyListRequest(request, sendResponse);
          break;
        
        case 'markAsLearned':
          await this.handleMarkAsLearnedRequest(request, sendResponse);
          break;
        
        case 'loadDictionary':
          await this.handleLoadDictionaryRequest(request, sendResponse);
          break;
        
        case 'lookupWord':
          await this.handleLookupWordRequest(request, sendResponse);
          break;
        
        case 'getSettings':
          await this.handleGetSettingsRequest(request, sendResponse);
          break;
        
        case 'updateSettings':
          await this.handleUpdateSettingsRequest(request, sendResponse);
          break;
        
        case 'getLearningStats':
          await this.handleGetLearningStatsRequest(request, sendResponse);
          break;
        
        case 'getDictionaryProgress':
          await this.handleGetDictionaryProgressRequest(request, sendResponse);
          break;
        
        case 'startReviewSession':
          await this.handleStartReviewSessionRequest(request, sendResponse);
          break;
        
        case 'endReviewSession':
          await this.handleEndReviewSessionRequest(request, sendResponse);
          break;
        
        case 'recordReviewResult':
          await this.handleRecordReviewResultRequest(request, sendResponse);
          break;
        
        case 'exportData':
          await this.handleExportDataRequest(request, sendResponse);
          break;
        
        case 'importData':
          await this.handleImportDataRequest(request, sendResponse);
          break;
        
        case 'syncData':
          await this.handleSyncDataRequest(request, sendResponse);
          break;
        
        default:
          sendResponse({ success: false, error: `未知的操作类型: ${request.action}` });
      }
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

  // 具体的消息处理方法
  private async handleTranslateRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const result = await this.translationService.translate(_request.data);
    sendResponse({ success: true, data: result });
  }

  private async handleDetectLanguageRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const result = await this.translationService.detectLanguage(_request.data.text);
    sendResponse({ success: true, data: result });
  }

  private async handleAddVocabularyRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    await this.learningMode.addVocabulary(_request.data);
    sendResponse({ success: true });
  }

  private async handleRemoveVocabularyRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    await this.learningMode.removeVocabulary(_request.data.word);
    sendResponse({ success: true });
  }

  private async handleGetVocabularyListRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const vocabularyList = await this.learningMode.getVocabularyList(_request.data?.dictionaryType);
    sendResponse({ success: true, data: vocabularyList });
  }

  private async handleMarkAsLearnedRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    await this.learningMode.markAsLearned(_request.data.word);
    sendResponse({ success: true });
  }

  private async handleLoadDictionaryRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const dictionary = await this.dictionaryManager.loadBuiltInDictionary(_request.data.type);
    sendResponse({ success: true, data: dictionary });
  }

  private async handleLookupWordRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const wordDefinition = await this.dictionaryManager.lookupWord(_request.data.word);
    sendResponse({ success: true, data: wordDefinition });
  }

  private async handleGetSettingsRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const settings = await this.storageManager.getSettings();
    sendResponse({ success: true, data: settings });
  }

  private async handleUpdateSettingsRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    await this.storageManager.saveSettings(_request.data);
    sendResponse({ success: true });
  }

  private async handleGetLearningStatsRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const stats = await this.learningMode.getLearningStats();
    sendResponse({ success: true, data: stats });
  }

  private async handleGetDictionaryProgressRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const progress = _request.data?.dictionaryType 
      ? await this.learningMode.getDictionaryProgress(_request.data.dictionaryType)
      : await this.learningMode.getAllDictionaryProgress();
    sendResponse({ success: true, data: progress });
  }

  private async handleStartReviewSessionRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const sessionId = await this.learningMode.startReviewSession();
    sendResponse({ success: true, data: { sessionId } });
  }

  private async handleEndReviewSessionRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const session = await this.learningMode.endReviewSession();
    sendResponse({ success: true, data: session });
  }

  private async handleRecordReviewResultRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    await this.learningMode.recordReviewResult(
      _request.data.word, 
      _request.data.isCorrect, 
      _request.data.responseTime
    );
    sendResponse({ success: true });
  }

  private async handleExportDataRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    const exportedData = await this.storageManager.exportData();
    sendResponse({ success: true, data: exportedData });
  }

  private async handleImportDataRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    await this.storageManager.importData(_request.data.jsonData);
    // 重新加载数据
    await this.learningMode.loadVocabulary();
    sendResponse({ success: true });
  }

  private async handleSyncDataRequest(_request: MessageRequest, sendResponse: (response: MessageResponse) => void): Promise<void> {
    await this.storageManager.syncData();
    sendResponse({ success: true });
  }
}

// 初始化后台服务
new BackgroundService();