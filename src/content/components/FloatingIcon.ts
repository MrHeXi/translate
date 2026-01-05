// 浮动翻译图标组件

export class FloatingIcon {
  private iconElement: HTMLElement | null = null;
  private toggleCallback: (() => void) | null = null;
  private isDragging: boolean = false;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

  create(): void {
    // 创建浮动图标元素
    this.iconElement = document.createElement('div');
    this.iconElement.id = 'translation-floating-icon';
    this.iconElement.innerHTML = '🌐';
    
    // 设置样式
    this.setStyles();
    
    // 添加事件监听器
    this.addEventListeners();
    
    // 添加到页面
    document.body.appendChild(this.iconElement);
  }

  private setStyles(): void {
    if (!this.iconElement) return;

    Object.assign(this.iconElement.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
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
      userSelect: 'none'
    });
  }

  private addEventListeners(): void {
    if (!this.iconElement) return;

    // 点击事件
    this.iconElement.addEventListener('click', () => {
      if (!this.isDragging && this.toggleCallback) {
        this.toggleCallback();
      }
    });

    // 拖拽事件
    this.iconElement.addEventListener('mousedown', (e) => {
      this.isDragging = false;
      this.dragOffset.x = e.clientX - this.iconElement!.offsetLeft;
      this.dragOffset.y = e.clientY - this.iconElement!.offsetTop;
      
      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('mouseup', this.handleMouseUp);
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
  }

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.iconElement) return;
    
    this.isDragging = true;
    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;
    
    // 限制在视窗范围内
    const maxX = window.innerWidth - this.iconElement.offsetWidth;
    const maxY = window.innerHeight - this.iconElement.offsetHeight;
    
    this.iconElement.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    this.iconElement.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    this.iconElement.style.right = 'auto';
  };

  private handleMouseUp = () => {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    
    // 延迟重置拖拽状态，避免触发点击事件
    setTimeout(() => {
      this.isDragging = false;
    }, 100);
  };

  onToggle(callback: () => void): void {
    this.toggleCallback = callback;
  }

  updateState(isActive: boolean): void {
    if (!this.iconElement) return;

    if (isActive) {
      this.iconElement.style.backgroundColor = '#34a853';
      this.iconElement.innerHTML = '✓';
    } else {
      this.iconElement.style.backgroundColor = '#4285f4';
      this.iconElement.innerHTML = '🌐';
    }
  }

  remove(): void {
    if (this.iconElement && this.iconElement.parentNode) {
      this.iconElement.parentNode.removeChild(this.iconElement);
      this.iconElement = null;
    }
  }
}