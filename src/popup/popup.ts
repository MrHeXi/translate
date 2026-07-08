// Chrome翻译插件弹出窗口脚本

// 学习统计接口定义
interface LearningStats {
  totalWordsLearned: number;
  dailyGoal: number;
  currentStreak: number;
  longestStreak: number;
  reviewAccuracy: number;
  timeSpentLearning: number;
  todayReviewedCount: number;
  reviewDueCount: number;
}

interface VocabularyPreview {
  word: string;
  translation?: string;
  addedDate?: string | Date;
}

class PopupController {
  private isTranslationActive: boolean = false;
  private isVideoSubtitleActive: boolean = false;
  private isLiveCaptionActive: boolean = false;
  private isTogglingTranslation: boolean = false;
  private isTogglingVideoSubtitles: boolean = false;
  private isTogglingLiveCaptions: boolean = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // 加载当前状态
    await this.loadCurrentState();
    
    // 绑定事件监听器
    this.bindEventListeners();
    
    // 更新学习统计
    await this.updateLearningStats();
    
    // 加载词库设置
    await this.loadDictionarySettings();
    await this.updateRecentWords();
  }

  private bindEventListeners(): void {
    // 翻译模式切换
    const toggleBtn = document.getElementById('toggleTranslation') as HTMLButtonElement;
    toggleBtn?.addEventListener('click', () => this.toggleTranslationMode());

    const toggleVideoSubtitles = document.getElementById('toggleVideoSubtitles') as HTMLButtonElement;
    toggleVideoSubtitles?.addEventListener('click', () => this.toggleVideoSubtitleMode());

    const toggleLiveCaptions = document.getElementById('toggleLiveCaptions') as HTMLButtonElement;
    toggleLiveCaptions?.addEventListener('click', () => this.toggleLiveCaptionMode());

    // 快速翻译
    const translateBtn = document.getElementById('translateBtn') as HTMLButtonElement;
    translateBtn?.addEventListener('click', () => this.quickTranslate());

    // 生词本按钮
    const vocabularyBtn = document.getElementById('vocabularyBtn') as HTMLButtonElement;
    vocabularyBtn?.addEventListener('click', () => this.openVocabulary());

    // 复习按钮
    const reviewBtn = document.getElementById('reviewBtn') as HTMLButtonElement;
    reviewBtn?.addEventListener('click', () => this.startReview());

    const documentTranslatorBtn = document.getElementById('documentTranslatorBtn') as HTMLButtonElement;
    documentTranslatorBtn?.addEventListener('click', () => this.openDocumentTranslator());

    // 设置按钮
    const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
    settingsBtn?.addEventListener('click', () => this.openSettings());

    // 更多设置按钮
    const optionsBtn = document.getElementById('optionsBtn') as HTMLButtonElement;
    optionsBtn?.addEventListener('click', () => this.openOptions());

    // 词库选择变化
    const dictionaryCheckboxes = document.querySelectorAll('.dictionary-item input[type="checkbox"]');
    dictionaryCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => this.updateDictionarySettings());
    });

    // 输入框回车事件
    const inputText = document.getElementById('inputText') as HTMLTextAreaElement;
    inputText?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.quickTranslate();
      }
    });
  }

  private async loadCurrentState(): Promise<void> {
    try {
      // 查询当前标签页的翻译状态
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await this.sendTabMessage(tab.id, { action: 'getTranslationStatus' });
        const isActive = response?.isActive ?? response?.data?.isActive;
        if (typeof isActive === 'boolean') {
          this.isTranslationActive = isActive;
        }

        const isVideoSubtitleMode = response?.isVideoSubtitleMode ?? response?.data?.isVideoSubtitleMode;
        if (typeof isVideoSubtitleMode === 'boolean') {
          this.isVideoSubtitleActive = isVideoSubtitleMode;
        }

        const isLiveCaptionMode = response?.isLiveCaptionMode ?? response?.data?.isLiveCaptionMode;
        if (typeof isLiveCaptionMode === 'boolean') {
          this.isLiveCaptionActive = isLiveCaptionMode;
        }

        this.updateTranslationStatusUI();
        this.updateVideoSubtitleStatusUI();
        this.updateLiveCaptionStatusUI();
      }
    } catch (error) {
      if (this.isMissingContentScriptReceiverError(error)) {
        this.isTranslationActive = false;
        this.isVideoSubtitleActive = false;
        this.isLiveCaptionActive = false;
        this.updateTranslationStatusUI();
        this.updateVideoSubtitleStatusUI();
        this.updateLiveCaptionStatusUI();
        return;
      }

      console.error('Could not load current state:', error);
    }
  }

  private async toggleTranslationMode(): Promise<void> {
    if (this.isTogglingTranslation) return;

    this.setTranslationToggleBusy(true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await this.sendMessageToTabWithInjection(tab, { action: 'toggleTranslation' });
        if (response?.success) {
          const isActive = response.isActive ?? response.data?.isActive;
          this.isTranslationActive = Boolean(isActive);
          this.updateTranslationStatusUI();
        } else {
          this.showError(response?.error || 'Could not toggle page translation.');
        }
      } else {
        this.showError('No active page found.');
      }
    } catch (error) {
      console.error('Could not toggle page translation:', error);
      this.showError(error instanceof Error ? error.message : 'Could not toggle page translation.');
    } finally {
      this.setTranslationToggleBusy(false);
    }
  }

  private async toggleVideoSubtitleMode(): Promise<void> {
    if (this.isTogglingVideoSubtitles) return;

    this.setVideoSubtitleToggleBusy(true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await this.sendMessageToTabWithInjection(tab, { action: 'toggleVideoSubtitleTranslation' });
        if (response?.success) {
          const isActive = response.isActive ?? response.data?.isActive;
          this.isVideoSubtitleActive = Boolean(isActive);
          this.updateVideoSubtitleStatusUI();
        } else {
          this.showError(response?.error || 'Could not toggle video subtitles.');
        }
      } else {
        this.showError('No active page found.');
      }
    } catch (error) {
      console.error('Could not toggle video subtitles:', error);
      this.showError(error instanceof Error ? error.message : 'Could not toggle video subtitles.');
    } finally {
      this.setVideoSubtitleToggleBusy(false);
    }
  }

  private async toggleLiveCaptionMode(): Promise<void> {
    if (this.isTogglingLiveCaptions) return;

    this.setLiveCaptionToggleBusy(true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await this.sendMessageToTabWithInjection(tab, { action: 'toggleLiveCaptionTranslation' });
        if (response?.success) {
          const isActive = response.isActive ?? response.data?.isActive;
          this.isLiveCaptionActive = Boolean(isActive);
          this.updateLiveCaptionStatusUI();
        } else {
          this.showError(response?.error || 'Could not toggle live captions.');
        }
      } else {
        this.showError('No active page found.');
      }
    } catch (error) {
      console.error('Could not toggle live captions:', error);
      this.showError(error instanceof Error ? error.message : 'Could not toggle live captions.');
    } finally {
      this.setLiveCaptionToggleBusy(false);
    }
  }

  private updateTranslationStatusUI(): void {
    const statusElement = document.getElementById('translationStatus');
    const toggleBtn = document.getElementById('toggleTranslation') as HTMLButtonElement;

    if (statusElement && toggleBtn) {
      if (this.isTranslationActive) {
        statusElement.textContent = 'On';
        toggleBtn.textContent = 'Stop';
        toggleBtn.classList.add('active');
      } else {
        statusElement.textContent = 'Off';
        toggleBtn.textContent = 'Start';
        toggleBtn.classList.remove('active');
      }
    }
  }

  private async quickTranslate(): Promise<void> {
    const inputText = document.getElementById('inputText') as HTMLTextAreaElement;
    const translateBtn = document.getElementById('translateBtn') as HTMLButtonElement;
    const resultDiv = document.getElementById('translateResult') as HTMLDivElement;
    const resultText = resultDiv.querySelector('.result-text') as HTMLDivElement;

    if (!inputText || !translateBtn || !resultDiv || !resultText) return;

    const text = inputText.value.trim();
    if (!text) return;

    try {
      // 禁用按钮并显示加载状态
      translateBtn.disabled = true;
      translateBtn.textContent = 'Translating...';

      // 发送翻译请求到后台脚本
      const response = await this.sendMessage({
        action: 'translate',
        data: {
          text: text,
          targetLang: 'zh-CN'
        }
      });

      if (response.success) {
        resultText.textContent = response.data.translatedText;
        resultDiv.style.display = 'block';
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Quick translation failed:', error);
      resultText.textContent = 'Translation failed. Please try again.';
      resultDiv.style.display = 'block';
    } finally {
      // 恢复按钮状态
      translateBtn.disabled = false;
      translateBtn.textContent = 'Translate';
    }
  }

  private async updateLearningStats(): Promise<void> {
    try {
      // 显示加载状态
      this.showLoadingState();
      
      const response = await this.sendMessage({ action: 'getLearningStats' });
      
      if (response.success) {
        const stats = response.data as Partial<LearningStats>;
        
        // 更新统计数字
        const totalWordsElement = document.getElementById('totalWords');
        const todayReviewedElement = document.getElementById('todayReviewed');
        const reviewDueElement = document.getElementById('reviewDue');
        const currentStreakElement = document.getElementById('currentStreak');
        const reviewAccuracyElement = document.getElementById('reviewAccuracy');

        if (totalWordsElement) totalWordsElement.textContent = stats.totalWordsLearned?.toString() || '0';
        if (todayReviewedElement) todayReviewedElement.textContent = stats.todayReviewedCount?.toString() || '0';
        if (reviewDueElement) reviewDueElement.textContent = stats.reviewDueCount?.toString() || '0';
        if (currentStreakElement) currentStreakElement.textContent = stats.currentStreak?.toString() || '0';
        if (reviewAccuracyElement) {
          const accuracy = stats.reviewAccuracy ? Math.round(stats.reviewAccuracy * 100) : 0;
          reviewAccuracyElement.textContent = `${accuracy}%`;
        }
      } else {
        this.showError('Could not load learning stats.');
      }
    } catch (error) {
      console.error('Could not update learning stats:', error);
      this.showError('Could not load learning stats.');
    } finally {
      this.hideLoadingState();
    }
  }

  private async loadDictionarySettings(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getSettings' });
      
      if (response.success) {
        const settings = response.data;
        const activeDictionaries = settings.activeDictionaries || [];
        this.updateActiveDictionarySummary(activeDictionaries.length);
        
        // 更新复选框状态
        const checkboxes = document.querySelectorAll('.dictionary-item input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
        checkboxes.forEach(checkbox => {
          checkbox.checked = activeDictionaries.includes(checkbox.value);
        });
      } else {
        this.showError('Could not load dictionary settings.');
      }
    } catch (error) {
      console.error('Could not load dictionary settings:', error);
      this.showError('Could not load dictionary settings.');
    }
  }

  private async updateDictionarySettings(): Promise<void> {
    try {
      const checkboxes = document.querySelectorAll('.dictionary-item input[type="checkbox"]:checked') as NodeListOf<HTMLInputElement>;
      const activeDictionaries = Array.from(checkboxes).map(cb => cb.value);
      this.updateActiveDictionarySummary(activeDictionaries.length);
      
      const response = await this.sendMessage({
        action: 'updateSettings',
        data: {
          activeDictionaries: activeDictionaries
        }
      });
      
      if (!response.success) {
        this.showError('Could not update dictionary settings.');
      }
    } catch (error) {
      console.error('Could not update dictionary settings:', error);
      this.showError('Could not update dictionary settings.');
    }
  }

  private updateVideoSubtitleStatusUI(): void {
    const statusElement = document.getElementById('videoSubtitleStatus');
    const toggleBtn = document.getElementById('toggleVideoSubtitles') as HTMLButtonElement;

    if (statusElement && toggleBtn) {
      if (this.isVideoSubtitleActive) {
        statusElement.textContent = 'On';
        toggleBtn.textContent = 'Stop';
        toggleBtn.classList.add('active');
      } else {
        statusElement.textContent = 'Off';
        toggleBtn.textContent = 'Start';
        toggleBtn.classList.remove('active');
      }
    }
  }

  private updateLiveCaptionStatusUI(): void {
    const statusElement = document.getElementById('liveCaptionStatus');
    const toggleBtn = document.getElementById('toggleLiveCaptions') as HTMLButtonElement;

    if (statusElement && toggleBtn) {
      if (this.isLiveCaptionActive) {
        statusElement.textContent = 'On';
        toggleBtn.textContent = 'Stop';
        toggleBtn.classList.add('active');
      } else {
        statusElement.textContent = 'Off';
        toggleBtn.textContent = 'Start';
        toggleBtn.classList.remove('active');
      }
    }
  }

  private updateActiveDictionarySummary(count: number): void {
    const summary = document.getElementById('activeDictionarySummary');
    if (summary) {
      summary.textContent = `${count} enabled`;
    }
  }

  private async updateRecentWords(): Promise<void> {
    try {
      const response = await this.sendMessage({
        action: 'getVocabularyList',
        data: {}
      });

      if (response.success) {
        this.renderRecentWords(response.data || []);
      } else {
        this.renderRecentWords([]);
      }
    } catch (error) {
      console.error('Could not load recent words:', error);
      this.renderRecentWords([]);
    }
  }

  private renderRecentWords(words: VocabularyPreview[]): void {
    const recentWords = document.getElementById('recentWords');
    const emptyState = document.getElementById('recentWordsEmpty');
    if (!recentWords || !emptyState) return;

    recentWords.replaceChildren();

    const sortedWords = [...words]
      .sort((a, b) => this.getAddedDateTime(b) - this.getAddedDateTime(a))
      .slice(0, 3);

    emptyState.style.display = sortedWords.length > 0 ? 'none' : 'block';

    sortedWords.forEach(item => {
      const listItem = document.createElement('li');
      listItem.className = 'recent-word-item';

      const word = document.createElement('span');
      word.className = 'recent-word';
      word.textContent = item.word;

      const translation = document.createElement('span');
      translation.className = 'recent-translation';
      translation.textContent = item.translation || 'Saved for review';

      listItem.appendChild(word);
      listItem.appendChild(translation);
      recentWords.appendChild(listItem);
    });
  }

  private getAddedDateTime(item: VocabularyPreview): number {
    if (!item.addedDate) return 0;

    const date = item.addedDate instanceof Date ? item.addedDate : new Date(item.addedDate);
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private openVocabulary(): void {
    // 打开生词本页面
    chrome.tabs.create({
      url: chrome.runtime.getURL('vocabulary.html')
    });
  }

  private startReview(): void {
    // 打开复习页面
    chrome.tabs.create({
      url: chrome.runtime.getURL('review.html')
    });
  }

  private async openDocumentTranslator(): Promise<void> {
    let documentUrl = chrome.runtime.getURL('document.html');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && this.isDocumentUrl(tab.url)) {
        documentUrl += `?sourceUrl=${encodeURIComponent(tab.url)}`;
      }
    } catch (error) {
      console.warn('Could not read active tab URL for document translator:', error);
    }

    chrome.tabs.create({ url: documentUrl });
  }

  private isDocumentUrl(url: string): boolean {
    return /\.(pdf|txt|md|markdown|srt|vtt)([?#].*)?$/i.test(url);
  }

  private openSettings(): void {
    // 打开设置页面
    chrome.runtime.openOptionsPage();
  }

  private openOptions(): void {
    // 打开选项页面
    chrome.runtime.openOptionsPage();
  }

  private sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  private sendTabMessage(tabId: number, message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  private isMissingContentScriptReceiverError(error: unknown): boolean {
    const message = error instanceof Error
      ? error.message
      : String((error as { message?: unknown })?.message || error || '');

    return message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist');
  }

  private async sendMessageToTabWithInjection(tab: chrome.tabs.Tab, message: any): Promise<any> {
    if (!tab.id) {
      throw new Error('No active page found.');
    }

    try {
      return await this.sendTabMessage(tab.id, message);
    } catch (error) {
      if (!this.canInjectContentScript(tab.url)) {
        throw new Error('This page does not support page translation. Open a regular web page and try again.');
      }

      await this.injectContentScript(tab.id);
      await this.waitForContentScript(tab.id);
      return await this.sendTabMessage(tab.id, message);
    }
  }

  private canInjectContentScript(url?: string): boolean {
    if (!url) return false;

    return /^(https?:|file:)/.test(url);
  }

  private async injectContentScript(tabId: number): Promise<void> {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['content.css']
      });
    } catch (error) {
      console.warn('Could not inject content styles:', error);
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  }

  private async waitForContentScript(tabId: number): Promise<void> {
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await this.sendTabMessage(tabId, { action: 'getTranslationStatus' });
        const isActive = response?.isActive ?? response?.data?.isActive;
        if (response?.success && typeof isActive === 'boolean') {
          return;
        }
      } catch {
        // Content script may still be initializing.
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('The page translation script did not initialize. Refresh the page and try again.');
  }

  private setTranslationToggleBusy(isBusy: boolean): void {
    this.isTogglingTranslation = isBusy;

    const toggleBtn = document.getElementById('toggleTranslation') as HTMLButtonElement;
    if (toggleBtn) {
      toggleBtn.disabled = isBusy;
    }
  }

  private setVideoSubtitleToggleBusy(isBusy: boolean): void {
    this.isTogglingVideoSubtitles = isBusy;

    const toggleBtn = document.getElementById('toggleVideoSubtitles') as HTMLButtonElement;
    if (toggleBtn) {
      toggleBtn.disabled = isBusy;
    }
  }

  private setLiveCaptionToggleBusy(isBusy: boolean): void {
    this.isTogglingLiveCaptions = isBusy;

    const toggleBtn = document.getElementById('toggleLiveCaptions') as HTMLButtonElement;
    if (toggleBtn) {
      toggleBtn.disabled = isBusy;
    }
  }

  private showLoadingState(): void {
    // 可以在这里添加加载动画或禁用按钮
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
  }

  private hideLoadingState(): void {
    // 恢复按钮状态
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = false);
  }

  private showError(message: string): void {
    // 简单的错误提示，可以后续改进为更好的UI
    console.error(message);
    
    // 可以在这里添加错误提示UI
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    errorElement.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background-color: #f44336;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
    `;
    
    document.body.appendChild(errorElement);
    
    // 3秒后自动移除
    setTimeout(() => {
      if (errorElement.parentNode) {
        errorElement.parentNode.removeChild(errorElement);
      }
    }, 3000);
  }
}

// 初始化弹出窗口
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
