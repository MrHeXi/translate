import { InputBoxTranslator } from '../components/InputBoxTranslator';

const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('InputBoxTranslator', () => {
  let inputBoxTranslator: InputBoxTranslator;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    inputBoxTranslator = new InputBoxTranslator();
  });

  afterEach(() => {
    inputBoxTranslator.cleanup();
    document.body.innerHTML = '';
  });

  it('translates textarea content when the user types three trailing spaces', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'Translate this sentence   ';
    document.body.appendChild(textarea);
    const translate = jest.fn(async () => 'Translated sentence');
    const inputListener = jest.fn();
    textarea.addEventListener('input', inputListener);

    inputBoxTranslator.initialize(translate);
    textarea.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    await flushPromises();

    expect(translate).toHaveBeenCalledWith('Translate this sentence');
    expect(textarea.value).toBe('Translated sentence');
    expect(textarea.dataset.lexibridgeInputTranslation).toBe('translated');
    expect(inputListener).toHaveBeenCalled();
  });

  it('does not translate ordinary typing or unsupported input types', async () => {
    const textInput = document.createElement('input');
    textInput.value = 'Do not translate yet ';
    document.body.appendChild(textInput);

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.value = 'secret   ';
    document.body.appendChild(passwordInput);

    const translate = jest.fn(async () => 'translated');
    inputBoxTranslator.initialize(translate);

    textInput.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    passwordInput.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    await flushPromises();

    expect(translate).not.toHaveBeenCalled();
    expect(textInput.value).toBe('Do not translate yet ');
    expect(passwordInput.value).toBe('secret   ');
  });

  it('translates contenteditable text with the same deliberate shortcut', async () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.textContent = 'Translate editable text   ';
    document.body.appendChild(editable);

    const translate = jest.fn(async () => 'Translated editable text');
    inputBoxTranslator.initialize(translate);

    editable.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    await flushPromises();

    expect(translate).toHaveBeenCalledWith('Translate editable text');
    expect(editable.textContent).toBe('Translated editable text');
    expect(editable.dataset.lexibridgeInputTranslation).toBe('translated');
  });
});
