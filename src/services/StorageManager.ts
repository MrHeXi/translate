// 存储管理器

import {
  getTranslationProvider,
  isAvailableTranslationProvider,
  TranslationProviderRuntimeConfig
} from './TranslationProviderRegistry';
import type {
  PageTranslationDisplayMode,
  PageTranslationScope,
  SiteTranslationRule,
  TranslationStylePreset
} from './TranslationPreferences';

export type {
  PageTranslationDisplayMode,
  PageTranslationScope,
  SiteTranslationRule,
  TranslationStylePreset
} from './TranslationPreferences';

export interface UserSettings {
  defaultTargetLanguage: string;
  translationProvider: string;
  pageTranslationDisplayMode: PageTranslationDisplayMode;
  floatingIconPosition: { x: number; y: number };
  learningModeEnabled: boolean;
  activeDictionaries: string[];
  highlightColors: { [key: string]: string };
  autoTranslate: boolean;
  showFloatingIcon: boolean;
  pageTranslationExcludeSelectors?: string[];
  translationStyle?: TranslationStylePreset;
  pageTranslationScope?: PageTranslationScope;
  siteTranslationRules?: SiteTranslationRule[];
}

export interface TranslationProviderConfigSummary {
  providerId: string;
  configured: boolean;
  apiKeyHint: string;
  endpoint: string;
  model: string;
  region: string;
}

export interface UserData {
  settings: UserSettings;
  vocabulary: any[];
  learningStats: any;
  dictionaryProgress: { [key: string]: any };
}

export class StorageManager {
  private readonly providerConfigStorageKey = 'translationProviderConfigs';
  private defaultSettings: UserSettings = {
    defaultTargetLanguage: 'zh-CN',
    translationProvider: 'google',
    pageTranslationDisplayMode: 'bilingual',
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
    autoTranslate: false,
    showFloatingIcon: true,
    pageTranslationExcludeSelectors: [],
    translationStyle: 'subtle',
    pageTranslationScope: 'main-content',
    siteTranslationRules: []
  };

  async saveUserData(data: Partial<UserData>): Promise<void> {
    try {
      await chrome.storage.sync.set(data);
      console.log('用户数据保存成功');
    } catch (error) {
      console.error('保存用户数据失败:', error);
      // 如果同步存储失败，尝试本地存储
      try {
        await chrome.storage.local.set(data);
        console.log('用户数据已保存到本地存储');
      } catch (localError) {
        console.error('本地存储也失败:', localError);
        throw new Error('无法保存用户数据');
      }
    }
  }

  async loadUserData(): Promise<UserData> {
    try {
      // 首先尝试从同步存储加载
      let result = await chrome.storage.sync.get(null);
      
      // 如果同步存储为空，尝试本地存储
      if (Object.keys(result).length === 0) {
        result = await chrome.storage.local.get(null);
      }

      // 合并默认设置
      const userData: UserData = {
        settings: { ...this.defaultSettings, ...result['settings'] },
        vocabulary: result['vocabulary'] || [],
        learningStats: result['learningStats'] || {},
        dictionaryProgress: result['dictionaryProgress'] || {}
      };

      return userData;
    } catch (error) {
      console.error('加载用户数据失败:', error);
      // 返回默认数据
      return {
        settings: this.defaultSettings,
        vocabulary: [],
        learningStats: {},
        dictionaryProgress: {}
      };
    }
  }

  async saveSettings(settings: Partial<UserSettings>): Promise<void> {
    try {
      const currentData = await this.loadUserData();
      const updatedSettings = { ...currentData.settings, ...settings };
      
      await this.saveUserData({ settings: updatedSettings });
    } catch (error) {
      console.error('保存设置失败:', error);
      throw new Error('无法保存设置');
    }
  }

  async getSettings(): Promise<UserSettings> {
    const userData = await this.loadUserData();
    return userData.settings;
  }

  async getTranslationProviderConfig(providerId: string): Promise<TranslationProviderRuntimeConfig | undefined> {
    const configs = await this.loadTranslationProviderConfigs();
    const config = configs[providerId];
    return config ? { ...config } : undefined;
  }

  async getTranslationProviderConfigSummaries(): Promise<TranslationProviderConfigSummary[]> {
    const configs = await this.loadTranslationProviderConfigs();

    return Object.entries(configs).map(([providerId, config]) => ({
      providerId,
      configured: Boolean(config.apiKey?.trim()),
      apiKeyHint: this.maskApiKey(config.apiKey || ''),
      endpoint: config.endpoint || '',
      model: config.model || '',
      region: config.region || ''
    }));
  }

  async saveTranslationProviderConfig(
    providerId: string,
    config: TranslationProviderRuntimeConfig
  ): Promise<TranslationProviderConfigSummary> {
    if (!isAvailableTranslationProvider(providerId)) {
      throw new Error('Unknown or unavailable translation provider');
    }

    const provider = getTranslationProvider(providerId)!;
    const configs = await this.loadTranslationProviderConfigs();
    const currentConfig = configs[providerId] || {};
    const apiKey = config.apiKey?.trim() || currentConfig.apiKey?.trim() || '';
    if (provider.requiresApiKey && !apiKey) {
      throw new Error(`${provider.label} API key is required`);
    }

    const savedConfig: TranslationProviderRuntimeConfig = {
      apiKey,
      endpoint: config.endpoint?.trim() || currentConfig.endpoint || provider.defaultEndpoint || '',
      model: config.model?.trim() || currentConfig.model || provider.defaultModel || '',
      region: config.region?.trim() || currentConfig.region || ''
    };
    configs[providerId] = savedConfig;
    await chrome.storage.local.set({ [this.providerConfigStorageKey]: configs });

    return {
      providerId,
      configured: true,
      apiKeyHint: this.maskApiKey(apiKey),
      endpoint: savedConfig.endpoint || '',
      model: savedConfig.model || '',
      region: savedConfig.region || ''
    };
  }

  async removeTranslationProviderConfig(providerId: string): Promise<void> {
    const configs = await this.loadTranslationProviderConfigs();
    delete configs[providerId];
    await chrome.storage.local.set({ [this.providerConfigStorageKey]: configs });
  }

  async exportData(): Promise<string> {
    try {
      const userData = await this.loadUserData();
      
      // 深度复制并序列化日期对象
      const serializedData = this.serializeDates(userData);
      
      // 创建导出数据对象
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: serializedData
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('导出数据失败:', error);
      throw new Error('无法导出数据');
    }
  }

  // 递归序列化日期对象为ISO字符串
  private serializeDates(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.serializeDates(item));
    }
    
    if (typeof obj === 'object') {
      const serialized: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          serialized[key] = this.serializeDates(obj[key]);
        }
      }
      return serialized;
    }
    
    return obj;
  }

  async importData(jsonData: string): Promise<void> {
    try {
      const importData = JSON.parse(jsonData);
      
      // 验证数据格式
      if (!importData.data || !importData.version) {
        throw new Error('无效的数据格式');
      }

      // 反序列化日期字符串为Date对象
      const deserializedData = this.deserializeDates(importData.data);

      // 备份当前数据
      const currentData = await this.loadUserData();
      await chrome.storage.local.set({ backup: currentData });

      // 导入新数据
      await this.saveUserData(deserializedData);
      
      console.log('数据导入成功');
    } catch (error) {
      console.error('导入数据失败:', error);
      throw new Error('无法导入数据：' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  // 递归反序列化ISO字符串为Date对象
  private deserializeDates(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    // 检查是否为ISO日期字符串
    if (typeof obj === 'string' && this.isISODateString(obj)) {
      return new Date(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deserializeDates(item));
    }
    
    if (typeof obj === 'object') {
      const deserialized: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          deserialized[key] = this.deserializeDates(obj[key]);
        }
      }
      return deserialized;
    }
    
    return obj;
  }

  // 检查字符串是否为ISO日期格式
  private isISODateString(str: string): boolean {
    // 匹配ISO 8601日期格式：YYYY-MM-DDTHH:mm:ss.sssZ 或 YYYY-MM-DDTHH:mm:ssZ
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    return isoDateRegex.test(str) && !isNaN(Date.parse(str));
  }

  private async loadTranslationProviderConfigs(): Promise<Record<string, TranslationProviderRuntimeConfig>> {
    const result = await chrome.storage.local.get(this.providerConfigStorageKey);
    const configs = result[this.providerConfigStorageKey];
    return configs && typeof configs === 'object' ? { ...configs } : {};
  }

  private maskApiKey(apiKey: string): string {
    if (!apiKey) return '';
    if (apiKey.length <= 8) return '*'.repeat(Math.max(4, apiKey.length));
    return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
  }

  async clearAllData(): Promise<void> {
    try {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      console.log('所有数据已清除');
    } catch (error) {
      console.error('清除数据失败:', error);
      throw new Error('无法清除数据');
    }
  }

  async getStorageUsage(): Promise<{ sync: number; local: number }> {
    try {
      const syncUsage = await chrome.storage.sync.getBytesInUse();
      const localUsage = await chrome.storage.local.getBytesInUse();
      
      return {
        sync: syncUsage,
        local: localUsage
      };
    } catch (error) {
      console.error('获取存储使用情况失败:', error);
      return { sync: 0, local: 0 };
    }
  }

  async syncData(): Promise<void> {
    try {
      // 从本地存储获取数据
      const localData = await chrome.storage.local.get(null);
      const syncableData = { ...localData };
      delete syncableData[this.providerConfigStorageKey];
      
      // 同步到云端存储
      await chrome.storage.sync.set(syncableData);
      
      console.log('数据同步成功');
    } catch (error) {
      console.error('数据同步失败:', error);
      throw new Error('无法同步数据');
    }
  }

  // 监听存储变化
  onStorageChanged(callback: (_changes: { [key: string]: chrome.storage.StorageChange }) => void): void {
    chrome.storage.onChanged.addListener((_changes, areaName) => {
      if (areaName === 'sync' || areaName === 'local') {
        callback(_changes);
      }
    });
  }

  // 获取特定键的值
  async getValue(key: string): Promise<any> {
    try {
      const result = await chrome.storage.sync.get(key);
      if (result[key] !== undefined) {
        return result[key];
      }
      
      // 如果同步存储中没有，尝试本地存储
      const localResult = await chrome.storage.local.get(key);
      return localResult[key];
    } catch (error) {
      console.error(`获取值失败: ${key}`, error);
      return undefined;
    }
  }

  // 设置特定键的值
  async setValue(key: string, value: any): Promise<void> {
    try {
      await chrome.storage.sync.set({ [key]: value });
    } catch (error) {
      console.error(`设置值失败: ${key}`, error);
      // 如果同步存储失败，尝试本地存储
      await chrome.storage.local.set({ [key]: value });
    }
  }
}
