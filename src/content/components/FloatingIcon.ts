// 浮动翻译图标组件

export class FloatingIcon {
  private iconElement: HTMLElement | null = null;
  private toggleCallback: (() => void) | null = null;
  private learningModeToggleCallback: (() => void) | null = null;
  private isDragging: boolean = false;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };
  private isTranslationActive: boolean = false;
  private isLearningModeActive: boolean = false;
  private contextMenu: HTMLElement | null = null;
  private readonly defaultIconSize = { width: 50, height: 50 };
  private readonly iconZIndex = '2147483000';
  private readonly contextMenuZIndex = '2147483001';
  private readonly boundHandleDocumentClick = this.handleDocumentClick.bind(this);

  create(position?: { x: number; y: number }): void {
    // 如果已存在，先移除
    if (this.iconElement) {
      this.cleanup();
    }

    // 创建浮动图标元素
    this.iconElement = document.createElement('div');
    this.iconElement.id = 'translation-floating-icon';
    this.iconElement.innerHTML = '🌐';
    
    // 设置样式
    this.setStyles(position);
    
    // 添加事件监听器
    this.addEventListeners();
    
    // 添加到页面
    document.body.appendChild(this.iconElement);

    // 创建右键菜单
    this.createContextMenu();
  }

  private setStyles(position?: { x: number; y: number }): void {
    if (!this.iconElement) return;

    const defaultPosition = position || { x: 20, y: 20 };

    [
      ['position', 'fixed'],
      ['top', `${defaultPosition.y}px`],
      ['left', `${defaultPosition.x}px`],
      ['right', 'auto'],
      ['bottom', 'auto'],
      ['width', '50px'],
      ['height', '50px'],
      ['background-color', '#4285f4'],
      ['color', 'white'],
      ['border-radius', '50%'],
      ['display', 'flex'],
      ['align-items', 'center'],
      ['justify-content', 'center'],
      ['cursor', 'pointer'],
      ['font-size', '20px'],
      ['font-family', 'Arial, sans-serif'],
      ['line-height', '1'],
      ['box-sizing', 'border-box'],
      ['z-index', this.iconZIndex],
      ['box-shadow', '0 2px 10px rgba(0,0,0,0.3)'],
      ['transition', 'transform 0.3s ease, opacity 0.3s ease, background-color 0.3s ease'],
      ['user-select', 'none'],
      ['pointer-events', 'auto'],
      ['opacity', '0.8']
    ].forEach(([property, value]) => {
      this.setIconStyle(property, value);
    });
  }

  private setIconStyle(property: string, value: string): void {
    if (!this.iconElement) return;

    this.iconElement.style.setProperty(property, value, 'important');
  }

  private createContextMenu(): void {
    this.removeContextMenu();

    this.contextMenu = document.createElement('div');
    this.contextMenu.id = 'translation-context-menu';
    this.contextMenu.style.cssText = `
      position: fixed;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: ${this.contextMenuZIndex};
      display: none;
      min-width: 150px;
      font-family: Arial, sans-serif;
      font-size: 14px;
    `;

    // 创建菜单项
    const menuItems = [
      { text: '切换翻译模式', action: 'toggle-translation' },
      { text: '切换学习模式', action: 'toggle-learning' },
      { text: '设置', action: 'settings' },
      { text: '隐藏图标', action: 'hide' }
    ];

    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.textContent = item.text;
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #eee;
      `;
      
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = '#f5f5f5';
      });
      
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = 'white';
      });
      
      menuItem.addEventListener('click', () => {
        this.handleContextMenuAction(item.action);
        this.hideContextMenu();
      });

      this.contextMenu!.appendChild(menuItem);
    });

    document.body.appendChild(this.contextMenu);

    // 点击其他地方时隐藏菜单
    document.addEventListener('click', this.boundHandleDocumentClick);
  }

  private handleDocumentClick(e: Event): void {
    if (this.contextMenu && !this.contextMenu.contains(e.target as Node) &&
        !this.iconElement?.contains(e.target as Node)) {
      this.hideContextMenu();
    }
  }

  private handleContextMenuAction(action: string): void {
    switch (action) {
      case 'toggle-translation':
        if (this.toggleCallback) {
          this.toggleCallback();
        }
        break;
      case 'toggle-learning':
        if (this.learningModeToggleCallback) {
          this.learningModeToggleCallback();
        }
        break;
      case 'settings':
        // 发送消息给后台脚本打开设置页面
        chrome.runtime.sendMessage({ action: 'openSettings' });
        break;
      case 'hide':
        this.hide();
        break;
    }
  }

  private showContextMenu(x: number, y: number): void {
    if (!this.contextMenu) return;

    // 调整菜单位置，确保不超出视窗
    const menuWidth = 150;
    const menuHeight = 160;
    
    let left = x;
    let top = y;
    
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
    }
    
    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 10;
    }

    this.contextMenu.style.left = `${left}px`;
    this.contextMenu.style.top = `${top}px`;
    this.contextMenu.style.display = 'block';
  }

  private hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.style.display = 'none';
    }
  }

  private addEventListeners(): void {
    if (!this.iconElement) return;

    // 左键点击事件
    this.iconElement.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.isDragging && this.toggleCallback) {
        this.toggleCallback();
      }
    });

    // 右键点击事件
    this.iconElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    });

    // 拖拽事件
    this.iconElement.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // 只处理左键
      
      this.isDragging = false;
      this.dragOffset.x = e.clientX - this.iconElement!.getBoundingClientRect().left;
      this.dragOffset.y = e.clientY - this.iconElement!.getBoundingClientRect().top;
      
      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('mouseup', this.handleMouseUp);
      
      e.preventDefault();
    });

    // 悬停效果
    this.iconElement.addEventListener('mouseenter', () => {
      if (this.iconElement) {
        this.setIconStyle('transform', 'scale(1.1)');
        this.setIconStyle('opacity', '1');
      }
    });

    this.iconElement.addEventListener('mouseleave', () => {
      if (this.iconElement) {
        this.setIconStyle('transform', 'scale(1)');
        this.setIconStyle('opacity', '0.8');
      }
    });

    // 双击事件 - 切换学习模式
    this.iconElement.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (this.learningModeToggleCallback) {
        this.learningModeToggleCallback();
      }
    });
  }

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.iconElement) return;
    
    this.isDragging = true;
    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;

    this.applyPosition({ x, y });
  };

  private handleMouseUp = () => {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    
    // 保存新位置到设置
    if (this.iconElement && this.isDragging) {
      const rect = this.iconElement.getBoundingClientRect();
      const position = { x: rect.left, y: rect.top };
      
      // 发送消息给后台脚本保存位置
      chrome.runtime.sendMessage({
        action: 'updateSettings',
        data: { floatingIconPosition: position }
      });
    }
    
    // 延迟重置拖拽状态，避免触发点击事件
    setTimeout(() => {
      this.isDragging = false;
    }, 100);
  };

  onToggle(callback: () => void): void {
    this.toggleCallback = callback;
  }

  onLearningModeToggle(callback: () => void): void {
    this.learningModeToggleCallback = callback;
  }

  updateState(isActive: boolean): void {
    if (!this.iconElement) return;

    this.isTranslationActive = isActive;
    this.updateAppearance();
  }

  updateLearningModeState(isActive: boolean): void {
    if (!this.iconElement) return;

    this.isLearningModeActive = isActive;
    this.updateAppearance();
  }

  private updateAppearance(): void {
    if (!this.iconElement) return;

    // 根据状态更新图标外观
    if (this.isTranslationActive && this.isLearningModeActive) {
      // 翻译模式 + 学习模式
      this.setIconStyle('background-color', '#ff9800');
      this.iconElement.innerHTML = '📚';
      this.iconElement.title = '翻译模式 + 学习模式已启用';
    } else if (this.isTranslationActive) {
      // 仅翻译模式
      this.setIconStyle('background-color', '#34a853');
      this.iconElement.innerHTML = '✓';
      this.iconElement.title = '翻译模式已启用';
    } else if (this.isLearningModeActive) {
      // 仅学习模式
      this.setIconStyle('background-color', '#9c27b0');
      this.iconElement.innerHTML = '📖';
      this.iconElement.title = '学习模式已启用';
    } else {
      // 默认状态
      this.setIconStyle('background-color', '#4285f4');
      this.iconElement.innerHTML = '🌐';
      this.iconElement.title = '点击启用翻译，双击启用学习模式，右键查看更多选项';
    }
  }

  updatePosition(position: { x: number; y: number }): void {
    this.applyPosition(position);
  }

  private applyPosition(position: { x: number; y: number }): void {
    if (!this.iconElement) return;

    const size = this.getIconSize();
    const maxX = Math.max(0, window.innerWidth - size.width);
    const maxY = Math.max(0, window.innerHeight - size.height);
    const newX = Math.max(0, Math.min(position.x, maxX));
    const newY = Math.max(0, Math.min(position.y, maxY));

    this.setIconStyle('left', `${newX}px`);
    this.setIconStyle('top', `${newY}px`);
    this.setIconStyle('right', 'auto');
    this.setIconStyle('bottom', 'auto');
  }

  private getIconSize(): { width: number; height: number } {
    if (!this.iconElement) return this.defaultIconSize;

    const rect = this.iconElement.getBoundingClientRect();
    const width = this.iconElement.offsetWidth || rect.width || this.defaultIconSize.width;
    const height = this.iconElement.offsetHeight || rect.height || this.defaultIconSize.height;

    return { width, height };
  }

  show(): void {
    if (this.iconElement) {
      this.setIconStyle('display', 'flex');
    }
  }

  hide(): void {
    if (this.iconElement) {
      this.setIconStyle('display', 'none');
    }
  }

  cleanup(): void {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);

    this.remove();
    this.removeContextMenu();
  }

  private removeContextMenu(): void {
    document.removeEventListener('click', this.boundHandleDocumentClick);

    if (this.contextMenu && this.contextMenu.parentNode) {
      this.contextMenu.parentNode.removeChild(this.contextMenu);
    }

    this.contextMenu = null;
  }

  remove(): void {
    if (this.iconElement && this.iconElement.parentNode) {
      this.iconElement.parentNode.removeChild(this.iconElement);
      this.iconElement = null;
    }
  }
}
