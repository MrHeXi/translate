// Chrome翻译插件选项页面脚本

import {
  getProviderTargetLanguages,
  getTranslationProvider,
  TRANSLATION_LANGUAGES,
  TRANSLATION_PROVIDERS,
  TranslationProviderRuntimeConfig
} from '../services/TranslationProviderRegistry';
import type { TranslationProviderConfigSummary } from '../services/StorageManager';
import {
  normalizeSitePattern,
  PageTranslationDisplayMode,
  PageTranslationScope,
  SiteTranslationRule,
  TranslationStylePreset
} from '../services/TranslationPreferences';
import {
  BUNDLED_OCR_LANGUAGES,
  BundledOcrLanguageCode
} from '../services/BundledOcrService';
import {
  formatTranslationGlossary,
  parseTranslationGlossary,
  TRANSLATION_DOMAINS,
  TranslationDomain,
  TranslationGlossaryEntry
} from '../services/AiTranslationPreferences';

interface UserSettings {
  defaultTargetLanguage: string;
  translationProvider: string;
  pageTranslationDisplayMode: PageTranslationDisplayMode;
  autoTranslate: boolean;
  showFloatingIcon: boolean;
  floatingIconPosition: { x: number; y: number };
  learningModeEnabled: boolean;
  activeDictionaries: string[];
  highlightColors: { [key: string]: string };
  dailyGoal: number;
  reviewInterval: string;
  difficultyAdjustment: string;
  pageTranslationExcludeSelectors?: string[];
  translationStyle?: TranslationStylePreset;
  pageTranslationScope?: PageTranslationScope;
  siteTranslationRules?: SiteTranslationRule[];
  documentOcrLanguage?: BundledOcrLanguageCode;
  aiContextEnabled?: boolean;
  aiTranslationDomain?: TranslationDomain;
  translationGlossary?: TranslationGlossaryEntry[];
  aiCustomPrompt?: string;
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
  private providerConfigSummaries: Map<string, TranslationProviderConfigSummary> = new Map();
  private siteTranslationRules: Map<string, SiteTranslationRule> = new Map();
  private editingSiteRulePattern: string | null = null;
  private readonly floatingIconEdgeMargin = 24;
  private readonly floatingIconFarEdge = 9999;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    this.populateTranslationControls();

    // 绑定事件监听器
    this.bindEventListeners();
    
    // 加载当前设置
    await this.loadSettings();
    await this.loadTranslationProviderConfigs();
    
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
        const tabId = target.dataset['tab'];
        if (tabId) {
          this.switchTab(tabId);
        }
      });
    });

    // 设置保存
    const saveBtn = document.getElementById('saveSettings');
    saveBtn?.addEventListener('click', () => this.saveSettings());

    const saveProviderConfig = document.getElementById('saveProviderConfig');
    saveProviderConfig?.addEventListener('click', () => this.saveTranslationProviderConfig());

    const removeProviderConfig = document.getElementById('removeProviderConfig');
    removeProviderConfig?.addEventListener('click', () => this.removeTranslationProviderConfig());

    const saveSiteRule = document.getElementById('saveSiteRule');
    saveSiteRule?.addEventListener('click', () => this.upsertSiteTranslationRule());

    const cancelSiteRule = document.getElementById('cancelSiteRule');
    cancelSiteRule?.addEventListener('click', () => this.resetSiteRuleEditor());

    const siteRuleList = document.getElementById('siteRuleList');
    siteRuleList?.addEventListener('click', (event) => this.handleSiteRuleListClick(event));

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

    // 生词本和复习页面导航
    const viewVocabularyBtn = document.getElementById('viewVocabulary');
    viewVocabularyBtn?.addEventListener('click', () => this.openVocabularyPage());

    const startReviewBtn = document.getElementById('startReview');
    startReviewBtn?.addEventListener('click', () => this.openReviewPage());

    // 设置项变化监听
    this.bindSettingChangeListeners();
  }

  private bindSettingChangeListeners(): void {
    // 常规设置
    const targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement;
    targetLanguage?.addEventListener('change', () => this.onSettingChange());

    const documentOcrLanguage = document.getElementById('documentOcrLanguage') as HTMLSelectElement;
    documentOcrLanguage?.addEventListener('change', () => this.onSettingChange());

    const aiContextEnabled = document.getElementById('aiContextEnabled') as HTMLInputElement;
    aiContextEnabled?.addEventListener('change', () => this.onSettingChange());

    const aiTranslationDomain = document.getElementById('aiTranslationDomain') as HTMLSelectElement;
    aiTranslationDomain?.addEventListener('change', () => this.onSettingChange());

    const translationGlossary = document.getElementById('translationGlossary') as HTMLTextAreaElement;
    translationGlossary?.addEventListener('input', () => this.onSettingChange());

    const aiCustomPrompt = document.getElementById('aiCustomPrompt') as HTMLTextAreaElement;
    aiCustomPrompt?.addEventListener('input', () => this.onSettingChange());

    const translationProvider = document.getElementById('translationProvider') as HTMLSelectElement;
    translationProvider?.addEventListener('change', () => {
      this.onSettingChange();
      this.updateProviderConfigurationUI();
    });

    const pageTranslationDisplayMode = document.getElementById('pageTranslationDisplayMode') as HTMLSelectElement;
    pageTranslationDisplayMode?.addEventListener('change', () => this.onSettingChange());

    const translationStyle = document.getElementById('translationStyle') as HTMLSelectElement;
    translationStyle?.addEventListener('change', () => this.onSettingChange());

    const pageTranslationScope = document.getElementById('pageTranslationScope') as HTMLSelectElement;
    pageTranslationScope?.addEventListener('change', () => this.onSettingChange());

    const autoTranslate = document.getElementById('autoTranslate') as HTMLInputElement;
    autoTranslate?.addEventListener('change', () => this.onSettingChange());

    const showFloatingIcon = document.getElementById('showFloatingIcon') as HTMLInputElement;
    showFloatingIcon?.addEventListener('change', () => this.onSettingChange());

    const iconPosition = document.getElementById('iconPosition') as HTMLSelectElement;
    iconPosition?.addEventListener('change', () => this.onSettingChange());

    const pageTranslationExcludeSelectors = document.getElementById('pageTranslationExcludeSelectors') as HTMLTextAreaElement;
    pageTranslationExcludeSelectors?.addEventListener('input', () => this.onSettingChange());

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

  private populateTranslationControls(): void {
    const targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement | null;
    if (targetLanguage && typeof targetLanguage.replaceChildren === 'function') {
      targetLanguage.replaceChildren(
        ...TRANSLATION_LANGUAGES.map(language => {
          const option = document.createElement('option');
          option.value = language.code;
          option.textContent = language.label;
          return option;
        })
      );
    }

    const documentOcrLanguage = document.getElementById('documentOcrLanguage') as HTMLSelectElement | null;
    if (documentOcrLanguage && typeof documentOcrLanguage.replaceChildren === 'function') {
      documentOcrLanguage.replaceChildren(
        ...BUNDLED_OCR_LANGUAGES.map(language => {
          const option = document.createElement('option');
          option.value = language.code;
          option.textContent = language.label;
          return option;
        })
      );
    }

    const aiTranslationDomain = document.getElementById('aiTranslationDomain') as HTMLSelectElement | null;
    if (aiTranslationDomain && typeof aiTranslationDomain.replaceChildren === 'function') {
      aiTranslationDomain.replaceChildren(
        ...TRANSLATION_DOMAINS.map(domain => {
          const option = document.createElement('option');
          option.value = domain.code;
          option.textContent = domain.label;
          return option;
        })
      );
    }

    const translationProvider = document.getElementById('translationProvider') as HTMLSelectElement | null;
    if (translationProvider && typeof translationProvider.replaceChildren === 'function') {
      translationProvider.replaceChildren(
        ...TRANSLATION_PROVIDERS.map(provider => {
          const option = document.createElement('option');
          option.value = provider.id;
          option.textContent = provider.status === 'available' ? provider.label : `${provider.label} (planned)`;
          option.disabled = provider.status !== 'available';
          return option;
        })
      );
    }
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

  private async loadTranslationProviderConfigs(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getTranslationProviderConfigs' });
      const summaries = response?.success && Array.isArray(response.data)
        ? response.data as TranslationProviderConfigSummary[]
        : [];
      this.providerConfigSummaries = new Map(
        summaries.map(summary => [summary.providerId, summary])
      );
    } catch (error) {
      this.providerConfigSummaries.clear();
      console.error('Could not load translation provider configurations:', error);
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
      this.updateProviderConfigurationUI();
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
    if (targetLanguage) this.setSelectValue(targetLanguage, this.settings.defaultTargetLanguage, 'zh-CN');

    const documentOcrLanguage = document.getElementById('documentOcrLanguage') as HTMLSelectElement;
    if (documentOcrLanguage) {
      this.setSelectValue(documentOcrLanguage, this.settings.documentOcrLanguage || 'eng', 'eng');
    }

    const aiContextEnabled = document.getElementById('aiContextEnabled') as HTMLInputElement;
    if (aiContextEnabled) aiContextEnabled.checked = Boolean(this.settings.aiContextEnabled);

    const aiTranslationDomain = document.getElementById('aiTranslationDomain') as HTMLSelectElement;
    if (aiTranslationDomain) {
      this.setSelectValue(aiTranslationDomain, this.settings.aiTranslationDomain || 'general', 'general');
    }

    const translationGlossary = document.getElementById('translationGlossary') as HTMLTextAreaElement;
    if (translationGlossary) {
      translationGlossary.value = formatTranslationGlossary(this.settings.translationGlossary);
    }

    const aiCustomPrompt = document.getElementById('aiCustomPrompt') as HTMLTextAreaElement;
    if (aiCustomPrompt) aiCustomPrompt.value = this.settings.aiCustomPrompt || '';

    const translationProvider = document.getElementById('translationProvider') as HTMLSelectElement;
    if (translationProvider) this.setSelectValue(translationProvider, this.settings.translationProvider, 'google');

    const pageTranslationDisplayMode = document.getElementById('pageTranslationDisplayMode') as HTMLSelectElement;
    if (pageTranslationDisplayMode) {
      this.setSelectValue(pageTranslationDisplayMode, this.settings.pageTranslationDisplayMode || 'bilingual', 'bilingual');
    }

    const translationStyle = document.getElementById('translationStyle') as HTMLSelectElement;
    if (translationStyle) {
      this.setSelectValue(translationStyle, this.settings.translationStyle || 'subtle', 'subtle');
    }

    const pageTranslationScope = document.getElementById('pageTranslationScope') as HTMLSelectElement;
    if (pageTranslationScope) {
      this.setSelectValue(pageTranslationScope, this.settings.pageTranslationScope || 'main-content', 'main-content');
    }

    const autoTranslate = document.getElementById('autoTranslate') as HTMLInputElement;
    if (autoTranslate) autoTranslate.checked = this.settings.autoTranslate;

    const showFloatingIcon = document.getElementById('showFloatingIcon') as HTMLInputElement;
    if (showFloatingIcon) showFloatingIcon.checked = this.settings.showFloatingIcon;

    const pageTranslationExcludeSelectors = document.getElementById('pageTranslationExcludeSelectors') as HTMLTextAreaElement;
    if (pageTranslationExcludeSelectors) {
      pageTranslationExcludeSelectors.value = (this.settings.pageTranslationExcludeSelectors || []).join('\n');
    }

    this.siteTranslationRules = new Map();
    for (const rule of this.settings.siteTranslationRules || []) {
      const pattern = normalizeSitePattern(rule.pattern);
      if (pattern) this.siteTranslationRules.set(pattern, { ...rule, pattern });
    }
    this.renderSiteTranslationRules();
    this.resetSiteRuleEditor();

    // 根据浮动图标位置设置选择框
    const iconPosition = document.getElementById('iconPosition') as HTMLSelectElement;
    if (iconPosition && this.settings.floatingIconPosition) {
      const { x, y } = this.settings.floatingIconPosition;
      if (x >= this.floatingIconFarEdge && y >= this.floatingIconFarEdge) {
        iconPosition.value = 'bottom-right';
      } else if (x >= this.floatingIconFarEdge) {
        iconPosition.value = 'top-right';
      } else if (y >= this.floatingIconFarEdge) {
        iconPosition.value = 'bottom-left';
      } else if (x > window.innerWidth / 2 && y < window.innerHeight / 2) {
        iconPosition.value = 'top-right';
      } else if (x > window.innerWidth / 2 && y > window.innerHeight / 2) {
        iconPosition.value = 'bottom-right';
      } else if (x < window.innerWidth / 2 && y > window.innerHeight / 2) {
        iconPosition.value = 'bottom-left';
      } else {
        iconPosition.value = 'top-left';
      }
    }
  }

  private setSelectValue(select: HTMLSelectElement, value: string, fallbackValue: string): void {
    if (!select.options) {
      select.value = value || fallbackValue;
      return;
    }

    const hasValue = Array.from(select.options).some(option => option.value === value && !option.disabled);
    select.value = hasValue ? value : fallbackValue;
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

  private updateProviderConfigurationUI(): void {
    const providerId = (document.getElementById('translationProvider') as HTMLSelectElement | null)?.value || 'google';
    this.updateAiTranslationControlAvailability(providerId);
    this.updateTargetLanguageAvailability(providerId);
    const provider = getTranslationProvider(providerId);
    const panel = document.getElementById('providerConfigPanel');
    const configFields = provider?.configFields || [];
    if (!panel || !provider || configFields.length === 0) {
      if (panel) panel.hidden = true;
      return;
    }

    panel.hidden = false;
    const summary = this.providerConfigSummaries.get(providerId);
    const title = document.getElementById('providerConfigTitle');
    const status = document.getElementById('providerConfigStatus');
    const removeButton = document.getElementById('removeProviderConfig') as HTMLButtonElement | null;
    const apiKeyInput = document.getElementById('providerApiKey') as HTMLInputElement | null;
    const endpointInput = document.getElementById('providerEndpoint') as HTMLInputElement | null;
    const modelInput = document.getElementById('providerModel') as HTMLInputElement | null;
    const regionInput = document.getElementById('providerRegion') as HTMLInputElement | null;

    if (title) title.textContent = `${provider.label} configuration`;
    if (status) {
      status.textContent = summary?.configured
        ? summary.apiKeyHint ? `Configured (${summary.apiKeyHint})` : 'Configured'
        : 'Not configured';
    }
    if (removeButton) removeButton.disabled = !summary?.configured;

    this.setProviderFieldVisibility('providerApiKeyField', configFields.includes('apiKey'));
    this.setProviderFieldVisibility('providerEndpointField', configFields.includes('endpoint'));
    this.setProviderFieldVisibility('providerModelField', configFields.includes('model'));
    this.setProviderFieldVisibility('providerRegionField', configFields.includes('region'));

    if (apiKeyInput) {
      apiKeyInput.value = '';
      apiKeyInput.placeholder = summary?.configured
        ? `Saved key: ${summary.apiKeyHint}`
        : 'Enter API key';
    }
    if (endpointInput) endpointInput.value = summary?.endpoint || provider.defaultEndpoint || '';
    if (modelInput) modelInput.value = summary?.model || provider.defaultModel || '';
    if (regionInput) regionInput.value = summary?.region || '';
    this.showProviderConfigMessage('');
  }

  private updateAiTranslationControlAvailability(providerId: string): void {
    const isAiProvider = Boolean(getTranslationProvider(providerId)?.supportsAiPreferences);
    const section = document.querySelector<HTMLElement>('.ai-translation-section');
    section?.classList.toggle('is-disabled', !isAiProvider);
    section?.setAttribute('aria-disabled', String(!isAiProvider));
    [
      'aiContextEnabled',
      'aiTranslationDomain',
      'translationGlossary',
      'aiCustomPrompt'
    ].forEach(elementId => {
      const control = document.getElementById(elementId) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (control) control.disabled = !isAiProvider;
    });
  }

  private updateTargetLanguageAvailability(providerId: string): void {
    const targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement | null;
    if (!targetLanguage) return;

    const supportedCodes = new Set(getProviderTargetLanguages(providerId).map(language => language.code));
    Array.from(targetLanguage.options).forEach(option => {
      option.disabled = !supportedCodes.has(option.value);
    });
    if (!supportedCodes.has(targetLanguage.value)) {
      const fallback = supportedCodes.has('zh-CN')
        ? 'zh-CN'
        : Array.from(targetLanguage.options).find(option => !option.disabled)?.value;
      if (fallback) targetLanguage.value = fallback;
    }
  }

  private setProviderFieldVisibility(elementId: string, isVisible: boolean): void {
    const element = document.getElementById(elementId);
    if (element) element.hidden = !isVisible;
  }

  private async saveTranslationProviderConfig(): Promise<void> {
    const providerId = (document.getElementById('translationProvider') as HTMLSelectElement | null)?.value || '';
    const provider = getTranslationProvider(providerId);
    if (!provider || !provider.configFields?.length) return;

    const existingSummary = this.providerConfigSummaries.get(providerId);
    const config: TranslationProviderRuntimeConfig = {
      apiKey: (document.getElementById('providerApiKey') as HTMLInputElement | null)?.value.trim() || '',
      endpoint: (document.getElementById('providerEndpoint') as HTMLInputElement | null)?.value.trim() || '',
      model: (document.getElementById('providerModel') as HTMLInputElement | null)?.value.trim() || '',
      region: (document.getElementById('providerRegion') as HTMLInputElement | null)?.value.trim() || ''
    };

    if (provider.requiresApiKey && !config.apiKey && !existingSummary?.configured) {
      this.showProviderConfigMessage(`${provider.label} API key is required`, true);
      return;
    }

    const endpoint = config.endpoint || provider.defaultEndpoint || '';
    if (provider.configFields.includes('endpoint')) {
      const permissionGranted = await this.ensureProviderEndpointPermission(endpoint);
      if (!permissionGranted) {
        this.showProviderConfigMessage('Host access was not granted for this endpoint', true);
        return;
      }
    }

    try {
      const response = await this.sendMessage({
        action: 'updateTranslationProviderConfig',
        data: { providerId, config }
      });
      if (!response?.success) {
        this.showProviderConfigMessage(response?.error || 'Could not save provider configuration', true);
        return;
      }

      const summary = response.data as TranslationProviderConfigSummary;
      this.providerConfigSummaries.set(providerId, summary);
      this.updateProviderConfigurationUI();
      this.showProviderConfigMessage(`${provider.label} configuration saved locally`);
    } catch (error) {
      this.showProviderConfigMessage(
        error instanceof Error ? error.message : 'Could not save provider configuration',
        true
      );
    }
  }

  private async removeTranslationProviderConfig(): Promise<void> {
    const providerId = (document.getElementById('translationProvider') as HTMLSelectElement | null)?.value || '';
    const provider = getTranslationProvider(providerId);
    if (!provider || !this.providerConfigSummaries.get(providerId)?.configured) return;

    try {
      const response = await this.sendMessage({
        action: 'removeTranslationProviderConfig',
        data: { providerId }
      });
      if (!response?.success) {
        this.showProviderConfigMessage(response?.error || 'Could not remove provider configuration', true);
        return;
      }

      this.providerConfigSummaries.delete(providerId);
      this.updateProviderConfigurationUI();
      this.showProviderConfigMessage(`${provider.label} configuration removed`);
    } catch (error) {
      this.showProviderConfigMessage(
        error instanceof Error ? error.message : 'Could not remove provider configuration',
        true
      );
    }
  }

  private async ensureProviderEndpointPermission(endpoint: string): Promise<boolean> {
    let endpointUrl: URL;
    try {
      endpointUrl = new URL(endpoint);
      const isLocalHttp = endpointUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpointUrl.hostname);
      if ((endpointUrl.protocol !== 'https:' && !isLocalHttp) || endpointUrl.username || endpointUrl.password) {
        return false;
      }
    } catch (error) {
      return false;
    }

    const preGrantedOrigins = [
      'https://api-free.deepl.com',
      'https://api.deepl.com',
      'https://api.cognitive.microsofttranslator.com',
      'https://api.openai.com',
      'https://generativelanguage.googleapis.com'
    ];
    if (preGrantedOrigins.includes(endpointUrl.origin)) return true;
    if (!chrome.permissions?.request) return false;

    const originPattern = `${endpointUrl.protocol}//${endpointUrl.hostname}/*`;
    return new Promise<boolean>(resolve => {
      chrome.permissions.request({ origins: [originPattern] }, resolve);
    });
  }

  private showProviderConfigMessage(message: string, isError: boolean = false): void {
    const element = document.getElementById('providerConfigMessage');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', isError);
  }

  private handleSiteRuleListClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLButtonElement>('button[data-site-rule-action]');
    const action = button?.dataset['siteRuleAction'];
    const pattern = button?.dataset['siteRulePattern'];
    if (!action || !pattern) return;

    if (action === 'edit') {
      this.editSiteTranslationRule(pattern);
    } else if (action === 'delete') {
      void this.deleteSiteTranslationRule(pattern);
    }
  }

  private editSiteTranslationRule(pattern: string): void {
    const rule = this.siteTranslationRules.get(pattern);
    if (!rule) return;

    this.editingSiteRulePattern = pattern;
    const patternInput = document.getElementById('siteRulePattern') as HTMLInputElement | null;
    const enabledInput = document.getElementById('siteRuleTranslationEnabled') as HTMLInputElement | null;
    const displayMode = document.getElementById('siteRuleDisplayMode') as HTMLSelectElement | null;
    const translationStyle = document.getElementById('siteRuleTranslationStyle') as HTMLSelectElement | null;
    const translationScope = document.getElementById('siteRuleTranslationScope') as HTMLSelectElement | null;
    const excludeSelectors = document.getElementById('siteRuleExcludeSelectors') as HTMLTextAreaElement | null;
    const saveButton = document.getElementById('saveSiteRule') as HTMLButtonElement | null;
    const cancelButton = document.getElementById('cancelSiteRule') as HTMLButtonElement | null;

    if (patternInput) patternInput.value = rule.pattern;
    if (enabledInput) enabledInput.checked = rule.translationEnabled !== false;
    if (displayMode) displayMode.value = rule.displayMode || '';
    if (translationStyle) translationStyle.value = rule.translationStyle || '';
    if (translationScope) translationScope.value = rule.translationScope || '';
    if (excludeSelectors) excludeSelectors.value = (rule.excludeSelectors || []).join('\n');
    if (saveButton) saveButton.textContent = 'Update rule';
    if (cancelButton) cancelButton.hidden = false;
    this.showSiteRuleMessage('');
    patternInput?.focus();
  }

  private async upsertSiteTranslationRule(): Promise<void> {
    const patternInput = document.getElementById('siteRulePattern') as HTMLInputElement | null;
    const pattern = normalizeSitePattern(patternInput?.value || '');
    if (!pattern) {
      this.showSiteRuleMessage('Enter a valid domain or wildcard domain', true);
      return;
    }

    const previousRules = new Map(this.siteTranslationRules);
    const enabledInput = document.getElementById('siteRuleTranslationEnabled') as HTMLInputElement | null;
    const displayModeValue = (document.getElementById('siteRuleDisplayMode') as HTMLSelectElement | null)?.value || '';
    const translationStyleValue = (document.getElementById('siteRuleTranslationStyle') as HTMLSelectElement | null)?.value || '';
    const translationScopeValue = (document.getElementById('siteRuleTranslationScope') as HTMLSelectElement | null)?.value || '';
    const excludeSelectors = this.parseSelectorList(
      (document.getElementById('siteRuleExcludeSelectors') as HTMLTextAreaElement | null)?.value || ''
    );

    const rule: SiteTranslationRule = {
      pattern,
      translationEnabled: enabledInput?.checked !== false,
      ...(displayModeValue ? { displayMode: displayModeValue as PageTranslationDisplayMode } : {}),
      ...(translationStyleValue ? { translationStyle: translationStyleValue as TranslationStylePreset } : {}),
      ...(translationScopeValue ? { translationScope: translationScopeValue as PageTranslationScope } : {}),
      ...(excludeSelectors.length > 0 ? { excludeSelectors } : {})
    };

    if (this.editingSiteRulePattern && this.editingSiteRulePattern !== pattern) {
      this.siteTranslationRules.delete(this.editingSiteRulePattern);
    }
    this.siteTranslationRules.set(pattern, rule);
    this.renderSiteTranslationRules();

    const saved = await this.saveSettings('Site rule saved');
    if (!saved) {
      this.siteTranslationRules = previousRules;
      this.renderSiteTranslationRules();
      return;
    }

    this.resetSiteRuleEditor();
    this.showSiteRuleMessage('Site rule saved');
  }

  private async deleteSiteTranslationRule(pattern: string): Promise<void> {
    if (!this.siteTranslationRules.has(pattern)) return;

    const previousRules = new Map(this.siteTranslationRules);
    this.siteTranslationRules.delete(pattern);
    this.renderSiteTranslationRules();

    const saved = await this.saveSettings('Site rule deleted');
    if (!saved) {
      this.siteTranslationRules = previousRules;
      this.renderSiteTranslationRules();
      return;
    }

    if (this.editingSiteRulePattern === pattern) this.resetSiteRuleEditor();
    this.showSiteRuleMessage('Site rule deleted');
  }

  private resetSiteRuleEditor(): void {
    this.editingSiteRulePattern = null;
    const patternInput = document.getElementById('siteRulePattern') as HTMLInputElement | null;
    const enabledInput = document.getElementById('siteRuleTranslationEnabled') as HTMLInputElement | null;
    const displayMode = document.getElementById('siteRuleDisplayMode') as HTMLSelectElement | null;
    const translationStyle = document.getElementById('siteRuleTranslationStyle') as HTMLSelectElement | null;
    const translationScope = document.getElementById('siteRuleTranslationScope') as HTMLSelectElement | null;
    const excludeSelectors = document.getElementById('siteRuleExcludeSelectors') as HTMLTextAreaElement | null;
    const saveButton = document.getElementById('saveSiteRule') as HTMLButtonElement | null;
    const cancelButton = document.getElementById('cancelSiteRule') as HTMLButtonElement | null;

    if (patternInput) patternInput.value = '';
    if (enabledInput) enabledInput.checked = true;
    if (displayMode) displayMode.value = '';
    if (translationStyle) translationStyle.value = '';
    if (translationScope) translationScope.value = '';
    if (excludeSelectors) excludeSelectors.value = '';
    if (saveButton) saveButton.textContent = 'Add rule';
    if (cancelButton) cancelButton.hidden = true;
    this.showSiteRuleMessage('');
  }

  private renderSiteTranslationRules(): void {
    const list = document.getElementById('siteRuleList');
    if (!list) return;
    list.replaceChildren();

    const rules = Array.from(this.siteTranslationRules.values())
      .sort((left, right) => left.pattern.localeCompare(right.pattern));
    if (rules.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'site-rule-empty';
      empty.textContent = 'No site rules';
      list.appendChild(empty);
      return;
    }

    const displayLabels: Record<PageTranslationDisplayMode, string> = {
      bilingual: 'Bilingual',
      'translation-only': 'Translation only',
      'original-only': 'Original only'
    };
    const styleLabels: Record<TranslationStylePreset, string> = {
      subtle: 'Subtle',
      highlight: 'Highlight',
      plain: 'Plain text'
    };
    const scopeLabels: Record<PageTranslationScope, string> = {
      'main-content': 'Main content',
      'whole-page': 'Whole page'
    };

    for (const rule of rules) {
      const row = document.createElement('div');
      row.className = 'site-rule-row';

      const summary = document.createElement('div');
      summary.className = 'site-rule-summary';
      const pattern = document.createElement('strong');
      pattern.textContent = rule.pattern;
      const details = document.createElement('span');
      details.textContent = [
        rule.translationEnabled === false ? 'Blocked' : 'Allowed',
        rule.displayMode ? displayLabels[rule.displayMode] : 'Global display',
        rule.translationStyle ? styleLabels[rule.translationStyle] : 'Global style',
        rule.translationScope ? scopeLabels[rule.translationScope] : 'Global scope',
        `${rule.excludeSelectors?.length || 0} exclusions`
      ].join(' | ');
      summary.append(pattern, details);

      const actions = document.createElement('div');
      actions.className = 'site-rule-actions';
      const editButton = this.createSiteRuleActionButton('Edit', 'edit', rule.pattern, 'secondary-btn');
      const deleteButton = this.createSiteRuleActionButton('Delete', 'delete', rule.pattern, 'danger-btn');
      actions.append(editButton, deleteButton);
      row.append(summary, actions);
      list.appendChild(row);
    }
  }

  private createSiteRuleActionButton(
    label: string,
    action: 'edit' | 'delete',
    pattern: string,
    className: string
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.dataset['siteRuleAction'] = action;
    button.dataset['siteRulePattern'] = pattern;
    return button;
  }

  private showSiteRuleMessage(message: string, isError: boolean = false): void {
    const element = document.getElementById('siteRuleMessage');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', isError);
  }

  private async saveSettings(successMessage: string = '设置保存成功'): Promise<boolean> {
    try {
      const settings = this.collectSettingsFromUI();
      const provider = getTranslationProvider(settings.translationProvider);
      if (provider?.configFields?.length && !this.providerConfigSummaries.get(provider.id)?.configured) {
        this.showMessage(`Save ${provider.label} provider configuration before selecting it`, 'error');
        return false;
      }
      const response = await this.sendMessage({
        action: 'updateSettings',
        data: settings
      });

      if (response.success) {
        this.settings = settings;
        this.showMessage(successMessage, 'success');
        return true;
      } else {
        this.showMessage('设置保存失败: ' + response.error, 'error');
        return false;
      }
    } catch (error) {
      console.error('保存设置失败:', error);
      this.showMessage('设置保存失败', 'error');
      return false;
    }
  }

  private collectSettingsFromUI(): UserSettings {
    const targetLanguage = (document.getElementById('targetLanguage') as HTMLSelectElement)?.value || 'zh-CN';
    const selectedOcrLanguage = (document.getElementById('documentOcrLanguage') as HTMLSelectElement)?.value;
    const documentOcrLanguage = BUNDLED_OCR_LANGUAGES.some(language => language.code === selectedOcrLanguage)
      ? selectedOcrLanguage as BundledOcrLanguageCode
      : 'eng';
    const aiContextEnabled = (document.getElementById('aiContextEnabled') as HTMLInputElement)?.checked || false;
    const selectedDomain = (document.getElementById('aiTranslationDomain') as HTMLSelectElement)?.value;
    const aiTranslationDomain = TRANSLATION_DOMAINS.some(domain => domain.code === selectedDomain)
      ? selectedDomain as TranslationDomain
      : 'general';
    const translationGlossary = parseTranslationGlossary(
      (document.getElementById('translationGlossary') as HTMLTextAreaElement)?.value || ''
    );
    const aiCustomPrompt = (
      (document.getElementById('aiCustomPrompt') as HTMLTextAreaElement)?.value || ''
    ).trim().slice(0, 2000);
    const translationProvider = (document.getElementById('translationProvider') as HTMLSelectElement)?.value || 'google';
    const pageTranslationDisplayMode = (
      (document.getElementById('pageTranslationDisplayMode') as HTMLSelectElement)?.value || 'bilingual'
    ) as PageTranslationDisplayMode;
    const translationStyle = (
      (document.getElementById('translationStyle') as HTMLSelectElement)?.value || 'subtle'
    ) as TranslationStylePreset;
    const pageTranslationScope = (
      (document.getElementById('pageTranslationScope') as HTMLSelectElement)?.value || 'main-content'
    ) as PageTranslationScope;
    const autoTranslate = (document.getElementById('autoTranslate') as HTMLInputElement)?.checked || false;
    const showFloatingIconInput = document.getElementById('showFloatingIcon') as HTMLInputElement | null;
    const showFloatingIcon = showFloatingIconInput ? showFloatingIconInput.checked : true;
    const learningModeEnabled = (document.getElementById('learningModeEnabled') as HTMLInputElement)?.checked || false;
    const dailyGoal = parseInt((document.getElementById('dailyGoal') as HTMLInputElement)?.value || '20');
    const pageTranslationExcludeSelectors = this.parseSelectorList(
      (document.getElementById('pageTranslationExcludeSelectors') as HTMLTextAreaElement)?.value || ''
    );

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
      documentOcrLanguage,
      aiContextEnabled,
      aiTranslationDomain,
      translationGlossary,
      aiCustomPrompt,
      translationProvider: translationProvider,
      pageTranslationDisplayMode: pageTranslationDisplayMode,
      translationStyle,
      pageTranslationScope,
      autoTranslate: autoTranslate,
      showFloatingIcon: showFloatingIcon,
      floatingIconPosition: this.getSelectedFloatingIconPosition(),
      pageTranslationExcludeSelectors,
      siteTranslationRules: Array.from(this.siteTranslationRules.values())
        .sort((left, right) => left.pattern.localeCompare(right.pattern)),
      learningModeEnabled: learningModeEnabled,
      activeDictionaries: activeDictionaries,
      highlightColors: highlightColors,
      dailyGoal: dailyGoal,
      reviewInterval: (document.getElementById('reviewInterval') as HTMLSelectElement)?.value || 'spaced',
      difficultyAdjustment: (document.getElementById('difficultyAdjustment') as HTMLSelectElement)?.value || 'auto'
    };
  }

  private getSelectedFloatingIconPosition(): { x: number; y: number } {
    const selectedPosition = (document.getElementById('iconPosition') as HTMLSelectElement)?.value || 'bottom-right';

    switch (selectedPosition) {
      case 'top-left':
        return { x: this.floatingIconEdgeMargin, y: this.floatingIconEdgeMargin };
      case 'top-right':
        return { x: this.floatingIconFarEdge, y: this.floatingIconEdgeMargin };
      case 'bottom-left':
        return { x: this.floatingIconEdgeMargin, y: this.floatingIconFarEdge };
      case 'bottom-right':
      default:
        return { x: this.floatingIconFarEdge, y: this.floatingIconFarEdge };
    }
  }

  private parseSelectorList(value: string): string[] {
    const seen = new Set<string>();

    return value
      .split(/[\n,]+/)
      .map(selector => selector.trim())
      .filter(Boolean)
      .filter(selector => {
        if (seen.has(selector)) return false;
        seen.add(selector);
        return true;
      });
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
            await this.loadTranslationProviderConfigs();
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

  private openVocabularyPage(): void {
    chrome.tabs.create({
      url: chrome.runtime.getURL('vocabulary.html')
    });
  }

  private openReviewPage(): void {
    chrome.tabs.create({
      url: chrome.runtime.getURL('review.html')
    });
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
