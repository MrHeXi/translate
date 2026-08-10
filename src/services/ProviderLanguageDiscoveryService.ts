import {
  getTranslationProvider,
  resolveTranslationProviderEndpoint,
  TRANSLATION_LANGUAGES,
  TranslationProviderLanguageCapabilities,
  TranslationProviderLanguagePair,
  TranslationProviderRuntimeConfig
} from './TranslationProviderRegistry';

export const PROVIDER_LANGUAGE_DISCOVERY_MAX_BYTES = 256 * 1024;
export const PROVIDER_LANGUAGE_DISCOVERY_MAX_PAIRS = 4096;
export const PROVIDER_LANGUAGE_DISCOVERY_TIMEOUT_MS = 10_000;

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const LANGUAGE_CODES = new Map(
  TRANSLATION_LANGUAGES.map(language => [language.code.toLowerCase(), language.code])
);

const LANGUAGE_ALIASES: Record<string, string> = {
  'zh': 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-sg': 'zh-CN',
  'zh-tw': 'zh-TW',
  'zh-hant': 'zh-TW',
  'zh-hk': 'zh-TW',
  'cht': 'zh-TW',
  'zht': 'zh-TW',
  'zt': 'zh-TW',
  'iw': 'he',
  'in': 'id',
  'ji': 'yi',
  'jw': 'jv',
  'tl': 'fil',
  'tj': 'tg',
  'nb': 'no'
};

const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
};

const normalizeLanguageCode = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) return null;
  const exact = LANGUAGE_CODES.get(normalized);
  if (exact) return exact;
  const alias = LANGUAGE_ALIASES[normalized];
  if (alias) return alias;
  const base = normalized.split('-')[0] || '';
  return LANGUAGE_ALIASES[base] || LANGUAGE_CODES.get(base) || null;
};

const normalizeLanguageList = (values: Iterable<unknown>): string[] => {
  const codes = new Set<string>();
  for (const value of values) {
    const code = normalizeLanguageCode(value);
    if (code) codes.add(code);
  }
  return TRANSLATION_LANGUAGES
    .map(language => language.code)
    .filter(code => codes.has(code));
};

const validateEndpoint = (endpoint: string): URL => {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('Translation provider endpoint is invalid');
  }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password) {
    throw new Error('Translation provider endpoint must use HTTPS or local HTTP');
  }
  url.hash = '';
  return url;
};

export const resolveProviderLanguageDiscoveryEndpoint = (
  providerId: string,
  config: TranslationProviderRuntimeConfig
): string => {
  const provider = getTranslationProvider(providerId);
  if (!provider?.languageDiscovery) throw new Error('Provider does not support language discovery');
  const translationEndpoint = resolveTranslationProviderEndpoint(providerId, config);
  const url = validateEndpoint(translationEndpoint);
  const path = url.pathname.replace(/\/+$/, '');

  if (provider.languageDiscovery === 'libretranslate') {
    if (!/\/translate$/i.test(path)) {
      throw new Error('LibreTranslate endpoint must end in /translate for language discovery');
    }
    url.pathname = path.replace(/\/translate$/i, '/languages');
  } else {
    url.pathname = /\/translation\/text\/translate$/i.test(path)
      ? path.replace(/\/translation\/text\/translate$/i, '/translation/supportedLanguages')
      : `${path}/translation/supportedLanguages`;
  }
  url.search = '';
  return url.toString();
};

const parseLibreTranslateLanguages = (value: unknown): {
  sourceLanguages: string[];
  targetLanguages: string[];
  languagePairs: TranslationProviderLanguagePair[];
  sourceLanguageMap: Record<string, string>;
  targetLanguageMap: Record<string, string>;
} => {
  if (!Array.isArray(value)) throw new Error('LibreTranslate returned an invalid language list');
  if (value.length > 256) throw new Error('LibreTranslate returned too many language entries');
  const sources: unknown[] = [];
  const targets: unknown[] = [];
  const pairs: TranslationProviderLanguagePair[] = [];
  const sourceLanguageMap: Record<string, string> = {};
  const targetLanguageMap: Record<string, string> = {};

  for (const item of value.slice(0, 256)) {
    if (!item || typeof item !== 'object') {
      throw new Error('LibreTranslate returned an invalid language list');
    }
    const record = item as { code?: unknown; name?: unknown; targets?: unknown };
    if (typeof record.code !== 'string' || typeof record.name !== 'string'
      || !Array.isArray(record.targets) || record.targets.some(target => typeof target !== 'string')) {
      throw new Error('LibreTranslate returned an invalid language list');
    }
    if (record.targets.length > 256) throw new Error('LibreTranslate returned too many language targets');
    const source = normalizeLanguageCode(record.code);
    if (source && typeof record.code === 'string') sourceLanguageMap[source] ||= record.code.trim();
    sources.push(record.code);
    if (!Array.isArray(record.targets)) continue;
    for (const rawTarget of record.targets.slice(0, 256)) {
      targets.push(rawTarget);
      const target = normalizeLanguageCode(rawTarget);
      if (target && typeof rawTarget === 'string') targetLanguageMap[target] ||= rawTarget.trim();
      if (source && target && pairs.length < PROVIDER_LANGUAGE_DISCOVERY_MAX_PAIRS) {
        pairs.push({ source, target });
      }
    }
  }

  return {
    sourceLanguages: normalizeLanguageList(sources),
    targetLanguages: normalizeLanguageList(targets),
    languagePairs: deduplicatePairs(pairs),
    sourceLanguageMap,
    targetLanguageMap
  };
};

const parseSystranLanguages = (value: unknown): {
  sourceLanguages: string[];
  targetLanguages: string[];
  languagePairs: TranslationProviderLanguagePair[];
  sourceLanguageMap: Record<string, string>;
  targetLanguageMap: Record<string, string>;
} => {
  const languagePairs = value && typeof value === 'object'
    ? (value as { languagePairs?: unknown }).languagePairs
    : null;
  if (!Array.isArray(languagePairs)) throw new Error('SYSTRAN returned an invalid language list');
  if (languagePairs.length > PROVIDER_LANGUAGE_DISCOVERY_MAX_PAIRS) {
    throw new Error('SYSTRAN returned too many language pairs');
  }
  const sources: unknown[] = [];
  const targets: unknown[] = [];
  const pairs: TranslationProviderLanguagePair[] = [];
  const sourceLanguageMap: Record<string, string> = {};
  const targetLanguageMap: Record<string, string> = {};

  for (const item of languagePairs.slice(0, PROVIDER_LANGUAGE_DISCOVERY_MAX_PAIRS)) {
    if (!item || typeof item !== 'object') {
      throw new Error('SYSTRAN returned an invalid language list');
    }
    const record = item as { source?: unknown; target?: unknown };
    if (typeof record.source !== 'string' || typeof record.target !== 'string') {
      throw new Error('SYSTRAN returned an invalid language list');
    }
    sources.push(record.source);
    targets.push(record.target);
    const source = normalizeLanguageCode(record.source);
    const target = normalizeLanguageCode(record.target);
    if (source && typeof record.source === 'string') sourceLanguageMap[source] ||= record.source.trim();
    if (target && typeof record.target === 'string') targetLanguageMap[target] ||= record.target.trim();
    if (source && target) pairs.push({ source, target });
  }

  return {
    sourceLanguages: normalizeLanguageList(sources),
    targetLanguages: normalizeLanguageList(targets),
    languagePairs: deduplicatePairs(pairs),
    sourceLanguageMap,
    targetLanguageMap
  };
};

const deduplicatePairs = (pairs: TranslationProviderLanguagePair[]): TranslationProviderLanguagePair[] => {
  const seen = new Set<string>();
  return pairs.filter(pair => {
    const key = `${pair.source}\u0000${pair.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export class ProviderLanguageDiscoveryService {
  constructor(
    private readonly fetchImplementation: FetchImplementation = globalThis.fetch.bind(globalThis),
    private readonly timeoutMs = PROVIDER_LANGUAGE_DISCOVERY_TIMEOUT_MS
  ) {}

  async discover(
    providerId: string,
    config: TranslationProviderRuntimeConfig,
    signal?: AbortSignal
  ): Promise<TranslationProviderLanguageCapabilities> {
    const provider = getTranslationProvider(providerId);
    if (!provider?.languageDiscovery) throw new Error('Provider does not support language discovery');
    const endpoint = resolveTranslationProviderEndpoint(providerId, config);
    validateEndpoint(endpoint);
    const discoveryEndpoint = resolveProviderLanguageDiscoveryEndpoint(providerId, config);
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (provider.languageDiscovery === 'systran') {
        const apiKey = config.apiKey?.trim() || '';
        if (!apiKey) throw new Error('SYSTRAN API key is not configured');
        headers.Authorization = `Key ${apiKey}`;
      }
      const response = await this.fetchImplementation(discoveryEndpoint, {
        method: 'GET',
        headers,
        credentials: 'omit',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${provider.label} language discovery failed (${response.status})`);
      const contentLength = Number(response.headers.get('content-length') || '0');
      if (contentLength > PROVIDER_LANGUAGE_DISCOVERY_MAX_BYTES) {
        throw new Error(`${provider.label} language response is too large`);
      }
      const text = await response.text();
      if (utf8ByteLength(text) > PROVIDER_LANGUAGE_DISCOVERY_MAX_BYTES) {
        throw new Error(`${provider.label} language response is too large`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`${provider.label} returned invalid language JSON`);
      }
      const languages = provider.languageDiscovery === 'libretranslate'
        ? parseLibreTranslateLanguages(parsed)
        : parseSystranLanguages(parsed);
      return {
        endpoint,
        discoveredAt: new Date().toISOString(),
        ...languages
      };
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) {
        throw new Error(`${provider.label} language discovery timed out`);
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}

export const providerLanguageDiscoveryService = new ProviderLanguageDiscoveryService();
