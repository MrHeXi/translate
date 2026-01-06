// 统一消息传递管理器
// 负责协调各组件间的通信和消息路由

export interface MessageRequest {
  action: string;
  data?: any;
  tabId?: number;
  timestamp?: number;
  requestId?: string;
}

export interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp?: number;
  requestId?: string;
}

export interface MessageHandler {
  (request: MessageRequest, sender?: chrome.runtime.MessageSender): Promise<MessageResponse>;
}

export class MessageManager {
  private handlers: Map<string, MessageHandler> = new Map();
  private pendingRequests: Map<string, {
    resolve: (response: MessageResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private readonly REQUEST_TIMEOUT = 30000; // 30秒超时
  private isInitialized: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (this.isInitialized) return;

    // 设置消息监听器
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // 保持消息通道开放
    });

    this.isInitialized = true;
  }

  // 注册消息处理器
  registerHandler(action: string, handler: MessageHandler): void {
    this.handlers.set(action, handler);
  }

  // 批量注册处理器
  registerHandlers(handlers: Record<string, MessageHandler>): void {
    Object.entries(handlers).forEach(([action, handler]) => {
      this.registerHandler(action, handler);
    });
  }

  // 发送消息（带重试机制）
  async sendMessage(
    request: MessageRequest, 
    options: {
      tabId?: number;
      retries?: number;
      timeout?: number;
    } = {}
  ): Promise<MessageResponse> {
    const { tabId, retries = 3, timeout = this.REQUEST_TIMEOUT } = options;
    const requestId = this.generateRequestId();
    
    const messageWithId: MessageRequest = {
      ...request,
      requestId,
      timestamp: Date.now()
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.sendSingleMessage(messageWithId, tabId, timeout);
        return response;
      } catch (error) {
        lastError = error as Error;
        console.warn(`消息发送失败 (尝试 ${attempt}/${retries}):`, error);
        
        if (attempt < retries) {
          // 指数退避重试
          await this.delay(Math.pow(2, attempt - 1) * 1000);
        }
      }
    }

    throw lastError || new Error('消息发送失败');
  }

  // 广播消息到所有标签页
  async broadcastMessage(request: MessageRequest): Promise<MessageResponse[]> {
    try {
      const tabs = await chrome.tabs.query({});
      const promises = tabs.map(tab => {
        if (tab.id) {
          return this.sendMessage(request, { tabId: tab.id, retries: 1 })
            .catch(error => ({
              success: false,
              error: error.message,
              tabId: tab.id
            } as MessageResponse));
        }
        return Promise.resolve({
          success: false,
          error: 'Invalid tab ID'
        } as MessageResponse);
      });

      return Promise.all(promises);
    } catch (error) {
      console.error('广播消息失败:', error);
      return [{
        success: false,
        error: error instanceof Error ? error.message : '广播失败'
      }];
    }
  }

  // 发送消息到后台脚本
  async sendToBackground(request: MessageRequest): Promise<MessageResponse> {
    return this.sendMessage(request);
  }

  // 发送消息到内容脚本
  async sendToContentScript(request: MessageRequest, tabId: number): Promise<MessageResponse> {
    return this.sendMessage(request, { tabId });
  }

  // 发送消息到当前活跃标签页
  async sendToActiveTab(request: MessageRequest): Promise<MessageResponse> {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        return this.sendToContentScript(request, activeTab.id);
      }
      throw new Error('未找到活跃标签页');
    } catch (error) {
      throw new Error(`发送到活跃标签页失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async sendSingleMessage(
    request: MessageRequest, 
    tabId?: number, 
    timeout: number = this.REQUEST_TIMEOUT
  ): Promise<MessageResponse> {
    return new Promise((resolve, reject) => {
      const requestId = request.requestId!;
      
      // 设置超时
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`消息超时: ${request.action}`));
      }, timeout);

      // 存储待处理请求
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });

      // 发送消息
      const sendFunction = tabId 
        ? (msg: any, callback: (response: any) => void) => chrome.tabs.sendMessage(tabId, msg, callback)
        : (msg: any, callback: (response: any) => void) => chrome.runtime.sendMessage(msg, callback);

      sendFunction(request, (response) => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(requestId);
          
          if (chrome.runtime.lastError) {
            pending.reject(new Error(chrome.runtime.lastError.message));
          } else {
            pending.resolve(response || { success: false, error: '无响应' });
          }
        }
      });
    });
  }

  private async handleMessage(
    request: MessageRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      // 检查是否有对应的处理器
      const handler = this.handlers.get(request.action);
      if (!handler) {
        sendResponse({
          success: false,
          error: `未找到处理器: ${request.action}`,
          requestId: request.requestId
        });
        return;
      }

      // 执行处理器
      const response = await handler(request, sender);
      
      // 添加请求ID到响应中
      const responseWithId: MessageResponse = {
        ...response,
        requestId: request.requestId,
        timestamp: Date.now()
      };

      sendResponse(responseWithId);
    } catch (error) {
      console.error(`处理消息失败 [${request.action}]:`, error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
        requestId: request.requestId
      });
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取消息统计信息
  getStats(): {
    handlersCount: number;
    pendingRequestsCount: number;
    registeredActions: string[];
  } {
    return {
      handlersCount: this.handlers.size,
      pendingRequestsCount: this.pendingRequests.size,
      registeredActions: Array.from(this.handlers.keys())
    };
  }

  // 清理资源
  cleanup(): void {
    // 清理所有待处理的请求
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('MessageManager cleanup'));
    }
    this.pendingRequests.clear();
    
    // 清理处理器
    this.handlers.clear();
  }

  // 检查连接状态
  async checkConnection(tabId?: number): Promise<boolean> {
    try {
      const response = await this.sendMessage(
        { action: 'ping' },
        { tabId, retries: 1, timeout: 5000 }
      );
      return response.success;
    } catch {
      return false;
    }
  }

  // 等待连接建立
  async waitForConnection(tabId?: number, maxWaitTime: number = 10000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      if (await this.checkConnection(tabId)) {
        return true;
      }
      await this.delay(500);
    }
    
    return false;
  }
}

// 单例实例
export const messageManager = new MessageManager();