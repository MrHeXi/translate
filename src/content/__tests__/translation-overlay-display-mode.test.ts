import { TranslationOverlay } from '../components/TranslationOverlay';

describe('TranslationOverlay display modes', () => {
  let overlay: TranslationOverlay;

  beforeEach(() => {
    document.body.innerHTML = '<p id="paragraph">Original sentence.</p>';
    overlay = new TranslationOverlay();
  });

  afterEach(() => {
    overlay.cleanup();
    document.body.innerHTML = '';
  });

  const addParagraphTranslation = (): Text => {
    const paragraph = document.getElementById('paragraph') as HTMLElement;
    const textNode = paragraph.firstChild as Text;

    overlay.addTranslation(textNode, 'Translated sentence.');

    return textNode;
  };

  it('shows original and translation in bilingual mode', () => {
    addParagraphTranslation();

    const original = document.querySelector('.translation-original') as HTMLElement;
    const translation = document.querySelector('.translation-overlay') as HTMLElement;
    const wrapper = document.querySelector('.translation-wrapper') as HTMLElement;

    expect(wrapper.dataset['translationDisplayMode']).toBe('bilingual');
    expect(original.style.display).toBe('');
    expect(translation.style.display).toBe('block');
    expect(translation.textContent).toBe('Translated sentence.');
  });

  it('can switch existing translations to translation-only and original-only', () => {
    addParagraphTranslation();

    overlay.setDisplayMode('translation-only');

    const original = document.querySelector('.translation-original') as HTMLElement;
    const translation = document.querySelector('.translation-overlay') as HTMLElement;
    const wrapper = document.querySelector('.translation-wrapper') as HTMLElement;

    expect(wrapper.dataset['translationDisplayMode']).toBe('translation-only');
    expect(original.style.display).toBe('none');
    expect(translation.style.display).toBe('block');

    overlay.setDisplayMode('original-only');

    expect(wrapper.dataset['translationDisplayMode']).toBe('original-only');
    expect(original.style.display).toBe('');
    expect(translation.style.display).toBe('none');
  });

  it('restores the original text node when translations are removed', () => {
    const textNode = addParagraphTranslation();

    overlay.setDisplayMode('translation-only');
    overlay.removeAllTranslations();

    const paragraph = document.getElementById('paragraph') as HTMLElement;

    expect(paragraph.firstChild).toBe(textNode);
    expect(paragraph.textContent).toBe('Original sentence.');
    expect(document.querySelector('.translation-wrapper')).toBeNull();
    expect(document.querySelector('.translation-overlay')).toBeNull();
  });
});
