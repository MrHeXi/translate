import { createTranslationRequestNamespace } from '../TranslationRequestId';

describe('createTranslationRequestNamespace', () => {
  it('creates bounded request namespaces that remain distinct across controllers', () => {
    const first = createTranslationRequestNamespace('video-subtitle');
    const second = createTranslationRequestNamespace('video-subtitle');

    expect(first).toMatch(/^video-subtitle:[A-Za-z0-9:_-]+$/);
    expect(second).toMatch(/^video-subtitle:[A-Za-z0-9:_-]+$/);
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThan(96);
    expect(second.length).toBeLessThan(96);
  });
});
