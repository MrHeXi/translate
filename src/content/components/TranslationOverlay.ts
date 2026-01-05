// 翻译覆盖层组件
// 负责在原文下方显示译文

export class TranslationOverlay {
  private translations: Map<Node, HTMLElement> = new Map();

  addTranslation(textNode: Node, translation: string): void {
    // 如果已经有翻译，先移除
    this.removeTranslation(textNode);

    // 创建翻译元素
    const translationElement = document.createElement('div');
    translationElement.className = 'translation-overlay';
    translationElement.textContent = translation;
    
    // 设置样式
    this.setTranslationStyles(translationElement);

    // 插入到原文节点后面
    const parentElement = textNode.parentElement;
    if (parentElement) {
      // 创建包装容器
      const wrapper = document.createElement('span');
      wrapper.className = 'translation-wrapper';
      
      // 将原文节点包装起来
      parentElement.insertBefore(wrapper, textNode);
      wrapper.appendChild(textNode);
      wrapper.appendChild(translationElement);
      
      // 记录翻译映射
      this.translations.set(textNode, wrapper);
    }
  }

  private setTranslationStyles(element: HTMLElement): void {
    Object.assign(element.style, {
      display: 'block',
      color: '#666',
      fontSize: '0.9em',
      fontStyle: 'italic',
      marginTop: '2px',
      lineHeight: '1.4',
      backgroundColor: '#f8f9fa',
      padding: '2px 4px',
      borderRadius: '3px',
      border: '1px solid #e9ecef'
    });
  }

  removeTranslation(textNode: Node): void {
    const wrapper = this.translations.get(textNode);
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
    for (const [textNode, wrapper] of this.translations) {
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
}