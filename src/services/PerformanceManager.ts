// 性能管理器
// 负责监控和优化插件性能

export interface PerformanceMetrics {
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cacheStats: {
    translationCache: number;
    dictionaryCache: number;
    totalSize: number;
  };
  requestStats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
  };
  componentStats: {
    activeComponents: number;
    translationOverlays: number;
    floatingIcons: number;
  };
}

export interface PerformanceConfig {
  maxMemoryUsage: number; // MB
  maxCacheSize: number; // 缓存项数量
  maxCacheAge: number; // 毫秒
  requestTimeout: number; // 毫秒
  batchSize: number; // 批处理大小
  throttleDelay: number; // 节流延迟
}

export class PerformanceManager {
  private config: PerformanceConfig = {
    maxMemoryUsage: 100, // 100MB
    maxCacheSize: 1000,
    maxCacheAge: 24 * 60 * 60 * 1000, // 24小时
    requestTimeout: 10000, // 10秒
    batchSize: 10,
    throttleDelay: 100 // 100ms
  };

  private metrics: PerformanceMetrics = {
    memoryUsage: { used: 0, total: 0, percentage: 0 },
    cacheStats: { translationCache: 0, dictionaryCache: 0, totalSize: 0 },
    requestStats: { totalRequests: 0, successfulRequests: 0, failedRequests: 0, averageResponseTime: 0 },
    componentStats: { activeComponents: 0, translationOverlays: 0, floatingIcons: 0 }
  };

  private requestTimes: number[] = [];
  private throttledFunctions: Map<string, {
    func: Function;
    timeout: NodeJS.Timeout | null;
    lastCall: number;
  }> = new Map();

  private debouncedFunctions: Map<string, {
    func: Function;
    timeout: NodeJS.Timeout | null;
  }> = new Map();

  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(config?: Partial<PerformanceConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.startMonitoring();
  }

  // 开始性能监控
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.updateMetrics();
      this.performOptimizations();
    }, 30000); // 每30秒更新一次

    console.log('性能监控已启动');
  }

  // 停止性能监控
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('性能监控已停止');
  }

  // 更新性能指标
  private async updateMetrics(): Promise<void> {
    try {
      // 更新内存使用情况
      await this.updateMemoryMetrics();
      
      // 更新缓存统计
      this.updateCacheMetrics();
      
      // 更新组件统计
      this.updateComponentMetrics();
      
      // 计算平均响应时间
      this.updateRequestMetrics();
    } catch (error) {
      console.error('更新性能指标失败:', error);
    }
  }

  private async updateMemoryMetrics(): Promise<void> {
    try {
      // 使用Chrome的内存API（如果可用）
      if (chrome.system && chrome.system.memory) {
        const memoryInfo = await chrome.system.memory.getInfo();
        this.metrics.memoryUsage = {
          used: memoryInfo.availableCapacity ? 
            (memoryInfo.capacity - memoryInfo.availableCapacity) / (1024 * 1024) : 0,
          total: memoryInfo.capacity / (1024 * 1024),
          percentage: memoryInfo.availableCapacity ? 
            ((memoryInfo.capacity - memoryInfo.availableCapacity) / memoryInfo.capacity) * 100 : 0
        };
      } else {
        // 降级方案：估算内存使用
        const estimatedUsage = this.estimateMemoryUsage();
        this.metrics.memoryUsage = {
          used: estimatedUsage,
          total: 100, // 假设100MB限制
          percentage: (estimatedUsage / 100) * 100
        };
      }
    } catch (error) {
      console.warn('获取内存信息失败:', error);
    }
  }

  private estimateMemoryUsage(): number {
    // 简单的内存使用估算
    const cacheSize = this.metrics.cacheStats.totalSize;
    const componentCount = this.metrics.componentStats.activeComponents;
    
    // 估算：每个缓存项约1KB，每个组件约10KB
    return (cacheSize * 0.001) + (componentCount * 0.01);
  }

  private updateCacheMetrics(): void {
    // 这些数据需要从各个服务获取
    // 这里提供接口，具体实现在集成时完成
    this.metrics.cacheStats = {
      translationCache: 0, // 从TranslationService获取
      dictionaryCache: 0,  // 从DictionaryManager获取
      totalSize: 0
    };
  }

  private updateComponentMetrics(): void {
    // 统计页面中的组件数量
    const overlays = document.querySelectorAll('.translation-overlay').length;
    const icons = document.querySelectorAll('#translation-floating-icon').length;
    
    this.metrics.componentStats = {
      activeComponents: overlays + icons,
      translationOverlays: overlays,
      floatingIcons: icons
    };
  }

  private updateRequestMetrics(): void {
    if (this.requestTimes.length > 0) {
      const sum = this.requestTimes.reduce((a, b) => a + b, 0);
      this.metrics.requestStats.averageResponseTime = sum / this.requestTimes.length;
      
      // 只保留最近100个请求的时间
      if (this.requestTimes.length > 100) {
        this.requestTimes = this.requestTimes.slice(-100);
      }
    }
  }

  // 记录请求性能
  recordRequest(responseTime: number, success: boolean): void {
    this.requestTimes.push(responseTime);
    this.metrics.requestStats.totalRequests++;
    
    if (success) {
      this.metrics.requestStats.successfulRequests++;
    } else {
      this.metrics.requestStats.failedRequests++;
    }
  }

  // 执行性能优化
  private performOptimizations(): void {
    // 内存优化
    if (this.metrics.memoryUsage.percentage > 80) {
      this.optimizeMemory();
    }

    // 缓存优化
    if (this.metrics.cacheStats.totalSize > this.config.maxCacheSize) {
      this.optimizeCache();
    }

    // 组件优化
    if (this.metrics.componentStats.activeComponents > 50) {
      this.optimizeComponents();
    }
  }

  private optimizeMemory(): void {
    console.log('执行内存优化...');
    
    // 清理过期缓存
    this.cleanupExpiredCache();
    
    // 触发垃圾回收（如果可能）
    if (window.gc) {
      window.gc();
    }
    
    // 发送内存警告事件
    this.emitPerformanceEvent('memory-warning', {
      usage: this.metrics.memoryUsage.percentage
    });
  }

  private optimizeCache(): void {
    console.log('执行缓存优化...');
    
    // 发送缓存清理消息到各个服务
    chrome.runtime.sendMessage({
      action: 'optimizeCache',
      data: { maxSize: this.config.maxCacheSize }
    });
  }

  private optimizeComponents(): void {
    console.log('执行组件优化...');
    
    // 清理不可见的翻译覆盖层
    const overlays = document.querySelectorAll('.translation-overlay');
    overlays.forEach(overlay => {
      const rect = overlay.getBoundingClientRect();
      if (rect.top > window.innerHeight || rect.bottom < 0) {
        overlay.remove();
      }
    });
  }

  private cleanupExpiredCache(): void {
    // 发送清理过期缓存的消息
    chrome.runtime.sendMessage({
      action: 'cleanupExpiredCache',
      data: { maxAge: this.config.maxCacheAge }
    });
  }

  // 节流函数
  throttle<T extends (...args: any[]) => any>(
    key: string,
    func: T,
    delay: number = this.config.throttleDelay
  ): T {
    return ((...args: Parameters<T>) => {
      const now = Date.now();
      const throttled = this.throttledFunctions.get(key);
      
      if (!throttled || now - throttled.lastCall >= delay) {
        if (throttled?.timeout) {
          clearTimeout(throttled.timeout);
        }
        
        this.throttledFunctions.set(key, {
          func,
          timeout: null,
          lastCall: now
        });
        
        return func(...args);
      } else {
        // 更新节流函数
        if (throttled.timeout) {
          clearTimeout(throttled.timeout);
        }
        
        throttled.timeout = setTimeout(() => {
          throttled.lastCall = Date.now();
          func(...args);
        }, delay - (now - throttled.lastCall));
      }
    }) as T;
  }

  // 防抖函数
  debounce<T extends (...args: any[]) => any>(
    key: string,
    func: T,
    delay: number = this.config.throttleDelay
  ): T {
    return ((...args: Parameters<T>) => {
      const debounced = this.debouncedFunctions.get(key);
      
      if (debounced?.timeout) {
        clearTimeout(debounced.timeout);
      }
      
      const timeout = setTimeout(() => {
        func(...args);
      }, delay);
      
      this.debouncedFunctions.set(key, {
        func,
        timeout
      });
    }) as T;
  }

  // 批处理函数
  createBatchProcessor<T>(
    processor: (items: T[]) => Promise<void>,
    batchSize: number = this.config.batchSize,
    delay: number = 1000
  ): (item: T) => void {
    let batch: T[] = [];
    let timeout: NodeJS.Timeout | null = null;

    const processBatch = async () => {
      if (batch.length === 0) return;
      
      const currentBatch = [...batch];
      batch = [];
      
      try {
        await processor(currentBatch);
      } catch (error) {
        console.error('批处理失败:', error);
      }
    };

    return (item: T) => {
      batch.push(item);
      
      if (batch.length >= batchSize) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        processBatch();
      } else if (!timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          processBatch();
        }, delay);
      }
    };
  }

  // 获取性能指标
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  // 获取性能报告
  getPerformanceReport(): {
    metrics: PerformanceMetrics;
    recommendations: string[];
    status: 'good' | 'warning' | 'critical';
  } {
    const recommendations: string[] = [];
    let status: 'good' | 'warning' | 'critical' = 'good';

    // 内存检查
    if (this.metrics.memoryUsage.percentage > 90) {
      status = 'critical';
      recommendations.push('内存使用率过高，建议清理缓存或重启插件');
    } else if (this.metrics.memoryUsage.percentage > 70) {
      status = 'warning';
      recommendations.push('内存使用率较高，建议定期清理缓存');
    }

    // 缓存检查
    if (this.metrics.cacheStats.totalSize > this.config.maxCacheSize * 0.9) {
      if (status === 'good') status = 'warning';
      recommendations.push('缓存大小接近限制，建议清理过期缓存');
    }

    // 响应时间检查
    if (this.metrics.requestStats.averageResponseTime > 5000) {
      if (status === 'good') status = 'warning';
      recommendations.push('平均响应时间较长，建议检查网络连接');
    }

    // 组件数量检查
    if (this.metrics.componentStats.activeComponents > 100) {
      if (status === 'good') status = 'warning';
      recommendations.push('活跃组件数量较多，可能影响页面性能');
    }

    if (recommendations.length === 0) {
      recommendations.push('性能状态良好');
    }

    return {
      metrics: this.metrics,
      recommendations,
      status
    };
  }

  // 发送性能事件
  private emitPerformanceEvent(type: string, data: any): void {
    chrome.runtime.sendMessage({
      action: 'performanceEvent',
      data: { type, data, timestamp: Date.now() }
    });
  }

  // 更新配置
  updateConfig(config: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // 重置指标
  resetMetrics(): void {
    this.metrics = {
      memoryUsage: { used: 0, total: 0, percentage: 0 },
      cacheStats: { translationCache: 0, dictionaryCache: 0, totalSize: 0 },
      requestStats: { totalRequests: 0, successfulRequests: 0, failedRequests: 0, averageResponseTime: 0 },
      componentStats: { activeComponents: 0, translationOverlays: 0, floatingIcons: 0 }
    };
    this.requestTimes = [];
  }

  // 清理资源
  cleanup(): void {
    this.stopMonitoring();
    
    // 清理节流和防抖函数
    this.throttledFunctions.forEach(({ timeout }) => {
      if (timeout) clearTimeout(timeout);
    });
    this.throttledFunctions.clear();
    
    this.debouncedFunctions.forEach(({ timeout }) => {
      if (timeout) clearTimeout(timeout);
    });
    this.debouncedFunctions.clear();
  }
}

// 单例实例
export const performanceManager = new PerformanceManager();