// Chrome扩展内容脚本
// 在网页中注入翻译功能

import { FloatingIcon } from './components/FloatingIcon';
import { PageTranslationDisplayMode, TranslationOverlay } from './components/TranslationOverlay';
import { SelectionHandler } from './components/SelectionHandler';
import { HoverTranslator } from './components/HoverTranslator';
import { InputBoxTranslator } from './components/InputBoxTranslator';
import { messageManager } from '../services/MessageManager';
import { performanceManager } from '../services/PerformanceManager';
import { errorHandler, ErrorType, ErrorSeverity } from '../services/ErrorHandler';
import { offlineManager } from '../services/OfflineManager';
import { loadingManager } from '../services/LoadingManager';

// 翻译结果接口
interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  confidence: number;
}

// 用户设置接口
interface UserSettings {
  defaultTargetLanguage: string;
  translationProvider: string;
  pageTranslationDisplayMode: PageTranslationDisplayMode;
  floatingIconPosition: { x: number; y: number };
  learningModeEnabled: boolean;
  activeDictionaries: string[];
  highlightColors: { [key: string]: string };
  autoTranslate: boolean;
  showFloatingIcon: boolean;
}

class ContentScript {
  private floatingIcon: FloatingIcon;
  private translationOverlay: TranslationOverlay;
  private selectionHandler: SelectionHandler;
  private hoverTranslator: HoverTranslator;
  private inputBoxTranslator: InputBoxTranslator;
  private isTranslationMode: boolean = false;
  private isLearningMode: boolean = false;
  private userSettings: UserSettings | null = null;
  private translationCache: Map<string, string> = new Map();
  private pageObserver: MutationObserver | null = null;
  private isInitialized: boolean = false;
  private translationRunId: number = 0;
  private pageTranslationLoadingId: string | null = null;

  constructor() {
    this.floatingIcon = new FloatingIcon();
    this.translationOverlay = new TranslationOverlay();
    this.selectionHandler = new SelectionHandler();
    this.hoverTranslator = new HoverTranslator();
    this.inputBoxTranslator = new InputBoxTranslator();
    
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // 等待页面加载完成
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setupComponents());
      } else {
        await this.setupComponents();
      }
    } catch (error) {
      console.error('内容脚本初始化失败:', error);
    }
  }

  private async setupComponents(): Promise<void> {
    try {
      // 启动性能监控（内容脚本环境）
      performanceManager.startMonitoring();
      
      // 注册消息处理器
      this.registerMessageHandlers();
      
      // 加载用户设置
      await this.loadUserSettings();
      
      // 创建浮动图标（如果启用）
      if (this.userSettings?.showFloatingIcon) {
        this.floatingIcon.create(this.userSettings.floatingIconPosition);
        this.floatingIcon.onToggle(() => this.toggleTranslation());
        this.floatingIcon.onLearningModeToggle(() => this.toggleLearningMode());
      }

      // 设置选词翻译处理器
      this.selectionHandler.initialize();
      this.selectionHandler.onTextSelected((text, position) => {
        this.handleTextSelection(text, position);
      });

      this.hoverTranslator.initialize((text) => this.translateInteractiveText(text));
      this.inputBoxTranslator.initialize((text) => this.translateInteractiveText(text));

      // 如果启用了学习模式，初始化词汇高亮
      if (this.userSettings?.learningModeEnabled) {
        this.isLearningMode = true;
        await this.initializeLearningMode();
      }

      // 监听动态内容变化
      this.observePageChanges();

      // 监听来自后台脚本的消息
      this.setupMessageListener();

      this.isInitialized = true;
      console.log('内容脚本初始化完成');
    } catch (error) {
      console.error('组件设置失败:', error);
    }
  }

  private async loadUserSettings(): Promise<void> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
        if (response?.success) {
          this.userSettings = response.data;
          this.translationOverlay.setDisplayMode(this.userSettings?.pageTranslationDisplayMode || 'bilingual');
          resolve();
        } else {
          console.warn('加载用户设置失败，使用默认设置');
          this.userSettings = this.getDefaultSettings();
          this.translationOverlay.setDisplayMode(this.userSettings.pageTranslationDisplayMode);
          resolve();
        }
      });
    });
  }

  private registerMessageHandlers(): void {
    // 注册内容脚本的消息处理器
    messageManager.registerHandlers({
      'ping': async () => ({ success: true, data: { status: 'content-script-ready' } }),
      'toggleTranslation': async () => {
        await this.toggleTranslation();
        return { success: true, data: { isActive: this.isTranslationMode } };
      },
      'toggleLearningMode': async () => {
        await this.toggleLearningMode();
        return { success: true, data: { isActive: this.isLearningMode } };
      },
      'updateSettings': async (request) => {
        this.userSettings = { ...this.userSettings, ...request.data };
        await this.applySettingsChanges();
        return { success: true };
      },
      'highlightWord': async (request) => {
        this.highlightWordInPage(request.data.word, request.data.color);
        return { success: true };
      },
      'getPageInfo': async () => {
        const pageInfo = this.getPageInfo();
        return { success: true, data: pageInfo };
      },
      'getTranslationStatus': async () => {
        return { 
          success: true, 
          data: { 
            isActive: this.isTranslationMode,
            isLearningMode: this.isLearningMode 
          } 
        };
      }
    });
  }

  private getDefaultSettings(): UserSettings {
    return {
      defaultTargetLanguage: 'zh-CN',
      translationProvider: 'google',
      pageTranslationDisplayMode: 'bilingual',
      floatingIconPosition: { x: 9999, y: 9999 },
      learningModeEnabled: true,
      activeDictionaries: ['gre', 'toefl'],
      highlightColors: {
        gre: '#ff6b6b',
        toefl: '#4ecdc4',
        ielts: '#45b7d1'
      },
      autoTranslate: false,
      showFloatingIcon: true
    };
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      this.handleRuntimeMessage(request, sendResponse);
      return true; // 保持消息通道开放
    });
  }

  private async handleRuntimeMessage(request: any, sendResponse: (response: any) => void): Promise<void> {
    try {
      switch (request.action) {
        case 'toggleTranslation':
          await this.toggleTranslation();
          sendResponse({ success: true, isActive: this.isTranslationMode });
          break;
        
        case 'toggleLearningMode':
          await this.toggleLearningMode();
          sendResponse({ success: true, isActive: this.isLearningMode });
          break;
        
        case 'updateSettings':
          this.userSettings = { ...this.userSettings, ...request.data };
          await this.applySettingsChanges();
          sendResponse({ success: true });
          break;
        
        case 'highlightWord':
          this.highlightWordInPage(request.data.word, request.data.color);
          sendResponse({ success: true });
          break;
        
        case 'getPageInfo': {
          const pageInfo = this.getPageInfo();
          sendResponse({ success: true, data: pageInfo });
          break;
        }

        case 'getTranslationStatus':
          sendResponse({
            success: true,
            isActive: this.isTranslationMode,
            isLearningMode: this.isLearningMode
          });
          break;
        
        default:
          sendResponse({ success: false, error: '未知的操作类型' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error instanceof Error ? error.message : '未知错误' });
    }
  }

  private async toggleTranslation(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('内容脚本尚未初始化完成');
      return;
    }

    if (this.isTranslationMode) {
      this.disableTranslationMode();
      return;
    }

    this.enableTranslationMode();
  }

  private enableTranslationMode(): void {
    this.isTranslationMode = true;
    this.floatingIcon.updateState(true);

    const runId = ++this.translationRunId;
    void this.translatePage(runId);
  }

  private disableTranslationMode(): void {
    this.isTranslationMode = false;
    this.translationRunId++;
    this.hidePageTranslationLoading();
    this.restoreOriginalPage();
    this.floatingIcon.updateState(false);
  }

  private async toggleLearningMode(): Promise<void> {
    try {
      if (this.isLearningMode) {
        this.disableLearningMode();
      } else {
        await this.initializeLearningMode();
      }
      this.isLearningMode = !this.isLearningMode;
      this.floatingIcon.updateLearningModeState(this.isLearningMode);
    } catch (error) {
      console.error('切换学习模式失败:', error);
    }
  }

  private async initializeLearningMode(): Promise<void> {
    if (!this.userSettings?.activeDictionaries) return;

    try {
      // 加载活跃词库
      for (const dictType of this.userSettings.activeDictionaries) {
        await this.loadAndHighlightDictionary(dictType);
      }
    } catch (error) {
      console.error('初始化学习模式失败:', error);
    }
  }

  private async loadAndHighlightDictionary(dictionaryType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'loadDictionary',
        data: { type: dictionaryType }
      }, (response) => {
        if (response?.success) {
          const dictionary = response.data;
          const color = this.userSettings?.highlightColors[dictionaryType] || '#ffeb3b';
          
          // 高亮页面中的词库词汇
          dictionary.words.forEach((wordDef: any) => {
            this.highlightWordInPage(wordDef.word, color);
          });
          
          resolve();
        } else {
          reject(new Error(response?.error || '加载词库失败'));
        }
      });
    });
  }

  private disableLearningMode(): void {
    // 移除所有词汇高亮
    const highlightedElements = document.querySelectorAll('.vocabulary-highlight');
    highlightedElements.forEach(element => {
      const parent = element.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(element.textContent || ''), element);
        parent.normalize(); // 合并相邻的文本节点
      }
    });
  }

  private highlightWordInPage(word: string, color: string): void {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (parent && ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent && parent.classList.contains('vocabulary-highlight')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node as Text);
      node = walker.nextNode();
    }

    textNodes.forEach(textNode => {
      if (textNode.textContent && regex.test(textNode.textContent)) {
        const parent = textNode.parentElement;
        if (parent) {
          const highlightedHTML = textNode.textContent.replace(regex, 
            `<span class="vocabulary-highlight" style="background-color: ${color}; cursor: pointer;" data-word="${word}">$&</span>`
          );
          
          const wrapper = document.createElement('span');
          wrapper.innerHTML = highlightedHTML;
          parent.replaceChild(wrapper, textNode);
          
          // 为高亮词汇添加点击事件
          wrapper.querySelectorAll('.vocabulary-highlight').forEach(highlight => {
            highlight.addEventListener('click', (e) => {
              e.preventDefault();
              this.handleVocabularyClick(word);
            });
          });
        }
      }
    });
  }

  private async handleVocabularyClick(word: string): Promise<void> {
    try {
      // 查询词汇详细信息
      const wordInfo = await this.lookupWord(word);
      
      // 显示词汇详情弹窗
      this.translationOverlay.showWordDetails(wordInfo);
      
      // 记录学习行为
      chrome.runtime.sendMessage({
        action: 'recordVocabularyInteraction',
        data: { word, action: 'click' }
      });
    } catch (error) {
      console.error('处理词汇点击失败:', error);
    }
  }

  private async lookupWord(word: string): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'lookupWord',
        data: { word }
      }, (response) => {
        if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || '查词失败'));
        }
      });
    });
  }

  private async handleTextSelection(text: string, position: { x: number; y: number }): Promise<void> {
    if (!text.trim()) return;

    // 显示加载状态
    const loadingId: string = loadingManager.showSimpleLoading('翻译中...', 10000);

    try {
      // 检查缓存
      let translation: string | undefined = this.translationCache.get(text);
      
      if (!translation) {
        // 检查网络状态
        if (!offlineManager.isNetworkOnline()) {
          // 尝试离线翻译
          const offlineResult = await offlineManager.handleOfflineTranslation(
            text, 
            this.userSettings?.defaultTargetLanguage || 'zh-CN'
          );
          
          if (offlineResult.success) {
            translation = offlineResult.data.translatedText;
          } else {
            throw new Error('离线模式下无法翻译新内容');
          }
        } else {
          // 在线翻译
          const result = await this.requestTranslation(text);
          translation = result.translatedText;
          this.translationCache.set(text, translation);
        }
      }

      // 确保 translation 不为空
      if (!translation) {
        throw new Error('翻译结果为空');
      }

      // 隐藏加载状态
      loadingManager.hideLoading(loadingId);

      // 显示翻译工具提示
      this.translationOverlay.showTooltip(text, translation, position);
      
      // 如果启用学习模式，提供添加到生词本的选项
      if (this.isLearningMode) {
        this.translationOverlay.showAddToVocabularyOption(text, translation);
      }
    } catch (error) {
      // 隐藏加载状态
      loadingManager.hideLoading(loadingId);
      
      // 记录错误
      errorHandler.logError(
        ErrorType.TRANSLATION_API_ERROR,
        '选词翻译失败',
        error,
        ErrorSeverity.MEDIUM,
        { component: 'content-script', action: 'text-selection' }
      );
      
      // 显示用户友好的错误信息
      const userMessage = errorHandler.getUserFriendlyMessage({
        type: ErrorType.TRANSLATION_API_ERROR,
        severity: ErrorSeverity.MEDIUM,
        message: error instanceof Error ? error.message : '翻译失败',
        timestamp: new Date()
      });
      
      this.translationOverlay.showError(userMessage);
    }
  }

  private async translatePage(runId: number): Promise<void> {
    // 显示页面翻译加载状态，保持非阻塞，避免遮住整页。
    this.hidePageTranslationLoading();
    const loadingId = `page_translation_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.pageTranslationLoadingId = loadingId;
    loadingManager.showLoading(loadingId, {
      message: '正在翻译页面...',
      type: 'progress',
      progress: 0,
      position: 'top',
      overlay: false
    });
    
    try {
      // 获取页面所有文本节点
      const textNodes = this.getTextNodes(document.body);

      if (!this.isCurrentTranslationRun(runId)) {
        return;
      }
      
      // 更新进度
      loadingManager.updateProgress(loadingId, 10, '正在分析页面内容...');
      
      // 批量翻译文本（分批处理以避免API限制）
      const batchSize = 10;
      const totalBatches = Math.ceil(textNodes.length / batchSize);
      
      for (let i = 0; i < textNodes.length; i += batchSize) {
        if (!this.isCurrentTranslationRun(runId)) {
          return;
        }

        const batch = textNodes.slice(i, i + batchSize);
        const currentBatch = Math.floor(i / batchSize) + 1;
        
        // 更新进度
        const progress = 10 + (currentBatch / totalBatches) * 80;
        loadingManager.updateProgress(loadingId, progress, `正在翻译第 ${currentBatch}/${totalBatches} 批内容...`);
        
        await this.translateTextNodeBatch(batch, runId);

        if (!this.isCurrentTranslationRun(runId)) {
          return;
        }
        
        // 添加小延迟以避免过于频繁的API调用
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!this.isCurrentTranslationRun(runId)) {
        return;
      }
      
      // 完成
      loadingManager.updateProgress(loadingId, 100, '翻译完成');
      setTimeout(() => {
        if (this.pageTranslationLoadingId === loadingId) {
          this.hidePageTranslationLoading(loadingId);
        }
      }, 1000);
      
    } catch (error) {
      this.hidePageTranslationLoading(loadingId);

      if (!this.isCurrentTranslationRun(runId)) {
        return;
      }

      this.isTranslationMode = false;
      this.floatingIcon.updateState(false);
      
      errorHandler.logError(
        ErrorType.TRANSLATION_API_ERROR,
        '页面翻译失败',
        error,
        ErrorSeverity.HIGH,
        { component: 'content-script', action: 'translate-page' }
      );
      
      // 显示错误通知
      const userMessage = errorHandler.getUserFriendlyMessage({
        type: ErrorType.TRANSLATION_API_ERROR,
        severity: ErrorSeverity.HIGH,
        message: error instanceof Error ? error.message : '页面翻译失败',
        timestamp: new Date()
      });
      
      this.translationOverlay.showError(userMessage);
    }
  }

  private async translateInteractiveText(text: string): Promise<string> {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return '';
    }

    const cachedTranslation = this.translationCache.get(normalizedText);
    if (cachedTranslation) {
      return cachedTranslation;
    }

    const result = await this.requestTranslation(normalizedText);
    this.translationCache.set(normalizedText, result.translatedText);
    return result.translatedText;
  }

  private async translateTextNodeBatch(textNodes: Text[], runId?: number): Promise<void> {
    const promises = textNodes.map(async (node) => {
      if (runId !== undefined && !this.isCurrentTranslationRun(runId)) {
        return;
      }

      if (node.textContent && node.textContent.trim().length > 3) {
        try {
          // 检查缓存
          let translation = this.translationCache.get(node.textContent);
          
          if (!translation) {
            const result = await this.requestTranslation(node.textContent);
            translation = result.translatedText;
            this.translationCache.set(node.textContent, translation);
          }

          if (runId !== undefined && !this.isCurrentTranslationRun(runId)) {
            return;
          }
          
          this.translationOverlay.addTranslation(
            node,
            translation,
            this.userSettings?.pageTranslationDisplayMode || 'bilingual'
          );
        } catch (error) {
          console.warn('翻译文本节点失败:', error);
        }
      }
    });

    await Promise.allSettled(promises);
  }

  private restoreOriginalPage(): void {
    this.translationOverlay.removeAllTranslations();
    this.translationCache.clear();
  }

  private isCurrentTranslationRun(runId: number): boolean {
    return this.isTranslationMode && this.translationRunId === runId;
  }

  private hidePageTranslationLoading(loadingId: string | null = this.pageTranslationLoadingId): void {
    if (!loadingId) return;

    loadingManager.hideLoading(loadingId);
    if (this.pageTranslationLoadingId === loadingId) {
      this.pageTranslationLoadingId = null;
    }
  }

  private getTextNodes(element: Element): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // 跳过脚本和样式标签
          const parent = node.parentElement;
          if (parent && ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE'].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          // 跳过已翻译的内容
          if (parent && parent.classList.contains('translation-overlay')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node = walker.nextNode();
    while (node) {
      textNodes.push(node as Text);
      node = walker.nextNode();
    }

    return textNodes;
  }

  private async requestTranslation(text: string): Promise<TranslationResult> {
    const startTime = Date.now();
    try {
      const response = await messageManager.sendToBackground({
        action: 'translate',
        data: {
          text: text,
          targetLang: this.userSettings?.defaultTargetLanguage || 'zh-CN',
          provider: this.userSettings?.translationProvider || 'google'
        }
      });

      const responseTime = Date.now() - startTime;
      performanceManager.recordRequest(responseTime, response.success);

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error || '翻译请求失败');
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      performanceManager.recordRequest(responseTime, false);
      throw error;
    }
  }

  private observePageChanges(): void {
    if (this.pageObserver) {
      this.pageObserver.disconnect();
    }

    this.pageObserver = new MutationObserver((mutations) => {
      if (this.isTranslationMode || this.isLearningMode) {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 处理新增的内容
              this.handleNewContent(node as Element);
            }
          });
        });
      }
    });

    this.pageObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private async handleNewContent(element: Element): Promise<void> {
    try {
      if (this.isTranslationMode) {
        await this.translateNewContent(element);
      }
      
      if (this.isLearningMode && this.userSettings?.activeDictionaries) {
        // 为新内容应用词汇高亮
        for (const dictType of this.userSettings.activeDictionaries) {
          // 这里需要获取词库词汇列表并高亮，简化处理
          // 实际实现中应该缓存词库数据
          console.log(`应用词库高亮: ${dictType}`);
        }
      }
    } catch (error) {
      console.warn('处理新内容失败:', error);
    }
  }

  private async translateNewContent(element: Element): Promise<void> {
    const textNodes = this.getTextNodes(element);
    await this.translateTextNodeBatch(textNodes, this.translationRunId);
  }

  private async applySettingsChanges(): Promise<void> {
    if (!this.userSettings) return;

    try {
      this.translationOverlay.setDisplayMode(this.userSettings.pageTranslationDisplayMode || 'bilingual');

      // 更新浮动图标位置
      this.floatingIcon.updatePosition(this.userSettings.floatingIconPosition);
      
      // 更新浮动图标显示状态
      if (this.userSettings.showFloatingIcon) {
        this.floatingIcon.show();
      } else {
        this.floatingIcon.hide();
      }
      
      // 如果学习模式设置发生变化
      if (this.userSettings.learningModeEnabled && !this.isLearningMode) {
        await this.toggleLearningMode();
      } else if (!this.userSettings.learningModeEnabled && this.isLearningMode) {
        await this.toggleLearningMode();
      }
    } catch (error) {
      console.error('应用设置变更失败:', error);
    }
  }

  private getPageInfo(): any {
    return {
      url: window.location.href,
      title: document.title,
      language: document.documentElement.lang || 'unknown',
      textLength: document.body.textContent?.length || 0,
      isTranslationMode: this.isTranslationMode,
      isLearningMode: this.isLearningMode
    };
  }

  // 清理资源
  public cleanup(): void {
    if (this.pageObserver) {
      this.pageObserver.disconnect();
    }
    this.translationOverlay.cleanup();
    this.floatingIcon.cleanup();
    this.selectionHandler.cleanup();
    this.hoverTranslator.cleanup();
    this.inputBoxTranslator.cleanup();
  }
}

// 初始化内容脚本
const contentScript = new ContentScript();

// 页面卸载时清理资源
window.addEventListener('beforeunload', () => {
  contentScript.cleanup();
});
