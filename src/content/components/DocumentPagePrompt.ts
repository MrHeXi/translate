export class DocumentPagePrompt {
  private promptElement: HTMLElement | null = null;

  initialize(): void {
    if (!this.isDocumentUrl(window.location.href) || this.promptElement) {
      return;
    }

    const prompt = document.createElement('button');
    prompt.id = 'lexibridge-document-translator-button';
    prompt.type = 'button';
    prompt.textContent = 'Document translator';
    prompt.setAttribute('aria-label', 'Open document translator');
    Object.assign(prompt.style, {
      position: 'fixed',
      right: '24px',
      bottom: '92px',
      zIndex: '2147483000',
      padding: '10px 12px',
      border: '1px solid #246bfe',
      borderRadius: '8px',
      background: '#246bfe',
      color: '#ffffff',
      font: '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
      boxShadow: '0 6px 18px rgba(0, 0, 0, 0.18)'
    });

    prompt.addEventListener('click', () => this.openDocumentTranslator());
    document.body.appendChild(prompt);
    this.promptElement = prompt;
  }

  cleanup(): void {
    this.promptElement?.remove();
    this.promptElement = null;
  }

  private openDocumentTranslator(): void {
    chrome.runtime.sendMessage({
      action: 'openDocumentTranslator',
      data: {
        sourceUrl: window.location.href
      }
    });
  }

  private isDocumentUrl(url: string): boolean {
    return /\.(pdf|txt|md|markdown|html|htm|json|srt|vtt)([?#].*)?$/i.test(url);
  }
}
