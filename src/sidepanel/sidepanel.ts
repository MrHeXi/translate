import {
  AVAILABLE_TRANSLATION_PROVIDERS,
  getProviderTargetLanguages,
  getTranslationProvider,
  TRANSLATION_LANGUAGES
} from '../services/TranslationProviderRegistry';

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
  private translateButton: HTMLButtonElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private resultSection: HTMLElement | null = null;
  private resultText: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private characterCount: HTMLElement | null = null;
  private configuredProviderIds = new Set<string>();
  private isTranslating = false;

  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    this.sourceText = document.getElementById('sourceText') as HTMLTextAreaElement | null;
    this.providerSelect = document.getElementById('translationProvider') as HTMLSelectElement | null;
    this.targetLanguageSelect = document.getElementById('targetLanguage') as HTMLSelectElement | null;
    this.translateButton = document.getElementById('translateText') as HTMLButtonElement | null;
    this.copyButton = document.getElementById('copyTranslation') as HTMLButtonElement | null;
    this.resultSection = document.getElementById('resultSection');
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
      this.targetLanguageSelect.replaceChildren(...TRANSLATION_LANGUAGES.map(language => {
        const option = document.createElement('option');
        option.value = language.code;
        option.textContent = language.label;
        return option;
      }));
    }
  }

  private bindEvents(): void {
    this.translateButton?.addEventListener('click', () => void this.translate());
    this.copyButton?.addEventListener('click', () => void this.copyTranslation());
    this.sourceText?.addEventListener('input', () => this.updateCharacterCount());
    this.sourceText?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void this.translate();
      }
    });
    this.providerSelect?.addEventListener('change', () => this.updateTargetLanguageAvailability());
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
      option.disabled = !isReady;
      option.textContent = provider
        ? `${provider.label}${isReady ? '' : ' (configure in Settings)'}`
        : option.value;
    });
  }

  private async loadSettings(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getSettings' });
      const settings = response?.success ? response.data as SidePanelSettings : {};
      const requestedProvider = settings.translationProvider || 'google';
      const providerOption = this.providerSelect
        ? Array.from(this.providerSelect.options).find(option => option.value === requestedProvider)
        : undefined;

      if (this.providerSelect) {
        this.providerSelect.value = providerOption && !providerOption.disabled ? requestedProvider : 'google';
      }
      if (this.targetLanguageSelect) {
        this.targetLanguageSelect.value = settings.defaultTargetLanguage || 'zh-CN';
      }
      this.updateTargetLanguageAvailability();
    } catch (error) {
      this.showStatus('Could not load translation settings.', true);
      if (this.providerSelect) this.providerSelect.value = 'google';
      if (this.targetLanguageSelect) this.targetLanguageSelect.value = 'zh-CN';
      this.updateTargetLanguageAvailability();
    }
  }

  private updateTargetLanguageAvailability(): void {
    if (!this.providerSelect || !this.targetLanguageSelect) return;

    const supportedCodes = new Set(
      getProviderTargetLanguages(this.providerSelect.value).map(language => language.code)
    );
    Array.from(this.targetLanguageSelect.options).forEach(option => {
      option.disabled = !supportedCodes.has(option.value);
    });

    if (!supportedCodes.has(this.targetLanguageSelect.value)) {
      const fallback = supportedCodes.has('zh-CN')
        ? 'zh-CN'
        : Array.from(this.targetLanguageSelect.options).find(option => !option.disabled)?.value;
      if (fallback) this.targetLanguageSelect.value = fallback;
    }
  }

  private async translate(): Promise<void> {
    if (this.isTranslating || !this.sourceText || !this.providerSelect || !this.targetLanguageSelect) return;
    const text = this.sourceText.value.trim();
    if (!text) {
      this.showStatus('Enter text to translate.', true);
      return;
    }

    this.setBusy(true);
    this.showStatus('Translating...');
    try {
      const response = await this.sendMessage({
        action: 'translate',
        data: {
          text,
          sourceLang: 'auto',
          targetLang: this.targetLanguageSelect.value,
          provider: this.providerSelect.value
        }
      });
      if (!response?.success) throw new Error(response?.error || 'Translation failed.');

      if (this.resultText) this.resultText.textContent = response.data.translatedText;
      if (this.resultSection) this.resultSection.hidden = false;
      if (this.copyButton) this.copyButton.disabled = false;
      this.showStatus(`Translated with ${getTranslationProvider(this.providerSelect.value)?.label || 'provider'}.`);
    } catch (error) {
      this.showStatus(error instanceof Error ? error.message : 'Translation failed.', true);
    } finally {
      this.setBusy(false);
    }
  }

  private async copyTranslation(): Promise<void> {
    const text = this.resultText?.textContent || '';
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      this.showStatus('Translation copied.');
    } catch (error) {
      this.showStatus('Could not copy translation.', true);
    }
  }

  private clear(): void {
    if (this.sourceText) this.sourceText.value = '';
    if (this.resultText) this.resultText.textContent = '';
    if (this.resultSection) this.resultSection.hidden = true;
    if (this.copyButton) this.copyButton.disabled = true;
    this.updateCharacterCount();
    this.showStatus('');
    this.sourceText?.focus();
  }

  private updateCharacterCount(): void {
    if (!this.characterCount) return;
    const count = this.sourceText?.value.length || 0;
    this.characterCount.textContent = `${count} ${count === 1 ? 'character' : 'characters'}`;
  }

  private setBusy(isBusy: boolean): void {
    this.isTranslating = isBusy;
    if (this.translateButton) {
      this.translateButton.disabled = isBusy;
      this.translateButton.textContent = isBusy ? 'Translating...' : 'Translate';
    }
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
