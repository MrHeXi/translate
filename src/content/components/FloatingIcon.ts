export class FloatingIcon {
  private iconElement: HTMLElement | null = null;
  private hintElement: HTMLElement | null = null;
  private toggleCallback: (() => void) | null = null;
  private learningModeToggleCallback: (() => void) | null = null;
  private isDragging: boolean = false;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };
  private isTranslationActive: boolean = false;
  private isLearningModeActive: boolean = false;
  private isVisible: boolean = true;
  private contextMenu: HTMLElement | null = null;
  private readonly defaultIconSize = { width: 50, height: 50 };
  private readonly defaultHintSize = { width: 116, height: 34 };
  private readonly edgeMargin = 24;
  private readonly iconZIndex = '2147483000';
  private readonly contextMenuZIndex = '2147483001';
  private readonly boundHandleDocumentClick = this.handleDocumentClick.bind(this);

  create(position?: { x: number; y: number }): void {
    if (this.iconElement) {
      this.cleanup();
    }

    this.iconElement = document.createElement('div');
    this.iconElement.id = 'translation-floating-icon';
    this.iconElement.setAttribute('role', 'button');
    this.iconElement.tabIndex = 0;
    this.isVisible = true;

    this.createHintElement();

    this.setStyles(position);
    this.updateAppearance();
    this.addEventListeners();

    if (this.hintElement) {
      document.body.appendChild(this.hintElement);
      this.syncHintPosition();
    }
    document.body.appendChild(this.iconElement);
    this.createContextMenu();
  }

  private createHintElement(): void {
    this.removeHint();

    this.hintElement = document.createElement('div');
    this.hintElement.id = 'translation-floating-icon-hint';
    this.hintElement.setAttribute('aria-hidden', 'true');

    [
      ['position', 'fixed'],
      ['left', 'auto'],
      ['top', 'auto'],
      ['min-width', '92px'],
      ['height', '34px'],
      ['padding', '0 12px'],
      ['background-color', '#ffffff'],
      ['color', '#1f2937'],
      ['border', '1px solid #d0d7de'],
      ['border-radius', '999px'],
      ['display', 'flex'],
      ['align-items', 'center'],
      ['justify-content', 'center'],
      ['font-size', '13px'],
      ['font-weight', '700'],
      ['font-family', 'Arial, sans-serif'],
      ['line-height', '1'],
      ['box-sizing', 'border-box'],
      ['z-index', this.iconZIndex],
      ['box-shadow', '0 8px 22px rgba(15, 23, 42, 0.2)'],
      ['transition', 'opacity 0.2s ease, transform 0.2s ease'],
      ['user-select', 'none'],
      ['pointer-events', 'none'],
      ['opacity', '0.96'],
      ['white-space', 'nowrap']
    ].forEach(([property, value]) => {
      this.setHintStyle(property, value);
    });
  }

  private setStyles(position?: { x: number; y: number }): void {
    if (!this.iconElement) return;

    [
      ['position', 'fixed'],
      ['right', 'auto'],
      ['bottom', 'auto'],
      ['width', '50px'],
      ['height', '50px'],
      ['background-color', '#2563eb'],
      ['color', 'white'],
      ['border-radius', '50%'],
      ['display', 'flex'],
      ['align-items', 'center'],
      ['justify-content', 'center'],
      ['cursor', 'pointer'],
      ['font-size', '15px'],
      ['font-weight', '700'],
      ['font-family', 'Arial, sans-serif'],
      ['line-height', '1'],
      ['box-sizing', 'border-box'],
      ['z-index', this.iconZIndex],
      ['box-shadow', '0 8px 24px rgba(15, 23, 42, 0.28)'],
      ['transition', 'transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease'],
      ['user-select', 'none'],
      ['pointer-events', 'auto'],
      ['opacity', '0.92']
    ].forEach(([property, value]) => {
      this.setIconStyle(property, value);
    });

    this.applyPosition(position || this.getDefaultPosition());
  }

  private setIconStyle(property: string, value: string): void {
    if (!this.iconElement) return;

    this.iconElement.style.setProperty(property, value, 'important');
  }

  private setHintStyle(property: string, value: string): void {
    if (!this.hintElement) return;

    this.hintElement.style.setProperty(property, value, 'important');
  }

  private getDefaultPosition(): { x: number; y: number } {
    const width = window.innerWidth || 1024;
    const height = window.innerHeight || 768;

    return {
      x: Math.max(this.edgeMargin, width - this.defaultIconSize.width - this.edgeMargin),
      y: Math.max(this.edgeMargin, height - this.defaultIconSize.height - this.edgeMargin)
    };
  }

  private createContextMenu(): void {
    this.removeContextMenu();

    this.contextMenu = document.createElement('div');
    this.contextMenu.id = 'translation-context-menu';
    this.contextMenu.style.cssText = `
      position: fixed;
      background: #ffffff;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.22);
      z-index: ${this.contextMenuZIndex};
      display: none;
      min-width: 220px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      color: #111827;
      overflow: hidden;
    `;

    this.renderContextMenuItems();
    document.body.appendChild(this.contextMenu);
    document.addEventListener('click', this.boundHandleDocumentClick);
  }

  private getContextMenuItems(): Array<{ text: string; action: string }> {
    return [
      {
        text: this.isTranslationActive ? 'Stop page translation' : 'Start page translation',
        action: 'toggle-translation'
      },
      {
        text: this.isLearningModeActive ? 'Turn learning highlights off' : 'Turn learning highlights on',
        action: 'toggle-learning'
      },
      { text: 'Settings', action: 'settings' },
      { text: 'Hide floating button', action: 'hide' }
    ];
  }

  private renderContextMenuItems(): void {
    if (!this.contextMenu) return;

    this.contextMenu.replaceChildren();

    this.getContextMenuItems().forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.textContent = item.text;
      menuItem.style.cssText = `
        padding: 9px 12px;
        cursor: pointer;
        border-bottom: 1px solid #edf2f7;
        white-space: nowrap;
      `;

      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = '#f8fafc';
      });

      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = '#ffffff';
      });

      menuItem.addEventListener('click', () => {
        this.handleContextMenuAction(item.action);
        this.hideContextMenu();
      });

      this.contextMenu!.appendChild(menuItem);
    });
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
        this.toggleCallback?.();
        break;
      case 'toggle-learning':
        this.learningModeToggleCallback?.();
        break;
      case 'settings':
        chrome.runtime.sendMessage({ action: 'openSettings' });
        break;
      case 'hide':
        this.hide();
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          data: { showFloatingIcon: false }
        });
        break;
    }
  }

  private showContextMenu(x: number, y: number): void {
    if (!this.contextMenu) return;

    this.renderContextMenuItems();

    const menuWidth = 220;
    const menuHeight = 156;
    let left = x;
    let top = y;

    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
    }

    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 10;
    }

    this.contextMenu.style.left = `${Math.max(10, left)}px`;
    this.contextMenu.style.top = `${Math.max(10, top)}px`;
    this.contextMenu.style.display = 'block';
  }

  private hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.style.display = 'none';
    }
  }

  private addEventListeners(): void {
    if (!this.iconElement) return;

    this.iconElement.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.isDragging) {
        this.toggleCallback?.();
      }
    });

    this.iconElement.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;

      e.preventDefault();
      this.toggleCallback?.();
    });

    this.iconElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    });

    this.iconElement.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;

      this.isDragging = false;
      this.dragOffset.x = e.clientX - this.iconElement!.getBoundingClientRect().left;
      this.dragOffset.y = e.clientY - this.iconElement!.getBoundingClientRect().top;

      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('mouseup', this.handleMouseUp);

      e.preventDefault();
    });

    this.iconElement.addEventListener('mouseenter', () => {
      if (this.iconElement) {
        this.setIconStyle('transform', 'scale(1.08)');
        this.setIconStyle('opacity', '1');
      }
    });

    this.iconElement.addEventListener('mouseleave', () => {
      if (this.iconElement) {
        this.setIconStyle('transform', 'scale(1)');
        this.setIconStyle('opacity', '0.92');
      }
    });

    this.iconElement.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.learningModeToggleCallback?.();
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

    if (this.iconElement && this.isDragging) {
      const rect = this.iconElement.getBoundingClientRect();
      const position = { x: rect.left, y: rect.top };

      chrome.runtime.sendMessage({
        action: 'updateSettings',
        data: { floatingIconPosition: position }
      });
    }

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

    if (this.isTranslationActive && this.isLearningModeActive) {
      this.setIconStyle('background-color', '#d97706');
      this.setIconText('Stop', 'Stop page translation. Learning highlights are on.');
      this.setHintText('', false);
    } else if (this.isTranslationActive) {
      this.setIconStyle('background-color', '#16a34a');
      this.setIconText('Stop', 'Stop page translation');
      this.setHintText('', false);
    } else if (this.isLearningModeActive) {
      this.setIconStyle('background-color', '#7c3aed');
      this.setIconText('Learn', 'Learning highlights are on. Start page translation');
      this.setHintText('Study mode', true);
    } else {
      this.setIconStyle('background-color', '#2563eb');
      this.setIconText('Start', 'Start page translation');
      this.setHintText('Translate page', true);
    }

    this.renderContextMenuItems();
  }

  private setIconText(label: string, description: string): void {
    if (!this.iconElement) return;

    this.iconElement.textContent = label;
    this.setIconStyle('font-size', label.length > 2 ? '11px' : '15px');
    this.iconElement.title = description;
    this.iconElement.setAttribute('aria-label', description);
  }

  private setHintText(label: string, shouldShow: boolean): void {
    if (!this.hintElement) return;

    this.hintElement.textContent = label;
    this.setHintStyle('display', this.isVisible && shouldShow ? 'flex' : 'none');
    this.syncHintPosition();
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
    this.positionHint(newX, newY, size);
  }

  private getIconSize(): { width: number; height: number } {
    if (!this.iconElement) return this.defaultIconSize;

    const rect = this.iconElement.getBoundingClientRect();
    const width = this.iconElement.offsetWidth || rect.width || this.defaultIconSize.width;
    const height = this.iconElement.offsetHeight || rect.height || this.defaultIconSize.height;

    return { width, height };
  }

  private syncHintPosition(): void {
    if (!this.iconElement) return;

    const left = parseFloat(this.iconElement.style.left || '0');
    const top = parseFloat(this.iconElement.style.top || '0');

    if (Number.isNaN(left) || Number.isNaN(top)) return;

    this.positionHint(left, top, this.getIconSize());
  }

  private positionHint(iconX: number, iconY: number, iconSize: { width: number; height: number }): void {
    if (!this.hintElement) return;

    const hintSize = this.getHintSize();
    const gap = 10;
    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = window.innerHeight || 768;
    const maxLeft = Math.max(0, viewportWidth - hintSize.width - 8);
    const maxTop = Math.max(0, viewportHeight - hintSize.height - 8);
    let left = iconX - hintSize.width - gap;
    const top = iconY + (iconSize.height - hintSize.height) / 2;

    if (left < 8) {
      left = iconX + iconSize.width + gap;
    }

    this.setHintStyle('left', `${Math.max(8, Math.min(left, maxLeft))}px`);
    this.setHintStyle('top', `${Math.max(8, Math.min(top, maxTop))}px`);
  }

  private getHintSize(): { width: number; height: number } {
    if (!this.hintElement) return this.defaultHintSize;

    const rect = this.hintElement.getBoundingClientRect();
    const width = this.hintElement.offsetWidth || rect.width || this.defaultHintSize.width;
    const height = this.hintElement.offsetHeight || rect.height || this.defaultHintSize.height;

    return { width, height };
  }

  show(): void {
    this.isVisible = true;

    if (this.iconElement) {
      this.setIconStyle('display', 'flex');
    }

    this.updateAppearance();
  }

  hide(): void {
    this.isVisible = false;

    if (this.iconElement) {
      this.setIconStyle('display', 'none');
    }

    if (this.hintElement) {
      this.setHintStyle('display', 'none');
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

  private removeHint(): void {
    if (this.hintElement && this.hintElement.parentNode) {
      this.hintElement.parentNode.removeChild(this.hintElement);
    }

    this.hintElement = null;
  }

  remove(): void {
    if (this.iconElement && this.iconElement.parentNode) {
      this.iconElement.parentNode.removeChild(this.iconElement);
      this.iconElement = null;
    }

    this.removeHint();
  }
}
