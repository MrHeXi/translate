// Chrome翻译插件弹出窗口脚本

class PopupController {
  private isTranslationActive: boolean = false;

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
  }

  private bindEventListeners(): void {
    // 翻译模式切换
    const toggleBtn = document.getElementById('toggleTranslation') as HTMLButtonElement;
    toggleBtn?.addEventListener('click', () => this.toggleTranslationMode());

    // 快速翻译
    const translateBtn = document.getElementById('translateBtn') as HTMLButtonElement;
    translateBtn?.addEventListener('click', () => this.quickTranslate());

    // 生词本按钮
    const vocabularyBtn = document.getElementById('vocabularyBtn') as HTMLButtonElement;
    vocabularyBtn?.addEventListener('click', () => this.openVocabulary());

    // 复习按钮
    const reviewBtn = document.getElementById('reviewBtn') as HTMLButtonElement;
    reviewBtn?.addEventListener('click', () => this.startReview());

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
        // 发送消息到content script查询状态
        chrome.tabs.sendMessage(tab.id, { action: 'getTranslationStatus' }, (response) => {
          if (response && response.isActive) {
            this.isTranslationActive = true;
            this.updateTranslationStatusUI();
          }
        });
      }
    } catch (error) {
      console.error('加载当前状态失败:', error);
    }
  }

  private async toggleTranslationMode(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        // 发送切换消息到content script
        chrome.tabs.sendMessage(tab.id, { action: 'toggleTranslation' }, (response) => {
          if (response && response.success) {
            this.isTranslationActive = response.isActive;
            this.updateTranslationStatusUI();
          }
        });
      }
    } catch (error) {
      console.error('切换翻译模式失败:', error);
    }
  }

  private updateTranslationStatusUI(): void {
    const statusElement = document.getElementById('translationStatus');
    const toggleBtn = document.getElementById('toggleTranslation') as HTMLButtonElement;

    if (statusElement && toggleBtn) {
      if (this.isTranslationActive) {
        statusElement.textContent = '开启';
        toggleBtn.textContent = '关闭';
        toggleBtn.classList.add('active');
      } else {
        statusElement.textContent = '关闭';
        toggleBtn.textContent = '开启';
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
      translateBtn.textContent = '翻译中...';

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
      console.error('快速翻译失败:', error);
      resultText.textContent = '翻译失败，请稍后重试';
      resultDiv.style.display = 'block';
    } finally {
      // 恢复按钮状态
      translateBtn.disabled = false;
      translateBtn.textContent = '翻译';
    }
  }

  private async updateLearningStats(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getLearningStats' });
      
      if (response.success) {
        const stats = response.data;
        
        // 更新统计数字
        const totalWordsElement = document.getElementById('totalWords');
        const todayReviewedElement = document.getElementById('todayReviewed');
        const reviewDueElement = document.getElementById('reviewDue');

        if (totalWordsElement) totalWordsElement.textContent = stats.totalWords || '0';
        if (todayReviewedElement) todayReviewedElement.textContent = stats.todayReviewed || '0';
        if (reviewDueElement) reviewDueElement.textContent = stats.reviewDue || '0';
      }
    } catch (error) {
      console.error('更新学习统计失败:', error);
    }
  }

  private async loadDictionarySettings(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getSettings' });
      
      if (response.success) {
        const settings = response.data;
        const activeDictionaries = settings.activeDictionaries || [];
        
        // 更新复选框状态
        const checkboxes = document.querySelectorAll('.dictionary-item input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
        checkboxes.forEach(checkbox => {
          checkbox.checked = activeDictionaries.includes(checkbox.value);
        });
      }
    } catch (error) {
      console.error('加载词库设置失败:', error);
    }
  }

  private async updateDictionarySettings(): Promise<void> {
    try {
      const checkboxes = document.querySelectorAll('.dictionary-item input[type="checkbox"]:checked') as NodeListOf<HTMLInputElement>;
      const activeDictionaries = Array.from(checkboxes).map(cb => cb.value);
      
      await this.sendMessage({
        action: 'updateSettings',
        data: {
          activeDictionaries: activeDictionaries
        }
      });
    } catch (error) {
      console.error('更新词库设置失败:', error);
    }
  }

  private openVocabulary(): void {
    // 打开生词本页面
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/options/vocabulary.html')
    });
  }

  private startReview(): void {
    // 打开复习页面
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/options/review.html')
    });
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
}

// 初始化弹出窗口
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});