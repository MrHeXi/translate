// 离线模式管理器
// 负责处理网络断开时的功能降级和缓存管理

export interface OfflineCapability {
  translation: boolean;
  vocabulary: boolean;
  learning: boolean;
  sync: boolean;
}

export interface OfflineData {
  translations: Map<string, any>;
  vocabulary: any[];
  settings: any;
  lastSyncTime: Date;
}

export class OfflineManager {
  private isOnline: boolean = navigator.onLine;
  private offlineCapabilities: OfflineCapability = {
    translation: true,  // 使用缓存翻译
    vocabulary: true,   // 本地词汇管理
    learning: true,     // 本地学习进度
    sync: false         // 离线时无法同步
  };
  
  private offlineQueue: Array<{
    action: string;
    data: any;
    timestamp: Date;
    retryCount: number;
  }> = [];

  private maxQueueSize: number = 1000;
  private maxRetryCount: number = 3;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupNetworkListeners();
    this.startPeriodicSync();
  }

  // 检查是否在线
  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  // 检查特定功能是否可用
  isFeatureAvailable(feature: keyof OfflineCapability): boolean {
    if (this.isOnline) {
      return true; // 在线时所有功能都可用
    }
    return this.offlineCapabilities[feature];
  }

  // 添加操作到离线队列
  queueOperation(action: string, data: any): void {
    if (this.offlineQueue.length >= this.maxQueueSize) {
      // 移除最旧的操作
      this.offlineQueue.shift();
    }

    this.offlineQueue.push({
      action,
      data,
      timestamp: new Date(),
      retryCount: 0
    });

    console.log(`操作已加入离线队列: ${action}`);
  }

  // 处理离线翻译请求
  async handleOfflineTranslation(text: string, targetLang: string): Promise<any> {
    // 检查本地缓存
    const cacheKey = `${text}_${targetLang}`;
    const cachedTranslation = await this.getCachedTranslation(cacheKey);
    
    if (cachedTranslation) {
      return {
        success: true,
        data: cachedTranslation,
        source: 'cache'
      };
    }

    // 如果没有缓存，返回错误或提供基本功能
    return {
      success: false,
      error: '离线模式下无法翻译新内容，请连接网络',
      suggestion: '您可以查看已缓存的翻译或使用生词本功能'
    };
  }

  // 处理离线词汇操作
  async handleOfflineVocabulary(operation: string, data: any): Promise<any> {
    try {
      // 离线时词汇操作直接使用本地存储
      switch (operation) {
        case 'add':
          await this.addVocabularyOffline(data);
          break;
        case 'remove':
          await this.removeVocabularyOffline(data.word);
          break;
        case 'update':
          await this.updateVocabularyOffline(data);
          break;
        case 'list':
          return await this.getVocabularyOffline();
      }

      // 将操作加入同步队列
      this.queueOperation(`vocabulary_${operation}`, data);

      return { success: true, offline: true };
    } catch (error) {
      throw new Error(`离线词汇操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 网络恢复时同步数据
  async syncWhenOnline(): Promise<void> {
    if (!this.isOnline || this.offlineQueue.length === 0) {
      return;
    }

    console.log(`开始同步 ${this.offlineQueue.length} 个离线操作`);
    
    const operationsToSync = [...this.offlineQueue];
    const successfulOperations: number[] = [];

    for (let i = 0; i < operationsToSync.length; i++) {
      const operation = operationsToSync[i]!;
      
      try {
        await this.syncSingleOperation(operation);
        successfulOperations.push(i);
        console.log(`同步成功: ${operation.action}`);
      } catch (error) {
        operation.retryCount++;
        console.error(`同步失败: ${operation.action}`, error);
        
        // 如果重试次数超过限制，从队列中移除
        if (operation.retryCount >= this.maxRetryCount) {
          successfulOperations.push(i);
          console.warn(`操作重试次数超限，已丢弃: ${operation.action}`);
        }
      }
    }

    // 移除已成功同步的操作
    successfulOperations.reverse().forEach(index => {
      this.offlineQueue.splice(index, 1);
    });

    if (successfulOperations.length > 0) {
      console.log(`同步完成，成功: ${successfulOperations.length}，剩余: ${this.offlineQueue.length}`);
    }
  }

  // 获取离线状态信息
  getOfflineStatus(): {
    isOnline: boolean;
    queuedOperations: number;
    capabilities: OfflineCapability;
    lastSyncAttempt?: Date;
  } {
    return {
      isOnline: this.isOnline,
      queuedOperations: this.offlineQueue.length,
      capabilities: this.offlineCapabilities,
      lastSyncAttempt: this.getLastSyncAttempt()
    };
  }

  // 清空离线队列
  clearOfflineQueue(): void {
    this.offlineQueue = [];
    console.log('离线队列已清空');
  }

  // 导出离线数据
  async exportOfflineData(): Promise<string> {
    const offlineData = {
      queue: this.offlineQueue,
      capabilities: this.offlineCapabilities,
      exportTime: new Date().toISOString(),
      isOnline: this.isOnline
    };

    return JSON.stringify(offlineData, null, 2);
  }

  // 设置网络监听器
  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      console.log('网络已连接');
      this.isOnline = true;
      this.onNetworkStatusChange(true);
    });

    window.addEventListener('offline', () => {
      console.log('网络已断开');
      this.isOnline = false;
      this.onNetworkStatusChange(false);
    });

    // 定期检查网络状态
    setInterval(() => {
      const currentStatus = navigator.onLine;
      if (currentStatus !== this.isOnline) {
        this.isOnline = currentStatus;
        this.onNetworkStatusChange(currentStatus);
      }
    }, 30000); // 每30秒检查一次
  }

  private onNetworkStatusChange(isOnline: boolean): void {
    // 通知其他组件网络状态变化
    chrome.runtime.sendMessage({
      action: 'networkStatusChanged',
      data: { isOnline, timestamp: new Date() }
    });

    if (isOnline) {
      // 网络恢复时尝试同步
      setTimeout(() => {
        this.syncWhenOnline();
      }, 2000); // 延迟2秒确保网络稳定
    }
  }

  private startPeriodicSync(): void {
    // 每5分钟尝试同步一次（如果在线）
    this.syncInterval = setInterval(() => {
      if (this.isOnline && this.offlineQueue.length > 0) {
        this.syncWhenOnline();
      }
    }, 5 * 60 * 1000);
  }

  private async syncSingleOperation(operation: any): Promise<void> {
    // 发送操作到后台脚本进行同步
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'syncOfflineOperation',
        data: operation
      }, (response) => {
        if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || '同步操作失败'));
        }
      });
    });
  }

  private async getCachedTranslation(cacheKey: string): Promise<any> {
    try {
      const result = await chrome.storage.local.get(`translation_${cacheKey}`);
      return result[`translation_${cacheKey}`] || null;
    } catch (error) {
      console.error('获取缓存翻译失败:', error);
      return null;
    }
  }

  private async addVocabularyOffline(vocabularyItem: any): Promise<void> {
    try {
      const result = await chrome.storage.local.get('offline_vocabulary');
      const vocabulary = result['offline_vocabulary'] || [];
      
      // 检查是否已存在
      const existingIndex = vocabulary.findIndex((item: any) => 
        item.word.toLowerCase() === vocabularyItem.word.toLowerCase()
      );
      
      if (existingIndex >= 0) {
        vocabulary[existingIndex] = vocabularyItem;
      } else {
        vocabulary.push(vocabularyItem);
      }
      
      await chrome.storage.local.set({ offline_vocabulary: vocabulary });
    } catch (error) {
      throw new Error(`离线添加词汇失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async removeVocabularyOffline(word: string): Promise<void> {
    try {
      const result = await chrome.storage.local.get('offline_vocabulary');
      const vocabulary = result['offline_vocabulary'] || [];
      
      const filteredVocabulary = vocabulary.filter((item: any) => 
        item.word.toLowerCase() !== word.toLowerCase()
      );
      
      await chrome.storage.local.set({ offline_vocabulary: filteredVocabulary });
    } catch (error) {
      throw new Error(`离线删除词汇失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async updateVocabularyOffline(vocabularyItem: any): Promise<void> {
    // 更新操作与添加操作相同
    await this.addVocabularyOffline(vocabularyItem);
  }

  private async getVocabularyOffline(): Promise<any[]> {
    try {
      const result = await chrome.storage.local.get('offline_vocabulary');
      return result['offline_vocabulary'] || [];
    } catch (error) {
      console.error('获取离线词汇失败:', error);
      return [];
    }
  }

  private getLastSyncAttempt(): Date | undefined {
    // 从存储中获取最后同步时间
    try {
      const stored = localStorage.getItem('lastSyncAttempt');
      return stored ? new Date(stored) : undefined;
    } catch {
      return undefined;
    }
  }

  // 显示离线模式通知
  showOfflineNotification(): void {
    const notification = document.createElement('div');
    notification.className = 'offline-notification';
    notification.innerHTML = `
      <div class="offline-icon">📡</div>
      <div class="offline-message">
        <div class="offline-title">离线模式</div>
        <div class="offline-subtitle">部分功能受限，数据将在网络恢复后同步</div>
      </div>
    `;

    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      left: '20px',
      padding: '16px',
      borderRadius: '12px',
      backgroundColor: '#f7fafc',
      border: '2px solid #e2e8f0',
      color: '#4a5568',
      fontSize: '14px',
      zIndex: '10008',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      maxWidth: '300px'
    });

    const iconStyle = notification.querySelector('.offline-icon') as HTMLElement;
    if (iconStyle) {
      iconStyle.style.fontSize = '24px';
    }

    const titleStyle = notification.querySelector('.offline-title') as HTMLElement;
    if (titleStyle) {
      titleStyle.style.fontWeight = '600';
      titleStyle.style.marginBottom = '4px';
    }

    const subtitleStyle = notification.querySelector('.offline-subtitle') as HTMLElement;
    if (subtitleStyle) {
      subtitleStyle.style.fontSize = '12px';
      subtitleStyle.style.opacity = '0.8';
    }

    document.body.appendChild(notification);

    // 5秒后自动隐藏
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-100%)';
        setTimeout(() => {
          notification.parentNode?.removeChild(notification);
        }, 300);
      }
    }, 5000);
  }

  // 清理资源
  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// 单例实例
export const offlineManager = new OfflineManager();