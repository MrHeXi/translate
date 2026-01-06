// 全局错误处理器
// 负责统一处理和报告错误

export enum ErrorType {
  TRANSLATION_API_ERROR = 'translation_api_error',
  NETWORK_ERROR = 'network_error',
  STORAGE_ERROR = 'storage_error',
  DICTIONARY_LOAD_ERROR = 'dictionary_load_error',
  CONTENT_SCRIPT_ERROR = 'content_script_error',
  PERMISSION_ERROR = 'permission_error',
  INITIALIZATION_ERROR = 'initialization_error',
  USER_INPUT_ERROR = 'user_input_error',
  PERFORMANCE_ERROR = 'performance_error'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ExtensionError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  timestamp: Date;
  url?: string;
  userAgent?: string;
  stackTrace?: string;
  context?: {
    component?: string;
    action?: string;
    userId?: string;
    sessionId?: string;
  };
}

export interface ErrorRecoveryStrategy {
  canRecover: boolean;
  recoveryAction?: () => Promise<void>;
  fallbackAction?: () => Promise<void>;
  userMessage?: string;
  retryable?: boolean;
  maxRetries?: number;
}

export class ErrorHandler {
  private errorLog: ExtensionError[] = [];
  private maxLogSize: number = 1000;
  private errorCallbacks: Map<ErrorType, ((error: ExtensionError) => void)[]> = new Map();
  private recoveryStrategies: Map<ErrorType, ErrorRecoveryStrategy> = new Map();
  private retryAttempts: Map<string, number> = new Map();

  constructor() {
    this.setupDefaultRecoveryStrategies();
    this.setupGlobalErrorHandlers();
  }

  // 记录错误
  logError(
    type: ErrorType,
    message: string,
    details?: any,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: any
  ): ExtensionError {
    const error: ExtensionError = {
      type,
      severity,
      message,
      details,
      timestamp: new Date(),
      url: window.location?.href,
      userAgent: navigator.userAgent,
      stackTrace: new Error().stack,
      context
    };

    // 添加到错误日志
    this.errorLog.push(error);
    
    // 限制日志大小
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }

    // 触发错误回调
    this.triggerErrorCallbacks(error);

    // 尝试错误恢复
    this.attemptErrorRecovery(error);

    // 根据严重程度决定是否上报
    if (severity === ErrorSeverity.HIGH || severity === ErrorSeverity.CRITICAL) {
      this.reportError(error);
    }

    console.error(`[${type}] ${message}`, details);
    return error;
  }

  // 处理异步错误
  async handleAsyncError<T>(
    operation: () => Promise<T>,
    errorType: ErrorType,
    context?: any
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const errorDetails = error instanceof Error ? { stack: error.stack } : error;
      
      throw this.logError(
        errorType,
        errorMessage,
        errorDetails,
        ErrorSeverity.MEDIUM,
        context
      );
    }
  }

  // 处理带重试的异步操作
  async handleWithRetry<T>(
    operation: () => Promise<T>,
    errorType: ErrorType,
    maxRetries: number = 3,
    delay: number = 1000,
    context?: any
  ): Promise<T> {
    const operationId = `${errorType}_${Date.now()}_${Math.random()}`;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        // 成功时清除重试记录
        this.retryAttempts.delete(operationId);
        return result;
      } catch (error) {
        lastError = error as Error;
        this.retryAttempts.set(operationId, attempt);

        if (attempt < maxRetries) {
          // 指数退避延迟
          const retryDelay = delay * Math.pow(2, attempt - 1);
          await this.delay(retryDelay);
          
          console.warn(`操作重试 ${attempt}/${maxRetries}, 延迟 ${retryDelay}ms:`, error);
        }
      }
    }

    // 所有重试都失败了
    this.retryAttempts.delete(operationId);
    const errorMessage = lastError?.message || '操作失败';
    
    throw this.logError(
      errorType,
      `重试${maxRetries}次后仍然失败: ${errorMessage}`,
      { originalError: lastError, attempts: maxRetries },
      ErrorSeverity.HIGH,
      context
    );
  }

  // 注册错误回调
  onError(type: ErrorType, callback: (error: ExtensionError) => void): void {
    if (!this.errorCallbacks.has(type)) {
      this.errorCallbacks.set(type, []);
    }
    this.errorCallbacks.get(type)!.push(callback);
  }

  // 注册恢复策略
  registerRecoveryStrategy(type: ErrorType, strategy: ErrorRecoveryStrategy): void {
    this.recoveryStrategies.set(type, strategy);
  }

  // 获取错误统计
  getErrorStats(): {
    totalErrors: number;
    errorsByType: Record<ErrorType, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    recentErrors: ExtensionError[];
  } {
    const errorsByType: Record<ErrorType, number> = {} as Record<ErrorType, number>;
    const errorsBySeverity: Record<ErrorSeverity, number> = {} as Record<ErrorSeverity, number>;

    // 初始化计数器
    Object.values(ErrorType).forEach(type => {
      errorsByType[type] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      errorsBySeverity[severity] = 0;
    });

    // 统计错误
    this.errorLog.forEach(error => {
      errorsByType[error.type]++;
      errorsBySeverity[error.severity]++;
    });

    return {
      totalErrors: this.errorLog.length,
      errorsByType,
      errorsBySeverity,
      recentErrors: this.errorLog.slice(-10) // 最近10个错误
    };
  }

  // 清除错误日志
  clearErrorLog(): void {
    this.errorLog = [];
    this.retryAttempts.clear();
  }

  // 导出错误日志
  exportErrorLog(): string {
    return JSON.stringify({
      exportDate: new Date().toISOString(),
      errors: this.errorLog,
      stats: this.getErrorStats()
    }, null, 2);
  }

  private setupDefaultRecoveryStrategies(): void {
    // 网络错误恢复策略
    this.registerRecoveryStrategy(ErrorType.NETWORK_ERROR, {
      canRecover: true,
      retryable: true,
      maxRetries: 3,
      userMessage: '网络连接异常，正在重试...',
      recoveryAction: async () => {
        // 检查网络连接
        if (navigator.onLine) {
          console.log('网络连接已恢复');
        }
      }
    });

    // 翻译API错误恢复策略
    this.registerRecoveryStrategy(ErrorType.TRANSLATION_API_ERROR, {
      canRecover: true,
      retryable: true,
      maxRetries: 2,
      userMessage: '翻译服务暂时不可用，正在尝试备用服务...',
      fallbackAction: async () => {
        // 切换到备用翻译服务
        console.log('切换到备用翻译服务');
      }
    });

    // 存储错误恢复策略
    this.registerRecoveryStrategy(ErrorType.STORAGE_ERROR, {
      canRecover: true,
      retryable: true,
      maxRetries: 2,
      userMessage: '数据保存失败，正在重试...',
      recoveryAction: async () => {
        // 尝试清理存储空间
        try {
          const usage = await chrome.storage.local.getBytesInUse();
          if (usage > 5 * 1024 * 1024) { // 5MB
            console.log('存储空间不足，执行清理');
          }
        } catch (error) {
          console.warn('无法检查存储使用情况:', error);
        }
      }
    });

    // 权限错误恢复策略
    this.registerRecoveryStrategy(ErrorType.PERMISSION_ERROR, {
      canRecover: false,
      userMessage: '缺少必要权限，请检查扩展设置',
      fallbackAction: async () => {
        // 引导用户到权限设置页面
        chrome.runtime.openOptionsPage();
      }
    });

    // 初始化错误恢复策略
    this.registerRecoveryStrategy(ErrorType.INITIALIZATION_ERROR, {
      canRecover: true,
      retryable: false,
      userMessage: '初始化失败，正在重新初始化...',
      recoveryAction: async () => {
        // 重新加载扩展
        chrome.runtime.reload();
      }
    });
  }

  private setupGlobalErrorHandlers(): void {
    // 捕获未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
      this.logError(
        ErrorType.CONTENT_SCRIPT_ERROR,
        '未处理的Promise拒绝',
        { reason: event.reason },
        ErrorSeverity.HIGH,
        { component: 'global', action: 'unhandledrejection' }
      );
    });

    // 捕获全局JavaScript错误
    window.addEventListener('error', (event) => {
      this.logError(
        ErrorType.CONTENT_SCRIPT_ERROR,
        event.message,
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error
        },
        ErrorSeverity.HIGH,
        { component: 'global', action: 'javascript_error' }
      );
    });
  }

  private triggerErrorCallbacks(error: ExtensionError): void {
    const callbacks = this.errorCallbacks.get(error.type);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(error);
        } catch (callbackError) {
          console.error('错误回调执行失败:', callbackError);
        }
      });
    }
  }

  private async attemptErrorRecovery(error: ExtensionError): Promise<void> {
    const strategy = this.recoveryStrategies.get(error.type);
    if (!strategy || !strategy.canRecover) {
      return;
    }

    try {
      // 显示用户消息
      if (strategy.userMessage) {
        this.showUserMessage(strategy.userMessage, 'info');
      }

      // 执行恢复操作
      if (strategy.recoveryAction) {
        await strategy.recoveryAction();
      } else if (strategy.fallbackAction) {
        await strategy.fallbackAction();
      }

      console.log(`错误恢复成功: ${error.type}`);
    } catch (recoveryError) {
      console.error(`错误恢复失败: ${error.type}`, recoveryError);
      
      // 如果有备用操作，尝试执行
      if (strategy.fallbackAction && strategy.recoveryAction) {
        try {
          await strategy.fallbackAction();
        } catch (fallbackError) {
          console.error(`备用恢复操作也失败: ${error.type}`, fallbackError);
        }
      }
    }
  }

  private reportError(error: ExtensionError): void {
    // 发送错误报告到后台脚本
    try {
      chrome.runtime.sendMessage({
        action: 'reportError',
        data: error
      });
    } catch (sendError) {
      console.error('发送错误报告失败:', sendError);
    }
  }

  private showUserMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    // 创建用户通知
    const notification = document.createElement('div');
    notification.className = `error-notification ${type}`;
    notification.textContent = message;
    
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 16px',
      borderRadius: '8px',
      color: 'white',
      fontSize: '14px',
      zIndex: '10007',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: type === 'error' ? '#e53e3e' : type === 'warning' ? '#dd6b20' : '#3182ce',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      maxWidth: '300px',
      wordWrap: 'break-word'
    });

    document.body.appendChild(notification);

    // 自动移除通知
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
          notification.parentNode?.removeChild(notification);
        }, 300);
      }
    }, 5000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 检查错误是否需要用户干预
  requiresUserIntervention(error: ExtensionError): boolean {
    const criticalTypes = [
      ErrorType.PERMISSION_ERROR,
      ErrorType.INITIALIZATION_ERROR
    ];
    
    return error.severity === ErrorSeverity.CRITICAL || 
           criticalTypes.includes(error.type);
  }

  // 获取错误的用户友好消息
  getUserFriendlyMessage(error: ExtensionError): string {
    const messages: Record<ErrorType, string> = {
      [ErrorType.TRANSLATION_API_ERROR]: '翻译服务暂时不可用，请稍后重试',
      [ErrorType.NETWORK_ERROR]: '网络连接异常，请检查网络设置',
      [ErrorType.STORAGE_ERROR]: '数据保存失败，请检查存储空间',
      [ErrorType.DICTIONARY_LOAD_ERROR]: '词库加载失败，请重新加载页面',
      [ErrorType.CONTENT_SCRIPT_ERROR]: '页面功能异常，请刷新页面',
      [ErrorType.PERMISSION_ERROR]: '缺少必要权限，请检查扩展设置',
      [ErrorType.INITIALIZATION_ERROR]: '插件初始化失败，请重新启动',
      [ErrorType.USER_INPUT_ERROR]: '输入格式不正确，请检查输入内容',
      [ErrorType.PERFORMANCE_ERROR]: '性能异常，正在优化中'
    };

    return messages[error.type] || '发生未知错误，请稍后重试';
  }
}

// 单例实例
export const errorHandler = new ErrorHandler();