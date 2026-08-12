import type { BundledOcrLanguageCode } from './BundledOcrService';

export const OCR_LANGUAGE_ROUTER_LIMITS = Object.freeze({
  maxExplicitTextLength: 20_000,
  maxProbeResults: 5,
  maxProbeTextLength: 4_000,
  maxCandidates: 2
});

export const OCR_LANGUAGE_CANDIDATES: readonly BundledOcrLanguageCode[] = Object.freeze([
  'eng',
  'chi_sim',
  'chi_tra',
  'jpn',
  'kor'
]);

export type OcrLanguageRouterLimitResource =
  | 'explicit-text'
  | 'probe-results'
  | 'probe-text';

export class OcrLanguageRouterLimitError extends Error {
  constructor(
    readonly resource: OcrLanguageRouterLimitResource,
    readonly actual: number,
    readonly limit: number
  ) {
    super(`${resource} limit exceeded: ${actual} > ${limit}`);
    this.name = 'OcrLanguageRouterLimitError';
  }
}

export interface OcrScriptStatistics {
  readonly codePoints: number;
  readonly supportedScriptCharacters: number;
  readonly latin: number;
  readonly han: number;
  readonly hiragana: number;
  readonly katakana: number;
  readonly hangul: number;
  readonly simplifiedChineseHints: number;
  readonly traditionalChineseHints: number;
}

export interface OcrLanguageProbeResult {
  readonly text: string;
  readonly language?: BundledOcrLanguageCode;
  readonly confidence?: number;
}

export interface OcrLanguageRouteInput {
  readonly userSelectedLanguage: BundledOcrLanguageCode;
  readonly explicitText?: string;
  readonly ocrProbeResults?: readonly OcrLanguageProbeResult[];
}

export interface OcrLanguageRouteResult {
  readonly candidates: readonly BundledOcrLanguageCode[];
  readonly source: 'explicit-text' | 'ocr-probe' | 'user-fallback';
  readonly basis: 'script-heuristic' | 'user-selection';
  readonly preciseDetection: false;
  readonly statistics: OcrScriptStatistics;
}

const LATIN_PATTERN = /\p{Script=Latin}/u;
const HAN_PATTERN = /\p{Script=Han}/u;
const HIRAGANA_PATTERN = /\p{Script=Hiragana}/u;
const KATAKANA_PATTERN = /\p{Script=Katakana}/u;
const HANGUL_PATTERN = /\p{Script=Hangul}/u;
const SIMPLIFIED_CHINESE_HINTS = '这为国汉语龙后发里云书门体学见说时万与东丝乐习乡买亲亿仅从仓仪们价众优会伞伟传伤伦伪';
const TRADITIONAL_CHINESE_HINTS = '這為國漢語龍後發裡雲書門體學見說時萬與東絲樂習鄉買親億僅從倉儀們價眾優會傘偉傳傷倫偽';

export function analyzeOcrScriptStatistics(text: string): OcrScriptStatistics {
  validateText(text, OCR_LANGUAGE_ROUTER_LIMITS.maxExplicitTextLength, 'explicit-text');
  return collectStatistics(text);
}

export function routeOcrLanguageCandidates(
  input: OcrLanguageRouteInput
): OcrLanguageRouteResult {
  validateRouteInput(input);

  const explicitStatistics = input.explicitText === undefined
    ? emptyStatistics()
    : analyzeOcrScriptStatistics(input.explicitText);
  if (explicitStatistics.supportedScriptCharacters > 0) {
    return createHeuristicResult(
      explicitStatistics,
      'explicit-text',
      input.userSelectedLanguage
    );
  }

  const probeStatistics = collectProbeStatistics(input.ocrProbeResults ?? []);
  if (probeStatistics.supportedScriptCharacters > 0) {
    return createHeuristicResult(
      probeStatistics,
      'ocr-probe',
      input.userSelectedLanguage
    );
  }

  return Object.freeze({
    candidates: Object.freeze([input.userSelectedLanguage]),
    source: 'user-fallback' as const,
    basis: 'user-selection' as const,
    preciseDetection: false as const,
    statistics: probeStatistics.codePoints > 0 ? probeStatistics : explicitStatistics
  });
}

function createHeuristicResult(
  statistics: OcrScriptStatistics,
  source: 'explicit-text' | 'ocr-probe',
  userSelectedLanguage: BundledOcrLanguageCode
): OcrLanguageRouteResult {
  const scores = new Map<BundledOcrLanguageCode, number>();
  if (statistics.latin > 0) scores.set('eng', statistics.latin);
  if (statistics.hangul > 0) scores.set('kor', statistics.hangul * 4);

  const kana = statistics.hiragana + statistics.katakana;
  if (kana > 0) {
    scores.set('jpn', kana * 4 + statistics.han);
  } else if (statistics.han > 0) {
    addChineseScores(scores, statistics, userSelectedLanguage);
  }

  const candidates = Array.from(scores.entries())
    .sort((left, right) => (
      right[1] - left[1]
      || candidateTieBreak(left[0], right[0], userSelectedLanguage)
    ))
    .slice(0, OCR_LANGUAGE_ROUTER_LIMITS.maxCandidates)
    .map(([language]) => language);

  if (candidates.length === 0) candidates.push(userSelectedLanguage);
  return Object.freeze({
    candidates: Object.freeze(candidates),
    source,
    basis: 'script-heuristic' as const,
    preciseDetection: false as const,
    statistics
  });
}

function addChineseScores(
  scores: Map<BundledOcrLanguageCode, number>,
  statistics: OcrScriptStatistics,
  userSelectedLanguage: BundledOcrLanguageCode
): void {
  const base = statistics.han;
  if (statistics.simplifiedChineseHints > statistics.traditionalChineseHints) {
    scores.set('chi_sim', base + statistics.simplifiedChineseHints * 2);
    return;
  }
  if (statistics.traditionalChineseHints > statistics.simplifiedChineseHints) {
    scores.set('chi_tra', base + statistics.traditionalChineseHints * 2);
    return;
  }
  if (userSelectedLanguage === 'chi_sim' || userSelectedLanguage === 'chi_tra') {
    scores.set(userSelectedLanguage, base);
    return;
  }
  scores.set('chi_sim', base);
  scores.set('chi_tra', base);
}

function candidateTieBreak(
  left: BundledOcrLanguageCode,
  right: BundledOcrLanguageCode,
  userSelectedLanguage: BundledOcrLanguageCode
): number {
  if (left === userSelectedLanguage) return -1;
  if (right === userSelectedLanguage) return 1;
  return OCR_LANGUAGE_CANDIDATES.indexOf(left) - OCR_LANGUAGE_CANDIDATES.indexOf(right);
}

function collectProbeStatistics(
  probes: readonly OcrLanguageProbeResult[]
): OcrScriptStatistics {
  let combined = emptyStatistics();
  for (const probe of probes) {
    combined = addStatistics(combined, collectStatistics(probe.text));
  }
  return combined;
}

function collectStatistics(text: string): OcrScriptStatistics {
  let codePoints = 0;
  let latin = 0;
  let han = 0;
  let hiragana = 0;
  let katakana = 0;
  let hangul = 0;
  let simplifiedChineseHints = 0;
  let traditionalChineseHints = 0;

  for (const character of text) {
    codePoints += 1;
    if (HIRAGANA_PATTERN.test(character)) {
      hiragana += 1;
    } else if (KATAKANA_PATTERN.test(character)) {
      katakana += 1;
    } else if (HANGUL_PATTERN.test(character)) {
      hangul += 1;
    } else if (HAN_PATTERN.test(character)) {
      han += 1;
      if (SIMPLIFIED_CHINESE_HINTS.includes(character)) simplifiedChineseHints += 1;
      if (TRADITIONAL_CHINESE_HINTS.includes(character)) traditionalChineseHints += 1;
    } else if (LATIN_PATTERN.test(character)) {
      latin += 1;
    }
  }

  return Object.freeze({
    codePoints,
    supportedScriptCharacters: latin + han + hiragana + katakana + hangul,
    latin,
    han,
    hiragana,
    katakana,
    hangul,
    simplifiedChineseHints,
    traditionalChineseHints
  });
}

function addStatistics(
  left: OcrScriptStatistics,
  right: OcrScriptStatistics
): OcrScriptStatistics {
  return Object.freeze({
    codePoints: left.codePoints + right.codePoints,
    supportedScriptCharacters: left.supportedScriptCharacters + right.supportedScriptCharacters,
    latin: left.latin + right.latin,
    han: left.han + right.han,
    hiragana: left.hiragana + right.hiragana,
    katakana: left.katakana + right.katakana,
    hangul: left.hangul + right.hangul,
    simplifiedChineseHints: left.simplifiedChineseHints + right.simplifiedChineseHints,
    traditionalChineseHints: left.traditionalChineseHints + right.traditionalChineseHints
  });
}

function emptyStatistics(): OcrScriptStatistics {
  return Object.freeze({
    codePoints: 0,
    supportedScriptCharacters: 0,
    latin: 0,
    han: 0,
    hiragana: 0,
    katakana: 0,
    hangul: 0,
    simplifiedChineseHints: 0,
    traditionalChineseHints: 0
  });
}

function validateRouteInput(input: OcrLanguageRouteInput): void {
  if (!input || typeof input !== 'object') {
    throw new TypeError('input must be an OCR language route object');
  }
  if (!isBundledLanguage(input.userSelectedLanguage)) {
    throw new TypeError('userSelectedLanguage must be a bundled OCR language');
  }
  if (input.explicitText !== undefined) {
    validateText(input.explicitText, OCR_LANGUAGE_ROUTER_LIMITS.maxExplicitTextLength, 'explicit-text');
  }
  if (input.ocrProbeResults !== undefined && !Array.isArray(input.ocrProbeResults)) {
    throw new TypeError('ocrProbeResults must be an array');
  }
  const probes = input.ocrProbeResults ?? [];
  if (probes.length > OCR_LANGUAGE_ROUTER_LIMITS.maxProbeResults) {
    throw new OcrLanguageRouterLimitError(
      'probe-results',
      probes.length,
      OCR_LANGUAGE_ROUTER_LIMITS.maxProbeResults
    );
  }
  probes.forEach(probe => validateProbe(probe));
}

function validateProbe(probe: OcrLanguageProbeResult): void {
  if (!probe || typeof probe !== 'object') {
    throw new TypeError('each OCR probe result must be an object');
  }
  validateText(probe.text, OCR_LANGUAGE_ROUTER_LIMITS.maxProbeTextLength, 'probe-text');
  if (probe.language !== undefined && !isBundledLanguage(probe.language)) {
    throw new TypeError('probe language must be a bundled OCR language');
  }
  if (probe.confidence !== undefined
    && (!Number.isFinite(probe.confidence) || probe.confidence < 0 || probe.confidence > 100)) {
    throw new RangeError('probe confidence must be between 0 and 100');
  }
}

function validateText(
  text: string,
  limit: number,
  resource: 'explicit-text' | 'probe-text'
): void {
  if (typeof text !== 'string') throw new TypeError(`${resource} must be a string`);
  if (text.length > limit) throw new OcrLanguageRouterLimitError(resource, text.length, limit);
}

function isBundledLanguage(language: unknown): language is BundledOcrLanguageCode {
  return typeof language === 'string'
    && (OCR_LANGUAGE_CANDIDATES as readonly string[]).includes(language);
}
