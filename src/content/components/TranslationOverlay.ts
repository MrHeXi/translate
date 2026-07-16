// 翻译覆盖层组件
// 负责在原文下方显示译文

import type {
  PageTranslationDisplayMode,
  TranslationStylePreset
} from '../../services/TranslationPreferences';

export type { PageTranslationDisplayMode, TranslationStylePreset } from '../../services/TranslationPreferences';

interface TranslationEntry {
  wrapper: HTMLElement;
  originalElement: HTMLElement;
  translationElement: HTMLElement;
}

export class TranslationOverlay {
  private translations: Map<Node, TranslationEntry> = new Map();
  private tooltipElement: HTMLElement | null = null;
  private wordDetailsModal: HTMLElement | null = null;
  private displayMode: PageTranslationDisplayMode = 'bilingual';
  private stylePreset: TranslationStylePreset = 'subtle';

  setDisplayMode(mode: PageTranslationDisplayMode): void {
    this.displayMode = mode;

    for (const entry of this.translations.values()) {
      this.applyDisplayMode(entry);
    }
  }

  setStylePreset(preset: TranslationStylePreset): void {
    this.stylePreset = preset;
    for (const entry of this.translations.values()) {
      this.applyTranslationStyle(entry.translationElement);
    }
  }

  addTranslation(textNode: Node, translation: string, displayMode: PageTranslationDisplayMode = this.displayMode): void {
    // 如果已经有翻译，先移除
    this.removeTranslation(textNode);
    this.displayMode = displayMode;

    // 创建翻译元素
    const translationElement = document.createElement('div');
    translationElement.className = 'translation-overlay';
    translationElement.textContent = translation;

    const originalElement = document.createElement('span');
    originalElement.className = 'translation-original';
    
    // 设置样式
    this.setTranslationStyles(translationElement);

    // 添加交互功能
    this.addTranslationInteractions(translationElement, textNode.textContent || '', translation);

    // 插入到原文节点后面
    const parentElement = textNode.parentElement;
    if (parentElement) {
      // 创建包装容器
      const wrapper = document.createElement('span');
      wrapper.className = 'translation-wrapper';
      
      // 将原文节点包装起来
      parentElement.insertBefore(wrapper, textNode);
      originalElement.appendChild(textNode);
      wrapper.appendChild(originalElement);
      wrapper.appendChild(translationElement);
      const entry = {
        wrapper,
        originalElement,
        translationElement
      };
      this.applyDisplayMode(entry);
      
      // 记录翻译映射
      this.translations.set(textNode, entry);
    }
  }

  private applyDisplayMode(entry: TranslationEntry): void {
    entry.wrapper.dataset['translationDisplayMode'] = this.displayMode;

    switch (this.displayMode) {
      case 'translation-only':
        entry.originalElement.style.display = 'none';
        entry.translationElement.style.display = 'block';
        entry.translationElement.style.marginTop = '0';
        break;
      case 'original-only':
        entry.originalElement.style.display = '';
        entry.translationElement.style.display = 'none';
        break;
      case 'bilingual':
      default:
        entry.originalElement.style.display = '';
        entry.translationElement.style.display = 'block';
        entry.translationElement.style.marginTop = '3px';
        break;
    }
  }

  private setTranslationStyles(element: HTMLElement): void {
    this.applyTranslationStyle(element);

    element.addEventListener('mouseenter', () => {
      this.applyTranslationStyle(element, true);
    });

    element.addEventListener('mouseleave', () => {
      this.applyTranslationStyle(element);
    });
  }

  private applyTranslationStyle(element: HTMLElement, isHovered: boolean = false): void {
    const presetStyles: Record<TranslationStylePreset, Record<string, string>> = {
      subtle: {
        color: '#4a5568',
        backgroundColor: isHovered ? '#edf2f7' : '#f7fafc',
        padding: '4px 6px',
        borderRadius: '4px',
        border: `1px solid ${isHovered ? '#cbd5e0' : '#e2e8f0'}`,
        borderLeft: `1px solid ${isHovered ? '#cbd5e0' : '#e2e8f0'}`
      },
      highlight: {
        color: '#263238',
        backgroundColor: isHovered ? '#ffefad' : '#fff7d6',
        padding: '5px 8px',
        borderRadius: '2px',
        border: `1px solid ${isHovered ? '#c99716' : '#e3c45f'}`,
        borderLeft: '3px solid #b7791f'
      },
      plain: {
        color: isHovered ? '#174f3a' : '#2f6f52',
        backgroundColor: 'transparent',
        padding: '0',
        borderRadius: '0',
        border: '1px solid transparent',
        borderLeft: '1px solid transparent'
      }
    };

    Object.assign(element.style, {
      display: 'block',
      fontSize: '0.85em',
      fontStyle: 'normal',
      lineHeight: '1.4',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      position: 'relative',
      ...presetStyles[this.stylePreset]
    });
  }

  private addTranslationInteractions(element: HTMLElement, originalText: string, translation: string): void {
    // 添加点击事件显示更多选项
    element.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showTranslationOptions(element, originalText, translation);
    });

    // 添加右键菜单
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showTranslationContextMenu(e, originalText, translation);
    });
  }

  private showTranslationOptions(element: HTMLElement, originalText: string, translation: string): void {
    // 创建选项菜单
    const optionsMenu = document.createElement('div');
    optionsMenu.className = 'translation-options-menu';
    optionsMenu.innerHTML = `
      <div class="option-item" data-action="copy-translation">
        <span class="option-icon">📋</span>
        <span class="option-text">复制译文</span>
      </div>
      <div class="option-item" data-action="copy-original">
        <span class="option-icon">📄</span>
        <span class="option-text">复制原文</span>
      </div>
      <div class="option-item" data-action="add-vocabulary">
        <span class="option-icon">📚</span>
        <span class="option-text">添加到生词本</span>
      </div>
      <div class="option-item" data-action="hide-translation">
        <span class="option-icon">👁️</span>
        <span class="option-text">隐藏此翻译</span>
      </div>
    `;

    this.setOptionsMenuStyles(optionsMenu);
    this.positionOptionsMenu(optionsMenu, element);
    this.addOptionsMenuListeners(optionsMenu, originalText, translation, element);

    document.body.appendChild(optionsMenu);

    // 点击其他地方时隐藏菜单
    const hideMenu = (e: Event) => {
      if (!optionsMenu.contains(e.target as Node)) {
        optionsMenu.remove();
        document.removeEventListener('click', hideMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', hideMenu), 0);
  }

  private setOptionsMenuStyles(menu: HTMLElement): void {
    Object.assign(menu.style, {
      position: 'fixed',
      backgroundColor: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: '10002',
      minWidth: '160px',
      padding: '4px 0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '14px'
    });

    // 设置选项项样式
    const optionItems = menu.querySelectorAll('.option-item') as NodeListOf<HTMLElement>;
    optionItems.forEach(item => {
      Object.assign(item.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease'
      });

      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f7fafc';
      });

      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
      });
    });
  }

  private positionOptionsMenu(menu: HTMLElement, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 5;
    let left = rect.left + window.scrollX;

    // 确保菜单不超出视窗
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    document.body.removeChild(menu);

    if (left + menuRect.width > window.innerWidth) {
      left = window.innerWidth - menuRect.width - 10;
    }
    if (top + menuRect.height > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - menuRect.height - 5;
    }

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
  }

  private addOptionsMenuListeners(menu: HTMLElement, originalText: string, translation: string, element: HTMLElement): void {
    menu.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const optionItem = target.closest('.option-item') as HTMLElement;
      
      if (optionItem) {
        const action = optionItem.getAttribute('data-action');
        await this.handleOptionAction(action, originalText, translation, element);
        menu.remove();
      }
    });
  }

  private async handleOptionAction(action: string | null, originalText: string, translation: string, element: HTMLElement): Promise<void> {
    switch (action) {
      case 'copy-translation':
        await this.copyToClipboard(translation);
        this.showTemporaryMessage(element, '译文已复制');
        break;
      case 'copy-original':
        await this.copyToClipboard(originalText);
        this.showTemporaryMessage(element, '原文已复制');
        break;
      case 'add-vocabulary':
        await this.addToVocabulary(originalText, translation);
        break;
      case 'hide-translation':
        this.hideTranslation(element);
        break;
    }
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (error) {
      console.error('复制到剪贴板失败:', error);
    }
  }

  private showTemporaryMessage(element: HTMLElement, message: string): void {
    const originalText = element.textContent;
    element.textContent = message;
    element.style.color = '#38a169';
    
    setTimeout(() => {
      element.textContent = originalText;
      this.applyTranslationStyle(element);
    }, 2000);
  }

  private async addToVocabulary(originalText: string, translation: string): Promise<void> {
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({
          action: 'addVocabulary',
          data: {
            word: originalText,
            translation: translation,
            context: this.getTextContext(originalText),
            sourceUrl: window.location.href,
            addedDate: new Date(),
            reviewCount: 0,
            masteryLevel: 0,
            nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        }, resolve);
      });

      if (response?.success) {
        this.showNotification('已添加到生词本', 'success');
      } else {
        throw new Error(response?.error || '添加失败');
      }
    } catch (error) {
      console.error('添加到生词本失败:', error);
      this.showNotification('添加失败，请稍后重试', 'error');
    }
  }

  private getTextContext(text: string): string {
    // 获取文本的上下文环境
    const bodyText = document.body.textContent || '';
    const index = bodyText.indexOf(text);
    
    if (index !== -1) {
      const start = Math.max(0, index - 100);
      const end = Math.min(bodyText.length, index + text.length + 100);
      return bodyText.substring(start, end);
    }
    
    return text;
  }

  private hideTranslation(element: HTMLElement): void {
    const wrapper = element.parentElement;
    if (wrapper && wrapper.classList.contains('translation-wrapper')) {
      element.style.display = 'none';
    }
  }

  private showTranslationContextMenu(event: MouseEvent, originalText: string, translation: string): void {
    // 右键菜单功能（可以扩展更多选项）
    this.showTranslationOptions(event.target as HTMLElement, originalText, translation);
  }

  // 新增方法：显示工具提示
  showTooltip(originalText: string, translation: string, position: { x: number; y: number }): void {
    this.hideTooltip();

    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'translation-tooltip-overlay';
    this.tooltipElement.innerHTML = `
      <div class="tooltip-content">
        <div class="tooltip-original">${this.escapeHtml(originalText)}</div>
        <div class="tooltip-translation">${this.escapeHtml(translation)}</div>
      </div>
    `;

    this.setTooltipStyles();
    this.positionTooltip(position);
    
    document.body.appendChild(this.tooltipElement);

    // 3秒后自动隐藏
    setTimeout(() => this.hideTooltip(), 3000);
  }

  private setTooltipStyles(): void {
    if (!this.tooltipElement) return;

    Object.assign(this.tooltipElement.style, {
      position: 'fixed',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '14px',
      zIndex: '10003',
      maxWidth: '300px',
      pointerEvents: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });

    const originalDiv = this.tooltipElement.querySelector('.tooltip-original') as HTMLElement;
    if (originalDiv) {
      originalDiv.style.fontWeight = 'bold';
      originalDiv.style.marginBottom = '4px';
    }

    const translationDiv = this.tooltipElement.querySelector('.tooltip-translation') as HTMLElement;
    if (translationDiv) {
      translationDiv.style.opacity = '0.9';
    }
  }

  private positionTooltip(position: { x: number; y: number }): void {
    if (!this.tooltipElement) return;

    let left = position.x;
    let top = position.y + 10;

    // 确保工具提示不超出视窗
    const tooltipRect = this.tooltipElement.getBoundingClientRect();
    
    if (left + tooltipRect.width > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > window.innerHeight) {
      top = position.y - tooltipRect.height - 10;
    }

    this.tooltipElement.style.left = left + 'px';
    this.tooltipElement.style.top = top + 'px';
  }

  hideTooltip(): void {
    if (this.tooltipElement && this.tooltipElement.parentNode) {
      this.tooltipElement.parentNode.removeChild(this.tooltipElement);
      this.tooltipElement = null;
    }
  }

  // 新增方法：显示添加到生词本选项
  showAddToVocabularyOption(originalText: string, translation: string): void {
    // 这个方法可以在选词翻译时调用，显示添加到生词本的快捷选项
    if (this.tooltipElement) {
      const addButton = document.createElement('button');
      addButton.textContent = '+ 生词本';
      addButton.style.cssText = `
        margin-top: 8px;
        padding: 4px 8px;
        background: #3182ce;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      `;
      
      addButton.addEventListener('click', () => {
        this.addToVocabulary(originalText, translation);
        this.hideTooltip();
      });

      this.tooltipElement.appendChild(addButton);
    }
  }

  // 新增方法：显示词汇详情
  showWordDetails(wordData: any): void {
    this.hideWordDetails();

    this.wordDetailsModal = document.createElement('div');
    this.wordDetailsModal.className = 'word-details-modal';
    this.wordDetailsModal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3>${this.escapeHtml(wordData.word)}</h3>
          <button class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="word-pronunciation">${this.escapeHtml(wordData.pronunciation)}</div>
          <div class="word-part-of-speech">${this.escapeHtml(wordData.partOfSpeech)}</div>
          <div class="word-definitions">
            <h4>释义:</h4>
            <ul>
              ${wordData.definitions.map((def: string) => `<li>${this.escapeHtml(def)}</li>`).join('')}
            </ul>
          </div>
          ${wordData.examples.length > 0 ? `
            <div class="word-examples">
              <h4>例句:</h4>
              <ul>
                ${wordData.examples.map((example: string) => `<li>${this.escapeHtml(example)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    this.setWordDetailsStyles();
    this.addWordDetailsListeners();
    
    document.body.appendChild(this.wordDetailsModal);
  }

  private setWordDetailsStyles(): void {
    if (!this.wordDetailsModal) return;

    const overlay = this.wordDetailsModal.querySelector('.modal-overlay') as HTMLElement;
    if (overlay) {
      Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: '10004'
      });
    }

    const content = this.wordDetailsModal.querySelector('.modal-content') as HTMLElement;
    if (content) {
      Object.assign(content.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '0',
        maxWidth: '500px',
        maxHeight: '80vh',
        overflow: 'auto',
        zIndex: '10005',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      });
    }

    // 设置其他样式...
  }

  private addWordDetailsListeners(): void {
    if (!this.wordDetailsModal) return;

    const closeButton = this.wordDetailsModal.querySelector('.modal-close') as HTMLElement;
    const overlay = this.wordDetailsModal.querySelector('.modal-overlay') as HTMLElement;

    if (closeButton) {
      closeButton.addEventListener('click', () => this.hideWordDetails());
    }

    if (overlay) {
      overlay.addEventListener('click', () => this.hideWordDetails());
    }
  }

  hideWordDetails(): void {
    if (this.wordDetailsModal && this.wordDetailsModal.parentNode) {
      this.wordDetailsModal.parentNode.removeChild(this.wordDetailsModal);
      this.wordDetailsModal = null;
    }
  }

  // 新增方法：显示错误信息
  showError(message: string): void {
    this.showNotification(message, 'error');
  }

  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const notification = document.createElement('div');
    notification.className = `translation-notification ${type}`;
    notification.textContent = message;

    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 16px',
      borderRadius: '8px',
      color: 'white',
      fontSize: '14px',
      zIndex: '10006',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: type === 'success' ? '#38a169' : type === 'error' ? '#e53e3e' : '#3182ce'
    });

    document.body.appendChild(notification);

    // 3秒后自动移除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  removeTranslation(textNode: Node): void {
    const entry = this.translations.get(textNode);
    const wrapper = entry?.wrapper;
    if (wrapper && wrapper.parentNode) {
      // 将原文节点移回原位置
      wrapper.parentNode.insertBefore(textNode, wrapper);
      // 移除包装容器
      wrapper.parentNode.removeChild(wrapper);
      // 从映射中删除
      this.translations.delete(textNode);
    }
  }

  removeAllTranslations(): void {
    // 移除所有翻译
    for (const [textNode, entry] of this.translations) {
      const wrapper = entry.wrapper;
      if (wrapper.parentNode) {
        wrapper.parentNode.insertBefore(textNode, wrapper);
        wrapper.parentNode.removeChild(wrapper);
      }
    }
    this.translations.clear();
  }

  hasTranslation(textNode: Node): boolean {
    return this.translations.has(textNode);
  }

  getTranslationCount(): number {
    return this.translations.size;
  }

  // 清理资源
  cleanup(): void {
    this.removeAllTranslations();
    this.hideTooltip();
    this.hideWordDetails();
  }
}
