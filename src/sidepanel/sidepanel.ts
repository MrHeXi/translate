import {
  AVAILABLE_TRANSLATION_PROVIDERS,
  getProviderTargetLanguages,
  getTranslationProvider,
  TRANSLATION_LANGUAGES
} from '../services/TranslationProviderRegistry';
import {
  AI_WRITING_ACTIONS,
  AI_WRITING_LENGTHS,
  AI_WRITING_TONES,
  AiWritingAction,
  isAiWritingAction
} from '../services/AiWritingAssistant';

type SidePanelMode = 'translate' | AiWritingAction;

interface SidePanelSettings {
  defaultTargetLanguage?: string;
  translationProvider?: string;
}

interface ProviderConfigSummary {
  providerId: string;
  configured: boolean;
}

class SidePanelController {
  private sourceText: HTMLTextAreaElement | null = null;
  private providerSelect: HTMLSelectElement | null = null;
  private targetLanguageSelect: HTMLSelectElement | null = null;
  private toneSelect: HTMLSelectElement | null = null;
  private lengthSelect: HTMLSelectElement | null = null;
  private instructionInput: HTMLInputElement | null = null;
  private translateButton: HTMLButtonElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private useResultButton: HTMLButtonElement | null = null;
  private aiControls: HTMLElement | null = null;
  private sourceLabel: HTMLLabelElement | null = null;
  private targetLanguageLabel: HTMLElement | null = null;
  private resultSection: HTMLElement | null = null;
  private resultHeading: HTMLElement | null = null;
  private resultText: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private characterCount: HTMLElement | null = null;
  private configuredProviderIds = new Set<string>();
  private isTranslating = false;
  private mode: SidePanelMode = 'translate';
  private preferredTranslationProvider = 'google';
  private preferredAiProvider = '';
  private preferredTranslationTarget = 'zh-CN';
  private preferredAiTarget = 'same';

  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    this.sourceText = document.getElementById('sourceText') as HTMLTextAreaElement | null;
    this.providerSelect = document.getElementById('translationProvider') as HTMLSelectElement | null;
    this.targetLanguageSelect = document.getElementById('targetLanguage') as HTMLSelectElement | null;
    this.toneSelect = document.getElementById('writingTone') as HTMLSelectElement | null;
    this.lengthSelect = document.getElementById('writingLength') as HTMLSelectElement | null;
    this.instructionInput = document.getElementById('writingInstruction') as HTMLInputElement | null;
    this.translateButton = document.getElementById('translateText') as HTMLButtonElement | null;
    this.copyButton = document.getElementById('copyTranslation') as HTMLButtonElement | null;
    this.useResultButton = document.getElementById('useResultAsInput') as HTMLButtonElement | null;
    this.aiControls = document.getElementById('aiControls');
    this.sourceLabel = document.getElementById('sourceLabel') as HTMLLabelElement | null;
    this.targetLanguageLabel = document.getElementById('targetLanguageLabel');
    this.resultSection = document.getElementById('resultSection');
    this.resultHeading = document.getElementById('resultHeading');
    this.resultText = document.getElementById('translationResult');
    this.status = document.getElementById('panelStatus');
    this.characterCount = document.getElementById('characterCount');

    this.populateControls();
    this.bindEvents();
    await this.loadProviderConfigurations();
    await this.loadSettings();
    this.updateCharacterCount();
  }

  private populateControls(): void {
    if (this.providerSelect) {
      this.providerSelect.replaceChildren(...AVAILABLE_TRANSLATION_PROVIDERS.map(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.label;
        return option;
      }));
    }

    if (this.targetLanguageSelect) {
      const sameLanguageOption = document.createElement('option');
      sameLanguageOption.value = 'same';
      sameLanguageOption.textContent = 'Same as input';
      this.targetLanguageSelect.replaceChildren(sameLanguageOption, ...TRANSLATION_LANGUAGES.map(language => {
        const option = document.createElement('option');
        option.value = language.code;
        option.textContent = language.label;
        return option;
      }));
    }

    if (this.toneSelect) {
      this.toneSelect.replaceChildren(...AI_WRITING_TONES.map(tone => {
        const option = document.createElement('option');
        option.value = tone.code;
        option.textContent = tone.label;
        return option;
      }));
    }

    if (this.lengthSelect) {
      this.lengthSelect.replaceChildren(...AI_WRITING_LENGTHS.map(length => {
        const option = document.createElement('option');
        option.value = length.code;
        option.textContent = length.label;
        return option;
      }));
      this.lengthSelect.value = 'similar';
    }
  }

  private bindEvents(): void {
    this.translateButton?.addEventListener('click', () => void this.submit());
    this.copyButton?.addEventListener('click', () => void this.copyTranslation());
    this.useResultButton?.addEventListener('click', () => this.useResultAsInput());
    this.sourceText?.addEventListener('input', () => this.updateCharacterCount());
    this.sourceText?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void this.submit();
      }
    });
    this.providerSelect?.addEventListener('change', () => {
      this.rememberProvider();
      this.updateTargetLanguageAvailability();
    });
    this.targetLanguageSelect?.addEventListener('change', () => this.rememberTargetLanguage());
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
      button.addEventListener('click', () => {
        const requestedMode = button.dataset['mode'];
        if (requestedMode === 'translate' || isAiWritingAction(requestedMode)) {
          this.setMode(requestedMode);
        }
      });
    });
    document.getElementById('clearText')?.addEventListener('click', () => this.clear());
    document.getElementById('openSettings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  private async loadProviderConfigurations(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getTranslationProviderConfigs' });
      const summaries = response?.success && Array.isArray(response.data)
        ? response.data as ProviderConfigSummary[]
        : [];
      this.configuredProviderIds = new Set(
        summaries.filter(summary => summary.configured).map(summary => summary.providerId)
      );
    } catch (error) {
      this.configuredProviderIds.clear();
      this.showStatus('Could not load provider configurations.', true);
    }

    this.updateProviderAvailability();
  }

  private updateProviderAvailability(): void {
    if (!this.providerSelect) return;

    Array.from(this.providerSelect.options).forEach(option => {
      const provider = getTranslationProvider(option.value);
      const requiresConfiguration = Boolean(provider?.configFields?.length);
      const isReady = !requiresConfiguration || this.configuredProviderIds.has(option.value);
      const supportsMode = this.mode === 'translate' || Boolean(provider?.supportsAiPreferences);
      option.disabled = !isReady || !supportsMode;
      option.textContent = provider
        ? `${provider.label}${!isReady
          ? ' (configure in Settings)'
          : supportsMode
            ? ''
            : ' (translation only)'}`
        : option.value;
    });

    const selectedOption = this.providerSelect.selectedOptions[0];
    if (!selectedOption || selectedOption.disabled) {
      const firstEnabled = Array.from(this.providerSelect.options).find(option => !option.disabled);
      if (firstEnabled) {
        this.providerSelect.value = firstEnabled.value;
      } else {
        this.providerSelect.selectedIndex = -1;
      }
    }
    this.updateSubmitAvailability();
  }

  private async loadSettings(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getSettings' });
      const settings = response?.success ? response.data as SidePanelSettings : {};
      const requestedProvider = settings.translationProvider || 'google';
      this.preferredTranslationProvider = requestedProvider;
      const providerOption = this.providerSelect
        ? Array.from(this.providerSelect.options).find(option => option.value === requestedProvider)
        : undefined;

      if (this.providerSelect) {
        this.providerSelect.value = providerOption && !providerOption.disabled ? requestedProvider : 'google';
      }
      if (this.targetLanguageSelect) {
        this.preferredTranslationTarget = settings.defaultTargetLanguage || 'zh-CN';
        this.targetLanguageSelect.value = this.preferredTranslationTarget;
      }
      this.updateTargetLanguageAvailability();
    } catch (error) {
      this.showStatus('Could not load translation settings.', true);
      if (this.providerSelect) this.providerSelect.value = 'google';
      if (this.targetLanguageSelect) this.targetLanguageSelect.value = this.preferredTranslationTarget;
      this.updateTargetLanguageAvailability();
    }
  }

  private updateTargetLanguageAvailability(): void {
    if (!this.providerSelect || !this.targetLanguageSelect) return;

    const isAiMode = this.mode !== 'translate';
    const supportedCodes = isAiMode
      ? new Set(['same', ...TRANSLATION_LANGUAGES.map(language => language.code)])
      : new Set(getProviderTargetLanguages(this.providerSelect.value).map(language => language.code));
    Array.from(this.targetLanguageSelect.options).forEach(option => {
      option.disabled = !supportedCodes.has(option.value);
    });

    if (!supportedCodes.has(this.targetLanguageSelect.value)) {
      let fallback: string | undefined;
      if (isAiMode && supportedCodes.has('same')) {
        fallback = 'same';
      } else if (supportedCodes.has(this.preferredTranslationTarget)) {
        fallback = this.preferredTranslationTarget;
      } else if (supportedCodes.has('zh-CN')) {
        fallback = 'zh-CN';
      } else {
        fallback = Array.from(this.targetLanguageSelect.options).find(option => !option.disabled)?.value;
      }
      if (fallback) this.targetLanguageSelect.value = fallback;
    }
    this.rememberTargetLanguage();
    this.updateSubmitAvailability();
  }

  private setMode(mode: SidePanelMode): void {
    this.rememberTargetLanguage();
    this.rememberProvider();
    this.mode = mode;

    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
      const isActive = button.dataset['mode'] === mode;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    const isAiMode = mode !== 'translate';
    if (this.aiControls) this.aiControls.hidden = !isAiMode;
    if (this.targetLanguageLabel) {
      this.targetLanguageLabel.textContent = isAiMode ? 'Output language' : 'Translate to';
    }

    if (mode === 'translate') {
      if (this.sourceLabel) this.sourceLabel.textContent = 'Source text';
      if (this.sourceText) this.sourceText.placeholder = 'Enter or paste text';
      if (this.translateButton) this.translateButton.textContent = 'Translate';
    } else {
      const definition = AI_WRITING_ACTIONS.find(action => action.code === mode)!;
      if (this.sourceLabel) this.sourceLabel.textContent = definition.inputLabel;
      if (this.sourceText) this.sourceText.placeholder = definition.placeholder;
      if (this.translateButton) this.translateButton.textContent = definition.buttonLabel;
    }

    this.updateProviderAvailability();
    if (this.providerSelect) {
      const preferredProvider = isAiMode
        ? this.preferredAiProvider
        : this.preferredTranslationProvider;
      const preferredOption = Array.from(this.providerSelect.options).find(
        option => option.value === preferredProvider && !option.disabled
      );
      if (preferredOption) this.providerSelect.value = preferredOption.value;
      this.rememberProvider();
    }
    if (this.targetLanguageSelect) {
      this.targetLanguageSelect.value = isAiMode
        ? this.preferredAiTarget
        : this.preferredTranslationTarget;
    }
    this.updateTargetLanguageAvailability();
    this.showStatus(
      isAiMode && !this.providerSelect?.value
        ? 'Configure an AI provider in Settings to use writing actions.'
        : ''
    );
  }

  private rememberProvider(): void {
    if (!this.providerSelect?.value) return;
    if (this.mode === 'translate') {
      this.preferredTranslationProvider = this.providerSelect.value;
    } else {
      this.preferredAiProvider = this.providerSelect.value;
    }
  }

  private rememberTargetLanguage(): void {
    if (!this.targetLanguageSelect?.value) return;
    if (this.mode === 'translate') {
      if (this.targetLanguageSelect.value !== 'same') {
        this.preferredTranslationTarget = this.targetLanguageSelect.value;
      }
    } else {
      this.preferredAiTarget = this.targetLanguageSelect.value;
    }
  }

  private async submit(): Promise<void> {
    if (this.isTranslating || !this.sourceText || !this.providerSelect || !this.targetLanguageSelect) return;
    const submittedMode = this.mode;
    const text = this.sourceText.value.trim();
    if (!text) {
      this.showStatus(submittedMode === 'translate' ? 'Enter text to translate.' : 'Enter text for this writing action.', true);
      return;
    }
    if (!this.providerSelect.value) {
      this.showStatus('Configure an AI provider in Settings to use writing actions.', true);
      return;
    }

    this.setBusy(true);
    this.showStatus(this.getProgressLabel(submittedMode));
    try {
      const providerId = this.providerSelect.value;
      const response = submittedMode === 'translate'
        ? await this.sendMessage({
          action: 'translate',
          data: {
            text,
            sourceLang: 'auto',
            targetLang: this.targetLanguageSelect.value,
            provider: providerId
          }
        })
        : await this.sendMessage({
          action: 'processAiText',
          data: {
            text,
            targetLang: this.targetLanguageSelect.value,
            provider: providerId,
            task: {
              action: submittedMode,
              tone: this.toneSelect?.value || 'neutral',
              length: this.lengthSelect?.value || 'similar',
              instruction: this.instructionInput?.value || ''
            }
          }
        });
      if (!response?.success) throw new Error(response?.error || 'Text processing failed.');

      const outputText = submittedMode === 'translate'
        ? response.data?.translatedText
        : response.data?.outputText;
      if (typeof outputText !== 'string' || !outputText.trim()) {
        throw new Error('The provider returned an empty result.');
      }

      if (this.resultText) this.resultText.textContent = outputText;
      if (this.resultHeading) this.resultHeading.textContent = this.getResultLabel(submittedMode);
      if (this.resultSection) this.resultSection.hidden = false;
      if (this.copyButton) this.copyButton.disabled = false;
      if (this.useResultButton) this.useResultButton.disabled = false;
      this.showStatus(`${this.getCompletionLabel(submittedMode)} with ${getTranslationProvider(providerId)?.label || 'provider'}.`);
    } catch (error) {
      this.showStatus(error instanceof Error ? error.message : 'Text processing failed.', true);
    } finally {
      this.setBusy(false);
    }
  }

  private async copyTranslation(): Promise<void> {
    const text = this.resultText?.textContent || '';
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      this.showStatus('Result copied.');
    } catch (error) {
      this.showStatus('Could not copy the result.', true);
    }
  }

  private useResultAsInput(): void {
    const text = this.resultText?.textContent || '';
    if (!text || !this.sourceText) return;
    this.sourceText.value = text;
    this.updateCharacterCount();
    this.showStatus('Result moved to the input.');
    this.sourceText.focus();
  }

  private clear(): void {
    if (this.sourceText) this.sourceText.value = '';
    if (this.resultText) this.resultText.textContent = '';
    if (this.resultSection) this.resultSection.hidden = true;
    if (this.copyButton) this.copyButton.disabled = true;
    if (this.useResultButton) this.useResultButton.disabled = true;
    this.updateCharacterCount();
    this.showStatus('');
    this.sourceText?.focus();
  }

  private updateCharacterCount(): void {
    if (!this.characterCount) return;
    const count = this.sourceText?.value.length || 0;
    this.characterCount.textContent = `${count} ${count === 1 ? 'character' : 'characters'}`;
  }

  private getProgressLabel(mode: SidePanelMode): string {
    switch (mode) {
      case 'translate': return 'Translating...';
      case 'polish': return 'Polishing...';
      case 'rewrite': return 'Rewriting...';
      case 'compose': return 'Creating draft...';
      case 'reply': return 'Drafting reply...';
      case 'summarize': return 'Summarizing...';
    }
  }

  private getCompletionLabel(mode: SidePanelMode): string {
    switch (mode) {
      case 'translate': return 'Translated';
      case 'polish': return 'Polished';
      case 'rewrite': return 'Rewritten';
      case 'compose': return 'Draft created';
      case 'reply': return 'Reply drafted';
      case 'summarize': return 'Summarized';
    }
  }

  private getResultLabel(mode: SidePanelMode): string {
    if (mode === 'translate') return 'Translation';
    return AI_WRITING_ACTIONS.find(action => action.code === mode)?.resultLabel || 'Result';
  }

  private getSubmitLabel(): string {
    if (this.mode === 'translate') return 'Translate';
    return AI_WRITING_ACTIONS.find(action => action.code === this.mode)?.buttonLabel || 'Run';
  }

  private updateSubmitAvailability(): void {
    if (!this.translateButton) return;
    const selectedProvider = this.providerSelect?.selectedOptions[0];
    this.translateButton.disabled = this.isTranslating
      || !selectedProvider
      || selectedProvider.disabled;
  }

  private setBusy(isBusy: boolean): void {
    this.isTranslating = isBusy;
    if (this.translateButton) {
      this.translateButton.textContent = isBusy ? this.getProgressLabel(this.mode) : this.getSubmitLabel();
    }
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
      button.disabled = isBusy;
    });
    if (this.providerSelect) this.providerSelect.disabled = isBusy;
    if (this.targetLanguageSelect) this.targetLanguageSelect.disabled = isBusy;
    if (this.toneSelect) this.toneSelect.disabled = isBusy;
    if (this.lengthSelect) this.lengthSelect.disabled = isBusy;
    if (this.instructionInput) this.instructionInput.disabled = isBusy;
    this.updateSubmitAvailability();
  }

  private showStatus(message: string, isError: boolean = false): void {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.classList.toggle('error', isError);
  }

  private sendMessage(message: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new SidePanelController(), { once: true });
