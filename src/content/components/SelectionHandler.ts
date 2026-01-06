// 选词翻译处理器

export class SelectionHandler {
  private tooltip: HTMLElement | null = null;
  private currentSelection: string = '';
  private textSelectedCallback: ((text: string, position: { x: number; y: number }) => void) | null = null;
  private isEnabled: boolean = true;

  initialize(): void {
    // 监听文本选择事件
    document.addEventListener('mouseup', this.handleSelection.bind(this));
    document.addEventListener('keyup', this.handleSelection.bind(this));
    
    // 监听点击事件以隐藏工具提示
    document.addEventListener('click', this.handleClick.bind(this));
    
    // 监听双击事件进行快速翻译
    document.addEventListener('dblclick', this.handleDoubleClick.bind(this));
  }

  onTextSelected(callback: (text: string, position: { x: number; y: number }) => void): void {
    this.textSelectedCallback = callback;
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.hideTooltip();
    }
  }

  private handleSelection(_event: Event): void {
    if (!this.isEnabled) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      this.hideTooltip();
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText && selectedText !== this.currentSelection && selectedText.length > 0) {
      this.currentSelection = selectedText;
      
      // 获取选择位置
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const position = {
        x: rect.left + rect.width / 2,
        y: rect.bottom
      };

      // 调用回调函数
      if (this.textSelectedCallback) {
        this.textSelectedCallback(selectedText, position);
      }

      // 显示翻译工具提示
      this.showTranslationTooltip(selectedText, selection);
    } else if (!selectedText) {
      this.hideTooltip();
    }
  }

  private handleDoubleClick(event: MouseEvent): void {
    if (!this.isEnabled) return;

    // 获取双击位置的单词
    const target = event.target as HTMLElement;
    if (target && target.nodeType === Node.TEXT_NODE || target.textContent) {
      const word = this.getWordAtPosition(event);
      if (word && word.length > 2) {
        const position = { x: event.clientX, y: event.clientY };
        
        if (this.textSelectedCallback) {
          this.textSelectedCallback(word, position);
        }
      }
    }
  }

  private getWordAtPosition(event: MouseEvent): string | null {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (!range) return null;

    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) return null;

    const text = textNode.textContent || '';
    const offset = range.startOffset;

    // 找到单词边界
    let start = offset;
    let end = offset;

    // 向前查找单词开始
    while (start > 0 && text[start - 1] && /\w/.test(text[start - 1]!)) {
      start--;
    }

    // 向后查找单词结束
    while (end < text.length && text[end] && /\w/.test(text[end]!)) {
      end++;
    }

    const word = text.substring(start, end).trim();
    return word.length > 0 ? word : null;
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
      this.showErrorTooltip(text, '翻译失败，请稍后重试');
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
      <div class="tooltip-header">
        <span class="tooltip-original">${this.escapeHtml(originalText)}</span>
        <button class="tooltip-close" data-action="close">×</button>
      </div>
      <div class="tooltip-translation">${this.escapeHtml(translation)}</div>
      <div class="tooltip-actions">
        <button class="tooltip-btn tooltip-btn-primary" data-action="collect">
          <span class="btn-icon">📚</span>
          <span class="btn-text">收藏</span>
        </button>
        <button class="tooltip-btn" data-action="speak">
          <span class="btn-icon">🔊</span>
          <span class="btn-text">发音</span>
        </button>
        <button class="tooltip-btn" data-action="details">
          <span class="btn-icon">ℹ️</span>
          <span class="btn-text">详情</span>
        </button>
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

    // 添加动画效果
    this.animateTooltipIn();
  }

  private showErrorTooltip(originalText: string, errorMessage: string): void {
    // 创建简单的错误提示
    this.hideTooltip();

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'translation-tooltip error-tooltip';
    this.tooltip.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-original">${this.escapeHtml(originalText)}</span>
        <button class="tooltip-close" data-action="close">×</button>
      </div>
      <div class="tooltip-error">${this.escapeHtml(errorMessage)}</div>
    `;

    this.setTooltipStyles();
    
    // 简单定位在鼠标附近
    this.tooltip.style.top = '50px';
    this.tooltip.style.left = '50px';
    
    this.addTooltipEventListeners();
    document.body.appendChild(this.tooltip);

    // 3秒后自动隐藏
    setTimeout(() => this.hideTooltip(), 3000);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private setTooltipStyles(): void {
    if (!this.tooltip) return;

    Object.assign(this.tooltip.style, {
      position: 'fixed',
      backgroundColor: 'white',
      border: '1px solid #e1e5e9',
      borderRadius: '12px',
      padding: '0',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      zIndex: '10001',
      maxWidth: '320px',
      minWidth: '200px',
      fontSize: '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      opacity: '0',
      transform: 'translateY(-10px)',
      transition: 'all 0.2s ease-out'
    });

    // 设置头部样式
    const headerDiv = this.tooltip.querySelector('.tooltip-header') as HTMLElement;
    if (headerDiv) {
      Object.assign(headerDiv.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px 8px',
        borderBottom: '1px solid #f0f0f0'
      });
    }

    // 设置原文样式
    const originalDiv = this.tooltip.querySelector('.tooltip-original') as HTMLElement;
    if (originalDiv) {
      Object.assign(originalDiv.style, {
        fontWeight: '600',
        color: '#1a1a1a',
        fontSize: '15px'
      });
    }

    // 设置关闭按钮样式
    const closeBtn = this.tooltip.querySelector('.tooltip-close') as HTMLElement;
    if (closeBtn) {
      Object.assign(closeBtn.style, {
        background: 'none',
        border: 'none',
        fontSize: '18px',
        cursor: 'pointer',
        color: '#666',
        padding: '0',
        width: '20px',
        height: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      });
    }

    // 设置翻译文本样式
    const translationDiv = this.tooltip.querySelector('.tooltip-translation') as HTMLElement;
    if (translationDiv) {
      Object.assign(translationDiv.style, {
        color: '#4a5568',
        padding: '8px 16px 12px',
        lineHeight: '1.5',
        fontSize: '14px'
      });
    }

    // 设置错误信息样式
    const errorDiv = this.tooltip.querySelector('.tooltip-error') as HTMLElement;
    if (errorDiv) {
      Object.assign(errorDiv.style, {
        color: '#e53e3e',
        padding: '8px 16px 12px',
        lineHeight: '1.5',
        fontSize: '14px'
      });
    }

    // 设置操作区域样式
    const actionsDiv = this.tooltip.querySelector('.tooltip-actions') as HTMLElement;
    if (actionsDiv) {
      Object.assign(actionsDiv.style, {
        display: 'flex',
        gap: '8px',
        padding: '8px 16px 12px',
        borderTop: '1px solid #f0f0f0'
      });
    }

    // 设置按钮样式
    const buttons = this.tooltip.querySelectorAll('.tooltip-btn') as NodeListOf<HTMLElement>;
    buttons.forEach(btn => {
      Object.assign(btn.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 10px',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        backgroundColor: '#f8f9fa',
        cursor: 'pointer',
        fontSize: '12px',
        color: '#4a5568',
        transition: 'all 0.15s ease'
      });

      // 主要按钮样式
      if (btn.classList.contains('tooltip-btn-primary')) {
        btn.style.backgroundColor = '#3182ce';
        btn.style.color = 'white';
        btn.style.borderColor = '#3182ce';
      }

      // 悬停效果
      btn.addEventListener('mouseenter', () => {
        if (btn.classList.contains('tooltip-btn-primary')) {
          btn.style.backgroundColor = '#2c5aa0';
        } else {
          btn.style.backgroundColor = '#e2e8f0';
        }
      });

      btn.addEventListener('mouseleave', () => {
        if (btn.classList.contains('tooltip-btn-primary')) {
          btn.style.backgroundColor = '#3182ce';
        } else {
          btn.style.backgroundColor = '#f8f9fa';
        }
      });
    });
  }

  private animateTooltipIn(): void {
    if (!this.tooltip) return;

    // 使用 requestAnimationFrame 确保样式已应用
    requestAnimationFrame(() => {
      if (this.tooltip) {
        this.tooltip.style.opacity = '1';
        this.tooltip.style.transform = 'translateY(0)';
      }
    });
  }

  private positionTooltip(rect: DOMRect): void {
    if (!this.tooltip) return;

    // 临时添加到页面以获取尺寸
    this.tooltip.style.visibility = 'hidden';
    document.body.appendChild(this.tooltip);
    const tooltipRect = this.tooltip.getBoundingClientRect();
    document.body.removeChild(this.tooltip);
    this.tooltip.style.visibility = 'visible';

    // 计算工具提示位置
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX + (rect.width - tooltipRect.width) / 2;

    // 水平位置调整
    if (left + tooltipRect.width > window.innerWidth - 10) {
      left = window.innerWidth - tooltipRect.width - 10;
    }
    if (left < 10) {
      left = 10;
    }

    // 垂直位置调整
    if (top + tooltipRect.height > window.innerHeight + window.scrollY - 10) {
      top = rect.top + window.scrollY - tooltipRect.height - 8;
    }

    this.tooltip.style.top = top + 'px';
    this.tooltip.style.left = left + 'px';
  }

  private addTooltipEventListeners(): void {
    if (!this.tooltip) return;

    this.tooltip.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('[data-action]') as HTMLElement;
      
      if (button) {
        const action = button.getAttribute('data-action');
        this.handleTooltipAction(action);
      }
    });

    // 阻止工具提示内的点击事件冒泡
    this.tooltip.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  private handleTooltipAction(action: string | null): void {
    if (!action) return;
    
    switch (action) {
      case 'collect':
        this.collectVocabulary();
        break;
      case 'speak':
        this.speakText();
        break;
      case 'details':
        this.showWordDetails();
        break;
      case 'close':
        this.hideTooltip();
        break;
    }
  }

  private async collectVocabulary(): Promise<void> {
    try {
      // 发送消息到后台脚本收藏词汇
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({
          action: 'addVocabulary',
          data: {
            word: this.currentSelection,
            translation: this.tooltip?.querySelector('.tooltip-translation')?.textContent || '',
            context: this.getSelectionContext(),
            sourceUrl: window.location.href,
            addedDate: new Date(),
            reviewCount: 0,
            masteryLevel: 0,
            nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        }, resolve);
      });

      if (response?.success) {
        this.showCollectionSuccess();
      } else {
        throw new Error(response?.error || '收藏失败');
      }
    } catch (error) {
      console.error('收藏词汇失败:', error);
      this.showCollectionError();
    }
  }

  private async speakText(): Promise<void> {
    try {
      // 使用Web Speech API朗读
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(this.currentSelection);
        utterance.lang = 'en-US';
        utterance.rate = 0.8;
        speechSynthesis.speak(utterance);
      } else {
        console.warn('浏览器不支持语音合成');
      }
    } catch (error) {
      console.error('语音播放失败:', error);
    }
  }

  private async showWordDetails(): Promise<void> {
    try {
      // 请求词汇详细信息
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({
          action: 'lookupWord',
          data: { word: this.currentSelection }
        }, resolve);
      });

      if (response?.success) {
        this.showDetailedTooltip(response.data);
      }
    } catch (error) {
      console.error('获取词汇详情失败:', error);
    }
  }

  private showDetailedTooltip(wordData: any): void {
    if (!this.tooltip) return;

    // 更新工具提示内容显示详细信息
    const translationDiv = this.tooltip.querySelector('.tooltip-translation') as HTMLElement;
    if (translationDiv) {
      translationDiv.innerHTML = `
        <div><strong>发音:</strong> ${wordData.pronunciation}</div>
        <div><strong>词性:</strong> ${wordData.partOfSpeech}</div>
        <div><strong>释义:</strong> ${wordData.definitions.join('; ')}</div>
        ${wordData.examples.length > 0 ? `<div><strong>例句:</strong> ${wordData.examples[0]}</div>` : ''}
      `;
    }
  }

  private getSelectionContext(): string {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const textContent = container.textContent || '';
    
    // 获取选中文本前后的上下文
    const selectedText = selection.toString();
    const index = textContent.indexOf(selectedText);
    
    if (index !== -1) {
      const start = Math.max(0, index - 50);
      const end = Math.min(textContent.length, index + selectedText.length + 50);
      return textContent.substring(start, end);
    }
    
    return selectedText;
  }

  private showCollectionSuccess(): void {
    if (!this.tooltip) return;

    const actionsDiv = this.tooltip.querySelector('.tooltip-actions') as HTMLElement;
    if (actionsDiv) {
      actionsDiv.innerHTML = '<div style="color: #38a169; font-weight: 500;">✓ 已添加到生词本</div>';
      
      // 2秒后隐藏工具提示
      setTimeout(() => {
        this.hideTooltip();
      }, 2000);
    }
  }

  private showCollectionError(): void {
    if (!this.tooltip) return;

    const actionsDiv = this.tooltip.querySelector('.tooltip-actions') as HTMLElement;
    if (actionsDiv) {
      actionsDiv.innerHTML = '<div style="color: #e53e3e; font-weight: 500;">✗ 收藏失败</div>';
      
      // 3秒后恢复原始按钮
      setTimeout(() => {
        if (this.tooltip) {
          const actionsDiv = this.tooltip.querySelector('.tooltip-actions') as HTMLElement;
          if (actionsDiv) {
            actionsDiv.innerHTML = `
              <button class="tooltip-btn tooltip-btn-primary" data-action="collect">
                <span class="btn-icon">📚</span>
                <span class="btn-text">收藏</span>
              </button>
              <button class="tooltip-btn" data-action="speak">
                <span class="btn-icon">🔊</span>
                <span class="btn-text">发音</span>
              </button>
              <button class="tooltip-btn" data-action="details">
                <span class="btn-icon">ℹ️</span>
                <span class="btn-text">详情</span>
              </button>
            `;
          }
        }
      }, 3000);
    }
  }

  private hideTooltip(): void {
    if (this.tooltip && this.tooltip.parentNode) {
      // 添加淡出动画
      this.tooltip.style.opacity = '0';
      this.tooltip.style.transform = 'translateY(-10px)';
      
      setTimeout(() => {
        if (this.tooltip && this.tooltip.parentNode) {
          this.tooltip.parentNode.removeChild(this.tooltip);
          this.tooltip = null;
          this.currentSelection = '';
        }
      }, 200);
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
        if (response?.success) {
          resolve(response.data.translatedText);
        } else {
          reject(new Error(response?.error || '翻译请求失败'));
        }
      });
    });
  }

  cleanup(): void {
    this.hideTooltip();
    this.setEnabled(false);
    
    // 移除事件监听器
    document.removeEventListener('mouseup', this.handleSelection.bind(this));
    document.removeEventListener('keyup', this.handleSelection.bind(this));
    document.removeEventListener('click', this.handleClick.bind(this));
    document.removeEventListener('dblclick', this.handleDoubleClick.bind(this));
  }
}