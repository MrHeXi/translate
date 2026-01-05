// Chrome扩展后台脚本
// 负责插件的核心逻辑和服务协调

import { TranslationService } from '../services/TranslationService';
import { DictionaryManager } from '../services/DictionaryManager';
import { LearningMode } from '../services/LearningMode';
import { StorageManager } from '../services/StorageManager';

class BackgroundService {
  private translationService: TranslationService;
  private dictionaryManager: DictionaryManager;
  private learningMode: LearningMode;
  private storageManager: StorageManager;

  constructor() {
    this.translationService = new TranslationService();
    this.dictionaryManager = new DictionaryManager();
    this.learningMode = new LearningMode();
    this.storageManager = new StorageManager();
    
    this.initializeMessageHandlers();
  }

  private initializeMessageHandlers() {
    // 监听来自content script和popup的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // 保持消息通道开放以支持异步响应
    });
  }

  private async handleMessage(request: any, _sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    try {
      switch (request.action) {
        case 'translate':
          const result = await this.translationService.translate(request.data);
          sendResponse({ success: true, data: result });
          break;
        case 'addVocabulary':
          await this.learningMode.addVocabulary(request.data);
          sendResponse({ success: true });
          break;
        case 'loadDictionary':
          const dictionary = await this.dictionaryManager.loadBuiltInDictionary(request.data.type);
          sendResponse({ success: true, data: dictionary });
          break;
        case 'getSettings':
          const settings = await this.storageManager.getSettings();
          sendResponse({ success: true, data: settings });
          break;
        case 'updateSettings':
          await this.storageManager.saveSettings(request.data);
          sendResponse({ success: true });
          break;
        case 'getLearningStats':
          const stats = await this.learningMode.getLearningStats();
          sendResponse({ success: true, data: stats });
          break;
        default:
          sendResponse({ success: false, error: '未知的操作类型' });
      }
    } catch (error) {
      console.error('后台脚本处理消息时出错:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : '未知错误' });
    }
  }
}

// 初始化后台服务
new BackgroundService();