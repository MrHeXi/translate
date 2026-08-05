import { InputBoxTranslator } from '../components/InputBoxTranslator';

type TestEditable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const setValue = (target: TestEditable, value: string): void => {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    target.value = value;
  } else {
    target.textContent = value;
  }
};

const handleDesktopSpace = (translator: InputBoxTranslator, target: TestEditable): void => {
  (translator as any).handleKeyUp({
    target,
    key: ' ',
    code: 'Space',
    isComposing: false
  });
};

const handleMobileInput = (translator: InputBoxTranslator, target: TestEditable): void => {
  (translator as any).handleInput({ target });
};

const handleTouchEnd = (translator: InputBoxTranslator, target: TestEditable): void => {
  (translator as any).handleTouchEnd({ target });
};

const dispatchDesktopSequence = (
  translator: InputBoxTranslator,
  target: TestEditable,
  sourceText: string,
  interval = 50
): void => {
  for (let spaces = 1; spaces <= 3; spaces++) {
    setValue(target, `${sourceText}${' '.repeat(spaces)}`);
    handleDesktopSpace(translator, target);
    if (spaces < 3) jest.advanceTimersByTime(interval);
  }
};

const dispatchMobileInputSequence = (
  translator: InputBoxTranslator,
  target: TestEditable,
  sourceText: string,
  interval = 100
): void => {
  for (let spaces = 1; spaces <= 3; spaces++) {
    setValue(target, `${sourceText}${' '.repeat(spaces)}`);
    handleMobileInput(translator, target);
    if (spaces < 3) jest.advanceTimersByTime(interval);
  }
};

describe('InputBoxTranslator', () => {
  let inputBoxTranslator: InputBoxTranslator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-19T00:00:00Z'));
    document.body.innerHTML = '';
    jest.clearAllMocks();
    inputBoxTranslator = new InputBoxTranslator();
  });

  afterEach(() => {
    inputBoxTranslator.cleanup();
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  it('translates textarea content after the desktop three-space shortcut', async () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const translate = jest.fn(async () => 'Translated sentence');
    const inputListener = jest.fn();
    textarea.addEventListener('input', inputListener);

    inputBoxTranslator.initialize(translate);
    dispatchDesktopSequence(inputBoxTranslator, textarea, 'Translate this sentence');
    await flushPromises();

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith('Translate this sentence');
    expect(textarea.value).toBe('Translated sentence');
    expect(textarea.dataset.lexibridgeInputTranslation).toBe('translated');
    expect(inputListener).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/en Hello', 'Hello', 'en'],
    ['/zh-CN Hello', 'Hello', 'zh-CN'],
    ['/\u4e2d\u6587 Hello', 'Hello', 'zh-CN'],
    ['/zh-Hant Hello', 'Hello', 'zh-TW'],
    ['/\u6cd5\u6587 Bonjour', 'Bonjour', 'fr']
  ])('normalizes the language prefix in %s', async (sourceText, expectedText, targetLanguage) => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const translate = jest.fn(async () => 'result');

    inputBoxTranslator.initialize(translate);
    dispatchDesktopSequence(inputBoxTranslator, input, sourceText);
    await flushPromises();

    expect(translate).toHaveBeenCalledWith(expectedText, targetLanguage);
  });

  it('keeps an unknown slash prefix in the source text', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const translate = jest.fn(async () => 'result');

    inputBoxTranslator.initialize(translate);
    dispatchDesktopSequence(inputBoxTranslator, input, '/path Hello');
    await flushPromises();

    expect(translate).toHaveBeenCalledWith('/path Hello');
  });

  it('does not trigger when the desktop space sequence exceeds the timeout', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const translate = jest.fn(async () => 'result');

    inputBoxTranslator.initialize(translate);

    setValue(input, 'Too slow ');
    handleDesktopSpace(inputBoxTranslator, input);
    jest.advanceTimersByTime(100);
    setValue(input, 'Too slow  ');
    handleDesktopSpace(inputBoxTranslator, input);
    jest.advanceTimersByTime(201);
    setValue(input, 'Too slow   ');
    handleDesktopSpace(inputBoxTranslator, input);
    await flushPromises();

    expect(translate).not.toHaveBeenCalled();
  });

  it('supports the mobile three-space shortcut through input events', async () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const translate = jest.fn(async () => 'Mobile result');

    inputBoxTranslator.initialize(translate);
    dispatchMobileInputSequence(inputBoxTranslator, textarea, '/\u65e5\u6587 Hello');
    await flushPromises();

    expect(translate).toHaveBeenCalledWith('Hello', 'ja');
    expect(textarea.value).toBe('Mobile result');
  });

  it('does not count touchend as a space but keeps subsequent mobile input active', async () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    const translate = jest.fn(async () => 'Touch result');

    inputBoxTranslator.initialize(translate);
    for (let spaces = 1; spaces <= 3; spaces++) {
      editable.textContent = `Touch this${' '.repeat(spaces)}`;
      handleTouchEnd(inputBoxTranslator, editable);
      if (spaces < 3) jest.advanceTimersByTime(100);
    }
    await flushPromises();

    expect(translate).not.toHaveBeenCalled();

    dispatchMobileInputSequence(inputBoxTranslator, editable, 'Touch this');
    await flushPromises();

    expect(translate).toHaveBeenCalledWith('Touch this');
    expect(editable.textContent).toBe('Touch result');
  });

  it('does not count pre-existing spaces as a mobile touch sequence', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'Existing text   ';
    document.body.appendChild(textarea);
    const translate = jest.fn(async () => 'should not run');

    inputBoxTranslator.initialize(translate);
    handleTouchEnd(inputBoxTranslator, textarea);
    await flushPromises();

    expect(translate).not.toHaveBeenCalled();
    expect(textarea.value).toBe('Existing text   ');
  });

  it('does not count pre-existing spaces as a desktop key sequence', async () => {
    const input = document.createElement('input');
    input.value = 'Existing text   ';
    document.body.appendChild(input);
    const translate = jest.fn(async () => 'should not run');

    inputBoxTranslator.initialize(translate);
    handleDesktopSpace(inputBoxTranslator, input);
    await flushPromises();

    expect(translate).not.toHaveBeenCalled();
    expect(input.value).toBe('Existing text   ');
  });

  it('does not inspect or translate existing content during initialization', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'Existing private text   ';
    document.body.appendChild(textarea);
    const translate = jest.fn(async () => 'result');

    inputBoxTranslator.initialize(translate);
    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(translate).not.toHaveBeenCalled();
    expect(textarea.value).toBe('Existing private text   ');
  });

  it('ignores synthetic page events even when they reproduce the shortcut', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const translate = jest.fn(async () => 'must not run');

    inputBoxTranslator.initialize(translate);
    for (let spaces = 1; spaces <= 3; spaces++) {
      input.value = `Hydrated value${' '.repeat(spaces)}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', {
        key: ' ',
        code: 'Space',
        bubbles: true
      }));
      input.dispatchEvent(new Event('touchend', { bubbles: true }));
      if (spaces < 3) jest.advanceTimersByTime(50);
    }
    await flushPromises();

    expect(translate).not.toHaveBeenCalled();
    expect(input.value).toBe('Hydrated value   ');
  });

  it('does not recurse when translated writeback emits an input event', async () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const translate = jest.fn(async () => 'Translated with spaces   ');

    inputBoxTranslator.initialize(translate);
    dispatchMobileInputSequence(inputBoxTranslator, textarea, 'Translate once');
    await flushPromises();

    handleMobileInput(inputBoxTranslator, textarea);
    handleTouchEnd(inputBoxTranslator, textarea);
    jest.advanceTimersByTime(500);
    await flushPromises();

    expect(translate).toHaveBeenCalledTimes(1);
    expect(textarea.value).toBe('Translated with spaces   ');
  });

  it('does not start overlapping translations for the same target', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    let resolveTranslation: ((value: string) => void) | undefined;
    const translate = jest.fn(() => new Promise<string>(resolve => {
      resolveTranslation = resolve;
    }));

    inputBoxTranslator.initialize(translate);
    dispatchDesktopSequence(inputBoxTranslator, input, 'Pending text');
    handleDesktopSpace(inputBoxTranslator, input);
    handleMobileInput(inputBoxTranslator, input);
    handleTouchEnd(inputBoxTranslator, input);

    expect(translate).toHaveBeenCalledTimes(1);

    resolveTranslation?.('Done');
    await flushPromises();
    expect(input.value).toBe('Done');
  });

  it('allows the same source text to be retried after a failed translation', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const translate = jest.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce('Retry succeeded');

    try {
      inputBoxTranslator.initialize(translate);
      dispatchDesktopSequence(inputBoxTranslator, input, 'Retry this');
      await flushPromises();

      expect(input.value).toBe('Retry this');
      expect(input.dataset.lexibridgeInputTranslation).toBe('error');

      dispatchDesktopSequence(inputBoxTranslator, input, 'Retry this');
      await flushPromises();

      expect(translate).toHaveBeenCalledTimes(2);
      expect(input.value).toBe('Retry succeeded');
      expect(input.dataset.lexibridgeInputTranslation).toBe('translated');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not let an old lifecycle release a new pending translation', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    let resolveOld: ((value: string) => void) | undefined;
    let resolveCurrent: ((value: string) => void) | undefined;
    const oldTranslation = jest.fn(() => new Promise<string>(resolve => {
      resolveOld = resolve;
    }));
    const currentTranslation = jest.fn(() => new Promise<string>(resolve => {
      resolveCurrent = resolve;
    }));

    inputBoxTranslator.initialize(oldTranslation);
    dispatchDesktopSequence(inputBoxTranslator, input, 'Old lifecycle');

    inputBoxTranslator.cleanup();
    inputBoxTranslator.initialize(currentTranslation);
    dispatchDesktopSequence(inputBoxTranslator, input, 'Current lifecycle');

    resolveOld?.('Stale result');
    await flushPromises();

    dispatchDesktopSequence(inputBoxTranslator, input, 'Overlapping request');
    expect(oldTranslation).toHaveBeenCalledTimes(1);
    expect(currentTranslation).toHaveBeenCalledTimes(1);

    resolveCurrent?.('Current result');
    await flushPromises();
  });

  it('removes every trigger listener and pending sequence on cleanup', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const translate = jest.fn(async () => 'result');

    inputBoxTranslator.initialize(translate);
    setValue(input, 'Clean up ');
    handleDesktopSpace(inputBoxTranslator, input);
    inputBoxTranslator.cleanup();

    setValue(input, 'Clean up   ');
    handleDesktopSpace(inputBoxTranslator, input);
    handleMobileInput(inputBoxTranslator, input);
    handleTouchEnd(inputBoxTranslator, input);
    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(translate).not.toHaveBeenCalled();
  });

  it('ignores ordinary typing and unsupported input types', async () => {
    const textInput = document.createElement('input');
    textInput.value = 'Do not translate yet ';
    document.body.appendChild(textInput);

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.value = 'secret   ';
    document.body.appendChild(passwordInput);

    const translate = jest.fn(async () => 'translated');
    inputBoxTranslator.initialize(translate);

    handleDesktopSpace(inputBoxTranslator, textInput);
    handleDesktopSpace(inputBoxTranslator, passwordInput);
    await flushPromises();

    expect(translate).not.toHaveBeenCalled();
    expect(textInput.value).toBe('Do not translate yet ');
    expect(passwordInput.value).toBe('secret   ');
  });
});
