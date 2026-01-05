// 选词翻译处理器

export class SelectionHandler {
  private tooltip: HTMLElement | null = null;
  private currentSelection: string = '';

  initialize(): void {
    // 监听文本选择事件
    document.addEventListener('mouseup', this.handleSelection.bind(this));
    document.addEventListener('keyup', this.handleSelection.bind(this));
    
    // 监听点击事件以隐藏工具提示
    document.addEventListener('click', this.handleClick.bind(this));
  }

  private handleSelection(_event: Event): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      this.hideTooltip();
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText && selectedText !== this.currentSelection) {
      this.currentSelection = selectedText;
      this.showTranslationTooltip(selectedText, selection);
    } else if (!selectedText) {
      this.hideTooltip();
    }
  }

  private handleClick(event: Event): void {
    // 如果点击的不是工具提示，则隐藏工具提示
    if (this.tooltip && !this.tooltip.contains(event.target as Node)) {
      this.hideTooltip();
    }
  }

  private async showTranslationTooltip(text: string, selection: Selection): Promise<void> {
    try {
      // 获取选择范围的位置
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // 请求翻译
      const translation = await this.requestTranslation(text);

      // 创建或更新工具提示
      this.createTooltip(text, translation, rect);
    } catch (error) {
      console.error('选词翻译失败:', error);
    }
  }

  private createTooltip(originalText: string, translation: string, rect: DOMRect): void {
    // 移除现有工具提示
    this.hideTooltip();

    // 创建工具提示元素
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'translation-tooltip';
    
    // 设置内容
    this.tooltip.innerHTML = `
      <div class="tooltip-original">${originalText}</div>
      <div class="tooltip-translation">${translation}</div>
      <div class="tooltip-actions">
        <button class="tooltip-btn" data-action="collect">收藏</button>
        <button class="tooltip-btn" data-action="close">关闭</button>
      </div>
    `;

    // 设置样式
    this.setTooltipStyles();

    // 计算位置
    this.positionTooltip(rect);

    // 添加事件监听器
    this.addTooltipEventListeners();

    // 添加到页面
    document.body.appendChild(this.tooltip);
  }

  private setTooltipStyles(): void {
    if (!this.tooltip) return;

    Object.assign(this.tooltip.style, {
      position: 'fixed',
      backgroundColor: 'white',
      border: '1px solid #ccc',
      borderRadius: '8px',
      padding: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: '10001',
      maxWidth: '300px',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif'
    });

    // 设置内部元素样式
    const originalDiv = this.tooltip.querySelector('.tooltip-original') as HTMLElement;
    if (originalDiv) {
      Object.assign(originalDiv.style, {
        fontWeight: 'bold',
        marginBottom: '8px',
        color: '#333'
      });
    }

    const translationDiv = this.tooltip.querySelector('.tooltip-translation') as HTMLElement;
    if (translationDiv) {
      Object.assign(translationDiv.style, {
        color: '#666',
        marginBottom: '10px',
        lineHeight: '1.4'
      });
    }

    const actionsDiv = this.tooltip.querySelector('.tooltip-actions') as HTMLElement;
    if (actionsDiv) {
      Object.assign(actionsDiv.style, {
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end'
      });
    }

    // 设置按钮样式
    const buttons = this.tooltip.querySelectorAll('.tooltip-btn') as NodeListOf<HTMLElement>;
    buttons.forEach(btn => {
      Object.assign(btn.style, {
        padding: '4px 8px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: '#f8f9fa',
        cursor: 'pointer',
        fontSize: '12px'
      });
    });
  }

  private positionTooltip(rect: DOMRect): void {
    if (!this.tooltip) return;

    // 计算工具提示位置
    let top = rect.bottom + window.scrollY + 5;
    let left = rect.left + window.scrollX;

    // 确保工具提示不超出视窗
    const tooltipRect = this.tooltip.getBoundingClientRect();
    
    // 水平位置调整
    if (left + tooltipRect.width > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - 10;
    }
    if (left < 10) {
      left = 10;
    }

    // 垂直位置调整
    if (top + tooltipRect.height > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - tooltipRect.height - 5;
    }

    this.tooltip.style.top = top + 'px';
    this.tooltip.style.left = left + 'px';
  }

  private addTooltipEventListeners(): void {
    if (!this.tooltip) return;

    this.tooltip.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const action = target.getAttribute('data-action');

      switch (action) {
        case 'collect':
          this.collectVocabulary();
          break;
        case 'close':
          this.hideTooltip();
          break;
      }
    });
  }

  private async collectVocabulary(): Promise<void> {
    try {
      // 发送消息到后台脚本收藏词汇
      chrome.runtime.sendMessage({
        action: 'addVocabulary',
        data: {
          word: this.currentSelection,
          sourceUrl: window.location.href,
          addedDate: new Date()
        }
      });

      // 显示成功提示
      this.showCollectionSuccess();
    } catch (error) {
      console.error('收藏词汇失败:', error);
    }
  }

  private showCollectionSuccess(): void {
    if (!this.tooltip) return;

    const actionsDiv = this.tooltip.querySelector('.tooltip-actions') as HTMLElement;
    if (actionsDiv) {
      actionsDiv.innerHTML = '<span style="color: #28a745;">已收藏 ✓</span>';
      
      // 2秒后隐藏工具提示
      setTimeout(() => {
        this.hideTooltip();
      }, 2000);
    }
  }

  private hideTooltip(): void {
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
      this.tooltip = null;
      this.currentSelection = '';
    }
  }

  private async requestTranslation(text: string): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'translate',
        data: {
          text: text,
          targetLang: 'zh-CN'
        }
      }, (response) => {
        if (response.success) {
          resolve(response.data.translatedText);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }
}