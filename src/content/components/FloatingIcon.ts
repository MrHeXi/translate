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

  create(position?: { x: number; y: number }): void {
    // 如果已存在，先移除
    if (this.iconElement) {
      this.remove();
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

    Object.assign(this.iconElement.style, {
      position: 'fixed',
      top: `${defaultPosition.y}px`,
      right: `${defaultPosition.x}px`,
      width: '50px',
      height: '50px',
      backgroundColor: '#4285f4',
      color: 'white',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontSize: '20px',
      zIndex: '10000',
      boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
      transition: 'all 0.3s ease',
      userSelect: 'none',
      opacity: '0.8'
    });
  }

  private createContextMenu(): void {
    this.contextMenu = document.createElement('div');
    this.contextMenu.id = 'translation-context-menu';
    this.contextMenu.style.cssText = `
      position: fixed;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 10001;
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
    document.addEventListener('click', (e) => {
      if (this.contextMenu && !this.contextMenu.contains(e.target as Node) && 
          !this.iconElement?.contains(e.target as Node)) {
        this.hideContextMenu();
      }
    });
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
        this.iconElement.style.transform = 'scale(1.1)';
        this.iconElement.style.opacity = '1';
      }
    });

    this.iconElement.addEventListener('mouseleave', () => {
      if (this.iconElement) {
        this.iconElement.style.transform = 'scale(1)';
        this.iconElement.style.opacity = '0.8';
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
    
    // 限制在视窗范围内
    const maxX = window.innerWidth - this.iconElement.offsetWidth;
    const maxY = window.innerHeight - this.iconElement.offsetHeight;
    
    const newX = Math.max(0, Math.min(x, maxX));
    const newY = Math.max(0, Math.min(y, maxY));
    
    this.iconElement.style.left = `${newX}px`;
    this.iconElement.style.top = `${newY}px`;
    this.iconElement.style.right = 'auto';
    this.iconElement.style.bottom = 'auto';
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
      this.iconElement.style.backgroundColor = '#ff9800';
      this.iconElement.innerHTML = '📚';
      this.iconElement.title = '翻译模式 + 学习模式已启用';
    } else if (this.isTranslationActive) {
      // 仅翻译模式
      this.iconElement.style.backgroundColor = '#34a853';
      this.iconElement.innerHTML = '✓';
      this.iconElement.title = '翻译模式已启用';
    } else if (this.isLearningModeActive) {
      // 仅学习模式
      this.iconElement.style.backgroundColor = '#9c27b0';
      this.iconElement.innerHTML = '📖';
      this.iconElement.title = '学习模式已启用';
    } else {
      // 默认状态
      this.iconElement.style.backgroundColor = '#4285f4';
      this.iconElement.innerHTML = '🌐';
      this.iconElement.title = '点击启用翻译，双击启用学习模式，右键查看更多选项';
    }
  }

  updatePosition(position: { x: number; y: number }): void {
    if (!this.iconElement) return;

    this.iconElement.style.left = `${position.x}px`;
    this.iconElement.style.top = `${position.y}px`;
    this.iconElement.style.right = 'auto';
    this.iconElement.style.bottom = 'auto';
  }

  show(): void {
    if (this.iconElement) {
      this.iconElement.style.display = 'flex';
    }
  }

  hide(): void {
    if (this.iconElement) {
      this.iconElement.style.display = 'none';
    }
  }

  cleanup(): void {
    this.remove();
    if (this.contextMenu && this.contextMenu.parentNode) {
      this.contextMenu.parentNode.removeChild(this.contextMenu);
      this.contextMenu = null;
    }
  }

  remove(): void {
    if (this.iconElement && this.iconElement.parentNode) {
      this.iconElement.parentNode.removeChild(this.iconElement);
      this.iconElement = null;
    }
  }
}