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
    this.learningMode = new LearningMode(this.dictionaryManager);
    this.storageManager = new StorageManager();
    
    this.initializeMessageHandlers();
  }

  private initializeMessageHandlers() {
    // 监听来自content script和popup的消息
    chrome.runtime.onMessage.addListener((request, sender, _response) => {
      this.handleMessage(request, sender, _response);
      return true; // 保持消息通道开放以支持异步响应
    });
  }

  private async handleMessage(request: any, _sender: chrome.runtime.MessageSender, _response: (_res: any) => void): Promise<void> {
    try {
      switch (request.action) {
        case 'translate': {
          const result = await this.translationService.translate(request.data);
          _response({ success: true, data: result });
          break;
        }
        case 'addVocabulary': {
          await this.learningMode.addVocabulary(request.data);
          _response({ success: true });
          break;
        }
        case 'loadDictionary': {
          const dictionary = await this.dictionaryManager.loadBuiltInDictionary(request.data.type);
          _response({ success: true, data: dictionary });
          break;
        }
        case 'getSettings': {
          const settings = await this.storageManager.getSettings();
          _response({ success: true, data: settings });
          break;
        }
        case 'updateSettings': {
          await this.storageManager.saveSettings(request.data);
          _response({ success: true });
          break;
        }
        case 'getLearningStats': {
          const stats = await this.learningMode.getLearningStats();
          _response({ success: true, data: stats });
          break;
        }
        default:
          _response({ success: false, error: '未知的操作类型' });
      }
    } catch (error) {
      _response({ success: false, error: error instanceof Error ? error.message : '未知错误' });
    }
  }
}

// 初始化后台服务
new BackgroundService();