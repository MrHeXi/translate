export type PageTranslationDisplayMode = 'bilingual' | 'translation-only' | 'original-only';
export type TranslationStylePreset = 'subtle' | 'highlight' | 'plain';

export interface SiteTranslationRule {
  pattern: string;
  translationEnabled: boolean;
  displayMode?: PageTranslationDisplayMode;
  translationStyle?: TranslationStylePreset;
  excludeSelectors?: string[];
}

export interface PageTranslationPreferences {
  pageTranslationDisplayMode?: PageTranslationDisplayMode;
  translationStyle?: TranslationStylePreset;
  pageTranslationExcludeSelectors?: string[];
  siteTranslationRules?: SiteTranslationRule[];
}

export interface EffectivePageTranslationPreferences {
  translationEnabled: boolean;
  displayMode: PageTranslationDisplayMode;
  translationStyle: TranslationStylePreset;
  excludeSelectors: string[];
  matchedPattern?: string;
}

const DISPLAY_MODES: PageTranslationDisplayMode[] = ['bilingual', 'translation-only', 'original-only'];
const STYLE_PRESETS: TranslationStylePreset[] = ['subtle', 'highlight', 'plain'];

export const normalizeSitePattern = (value: string): string | null => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  const isWildcard = trimmed.startsWith('*.');
  let hostnameInput = isWildcard ? trimmed.slice(2) : trimmed;

  if (!isWildcard && hostnameInput.includes('://')) {
    try {
      hostnameInput = new URL(hostnameInput).hostname;
    } catch {
      return null;
    }
  } else if (/[/?#@]/.test(hostnameInput)) {
    return null;
  }

  try {
    const parsed = new URL(`https://${hostnameInput}`);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || parsed.username || parsed.password || parsed.port) return null;
    if (isWildcard && (hostname === 'localhost' || isIpAddress(hostname))) return null;
    return isWildcard ? `*.${hostname}` : hostname;
  } catch {
    return null;
  }
};

export const findMatchingSiteRule = (
  hostname: string,
  rules: SiteTranslationRule[] | undefined
): SiteTranslationRule | undefined => {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname || !Array.isArray(rules)) return undefined;

  const normalizedRules = rules
    .map(rule => ({ rule, pattern: normalizeSitePattern(rule.pattern) }))
    .filter((entry): entry is { rule: SiteTranslationRule; pattern: string } => Boolean(entry.pattern));

  const exactMatch = normalizedRules.find(entry => entry.pattern === normalizedHostname);
  if (exactMatch) return { ...exactMatch.rule, pattern: exactMatch.pattern };

  const wildcardMatch = normalizedRules
    .filter(entry => entry.pattern.startsWith('*.'))
    .filter(entry => {
      const baseDomain = entry.pattern.slice(2);
      return normalizedHostname === baseDomain || normalizedHostname.endsWith(`.${baseDomain}`);
    })
    .sort((left, right) => right.pattern.length - left.pattern.length)[0];

  return wildcardMatch
    ? { ...wildcardMatch.rule, pattern: wildcardMatch.pattern }
    : undefined;
};

export const resolvePageTranslationPreferences = (
  hostname: string,
  settings: PageTranslationPreferences
): EffectivePageTranslationPreferences => {
  const rule = findMatchingSiteRule(hostname, settings.siteTranslationRules);
  const globalDisplayMode = isDisplayMode(settings.pageTranslationDisplayMode)
    ? settings.pageTranslationDisplayMode
    : 'bilingual';
  const globalStyle = isStylePreset(settings.translationStyle)
    ? settings.translationStyle
    : 'subtle';
  const displayMode = isDisplayMode(rule?.displayMode) ? rule.displayMode : globalDisplayMode;
  const translationStyle = isStylePreset(rule?.translationStyle) ? rule.translationStyle : globalStyle;

  const excludeSelectors = Array.from(new Set([
    ...sanitizeSelectors(settings.pageTranslationExcludeSelectors),
    ...sanitizeSelectors(rule?.excludeSelectors)
  ]));

  return {
    translationEnabled: rule?.translationEnabled !== false,
    displayMode,
    translationStyle,
    excludeSelectors,
    ...(rule ? { matchedPattern: rule.pattern } : {})
  };
};

const normalizeHostname = (hostname: string): string | null => {
  const normalized = normalizeSitePattern(hostname);
  return normalized?.startsWith('*.') ? normalized.slice(2) : normalized;
};

const isDisplayMode = (value: unknown): value is PageTranslationDisplayMode =>
  typeof value === 'string' && DISPLAY_MODES.includes(value as PageTranslationDisplayMode);

const isStylePreset = (value: unknown): value is TranslationStylePreset =>
  typeof value === 'string' && STYLE_PRESETS.includes(value as TranslationStylePreset);

const sanitizeSelectors = (selectors: string[] | undefined): string[] =>
  Array.isArray(selectors)
    ? selectors.map(selector => selector.trim()).filter(Boolean)
    : [];

const isIpAddress = (hostname: string): boolean =>
  /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
