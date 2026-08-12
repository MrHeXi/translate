import {
  OCR_LANGUAGE_ROUTER_LIMITS,
  OcrLanguageRouterLimitError,
  analyzeOcrScriptStatistics,
  routeOcrLanguageCandidates
} from '../OcrLanguageRouter';

describe('OcrLanguageRouter', () => {
  it('counts supported scripts without treating the result as precise detection', () => {
    const statistics = analyzeOcrScriptStatistics('Hello 世界 こんにちは 한국어');

    expect(statistics).toMatchObject({
      latin: 5,
      han: 2,
      hiragana: 5,
      katakana: 0,
      hangul: 3,
      supportedScriptCharacters: 15
    });
    expect(routeOcrLanguageCandidates({
      userSelectedLanguage: 'eng',
      explicitText: 'Hello こんにちは'
    })).toMatchObject({
      candidates: ['jpn', 'eng'],
      source: 'explicit-text',
      basis: 'script-heuristic',
      preciseDetection: false
    });
  });

  it('routes mixed Korean and Latin scripts to no more than two candidates', () => {
    const result = routeOcrLanguageCandidates({
      userSelectedLanguage: 'chi_sim',
      explicitText: '한국어 OCR sample'
    });

    expect(result.candidates).toEqual(['kor', 'eng']);
    expect(result.candidates).toHaveLength(2);
    expect(result.preciseDetection).toBe(false);
  });

  it('uses simplified and traditional hints only as lightweight heuristics', () => {
    expect(routeOcrLanguageCandidates({
      userSelectedLanguage: 'eng',
      explicitText: '这是中文扫描文档'
    }).candidates).toEqual(['chi_sim']);
    expect(routeOcrLanguageCandidates({
      userSelectedLanguage: 'eng',
      explicitText: '這是繁體中文掃描文件'
    }).candidates).toEqual(['chi_tra']);
    expect(routeOcrLanguageCandidates({
      userSelectedLanguage: 'chi_tra',
      explicitText: '世界文化'
    }).candidates).toEqual(['chi_tra']);
  });

  it('uses supplied OCR probe text only when explicit text has no script evidence', () => {
    const result = routeOcrLanguageCandidates({
      userSelectedLanguage: 'eng',
      explicitText: '2026-08-12',
      ocrProbeResults: [{ language: 'jpn', text: 'テスト結果', confidence: 82 }]
    });

    expect(result).toMatchObject({
      candidates: ['jpn'],
      source: 'ocr-probe',
      basis: 'script-heuristic',
      preciseDetection: false
    });
  });

  it('falls back to the user selection when text and probes are unknown', () => {
    const result = routeOcrLanguageCandidates({
      userSelectedLanguage: 'chi_tra',
      explicitText: '1234 -- ???',
      ocrProbeResults: [{ language: 'eng', text: '9876', confidence: 99 }]
    });

    expect(result).toMatchObject({
      candidates: ['chi_tra'],
      source: 'user-fallback',
      basis: 'user-selection',
      preciseDetection: false
    });
  });

  it('fails closed on unsupported languages, malformed probes, and routing limits', () => {
    expect(() => routeOcrLanguageCandidates({
      userSelectedLanguage: 'fra' as 'eng'
    })).toThrow(TypeError);
    expect(() => analyzeOcrScriptStatistics(
      'x'.repeat(OCR_LANGUAGE_ROUTER_LIMITS.maxExplicitTextLength + 1)
    )).toThrow(OcrLanguageRouterLimitError);
    expect(() => routeOcrLanguageCandidates({
      userSelectedLanguage: 'eng',
      ocrProbeResults: Array.from(
        { length: OCR_LANGUAGE_ROUTER_LIMITS.maxProbeResults + 1 },
        () => ({ text: 'test' })
      )
    })).toThrow(expect.objectContaining({ resource: 'probe-results' }));
    expect(() => routeOcrLanguageCandidates({
      userSelectedLanguage: 'eng',
      ocrProbeResults: [{
        text: 'x'.repeat(OCR_LANGUAGE_ROUTER_LIMITS.maxProbeTextLength + 1)
      }]
    })).toThrow(expect.objectContaining({ resource: 'probe-text' }));
    expect(() => routeOcrLanguageCandidates({
      userSelectedLanguage: 'eng',
      ocrProbeResults: [{ text: 'hello', confidence: 101 }]
    })).toThrow(RangeError);
  });

  it('does no OCR, canvas, or network work while routing supplied text', () => {
    const createElement = jest.spyOn(document, 'createElement');
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    const result = routeOcrLanguageCandidates({
      userSelectedLanguage: 'eng',
      explicitText: 'English only'
    });

    expect(result.candidates).toEqual(['eng']);
    expect(createElement).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
