// 存储管理器

export interface UserSettings {
  defaultTargetLanguage: string;
  translationProvider: string;
  floatingIconPosition: { x: number; y: number };
  learningModeEnabled: boolean;
  activeDictionaries: string[];
  highlightColors: { [key: string]: string };
  autoTranslate: boolean;
  showFloatingIcon: boolean;
}

export interface UserData {
  settings: UserSettings;
  vocabulary: any[];
  learningStats: any;
  dictionaryProgress: { [key: string]: any };
}

export class StorageManager {
  private defaultSettings: UserSettings = {
    defaultTargetLanguage: 'zh-CN',
    translationProvider: 'google',
    floatingIconPosition: { x: 20, y: 20 },
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
    showFloatingIcon: true
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

  async exportData(): Promise<string> {
    try {
      const userData = await this.loadUserData();
      
      // 创建导出数据对象
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: userData
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('导出数据失败:', error);
      throw new Error('无法导出数据');
    }
  }

  async importData(jsonData: string): Promise<void> {
    try {
      const importData = JSON.parse(jsonData);
      
      // 验证数据格式
      if (!importData.data || !importData.version) {
        throw new Error('无效的数据格式');
      }

      // 备份当前数据
      const currentData = await this.loadUserData();
      await chrome.storage.local.set({ backup: currentData });

      // 导入新数据
      await this.saveUserData(importData.data);
      
      console.log('数据导入成功');
    } catch (error) {
      console.error('导入数据失败:', error);
      throw new Error('无法导入数据：' + (error instanceof Error ? error.message : '未知错误'));
    }
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
      
      // 同步到云端存储
      await chrome.storage.sync.set(localData);
      
      console.log('数据同步成功');
    } catch (error) {
      console.error('数据同步失败:', error);
      throw new Error('无法同步数据');
    }
  }

  // 监听存储变化
  onStorageChanged(callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' || areaName === 'local') {
        callback(changes);
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