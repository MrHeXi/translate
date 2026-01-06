// Chrome翻译插件选项页面脚本

interface UserSettings {
  defaultTargetLanguage: string;
  translationProvider: string;
  autoTranslate: boolean;
  showFloatingIcon: boolean;
  floatingIconPosition: { x: number; y: number };
  learningModeEnabled: boolean;
  activeDictionaries: string[];
  highlightColors: { [key: string]: string };
  dailyGoal: number;
  reviewInterval: string;
  difficultyAdjustment: string;
}

interface LearningStats {
  totalWordsLearned: number;
  dailyGoal: number;
  currentStreak: number;
  longestStreak: number;
  reviewAccuracy: number;
  timeSpentLearning: number;
}

interface DictionaryProgress {
  [dictionaryType: string]: {
    totalWords: number;
    learnedWords: number;
    progress: number;
  };
}

class OptionsController {
  private currentTab: string = 'general';
  private settings: UserSettings | null = null;
  private stats: LearningStats | null = null;
  private dictionaryProgress: DictionaryProgress = {};

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // 绑定事件监听器
    this.bindEventListeners();
    
    // 加载当前设置
    await this.loadSettings();
    
    // 加载学习统计
    await this.loadLearningStats();
    
    // 加载词库进度
    await this.loadDictionaryProgress();
    
    // 更新UI显示
    this.updateUI();
  }

  private bindEventListeners(): void {
    // 标签页切换
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const tabId = target.dataset.tab;
        if (tabId) {
          this.switchTab(tabId);
        }
      });
    });

    // 设置保存
    const saveBtn = document.getElementById('saveSettings');
    saveBtn?.addEventListener('click', () => this.saveSettings());

    // 恢复默认设置
    const resetBtn = document.getElementById('resetToDefault');
    resetBtn?.addEventListener('click', () => this.resetToDefault());

    // 数据导出
    const exportBtn = document.getElementById('exportData');
    exportBtn?.addEventListener('click', () => this.exportData());

    // 数据导入
    const importBtn = document.getElementById('importData');
    const importFile = document.getElementById('importFile') as HTMLInputElement;
    importBtn?.addEventListener('click', () => importFile?.click());
    importFile?.addEventListener('change', (e) => this.importData(e));

    // 强制同步
    const syncBtn = document.getElementById('forcSync');
    syncBtn?.addEventListener('click', () => this.forceSync());

    // 危险操作
    const clearVocabBtn = document.getElementById('clearVocabulary');
    clearVocabBtn?.addEventListener('click', () => this.clearVocabulary());

    const resetSettingsBtn = document.getElementById('resetSettings');
    resetSettingsBtn?.addEventListener('click', () => this.resetAllSettings());

    const clearAllBtn = document.getElementById('clearAllData');
    clearAllBtn?.addEventListener('click', () => this.clearAllData());

    // 设置项变化监听
    this.bindSettingChangeListeners();
  }

  private bindSettingChangeListeners(): void {
    // 常规设置
    const targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement;
    targetLanguage?.addEventListener('change', () => this.onSettingChange());

    const translationProvider = document.getElementById('translationProvider') as HTMLSelectElement;
    translationProvider?.addEventListener('change', () => this.onSettingChange());

    const autoTranslate = document.getElementById('autoTranslate') as HTMLInputElement;
    autoTranslate?.addEventListener('change', () => this.onSettingChange());

    const showFloatingIcon = document.getElementById('showFloatingIcon') as HTMLInputElement;
    showFloatingIcon?.addEventListener('change', () => this.onSettingChange());

    const iconPosition = document.getElementById('iconPosition') as HTMLSelectElement;
    iconPosition?.addEventListener('change', () => this.onSettingChange());

    // 词库设置
    const dictionaryCheckboxes = document.querySelectorAll('input[id$="Enabled"]');
    dictionaryCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => this.onDictionarySettingChange());
    });

    // 高亮颜色设置
    const colorInputs = document.querySelectorAll('input[id$="Color"]');
    colorInputs.forEach(input => {
      input.addEventListener('change', () => this.onHighlightColorChange());
    });

    // 学习设置
    const dailyGoal = document.getElementById('dailyGoal') as HTMLInputElement;
    dailyGoal?.addEventListener('change', () => this.onSettingChange());

    const learningModeEnabled = document.getElementById('learningModeEnabled') as HTMLInputElement;
    learningModeEnabled?.addEventListener('change', () => this.onSettingChange());

    const reviewInterval = document.getElementById('reviewInterval') as HTMLSelectElement;
    reviewInterval?.addEventListener('change', () => this.onSettingChange());

    const difficultyAdjustment = document.getElementById('difficultyAdjustment') as HTMLSelectElement;
    difficultyAdjustment?.addEventListener('change', () => this.onSettingChange());
  }

  private switchTab(tabId: string): void {
    // 隐藏所有标签页内容
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));

    // 移除所有导航按钮的激活状态
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => btn.classList.remove('active'));

    // 显示目标标签页
    const targetTab = document.getElementById(tabId);
    targetTab?.classList.add('active');

    // 激活对应的导航按钮
    const targetNavBtn = document.querySelector(`[data-tab="${tabId}"]`);
    targetNavBtn?.classList.add('active');

    this.currentTab = tabId;
  }

  private async loadSettings(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getSettings' });
      if (response.success) {
        this.settings = response.data;
      } else {
        console.error('加载设置失败:', response.error);
        this.showMessage('加载设置失败', 'error');
      }
    } catch (error) {
      console.error('加载设置失败:', error);
      this.showMessage('加载设置失败', 'error');
    }
  }

  private async loadLearningStats(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getLearningStats' });
      if (response.success) {
        this.stats = response.data;
      } else {
        console.error('加载学习统计失败:', response.error);
      }
    } catch (error) {
      console.error('加载学习统计失败:', error);
    }
  }

  private async loadDictionaryProgress(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getDictionaryProgress' });
      if (response.success) {
        this.dictionaryProgress = response.data;
      } else {
        console.error('加载词库进度失败:', response.error);
      }
    } catch (error) {
      console.error('加载词库进度失败:', error);
    }
  }

  private updateUI(): void {
    if (this.settings) {
      this.updateGeneralSettings();
      this.updateDictionarySettings();
      this.updateLearningSettings();
    }

    if (this.stats) {
      this.updateLearningStats();
    }

    this.updateDictionaryProgress();
  }

  private updateGeneralSettings(): void {
    if (!this.settings) return;

    const targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement;
    if (targetLanguage) targetLanguage.value = this.settings.defaultTargetLanguage;

    const translationProvider = document.getElementById('translationProvider') as HTMLSelectElement;
    if (translationProvider) translationProvider.value = this.settings.translationProvider;

    const autoTranslate = document.getElementById('autoTranslate') as HTMLInputElement;
    if (autoTranslate) autoTranslate.checked = this.settings.autoTranslate;

    const showFloatingIcon = document.getElementById('showFloatingIcon') as HTMLInputElement;
    if (showFloatingIcon) showFloatingIcon.checked = this.settings.showFloatingIcon;

    // 根据浮动图标位置设置选择框
    const iconPosition = document.getElementById('iconPosition') as HTMLSelectElement;
    if (iconPosition && this.settings.floatingIconPosition) {
      const { x, y } = this.settings.floatingIconPosition;
      if (x > window.innerWidth / 2 && y < window.innerHeight / 2) {
        iconPosition.value = 'top-right';
      } else if (x < window.innerWidth / 2 && y < window.innerHeight / 2) {
        iconPosition.value = 'top-left';
      } else if (x > window.innerWidth / 2 && y > window.innerHeight / 2) {
        iconPosition.value = 'bottom-right';
      } else {
        iconPosition.value = 'bottom-left';
      }
    }
  }

  private updateDictionarySettings(): void {
    if (!this.settings) return;

    // 更新词库启用状态
    const activeDictionaries = this.settings.activeDictionaries || [];
    const dictionaryTypes = ['gre', 'toefl', 'ielts', 'cet4', 'cet6'];
    
    dictionaryTypes.forEach(type => {
      const checkbox = document.getElementById(`${type}Enabled`) as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = activeDictionaries.includes(type);
      }
    });

    // 更新高亮颜色
    const highlightColors = this.settings.highlightColors || {};
    dictionaryTypes.forEach(type => {
      const colorInput = document.getElementById(`${type}Color`) as HTMLInputElement;
      if (colorInput && highlightColors[type]) {
        colorInput.value = highlightColors[type];
      }
    });
  }

  private updateLearningSettings(): void {
    if (!this.settings) return;

    const dailyGoal = document.getElementById('dailyGoal') as HTMLInputElement;
    if (dailyGoal && this.stats) dailyGoal.value = this.stats.dailyGoal.toString();

    const learningModeEnabled = document.getElementById('learningModeEnabled') as HTMLInputElement;
    if (learningModeEnabled) learningModeEnabled.checked = this.settings.learningModeEnabled;
  }

  private updateLearningStats(): void {
    if (!this.stats) return;

    const totalVocabulary = document.getElementById('totalVocabulary');
    if (totalVocabulary) totalVocabulary.textContent = this.stats.totalWordsLearned.toString();

    const currentStreak = document.getElementById('currentStreak');
    if (currentStreak) currentStreak.textContent = this.stats.currentStreak.toString();

    const reviewAccuracy = document.getElementById('reviewAccuracy');
    if (reviewAccuracy) reviewAccuracy.textContent = `${Math.round(this.stats.reviewAccuracy * 100)}%`;

    const timeSpent = document.getElementById('timeSpent');
    if (timeSpent) timeSpent.textContent = Math.round(this.stats.timeSpentLearning / 60).toString();
  }

  private updateDictionaryProgress(): void {
    const dictionaryTypes = ['gre', 'toefl', 'ielts', 'cet4', 'cet6'];
    
    dictionaryTypes.forEach(type => {
      const progress = this.dictionaryProgress[type];
      const totalElement = document.getElementById(`${type}Total`);
      const learnedElement = document.getElementById(`${type}Learned`);
      
      if (totalElement && learnedElement) {
        if (progress) {
          totalElement.textContent = progress.totalWords.toString();
          learnedElement.textContent = progress.learnedWords.toString();
        } else {
          totalElement.textContent = '0';
          learnedElement.textContent = '0';
        }
      }
    });
  }

  private onSettingChange(): void {
    // 标记设置已更改，可以在这里添加自动保存逻辑
    console.log('设置已更改');
  }

  private onDictionarySettingChange(): void {
    // 词库设置更改时的处理
    this.onSettingChange();
  }

  private onHighlightColorChange(): void {
    // 高亮颜色更改时的处理
    this.onSettingChange();
  }

  private async saveSettings(): Promise<void> {
    try {
      const settings = this.collectSettingsFromUI();
      const response = await this.sendMessage({
        action: 'updateSettings',
        data: settings
      });

      if (response.success) {
        this.settings = settings;
        this.showMessage('设置保存成功', 'success');
      } else {
        this.showMessage('设置保存失败: ' + response.error, 'error');
      }
    } catch (error) {
      console.error('保存设置失败:', error);
      this.showMessage('设置保存失败', 'error');
    }
  }

  private collectSettingsFromUI(): UserSettings {
    const targetLanguage = (document.getElementById('targetLanguage') as HTMLSelectElement)?.value || 'zh-CN';
    const translationProvider = (document.getElementById('translationProvider') as HTMLSelectElement)?.value || 'google';
    const autoTranslate = (document.getElementById('autoTranslate') as HTMLInputElement)?.checked || false;
    const showFloatingIcon = (document.getElementById('showFloatingIcon') as HTMLInputElement)?.checked || true;
    const learningModeEnabled = (document.getElementById('learningModeEnabled') as HTMLInputElement)?.checked || false;
    const dailyGoal = parseInt((document.getElementById('dailyGoal') as HTMLInputElement)?.value || '20');

    // 收集激活的词库
    const activeDictionaries: string[] = [];
    const dictionaryTypes = ['gre', 'toefl', 'ielts', 'cet4', 'cet6'];
    dictionaryTypes.forEach(type => {
      const checkbox = document.getElementById(`${type}Enabled`) as HTMLInputElement;
      if (checkbox?.checked) {
        activeDictionaries.push(type);
      }
    });

    // 收集高亮颜色
    const highlightColors: { [key: string]: string } = {};
    dictionaryTypes.forEach(type => {
      const colorInput = document.getElementById(`${type}Color`) as HTMLInputElement;
      if (colorInput) {
        highlightColors[type] = colorInput.value;
      }
    });

    return {
      defaultTargetLanguage: targetLanguage,
      translationProvider: translationProvider,
      autoTranslate: autoTranslate,
      showFloatingIcon: showFloatingIcon,
      floatingIconPosition: this.settings?.floatingIconPosition || { x: 50, y: 50 },
      learningModeEnabled: learningModeEnabled,
      activeDictionaries: activeDictionaries,
      highlightColors: highlightColors,
      dailyGoal: dailyGoal,
      reviewInterval: (document.getElementById('reviewInterval') as HTMLSelectElement)?.value || 'spaced',
      difficultyAdjustment: (document.getElementById('difficultyAdjustment') as HTMLSelectElement)?.value || 'auto'
    };
  }

  private async resetToDefault(): Promise<void> {
    if (confirm('确定要恢复默认设置吗？这将覆盖您的当前设置。')) {
      try {
        const response = await this.sendMessage({ action: 'resetSettings' });
        if (response.success) {
          await this.loadSettings();
          this.updateUI();
          this.showMessage('设置已恢复为默认值', 'success');
        } else {
          this.showMessage('恢复默认设置失败: ' + response.error, 'error');
        }
      } catch (error) {
        console.error('恢复默认设置失败:', error);
        this.showMessage('恢复默认设置失败', 'error');
      }
    }
  }

  private async exportData(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'exportUserData' });
      if (response.success) {
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `chrome-translation-backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        this.showMessage('数据导出成功', 'success');
      } else {
        this.showMessage('数据导出失败: ' + response.error, 'error');
      }
    } catch (error) {
      console.error('导出数据失败:', error);
      this.showMessage('数据导出失败', 'error');
    }
  }

  private async importData(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const response = await this.sendMessage({
        action: 'importUserData',
        data: data
      });

      if (response.success) {
        await this.loadSettings();
        await this.loadLearningStats();
        await this.loadDictionaryProgress();
        this.updateUI();
        this.showMessage('数据导入成功', 'success');
      } else {
        this.showMessage('数据导入失败: ' + response.error, 'error');
      }
    } catch (error) {
      console.error('导入数据失败:', error);
      this.showMessage('数据导入失败，请检查文件格式', 'error');
    }
  }

  private async forceSync(): Promise<void> {
    try {
      const syncBtn = document.getElementById('forcSync') as HTMLButtonElement;
      const originalText = syncBtn.textContent;
      
      syncBtn.textContent = '同步中...';
      syncBtn.disabled = true;

      const response = await this.sendMessage({ action: 'forceSync' });
      
      if (response.success) {
        this.showMessage('数据同步成功', 'success');
        this.updateSyncStatus('已同步');
      } else {
        this.showMessage('数据同步失败: ' + response.error, 'error');
      }
    } catch (error) {
      console.error('强制同步失败:', error);
      this.showMessage('数据同步失败', 'error');
    } finally {
      const syncBtn = document.getElementById('forcSync') as HTMLButtonElement;
      syncBtn.textContent = '强制同步';
      syncBtn.disabled = false;
    }
  }

  private updateSyncStatus(status: string): void {
    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) {
      syncStatus.textContent = `同步状态：${status}`;
    }
  }

  private async clearVocabulary(): Promise<void> {
    if (confirm('确定要清空生词本吗？此操作不可撤销。')) {
      try {
        const response = await this.sendMessage({ action: 'clearVocabulary' });
        if (response.success) {
          await this.loadLearningStats();
          this.updateLearningStats();
          this.showMessage('生词本已清空', 'success');
        } else {
          this.showMessage('清空生词本失败: ' + response.error, 'error');
        }
      } catch (error) {
        console.error('清空生词本失败:', error);
        this.showMessage('清空生词本失败', 'error');
      }
    }
  }

  private async resetAllSettings(): Promise<void> {
    if (confirm('确定要重置所有设置吗？此操作不可撤销。')) {
      try {
        const response = await this.sendMessage({ action: 'resetAllSettings' });
        if (response.success) {
          await this.loadSettings();
          this.updateUI();
          this.showMessage('所有设置已重置', 'success');
        } else {
          this.showMessage('重置设置失败: ' + response.error, 'error');
        }
      } catch (error) {
        console.error('重置设置失败:', error);
        this.showMessage('重置设置失败', 'error');
      }
    }
  }

  private async clearAllData(): Promise<void> {
    if (confirm('确定要清空所有数据吗？包括设置、生词本和学习进度。此操作不可撤销。')) {
      if (confirm('请再次确认：这将删除您的所有数据，包括生词本和学习进度。')) {
        try {
          const response = await this.sendMessage({ action: 'clearAllData' });
          if (response.success) {
            await this.loadSettings();
            await this.loadLearningStats();
            await this.loadDictionaryProgress();
            this.updateUI();
            this.showMessage('所有数据已清空', 'success');
          } else {
            this.showMessage('清空数据失败: ' + response.error, 'error');
          }
        } catch (error) {
          console.error('清空数据失败:', error);
          this.showMessage('清空数据失败', 'error');
        }
      }
    }
  }

  private showMessage(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    // 移除现有消息
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
      existingMessage.remove();
    }

    // 创建新消息
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;

    // 插入到主要内容区域顶部
    const main = document.querySelector('.options-main');
    if (main) {
      main.insertBefore(messageDiv, main.firstChild);
    }

    // 3秒后自动移除
    setTimeout(() => {
      messageDiv.remove();
    }, 3000);
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

// 初始化选项页面
document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});