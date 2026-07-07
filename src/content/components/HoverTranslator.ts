type TranslateCallback = (text: string) => Promise<string>;

export class HoverTranslator {
  private translateCallback: TranslateCallback | null = null;
  private currentElement: HTMLElement | null = null;
  private isControlPressed = false;
  private isInitialized = false;
  private pendingElements = new WeakSet<HTMLElement>();
  private translationElements = new Map<HTMLElement, HTMLElement>();
  private readonly boundHandleMouseOver = this.handleMouseOver.bind(this);
  private readonly boundHandleKeyDown = this.handleKeyDown.bind(this);
  private readonly boundHandleKeyUp = this.handleKeyUp.bind(this);

  initialize(translateCallback: TranslateCallback): void {
    if (this.isInitialized) return;

    this.translateCallback = translateCallback;
    document.addEventListener('mouseover', this.boundHandleMouseOver, true);
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    document.addEventListener('keyup', this.boundHandleKeyUp, true);
    this.isInitialized = true;
  }

  private handleMouseOver(event: MouseEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const element = this.findTranslatableElement(target);

    if (!element) return;

    this.currentElement = element;

    if (this.isControlPressed || event.ctrlKey) {
      void this.translateElement(element);
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Control') return;

    this.isControlPressed = true;

    if (this.currentElement) {
      void this.translateElement(this.currentElement);
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Control') {
      this.isControlPressed = false;
    }
  }

  private findTranslatableElement(target: HTMLElement | null): HTMLElement | null {
    const element = target?.closest<HTMLElement>(
      'p, li, blockquote, article, section, td, th, h1, h2, h3, h4, h5, h6, div'
    );

    if (!element || this.shouldIgnoreElement(element)) {
      return null;
    }

    const text = this.getElementText(element);
    if (text.length < 8 || text.length > 2000) {
      return null;
    }

    return element;
  }

  private shouldIgnoreElement(element: HTMLElement): boolean {
    if (element.closest(
      [
        'script',
        'style',
        'noscript',
        'code',
        'pre',
        'textarea',
        'input',
        '[contenteditable="true"]',
        '.translation-overlay',
        '.translation-tooltip',
        '.translation-tooltip-overlay',
        '.lexibridge-hover-translation',
        '#translation-floating-icon',
        '#translation-floating-icon-hint'
      ].join(',')
    )) {
      return true;
    }

    return false;
  }

  private getElementText(element: HTMLElement): string {
    return (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
  }

  private async translateElement(element: HTMLElement): Promise<void> {
    if (!this.translateCallback || this.pendingElements.has(element)) return;

    const text = this.getElementText(element);
    if (!text) return;

    const existing = this.translationElements.get(element);
    if (existing) {
      existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
      return;
    }

    this.pendingElements.add(element);
    const translationElement = this.createTranslationElement('Translating...');
    element.insertAdjacentElement('afterend', translationElement);
    this.translationElements.set(element, translationElement);

    try {
      const translation = await this.translateCallback(text);
      translationElement.textContent = translation;
      translationElement.setAttribute('data-state', 'translated');
    } catch (error) {
      translationElement.textContent = 'Translation failed. Try again later.';
      translationElement.setAttribute('data-state', 'error');
      console.warn('Hover translation failed:', error);
    } finally {
      this.pendingElements.delete(element);
    }
  }

  private createTranslationElement(text: string): HTMLElement {
    const element = document.createElement('div');
    element.className = 'lexibridge-hover-translation';
    element.textContent = text;
    element.setAttribute('role', 'note');
    element.setAttribute('data-state', 'loading');

    Object.assign(element.style, {
      display: 'block',
      margin: '6px 0 10px',
      padding: '8px 10px',
      border: '1px solid #bfdbfe',
      borderRadius: '6px',
      backgroundColor: '#eff6ff',
      color: '#1e3a8a',
      fontSize: '14px',
      lineHeight: '1.5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box'
    });

    return element;
  }

  removeAllTranslations(): void {
    this.translationElements.forEach(element => {
      element.remove();
    });
    this.translationElements.clear();
  }

  cleanup(): void {
    document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
    document.removeEventListener('keydown', this.boundHandleKeyDown, true);
    document.removeEventListener('keyup', this.boundHandleKeyUp, true);
    this.removeAllTranslations();
    this.currentElement = null;
    this.translateCallback = null;
    this.isControlPressed = false;
    this.isInitialized = false;
  }
}
