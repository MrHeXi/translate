import {
  findMatchingSiteRule,
  normalizeSitePattern,
  resolvePageTranslationPreferences,
  SiteTranslationRule
} from '../TranslationPreferences';

describe('TranslationPreferences', () => {
  const rules: SiteTranslationRule[] = [
    {
      pattern: '*.example.com',
      translationEnabled: true,
      displayMode: 'translation-only',
      translationStyle: 'plain',
      translationScope: 'whole-page',
      excludeSelectors: ['.shared', '.wildcard-only']
    },
    {
      pattern: 'docs.example.com',
      translationEnabled: false,
      displayMode: 'original-only',
      translationStyle: 'highlight',
      translationScope: 'main-content',
      excludeSelectors: ['.shared', '.docs-only']
    }
  ];

  it('normalizes exact, wildcard, URL, and internationalized host patterns', () => {
    expect(normalizeSitePattern(' HTTPS://Docs.Example.com/path ')).toBe('docs.example.com');
    expect(normalizeSitePattern('*.Example.com')).toBe('*.example.com');
    expect(normalizeSitePattern('例子.测试')).toBe('xn--fsqu00a.xn--0zwm56d');
    expect(normalizeSitePattern('*.127.0.0.1')).toBeNull();
    expect(normalizeSitePattern('example.com/path')).toBeNull();
  });

  it('prefers an exact rule over a wildcard and uses the most specific wildcard', () => {
    expect(findMatchingSiteRule('docs.example.com', rules)?.pattern).toBe('docs.example.com');
    expect(findMatchingSiteRule('blog.example.com', rules)?.pattern).toBe('*.example.com');
    expect(findMatchingSiteRule('example.com', rules)?.pattern).toBe('*.example.com');

    const nestedRules: SiteTranslationRule[] = [
      ...rules,
      { pattern: '*.team.example.com', translationEnabled: true }
    ];
    expect(findMatchingSiteRule('docs.team.example.com', nestedRules)?.pattern).toBe('*.team.example.com');
  });

  it('merges global and matching-site preferences without enabling automatic translation', () => {
    const preferences = resolvePageTranslationPreferences('docs.example.com', {
      pageTranslationDisplayMode: 'bilingual',
      translationStyle: 'subtle',
      pageTranslationScope: 'whole-page',
      pageTranslationExcludeSelectors: ['nav', '.shared'],
      siteTranslationRules: rules
    });

    expect(preferences).toEqual({
      translationEnabled: false,
      displayMode: 'original-only',
      translationStyle: 'highlight',
      translationScope: 'main-content',
      excludeSelectors: ['nav', '.shared', '.docs-only'],
      matchedPattern: 'docs.example.com'
    });
  });

  it('uses safe defaults when no site rule matches', () => {
    expect(resolvePageTranslationPreferences('other.example.net', {})).toEqual({
      translationEnabled: true,
      displayMode: 'bilingual',
      translationStyle: 'subtle',
      translationScope: 'main-content',
      excludeSelectors: []
    });
  });
});
