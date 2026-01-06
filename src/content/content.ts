// Chrome扩展内容脚本
// 在网页中注入翻译功能

import { FloatingIcon } from './components/FloatingIcon';
import { TranslationOverlay } from './components/TranslationOverlay';
import { SelectionHandler } from './components/SelectionHandler';

class ContentScript {
  private floatingIcon: FloatingIcon;
  private translationOverlay: TranslationOverlay;
  private selectionHandler: SelectionHandler;
  private isTranslationMode: boolean = false;

  constructor() {
    this.floatingIcon = new FloatingIcon();
    this.translationOverlay = new TranslationOverlay();
    this.selectionHandler = new SelectionHandler();
    
    this.initialize();
  }

  private initialize() {
    // 等待页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupComponents());
    } else {
      this.setupComponents();
    }
  }

  private setupComponents() {
    // 创建浮动图标
    this.floatingIcon.create();
    this.floatingIcon.onToggle(() => this.toggleTranslation());

    // 设置选词翻译处理器
    this.selectionHandler.initialize();

    // 监听动态内容变化
    this.observePageChanges();
  }

  private async toggleTranslation() {
    if (this.isTranslationMode) {
      this.restoreOriginalPage();
    } else {
      await this.translatePage();
    }
    this.isTranslationMode = !this.isTranslationMode;
    this.floatingIcon.updateState(this.isTranslationMode);
  }

  private async translatePage() {
    try {
      // 获取页面所有文本节点
      const textNodes = this.getTextNodes(document.body);
      
      // 批量翻译文本
      for (const node of textNodes) {
        if (node.textContent && node.textContent.trim()) {
          const translation = await this.requestTranslation(node.textContent);
          this.translationOverlay.addTranslation(node, translation);
        }
      }
    } catch (error) {
      console.error('页面翻译失败:', error);
    }
  }

  private restoreOriginalPage() {
    this.translationOverlay.removeAllTranslations();
  }

  private getTextNodes(element: Element): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // 跳过脚本和样式标签
          const parent = node.parentElement;
          if (parent && ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node = walker.nextNode();
    while (node) {
      textNodes.push(node as Text);
      node = walker.nextNode();
    }

    return textNodes;
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

  private observePageChanges() {
    const observer = new MutationObserver((mutations) => {
      if (this.isTranslationMode) {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 翻译新增的文本内容
              this.translateNewContent(node as Element);
            }
          });
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private async translateNewContent(element: Element) {
    const textNodes = this.getTextNodes(element);
    for (const node of textNodes) {
      if (node.textContent && node.textContent.trim()) {
        const translation = await this.requestTranslation(node.textContent);
        this.translationOverlay.addTranslation(node, translation);
      }
    }
  }
}

// 初始化内容脚本
new ContentScript();