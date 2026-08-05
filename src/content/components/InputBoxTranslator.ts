export type TranslateCallback = (text: string, targetLanguage?: string) => Promise<string>;

type EditableElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

interface TriggerSequence {
  baseValue: string;
  trailingSpaces: number;
  count: number;
  lastTriggerAt: number;
  timeoutId: number | null;
}

interface TranslationRequest {
  sourceText: string;
  targetLanguage?: string;
}

const DESKTOP_TRIGGER_WINDOW_MS = 200;
const MOBILE_TRIGGER_WINDOW_MS = 300;
const REQUIRED_TRAILING_SPACES = 3;

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  en: 'en',
  '\u82f1\u6587': 'en',
  '\u82f1\u8bed': 'en',
  'zh-cn': 'zh-CN',
  zh: 'zh-CN',
  '\u4e2d\u6587': 'zh-CN',
  'zh-tw': 'zh-TW',
  zht: 'zh-TW',
  'zh-hant': 'zh-TW',
  '\u7e41\u4e2d': 'zh-TW',
  ja: 'ja',
  '\u65e5\u8bed': 'ja',
  '\u65e5\u6587': 'ja',
  ko: 'ko',
  '\u97e9\u8bed': 'ko',
  '\u97e9\u6587': 'ko',
  fr: 'fr',
  '\u6cd5\u8bed': 'fr',
  '\u6cd5\u6587': 'fr',
  '\u53d1\u6587': 'fr',
  es: 'es',
  '\u897f\u73ed\u7259\u8bed': 'es',
  '\u897f\u8bed': 'es',
  ru: 'ru',
  '\u4fc4\u8bed': 'ru',
  '\u4fc4\u6587': 'ru',
  bo: 'bo',
  '\u85cf\u8bed': 'bo'
};

export class InputBoxTranslator {
  private translateCallback: TranslateCallback | null = null;
  private isInitialized = false;
  private lifecycleId = 0;
  private pendingTargets = new WeakSet<EditableElement>();
  private suppressedInputTargets = new WeakSet<EditableElement>();
  private keyboardTargets = new WeakSet<EditableElement>();
  private touchTargets = new WeakSet<EditableElement>();
  private lastTriggeredValues = new WeakMap<EditableElement, string>();
  private lastWrittenValues = new WeakMap<EditableElement, string>();
  private desktopSequences = new Map<EditableElement, TriggerSequence>();
  private mobileSequences = new Map<EditableElement, TriggerSequence>();
  private readonly boundHandleKeyUp = (event: KeyboardEvent): void => {
    if (event.isTrusted) this.handleKeyUp(event);
  };
  private readonly boundHandleInput = (event: Event): void => {
    if (event.isTrusted) this.handleInput(event);
  };
  private readonly boundHandleTouchEnd = (event: Event): void => {
    if (event.isTrusted) this.handleTouchEnd(event);
  };

  initialize(translateCallback: TranslateCallback): void {
    if (this.isInitialized) return;

    this.translateCallback = translateCallback;
    document.addEventListener('keyup', this.boundHandleKeyUp, true);
    document.addEventListener('input', this.boundHandleInput, true);
    document.addEventListener('touchend', this.boundHandleTouchEnd, true);
    this.isInitialized = true;
    this.lifecycleId++;
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const target = this.getEditableTarget(event.target);
    if (!target) return;

    this.keyboardTargets.add(target);
    this.touchTargets.delete(target);
    this.clearSequence(this.mobileSequences, target);

    if (!this.isSpaceKey(event) || event.isComposing) {
      this.clearSequence(this.desktopSequences, target);
      return;
    }

    this.recordTrigger(target, this.desktopSequences, DESKTOP_TRIGGER_WINDOW_MS);
  }

  private handleInput(event: Event): void {
    const target = this.getEditableTarget(event.target);
    if (!target || this.suppressedInputTargets.has(target)) return;

    const inputEvent = typeof InputEvent !== 'undefined' && event instanceof InputEvent
      ? event
      : null;
    if (inputEvent?.isComposing) {
      this.clearSequence(this.mobileSequences, target);
      return;
    }

    const value = this.getValue(target);
    if (!value.endsWith(' ')) {
      this.clearSequence(this.desktopSequences, target);
      this.clearSequence(this.mobileSequences, target);
      this.noteUserValue(target, value);
      return;
    }

    if (!this.keyboardTargets.has(target) || this.touchTargets.has(target)) {
      this.recordTrigger(target, this.mobileSequences, MOBILE_TRIGGER_WINDOW_MS);
    }
  }

  private handleTouchEnd(event: Event): void {
    const target = this.getEditableTarget(event.target);
    if (!target) return;

    this.touchTargets.add(target);
    this.keyboardTargets.delete(target);
    this.clearSequence(this.desktopSequences, target);
  }

  private recordTrigger(
    target: EditableElement,
    sequences: Map<EditableElement, TriggerSequence>,
    triggerWindowMs: number
  ): void {
    if (!this.translateCallback || this.pendingTargets.has(target) || this.suppressedInputTargets.has(target)) {
      return;
    }

    const value = this.getValue(target);
    if (this.shouldIgnoreValue(target, value)) return;

    const trailingSpaces = this.countTrailingSpaces(value);
    if (trailingSpaces === 0) {
      this.clearSequence(sequences, target);
      this.noteUserValue(target, value);
      return;
    }

    const now = Date.now();
    const baseValue = value.slice(0, -trailingSpaces);
    const previous = sequences.get(target);
    let count: number;

    if (!previous) {
      count = 1;
    } else if (previous.baseValue !== baseValue || trailingSpaces < previous.trailingSpaces) {
      count = 1;
    } else if (trailingSpaces === previous.trailingSpaces) {
      return;
    } else {
      const addedSpaces = trailingSpaces - previous.trailingSpaces;
      count = now - previous.lastTriggerAt <= triggerWindowMs
        ? previous.count + addedSpaces
        : addedSpaces;
    }

    if (previous?.timeoutId !== null && previous?.timeoutId !== undefined) {
      window.clearTimeout(previous.timeoutId);
    }

    const sequence: TriggerSequence = {
      baseValue,
      trailingSpaces,
      count,
      lastTriggerAt: now,
      timeoutId: null
    };
    sequence.timeoutId = window.setTimeout(() => {
      const current = sequences.get(target);
      if (current !== sequence) return;

      current.count = 0;
      current.timeoutId = null;
    }, triggerWindowMs);
    sequences.set(target, sequence);

    if (count < REQUIRED_TRAILING_SPACES || trailingSpaces < REQUIRED_TRAILING_SPACES) return;

    this.clearSequence(this.desktopSequences, target);
    this.clearSequence(this.mobileSequences, target);
    this.lastTriggeredValues.set(target, value);

    const request = this.createTranslationRequest(value);
    if (request.sourceText.length < 2) return;

    void this.translateTarget(target, value, value.trimEnd(), request);
  }

  private shouldIgnoreValue(target: EditableElement, value: string): boolean {
    const writtenValue = this.lastWrittenValues.get(target);
    if (writtenValue === value) return true;

    if (writtenValue !== undefined) {
      this.lastWrittenValues.delete(target);
    }

    return this.lastTriggeredValues.get(target) === value;
  }

  private noteUserValue(target: EditableElement, value: string): void {
    if (this.lastWrittenValues.get(target) !== value) {
      this.lastWrittenValues.delete(target);
    }

    if (this.lastTriggeredValues.get(target) !== value) {
      this.lastTriggeredValues.delete(target);
    }
  }

  private createTranslationRequest(value: string): TranslationRequest {
    const sourceText = value.trimEnd();
    const prefixMatch = /^\/([^\s/]+)\s+([\s\S]+)$/.exec(sourceText);
    if (!prefixMatch) return { sourceText };

    const alias = prefixMatch[1]!.toLowerCase();
    const targetLanguage = LANGUAGE_ALIASES[alias];
    if (!targetLanguage) return { sourceText };

    return {
      sourceText: prefixMatch[2]!.trim(),
      targetLanguage
    };
  }

  private countTrailingSpaces(value: string): number {
    const match = / +$/.exec(value);
    return match?.[0].length || 0;
  }

  private isSpaceKey(event: KeyboardEvent): boolean {
    return event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space';
  }

  private clearSequence(
    sequences: Map<EditableElement, TriggerSequence>,
    target: EditableElement
  ): void {
    const sequence = sequences.get(target);
    if (sequence?.timeoutId !== null && sequence?.timeoutId !== undefined) {
      window.clearTimeout(sequence.timeoutId);
    }
    sequences.delete(target);
  }

  private clearSequences(sequences: Map<EditableElement, TriggerSequence>): void {
    sequences.forEach(sequence => {
      if (sequence.timeoutId !== null) {
        window.clearTimeout(sequence.timeoutId);
      }
    });
    sequences.clear();
  }

  private getEditableTarget(target: EventTarget | null): EditableElement | null {
    if (target instanceof HTMLTextAreaElement) {
      return target;
    }

    if (target instanceof HTMLInputElement && this.isSupportedInput(target)) {
      return target;
    }

    let element = target instanceof HTMLElement ? target : null;
    while (element) {
      if (this.isContentEditable(element)) return element;
      element = element.parentElement;
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

  private async translateTarget(
    target: EditableElement,
    triggerValue: string,
    fallbackValue: string,
    request: TranslationRequest
  ): Promise<void> {
    const translateCallback = this.translateCallback;
    if (!translateCallback) return;

    const lifecycleId = this.lifecycleId;
    const pendingTargets = this.pendingTargets;
    pendingTargets.add(target);
    this.setState(target, 'translating');

    try {
      const translation = request.targetLanguage
        ? await translateCallback(request.sourceText, request.targetLanguage)
        : await translateCallback(request.sourceText);

      if (!this.isCurrentTranslation(target, triggerValue, lifecycleId)) return;

      this.setValue(target, translation);
      this.setState(target, 'translated');
    } catch (error) {
      if (this.isCurrentTranslation(target, triggerValue, lifecycleId)) {
        this.lastTriggeredValues.delete(target);
        this.setValue(target, fallbackValue);
        this.setState(target, 'error');
      }
      console.warn('Input box translation failed:', error);
    } finally {
      // cleanup() swaps the lifecycle collections. A stale request must only
      // release the collection it originally joined.
      pendingTargets.delete(target);
    }
  }

  private isCurrentTranslation(
    target: EditableElement,
    triggerValue: string,
    lifecycleId: number
  ): boolean {
    return this.isInitialized
      && this.lifecycleId === lifecycleId
      && this.getValue(target) === triggerValue;
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

    this.lastWrittenValues.set(target, value);
    this.suppressedInputTargets.add(target);
    try {
      target.dispatchEvent(new Event('input', { bubbles: true }));
    } finally {
      this.suppressedInputTargets.delete(target);
    }
  }

  private setState(target: EditableElement, state: 'translating' | 'translated' | 'error'): void {
    if (target instanceof HTMLElement) {
      target.dataset.lexibridgeInputTranslation = state;
    }
  }

  cleanup(): void {
    document.removeEventListener('keyup', this.boundHandleKeyUp, true);
    document.removeEventListener('input', this.boundHandleInput, true);
    document.removeEventListener('touchend', this.boundHandleTouchEnd, true);
    this.clearSequences(this.desktopSequences);
    this.clearSequences(this.mobileSequences);
    this.translateCallback = null;
    this.isInitialized = false;
    this.lifecycleId++;
    this.pendingTargets = new WeakSet<EditableElement>();
    this.suppressedInputTargets = new WeakSet<EditableElement>();
    this.keyboardTargets = new WeakSet<EditableElement>();
    this.touchTargets = new WeakSet<EditableElement>();
    this.lastTriggeredValues = new WeakMap<EditableElement, string>();
    this.lastWrittenValues = new WeakMap<EditableElement, string>();
    this.desktopSequences = new Map<EditableElement, TriggerSequence>();
    this.mobileSequences = new Map<EditableElement, TriggerSequence>();
  }
}
