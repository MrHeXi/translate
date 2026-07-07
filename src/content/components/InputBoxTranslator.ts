type TranslateCallback = (text: string) => Promise<string>;

type EditableElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export class InputBoxTranslator {
  private translateCallback: TranslateCallback | null = null;
  private isInitialized = false;
  private pendingTargets = new WeakSet<EditableElement>();
  private readonly boundHandleKeyUp = this.handleKeyUp.bind(this);

  initialize(translateCallback: TranslateCallback): void {
    if (this.isInitialized) return;

    this.translateCallback = translateCallback;
    document.addEventListener('keyup', this.boundHandleKeyUp, true);
    this.isInitialized = true;
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (event.key !== ' ') return;

    const target = this.getEditableTarget(event.target);
    if (!target || this.pendingTargets.has(target)) return;

    const value = this.getValue(target);
    if (!value.endsWith('   ')) return;

    const sourceText = value.trimEnd();
    if (sourceText.length < 2 || !this.translateCallback) return;

    void this.translateTarget(target, sourceText);
  }

  private getEditableTarget(target: EventTarget | null): EditableElement | null {
    if (target instanceof HTMLTextAreaElement) {
      return target;
    }

    if (target instanceof HTMLInputElement && this.isSupportedInput(target)) {
      return target;
    }

    if (target instanceof HTMLElement && this.isContentEditable(target)) {
      return target;
    }

    return null;
  }

  private isContentEditable(element: HTMLElement): boolean {
    const contentEditable = element.getAttribute('contenteditable');

    return element.isContentEditable || contentEditable === '' || contentEditable?.toLowerCase() === 'true';
  }

  private isSupportedInput(input: HTMLInputElement): boolean {
    const unsupportedTypes = new Set([
      'button',
      'checkbox',
      'color',
      'date',
      'datetime-local',
      'file',
      'hidden',
      'image',
      'month',
      'number',
      'password',
      'radio',
      'range',
      'reset',
      'submit',
      'time',
      'week'
    ]);

    return !unsupportedTypes.has((input.getAttribute('type') || 'text').toLowerCase());
  }

  private getValue(target: EditableElement): string {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return target.value;
    }

    return target.textContent || '';
  }

  private async translateTarget(target: EditableElement, sourceText: string): Promise<void> {
    if (!this.translateCallback) return;

    this.pendingTargets.add(target);
    this.setState(target, 'translating');

    try {
      const translation = await this.translateCallback(sourceText);
      this.setValue(target, translation);
      this.setState(target, 'translated');
    } catch (error) {
      this.setValue(target, sourceText);
      this.setState(target, 'error');
      console.warn('Input box translation failed:', error);
    } finally {
      this.pendingTargets.delete(target);
    }
  }

  private setValue(target: EditableElement, value: string): void {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.value = value;

      const end = value.length;
      if (typeof target.setSelectionRange === 'function') {
        target.setSelectionRange(end, end);
      }
    } else {
      target.textContent = value;
    }

    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private setState(target: EditableElement, state: 'translating' | 'translated' | 'error'): void {
    if (target instanceof HTMLElement) {
      target.dataset.lexibridgeInputTranslation = state;
    }
  }

  cleanup(): void {
    document.removeEventListener('keyup', this.boundHandleKeyUp, true);
    this.translateCallback = null;
    this.isInitialized = false;
    this.pendingTargets = new WeakSet<EditableElement>();
  }
}
