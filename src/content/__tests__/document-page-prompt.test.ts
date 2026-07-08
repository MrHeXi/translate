import { DocumentPagePrompt } from '../components/DocumentPagePrompt';

describe('DocumentPagePrompt', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/guide.pdf');

    (global as any).chrome = {
      runtime: {
        sendMessage: jest.fn()
      }
    };
  });

  it('shows a manual document translator entry on document URLs', () => {
    const prompt = new DocumentPagePrompt();

    prompt.initialize();

    const button = document.getElementById('lexibridge-document-translator-button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.textContent).toBe('Document translator');

    button.click();

    expect((global as any).chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'openDocumentTranslator',
      data: {
        sourceUrl: window.location.href
      }
    });

    prompt.cleanup();
    expect(document.getElementById('lexibridge-document-translator-button')).toBeNull();
  });

  it('does not show the entry on regular web pages', () => {
    window.history.replaceState({}, '', '/article');
    const prompt = new DocumentPagePrompt();

    prompt.initialize();

    expect(document.getElementById('lexibridge-document-translator-button')).toBeNull();
  });

  it('shows the entry on HTML document URLs', () => {
    window.history.replaceState({}, '', '/manual.html?download=1');
    const prompt = new DocumentPagePrompt();

    prompt.initialize();

    expect(document.getElementById('lexibridge-document-translator-button')).not.toBeNull();
  });
});
