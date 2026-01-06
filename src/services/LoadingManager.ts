// 加载状态管理器
// 负责统一管理各种加载状态和用户反馈

export interface LoadingState {
  id: string;
  message: string;
  progress?: number; // 0-100
  type: 'spinner' | 'progress' | 'skeleton';
  cancellable?: boolean;
  onCancel?: () => void;
}

export interface LoadingOptions {
  message?: string;
  type?: 'spinner' | 'progress' | 'skeleton';
  progress?: number;
  cancellable?: boolean;
  onCancel?: () => void;
  timeout?: number;
  position?: 'center' | 'top' | 'bottom' | 'inline';
  overlay?: boolean;
}

export class LoadingManager {
  private activeLoadings: Map<string, LoadingState> = new Map();
  private loadingElements: Map<string, HTMLElement> = new Map();
  private loadingTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // 显示加载状态
  showLoading(id: string, options: LoadingOptions = {}): void {
    const {
      message = '加载中...',
      type = 'spinner',
      progress = 0,
      cancellable = false,
      onCancel,
      timeout,
      position = 'center',
      overlay = true
    } = options;

    // 如果已存在相同ID的加载，先移除
    this.hideLoading(id);

    const loadingState: LoadingState = {
      id,
      message,
      progress,
      type,
      cancellable,
      onCancel
    };

    this.activeLoadings.set(id, loadingState);

    // 创建加载UI
    const loadingElement = this.createLoadingElement(loadingState, position, overlay);
    this.loadingElements.set(id, loadingElement);
    document.body.appendChild(loadingElement);

    // 设置超时
    if (timeout) {
      const timeoutHandle = setTimeout(() => {
        this.hideLoading(id);
        console.warn(`加载超时: ${id}`);
      }, timeout);
      this.loadingTimeouts.set(id, timeoutHandle);
    }

    // 添加动画
    requestAnimationFrame(() => {
      loadingElement.style.opacity = '1';
      loadingElement.style.transform = 'scale(1)';
    });
  }

  // 更新加载进度
  updateProgress(id: string, progress: number, message?: string): void {
    const loadingState = this.activeLoadings.get(id);
    const loadingElement = this.loadingElements.get(id);

    if (!loadingState || !loadingElement) {
      return;
    }

    loadingState.progress = Math.max(0, Math.min(100, progress));
    if (message) {
      loadingState.message = message;
    }

    // 更新UI
    this.updateLoadingElement(loadingElement, loadingState);
  }

  // 隐藏加载状态
  hideLoading(id: string): void {
    const loadingElement = this.loadingElements.get(id);
    const timeout = this.loadingTimeouts.get(id);

    if (timeout) {
      clearTimeout(timeout);
      this.loadingTimeouts.delete(id);
    }

    if (loadingElement) {
      // 添加淡出动画
      loadingElement.style.opacity = '0';
      loadingElement.style.transform = 'scale(0.95)';
      
      setTimeout(() => {
        if (loadingElement.parentNode) {
          loadingElement.parentNode.removeChild(loadingElement);
        }
      }, 200);

      this.loadingElements.delete(id);
    }

    this.activeLoadings.delete(id);
  }

  // 隐藏所有加载状态
  hideAllLoadings(): void {
    const ids = Array.from(this.activeLoadings.keys());
    ids.forEach(id => this.hideLoading(id));
  }

  // 检查是否有活跃的加载
  hasActiveLoadings(): boolean {
    return this.activeLoadings.size > 0;
  }

  // 获取活跃加载列表
  getActiveLoadings(): LoadingState[] {
    return Array.from(this.activeLoadings.values());
  }

  // 创建加载元素
  private createLoadingElement(
    state: LoadingState, 
    position: string, 
    overlay: boolean
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = `loading-container loading-${position}`;
    
    // 设置容器样式
    this.setContainerStyles(container, position, overlay);

    // 创建加载内容
    const content = document.createElement('div');
    content.className = 'loading-content';
    this.setContentStyles(content, state.type);

    // 添加加载图标/动画
    const icon = this.createLoadingIcon(state.type);
    content.appendChild(icon);

    // 添加消息
    const message = document.createElement('div');
    message.className = 'loading-message';
    message.textContent = state.message;
    this.setMessageStyles(message);
    content.appendChild(message);

    // 添加进度条（如果需要）
    if (state.type === 'progress') {
      const progressBar = this.createProgressBar(state.progress || 0);
      content.appendChild(progressBar);
    }

    // 添加取消按钮（如果可取消）
    if (state.cancellable && state.onCancel) {
      const cancelButton = this.createCancelButton(state.onCancel);
      content.appendChild(cancelButton);
    }

    container.appendChild(content);
    return container;
  }

  private setContainerStyles(
    container: HTMLElement, 
    position: string, 
    overlay: boolean
  ): void {
    const baseStyles = {
      position: 'fixed' as const,
      zIndex: '10009',
      opacity: '0',
      transform: 'scale(0.95)',
      transition: 'all 0.2s ease-out',
      pointerEvents: overlay ? 'auto' as const : 'none' as const
    };

    const positionStyles = {
      center: {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%) scale(0.95)'
      },
      top: {
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%) scale(0.95)'
      },
      bottom: {
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%) scale(0.95)'
      },
      inline: {
        position: 'relative' as const,
        display: 'inline-block',
        transform: 'scale(0.95)'
      }
    };

    Object.assign(container.style, baseStyles);
    Object.assign(container.style, positionStyles[position as keyof typeof positionStyles] || positionStyles.center);

    if (overlay && position !== 'inline') {
      // 添加背景遮罩
      container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      container.style.width = '100vw';
      container.style.height = '100vh';
      container.style.top = '0';
      container.style.left = '0';
      container.style.transform = 'scale(0.95)';
    }
  }

  private setContentStyles(content: HTMLElement, type: string): void {
    Object.assign(content.style, {
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: type === 'skeleton' ? '0' : '24px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px',
      minWidth: '200px',
      maxWidth: '400px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });
  }

  private createLoadingIcon(type: string): HTMLElement {
    const icon = document.createElement('div');
    icon.className = `loading-icon loading-icon-${type}`;

    switch (type) {
      case 'spinner':
        icon.innerHTML = '⟳';
        Object.assign(icon.style, {
          fontSize: '32px',
          animation: 'spin 1s linear infinite',
          color: '#3182ce'
        });
        this.addSpinAnimation();
        break;

      case 'progress':
        icon.innerHTML = '📊';
        Object.assign(icon.style, {
          fontSize: '32px',
          color: '#3182ce'
        });
        break;

      case 'skeleton':
        icon.innerHTML = '';
        Object.assign(icon.style, {
          width: '100%',
          height: '120px',
          backgroundColor: '#f0f0f0',
          borderRadius: '8px',
          position: 'relative',
          overflow: 'hidden'
        });
        this.addSkeletonAnimation(icon);
        break;
    }

    return icon;
  }

  private createProgressBar(progress: number): HTMLElement {
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    
    Object.assign(progressContainer.style, {
      width: '100%',
      height: '8px',
      backgroundColor: '#e2e8f0',
      borderRadius: '4px',
      overflow: 'hidden'
    });

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    
    Object.assign(progressBar.style, {
      width: `${progress}%`,
      height: '100%',
      backgroundColor: '#3182ce',
      borderRadius: '4px',
      transition: 'width 0.3s ease'
    });

    progressContainer.appendChild(progressBar);
    return progressContainer;
  }

  private createCancelButton(onCancel: () => void): HTMLElement {
    const button = document.createElement('button');
    button.textContent = '取消';
    button.className = 'loading-cancel-button';
    
    Object.assign(button.style, {
      padding: '8px 16px',
      border: '1px solid #e2e8f0',
      borderRadius: '6px',
      backgroundColor: '#f8f9fa',
      color: '#4a5568',
      cursor: 'pointer',
      fontSize: '14px',
      transition: 'all 0.15s ease'
    });

    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#e2e8f0';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#f8f9fa';
    });

    button.addEventListener('click', onCancel);

    return button;
  }

  private setMessageStyles(message: HTMLElement): void {
    Object.assign(message.style, {
      fontSize: '16px',
      color: '#4a5568',
      textAlign: 'center',
      fontWeight: '500'
    });
  }

  private updateLoadingElement(element: HTMLElement, state: LoadingState): void {
    // 更新消息
    const messageElement = element.querySelector('.loading-message') as HTMLElement;
    if (messageElement) {
      messageElement.textContent = state.message;
    }

    // 更新进度条
    const progressBar = element.querySelector('.progress-bar') as HTMLElement;
    if (progressBar && state.progress !== undefined) {
      progressBar.style.width = `${state.progress}%`;
    }
  }

  private addSpinAnimation(): void {
    // 检查是否已添加动画样式
    if (document.querySelector('#loading-spin-animation')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'loading-spin-animation';
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  private addSkeletonAnimation(element: HTMLElement): void {
    // 创建骨架屏动画
    const shimmer = document.createElement('div');
    Object.assign(shimmer.style, {
      position: 'absolute',
      top: '0',
      left: '-100%',
      width: '100%',
      height: '100%',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
      animation: 'shimmer 1.5s infinite'
    });

    element.appendChild(shimmer);

    // 添加shimmer动画样式
    if (!document.querySelector('#loading-shimmer-animation')) {
      const style = document.createElement('style');
      style.id = 'loading-shimmer-animation';
      style.textContent = `
        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 100%; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // 显示简单的加载提示
  showSimpleLoading(message: string = '加载中...', timeout: number = 10000): string {
    const id = `simple_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    this.showLoading(id, {
      message,
      type: 'spinner',
      timeout,
      position: 'top',
      overlay: false
    });

    return id;
  }

  // 显示进度加载
  showProgressLoading(message: string = '处理中...', initialProgress: number = 0): string {
    const id = `progress_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    this.showLoading(id, {
      message,
      type: 'progress',
      progress: initialProgress,
      position: 'center',
      overlay: true
    });

    return id;
  }

  // 显示可取消的加载
  showCancellableLoading(
    message: string = '加载中...', 
    onCancel: () => void,
    timeout: number = 30000
  ): string {
    const id = `cancellable_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    this.showLoading(id, {
      message,
      type: 'spinner',
      cancellable: true,
      onCancel,
      timeout,
      position: 'center',
      overlay: true
    });

    return id;
  }

  // 清理资源
  cleanup(): void {
    this.hideAllLoadings();
    
    // 清理所有超时
    this.loadingTimeouts.forEach(timeout => clearTimeout(timeout));
    this.loadingTimeouts.clear();
  }
}

// 单例实例
export const loadingManager = new LoadingManager();