import { HoverTranslator } from '../components/HoverTranslator';

const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('HoverTranslator', () => {
  let hoverTranslator: HoverTranslator;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    hoverTranslator = new HoverTranslator();
  });

  afterEach(() => {
    hoverTranslator.cleanup();
    document.body.innerHTML = '';
  });

  it('translates a paragraph only when the user holds Control while hovering', async () => {
    document.body.innerHTML = '<p id="target">This paragraph should be translated on demand.</p>';
    const target = document.getElementById('target') as HTMLElement;
    const translate = jest.fn(async () => 'Translated paragraph on demand.');

    hoverTranslator.initialize(translate);

    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await flushPromises();

    expect(translate).not.toHaveBeenCalled();
    expect(document.querySelector('.lexibridge-hover-translation')).toBeNull();

    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, ctrlKey: true }));
    await flushPromises();

    expect(translate).toHaveBeenCalledWith('This paragraph should be translated on demand.');
    expect(document.querySelector('.lexibridge-hover-translation')?.textContent).toBe('Translated paragraph on demand.');
  });

  it('translates the current paragraph when Control is pressed after hover', async () => {
    document.body.innerHTML = '<p id="target">Hover first, then press Control to translate.</p>';
    const target = document.getElementById('target') as HTMLElement;
    const translate = jest.fn(async () => 'Hover first, then Control translates.');

    hoverTranslator.initialize(translate);
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true }));
    await flushPromises();

    expect(translate).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.lexibridge-hover-translation')?.getAttribute('data-state')).toBe('translated');
  });

  it('removes hover translations during cleanup', async () => {
    document.body.innerHTML = '<p id="target">Cleanup should remove generated hover translations.</p>';
    const target = document.getElementById('target') as HTMLElement;

    hoverTranslator.initialize(async () => 'Cleanup removes generated hover translations.');
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, ctrlKey: true }));
    await flushPromises();

    expect(document.querySelector('.lexibridge-hover-translation')).not.toBeNull();

    hoverTranslator.cleanup();

    expect(document.querySelector('.lexibridge-hover-translation')).toBeNull();
  });
});
