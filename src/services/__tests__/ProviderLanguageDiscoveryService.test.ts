import {
  ProviderLanguageDiscoveryService,
  resolveProviderLanguageDiscoveryEndpoint,
  PROVIDER_LANGUAGE_DISCOVERY_MAX_BYTES
} from '../ProviderLanguageDiscoveryService';

const responseFor = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => headers[name.toLowerCase()] || null } as unknown as Headers,
  text: jest.fn().mockResolvedValue(JSON.stringify(body))
} as unknown as Response);

describe('ProviderLanguageDiscoveryService', () => {
  it('derives the documented discovery endpoints without carrying query credentials', () => {
    expect(resolveProviderLanguageDiscoveryEndpoint('libretranslate', {
      endpoint: 'https://translate.example.test/prefix/translate?api_key=secret#fragment'
    })).toBe('https://translate.example.test/prefix/languages');
    expect(resolveProviderLanguageDiscoveryEndpoint('systran', {
      endpoint: 'https://translate.example.test/prefix/translation/text/translate'
    })).toBe('https://translate.example.test/prefix/translation/supportedLanguages');
  });

  it('discovers LibreTranslate languages and keeps the source-target matrix', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(responseFor([
      { code: 'en', name: 'English', targets: ['fr', 'zh-Hant'] },
      { code: 'zh', name: 'Chinese', targets: ['en'] }
    ]));
    const service = new ProviderLanguageDiscoveryService(fetchImplementation);

    const result = await service.discover('libretranslate', {
      endpoint: 'https://translate.example.test/translate',
      apiKey: 'must-not-be-sent'
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://translate.example.test/languages',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      })
    );
    expect(JSON.stringify(fetchImplementation.mock.calls)).not.toContain('must-not-be-sent');
    expect(result.sourceLanguages).toEqual(['zh-CN', 'en']);
    expect(result.targetLanguages).toEqual(['zh-TW', 'en', 'fr']);
    expect(result.languagePairs).toEqual([
      { source: 'en', target: 'fr' },
      { source: 'en', target: 'zh-TW' },
      { source: 'zh-CN', target: 'en' }
    ]);
    expect(result.targetLanguageMap?.['zh-TW']).toBe('zh-Hant');
  });

  it('discovers SYSTRAN with an Authorization header and accepts an authoritative empty result', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(responseFor({
      languagePairs: []
    }));
    const service = new ProviderLanguageDiscoveryService(fetchImplementation);

    const result = await service.discover('systran', {
      endpoint: 'https://translate.example.test/translation/text/translate',
      apiKey: 'systran-secret'
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://translate.example.test/translation/supportedLanguages',
      expect.objectContaining({
        headers: { Accept: 'application/json', Authorization: 'Key systran-secret' },
        credentials: 'omit'
      })
    );
    expect(result.targetLanguages).toEqual([]);
    expect(JSON.stringify(fetchImplementation.mock.calls[0]?.[0])).not.toContain('systran-secret');
  });

  it('rejects malformed entries instead of silently treating them as supported', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(responseFor([
      { code: 'en', targets: ['fr'] }
    ]));
    const service = new ProviderLanguageDiscoveryService(fetchImplementation);

    await expect(service.discover('libretranslate', {
      endpoint: 'https://translate.example.test/translate'
    })).rejects.toThrow('invalid language list');
  });

  it('rejects oversized responses before parsing', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(responseFor(
      [],
      200,
      { 'content-length': String(PROVIDER_LANGUAGE_DISCOVERY_MAX_BYTES + 1) }
    ));
    const service = new ProviderLanguageDiscoveryService(fetchImplementation);

    await expect(service.discover('libretranslate', {
      endpoint: 'https://translate.example.test/translate'
    })).rejects.toThrow('too large');
  });

  it('rejects non-local HTTP endpoints and wrong LibreTranslate paths', async () => {
    expect(() => resolveProviderLanguageDiscoveryEndpoint('libretranslate', {
      endpoint: 'http://remote.example.test/translate'
    })).toThrow('HTTPS or local HTTP');
    expect(() => resolveProviderLanguageDiscoveryEndpoint('libretranslate', {
      endpoint: 'https://translate.example.test/api'
    })).toThrow('must end in /translate');
  });
});
