export const SENSITIVE_DATA_MAX_FIELDS = 32;
export const SENSITIVE_DATA_MAX_FIELD_ID_LENGTH = 128;
export const SENSITIVE_DATA_MAX_FIELD_LENGTH = 50_000;
export const SENSITIVE_DATA_MAX_TOTAL_LENGTH = 200_000;
export const SENSITIVE_DATA_MAX_MATCHES = 512;

export interface SensitiveDataField {
  id: string;
  text: string;
  requireRestoration: boolean;
}

export interface MaskedSensitiveDataField {
  id: string;
  text: string;
  requireRestoration: boolean;
}

export type SensitiveDataMaskRejectionReason =
  | 'invalid-fields'
  | 'too-many-fields'
  | 'duplicate-field-id'
  | 'field-id-too-long'
  | 'field-too-long'
  | 'total-input-too-large'
  | 'too-many-matches'
  | 'reserved-placeholder-input'
  | 'session-already-used';

export type SensitiveDataMaskResult =
  | {
      status: 'ok';
      fields: MaskedSensitiveDataField[];
      maskedMatchCount: number;
    }
  | {
      status: 'rejected';
      reason: SensitiveDataMaskRejectionReason;
      message: string;
    };

export interface SensitiveDataRestorationField {
  id: string;
  text: string;
}

export type SensitiveDataRestorationAmbiguityReason =
  | 'missing-placeholder'
  | 'duplicate-placeholder'
  | 'unknown-placeholder'
  | 'unexpected-placeholder'
  | 'transformed-placeholder';

export type SensitiveDataRestorationRejectionReason =
  | 'session-not-masked'
  | 'invalid-fields'
  | 'too-many-fields'
  | 'duplicate-field-id'
  | 'unknown-field-id'
  | 'field-id-too-long'
  | 'field-too-long'
  | 'total-input-too-large';

export type SensitiveDataRestorationResult =
  | {
      status: 'ok';
      fields: SensitiveDataRestorationField[];
    }
  | {
      status: 'ambiguous';
      reason: SensitiveDataRestorationAmbiguityReason;
      reasons: SensitiveDataRestorationAmbiguityReason[];
      fieldIds: string[];
      message: string;
    }
  | {
      status: 'rejected';
      reason: SensitiveDataRestorationRejectionReason;
      message: string;
    };

interface SensitiveMatch {
  start: number;
  end: number;
  secret: string;
  priority: number;
}

interface FieldRestorationRule {
  requireRestoration: boolean;
  placeholders: string[];
}

const PLACEHOLDER_PATTERN = /\[\[LEXIBRIDGE_MASK_[A-Z0-9]+_[A-Z0-9]+\]\]/g;
const FORMAT_CHARACTERS_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/g;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const EMAIL_PATTERN = /(^|[^A-Z0-9.!#$%&'*+/=?^_`{|}~-])([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+)/gi;
const CARD_PATTERN = /(^|\D)((?:\d[ -]?){12,18}\d)(?!\d)/g;
const IPV4_PATTERN = /(^|[^\d.])((?:\d{1,3}\.){3}\d{1,3})(?![\d.])/g;
const IPV6_PATTERN = /(^|[^A-F0-9:])((?:[A-F0-9]{0,4}:){2,7}[A-F0-9:]{0,4})(?![A-F0-9:])/gi;
const JWT_PATTERN = /(^|[^A-Z0-9_-])([A-Z0-9_-]+(?:\.[A-Z0-9_-]+){2})(?![A-Z0-9_-])/gi;
const PHONE_PATTERN = /(^|[^\d+])((?:\+\d{1,3}[ \t.-]?)?(?:\(\d{2,4}\)|\d{2,4})(?:[ \t.-]?\d{2,4}){2,4})(?!\d)/g;
const IBAN_START_PATTERN = /\b[A-Z]{2}\d{2}/gi;
const SENSITIVE_QUERY_KEYS = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'secret',
  'client_secret',
  'auth',
  'authorization',
  'bearer',
  'credential',
  'credentials',
  'session',
  'session_id'
]);
const COMPACT_SENSITIVE_QUERY_KEYS = new Set([
  'password', 'passwd', 'pwd', 'token', 'accesstoken', 'refreshtoken',
  'idtoken', 'apikey', 'secret', 'clientsecret', 'auth', 'authtoken',
  'authorization', 'bearer', 'credential', 'credentials', 'session', 'sessionid'
]);
const AMBIGUITY_REASON_PRIORITY: readonly SensitiveDataRestorationAmbiguityReason[] = [
  'unknown-placeholder',
  'transformed-placeholder',
  'unexpected-placeholder',
  'duplicate-placeholder',
  'missing-placeholder'
];

const IBAN_LENGTHS: Readonly<Record<string, number>> = Object.freeze({
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22,
  BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22,
  DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27,
  GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28,
  IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20,
  LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24,
  ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, OM: 23,
  PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24,
  SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23,
  TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20
});

const MASK_REJECTION_MESSAGES: Record<SensitiveDataMaskRejectionReason, string> = {
  'invalid-fields': 'Masking fields must be a non-empty array of valid field objects.',
  'too-many-fields': 'The masking request exceeds the field count limit.',
  'duplicate-field-id': 'Masking field identifiers must be unique.',
  'field-id-too-long': 'A masking field identifier exceeds the length limit.',
  'field-too-long': 'A masking field exceeds the length limit.',
  'total-input-too-large': 'The masking request exceeds the total input length limit.',
  'too-many-matches': 'The masking request exceeds the sensitive match limit.',
  'reserved-placeholder-input': 'The masking input contains a reserved or ambiguous LexiBridge placeholder.',
  'session-already-used': 'A masking session can process only one request.'
};

const RESTORATION_REJECTION_MESSAGES: Record<SensitiveDataRestorationRejectionReason, string> = {
  'session-not-masked': 'The masking session has not processed a request.',
  'invalid-fields': 'Restoration fields must be a non-empty array of valid field objects.',
  'too-many-fields': 'The restoration request exceeds the field count limit.',
  'duplicate-field-id': 'Restoration field identifiers must be unique.',
  'unknown-field-id': 'The restoration request contains an unknown field identifier.',
  'field-id-too-long': 'A restoration field identifier exceeds the length limit.',
  'field-too-long': 'A restoration field exceeds the length limit.',
  'total-input-too-large': 'The restoration request exceeds the total input length limit.'
};

const AMBIGUITY_MESSAGES: Record<SensitiveDataRestorationAmbiguityReason, string> = {
  'missing-placeholder': 'A required sensitive-data placeholder is missing.',
  'duplicate-placeholder': 'A required sensitive-data placeholder appears more than once.',
  'unknown-placeholder': 'The output contains an unknown LexiBridge placeholder.',
  'unexpected-placeholder': 'The output contains a LexiBridge placeholder that is not valid for this field.',
  'transformed-placeholder': 'The output contains a transformed or malformed LexiBridge placeholder.'
};

let sessionSequence = 0;

function makeRejectedMask(reason: SensitiveDataMaskRejectionReason): SensitiveDataMaskResult {
  return { status: 'rejected', reason, message: MASK_REJECTION_MESSAGES[reason] };
}

function makeRejectedRestoration(
  reason: SensitiveDataRestorationRejectionReason
): SensitiveDataRestorationResult {
  return { status: 'rejected', reason, message: RESTORATION_REJECTION_MESSAGES[reason] };
}

function createSessionNamespace(): string {
  sessionSequence += 1;
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    let state = (Date.now() ^ sessionSequence) >>> 0;
    for (let index = 0; index < bytes.length; index += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      bytes[index] = state & 0xff;
    }
  }

  const entropy = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${entropy}${sessionSequence.toString(36).toUpperCase()}`;
}

function canonicalizeMarkerText(text: string): string {
  return text.normalize('NFKC')
    .replace(FORMAT_CHARACTERS_PATTERN, '')
    .toUpperCase()
    .replace(/[А]/g, 'A')
    .replace(/[В]/g, 'B')
    .replace(/[Е]/g, 'E')
    .replace(/[І]/g, 'I')
    .replace(/[К]/g, 'K')
    .replace(/[М]/g, 'M')
    .replace(/[О]/g, 'O')
    .replace(/[Р]/g, 'P')
    .replace(/[С]/g, 'C')
    .replace(/[Т]/g, 'T')
    .replace(/[Х]/g, 'X')
    .replace(/[У]/g, 'Y')
    .replace(/[Ѕ]/g, 'S')
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/3/g, 'E')
    .replace(/4|@/g, 'A')
    .replace(/5|\$/g, 'S')
    .replace(/7/g, 'T')
    .replace(/[^A-Z]/g, '');
}

function boundedEditDistance(left: string, right: string, limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

function containsApproximateMarker(text: string): boolean {
  const target = 'LEXIBRIDGEMASK';
  const minimumLength = target.length - 2;
  const maximumLength = target.length + 2;
  const bracketedCandidates = text.match(/(?:\[\[?|\{\{?|<<)[^\]}>]{0,180}/g) || [];
  return bracketedCandidates.some(candidate => {
    const canonical = canonicalizeMarkerText(candidate);
    for (let start = 0; start <= canonical.length - minimumLength; start += 1) {
      for (let length = minimumLength; length <= maximumLength && start + length <= canonical.length; length += 1) {
        if (boundedEditDistance(canonical.slice(start, start + length), target, 2) <= 2) return true;
      }
    }
    return false;
  });
}

function containsReservedPlaceholder(text: string): boolean {
  const canonical = canonicalizeMarkerText(text);

  return canonical.includes('LEXIBRIDGEMASK')
    || canonical.includes('LEXIBRIDGEPLACEHOLDER')
    || canonical.includes('LEXIBRIDGETOKEN')
    || containsApproximateMarker(text);
}

function isLuhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) {
    return false;
  }

  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function isValidIpv4(value: string): boolean {
  const octets = value.split('.');
  return octets.length === 4 && octets.every(octet => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    if (octet.length > 1 && octet.startsWith('0')) return false;
    const numeric = Number(octet);
    return numeric >= 0 && numeric <= 255;
  });
}

function isValidIpv6(value: string): boolean {
  if (value.length === 0 || value.includes(':::')) return false;
  const compressedIndex = value.indexOf('::');
  if (compressedIndex !== value.lastIndexOf('::')) return false;

  const segments = value.split('::');
  if (segments.length > 2) return false;
  const hextets = value.replace('::', ':').split(':').filter(Boolean);
  if (!hextets.every(hextet => /^[A-F0-9]{1,4}$/i.test(hextet))) return false;

  return compressedIndex >= 0
    ? hextets.length < 8
    : hextets.length === 8;
}

function decodeBase64UrlJson(value: string): unknown | null {
  if (value.length % 4 === 1) return null;
  try {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const decoded = typeof TextDecoder === 'function'
      ? new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      : decodeURIComponent(Array.from(bytes, byte => `%${byte.toString(16).padStart(2, '0')}`).join(''));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isValidJwt(value: string): boolean {
  const [headerSegment, payloadSegment, signatureSegment] = value.split('.');
  if (!headerSegment || !payloadSegment || !signatureSegment || signatureSegment.length < 16) return false;

  const header = decodeBase64UrlJson(headerSegment);
  const payload = decodeBase64UrlJson(payloadSegment);
  if (!header || typeof header !== 'object' || Array.isArray(header)
    || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  const headerRecord = header as Record<string, unknown>;
  return headerRecord.typ === 'JWT'
    && typeof headerRecord.alg === 'string'
    && headerRecord.alg.length > 0;
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  const minimumDigits = value.trim().startsWith('+') ? 8 : 10;
  if (digits.length < minimumDigits || digits.length > 15) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value.trim())) return false;
  return value.trim().startsWith('+')
    || /[() .-]/.test(value)
    || digits.length >= 10;
}

function isValidIban(value: string): boolean {
  const compact = value.replace(/\s/g, '').toUpperCase();
  const expectedLength = IBAN_LENGTHS[compact.slice(0, 2)];
  if (!expectedLength || compact.length !== expectedLength || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact)) {
    return false;
  }

  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const expanded = /[A-Z]/.test(character)
      ? String(character.charCodeAt(0) - 55)
      : character;
    for (const digit of expanded) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

function addRegexMatches(
  text: string,
  pattern: RegExp,
  captureIndex: number,
  priority: number,
  matches: SensitiveMatch[],
  validate: (value: string) => boolean = () => true
): void {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const value = match[captureIndex];
    if (value && validate(value)) {
      const prefixLength = match[0].indexOf(value);
      const start = match.index + prefixLength;
      matches.push({ start, end: start + value.length, secret: value, priority });
    }
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
}

function decodeQueryKey(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' ')).toLowerCase().replace(/\[\]$/, '');
  } catch {
    return value.toLowerCase().replace(/\[\]$/, '');
  }
}

function isSensitiveQueryKey(key: string): boolean {
  if (SENSITIVE_QUERY_KEYS.has(key)) return true;
  const compactKey = key.replace(/[_-]/g, '');
  if (COMPACT_SENSITIVE_QUERY_KEYS.has(compactKey)) return true;
  return /(?:^|[_-])(?:password|passwd|pwd|token|secret|auth|credential|api[_-]?key)(?:$|[_-])/.test(key);
}

function addSensitiveUrlQueryMatches(text: string, matches: SensitiveMatch[]): void {
  URL_PATTERN.lastIndex = 0;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = URL_PATTERN.exec(text)) !== null) {
    let rawUrl = urlMatch[0];
    while (/[.,!?;:)\]}]$/.test(rawUrl)) rawUrl = rawUrl.slice(0, -1);
    const queryStart = rawUrl.indexOf('?');
    if (queryStart < 0) continue;
    const fragmentStart = rawUrl.indexOf('#', queryStart + 1);
    const queryEnd = fragmentStart < 0 ? rawUrl.length : fragmentStart;
    const query = rawUrl.slice(queryStart + 1, queryEnd);
    let offset = 0;

    for (const part of query.split('&')) {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex >= 0) {
        const key = decodeQueryKey(part.slice(0, separatorIndex));
        const value = part.slice(separatorIndex + 1);
        if (value.length > 0 && isSensitiveQueryKey(key)) {
          const start = urlMatch.index + queryStart + 1 + offset + separatorIndex + 1;
          matches.push({ start, end: start + value.length, secret: value, priority: 100 });
        }
      }
      offset += part.length + 1;
    }
  }
}

function addIbanMatches(text: string, matches: SensitiveMatch[]): void {
  IBAN_START_PATTERN.lastIndex = 0;
  let startMatch: RegExpExecArray | null;
  while ((startMatch = IBAN_START_PATTERN.exec(text)) !== null) {
    const expectedLength = IBAN_LENGTHS[startMatch[0].slice(0, 2).toUpperCase()];
    if (!expectedLength) continue;

    let index = startMatch.index;
    let alphanumericCount = 0;
    while (index < text.length && alphanumericCount < expectedLength) {
      const character = text[index];
      if (/[A-Z0-9]/i.test(character)) {
        alphanumericCount += 1;
      } else if (character !== ' ') {
        break;
      }
      index += 1;
    }

    let end = index;
    while (end > startMatch.index && text[end - 1] === ' ') end -= 1;
    const value = text.slice(startMatch.index, end);
    if (alphanumericCount === expectedLength
      && !/[A-Z0-9]/i.test(text[end] || '')
      && isValidIban(value)) {
      matches.push({
        start: startMatch.index,
        end,
        secret: value,
        priority: 80
      });
      IBAN_START_PATTERN.lastIndex = end;
    }
  }
}

function findSensitiveMatches(text: string): SensitiveMatch[] {
  const candidates: SensitiveMatch[] = [];
  addSensitiveUrlQueryMatches(text, candidates);
  addRegexMatches(text, EMAIL_PATTERN, 2, 70, candidates);
  addRegexMatches(text, CARD_PATTERN, 2, 90, candidates, isLuhnValid);
  addRegexMatches(text, IPV4_PATTERN, 2, 75, candidates, isValidIpv4);
  addRegexMatches(text, IPV6_PATTERN, 2, 75, candidates, isValidIpv6);
  addRegexMatches(text, JWT_PATTERN, 2, 95, candidates, isValidJwt);
  addRegexMatches(text, PHONE_PATTERN, 2, 60, candidates, isValidPhone);
  addIbanMatches(text, candidates);

  candidates.sort((left, right) => left.start - right.start
    || right.priority - left.priority
    || (right.end - right.start) - (left.end - left.start));

  const selected: SensitiveMatch[] = [];
  for (const candidate of candidates) {
    const previous = selected[selected.length - 1];
    if (!previous || candidate.start >= previous.end) {
      selected.push(candidate);
    }
  }
  return selected;
}

function validateMaskFields(fields: readonly SensitiveDataField[]): SensitiveDataMaskRejectionReason | null {
  if (!Array.isArray(fields) || fields.length === 0
    || fields.some(field => !field || typeof field.id !== 'string'
      || typeof field.text !== 'string' || typeof field.requireRestoration !== 'boolean')) {
    return 'invalid-fields';
  }
  if (fields.length > SENSITIVE_DATA_MAX_FIELDS) return 'too-many-fields';

  const identifiers = new Set<string>();
  let totalLength = 0;
  for (const field of fields) {
    if (field.id.length === 0) return 'invalid-fields';
    if (field.id.length > SENSITIVE_DATA_MAX_FIELD_ID_LENGTH) return 'field-id-too-long';
    if (identifiers.has(field.id)) return 'duplicate-field-id';
    identifiers.add(field.id);
    if (field.text.length > SENSITIVE_DATA_MAX_FIELD_LENGTH) return 'field-too-long';
    totalLength += field.text.length;
    if (totalLength > SENSITIVE_DATA_MAX_TOTAL_LENGTH) return 'total-input-too-large';
    if (containsReservedPlaceholder(field.text)) return 'reserved-placeholder-input';
  }
  return null;
}

function validateRestorationFields(
  fields: readonly SensitiveDataRestorationField[]
): SensitiveDataRestorationRejectionReason | null {
  if (!Array.isArray(fields) || fields.length === 0
    || fields.some(field => !field || typeof field.id !== 'string' || typeof field.text !== 'string')) {
    return 'invalid-fields';
  }
  if (fields.length > SENSITIVE_DATA_MAX_FIELDS) return 'too-many-fields';

  const identifiers = new Set<string>();
  let totalLength = 0;
  for (const field of fields) {
    if (field.id.length === 0) return 'invalid-fields';
    if (field.id.length > SENSITIVE_DATA_MAX_FIELD_ID_LENGTH) return 'field-id-too-long';
    if (identifiers.has(field.id)) return 'duplicate-field-id';
    identifiers.add(field.id);
    if (field.text.length > SENSITIVE_DATA_MAX_FIELD_LENGTH) return 'field-too-long';
    totalLength += field.text.length;
    if (totalLength > SENSITIVE_DATA_MAX_TOTAL_LENGTH) return 'total-input-too-large';
  }
  return null;
}

function countExactPlaceholders(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  PLACEHOLDER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_PATTERN.exec(text)) !== null) {
    counts.set(match[0], (counts.get(match[0]) || 0) + 1);
  }
  return counts;
}

function hasTransformedPlaceholder(text: string): boolean {
  PLACEHOLDER_PATTERN.lastIndex = 0;
  const withoutExact = text.replace(PLACEHOLDER_PATTERN, '');
  return containsReservedPlaceholder(withoutExact);
}

export class SensitiveDataMaskingSession {
  readonly #namespace = createSessionNamespace();
  #placeholderSequence = 0;
  #hasMasked = false;
  readonly #secretByPlaceholder = new Map<string, string>();
  readonly #knownPlaceholders = new Set<string>();
  readonly #primaryPlaceholderBySecret = new Map<string, string>();
  readonly #fieldRules = new Map<string, FieldRestorationRule>();

  maskFields(fields: readonly SensitiveDataField[]): SensitiveDataMaskResult {
    if (this.#hasMasked) return makeRejectedMask('session-already-used');
    const rejection = validateMaskFields(fields);
    if (rejection) return makeRejectedMask(rejection);

    const matchesByField = fields.map(field => findSensitiveMatches(field.text));
    const matchCount = matchesByField.reduce((sum, matches) => sum + matches.length, 0);
    if (matchCount > SENSITIVE_DATA_MAX_MATCHES) return makeRejectedMask('too-many-matches');

    this.#hasMasked = true;
    const maskedFields = fields.map((field, fieldIndex) => {
      const placeholdersUsedInField = new Set<string>();
      const requiredPlaceholders: string[] = [];
      const fragments: string[] = [];
      let cursor = 0;

      for (const match of matchesByField[fieldIndex]) {
        fragments.push(field.text.slice(cursor, match.start));
        let placeholder = this.#primaryPlaceholderBySecret.get(match.secret);
        if (!placeholder || placeholdersUsedInField.has(placeholder)) {
          placeholder = this.#createPlaceholder();
          this.#knownPlaceholders.add(placeholder);
          if (!this.#primaryPlaceholderBySecret.has(match.secret)) {
            this.#primaryPlaceholderBySecret.set(match.secret, placeholder);
          }
        }
        placeholdersUsedInField.add(placeholder);
        if (field.requireRestoration) {
          requiredPlaceholders.push(placeholder);
          this.#secretByPlaceholder.set(placeholder, match.secret);
        }
        fragments.push(placeholder);
        cursor = match.end;
      }
      fragments.push(field.text.slice(cursor));

      this.#fieldRules.set(field.id, {
        requireRestoration: field.requireRestoration,
        placeholders: requiredPlaceholders.slice()
      });
      return {
        id: field.id,
        text: fragments.join(''),
        requireRestoration: field.requireRestoration
      };
    });
    this.#primaryPlaceholderBySecret.clear();

    return {
      status: 'ok',
      fields: maskedFields.map(field => ({ ...field })),
      maskedMatchCount: matchCount
    };
  }

  restoreFields(fields: readonly SensitiveDataRestorationField[]): SensitiveDataRestorationResult {
    if (!this.#hasMasked) return makeRejectedRestoration('session-not-masked');
    const rejection = validateRestorationFields(fields);
    if (rejection) return makeRejectedRestoration(rejection);
    if (fields.some(field => !this.#fieldRules.has(field.id))) {
      return makeRejectedRestoration('unknown-field-id');
    }

    const ambiguousReasons = new Set<SensitiveDataRestorationAmbiguityReason>();
    const ambiguousFieldIds = new Set<string>();
    const providedFieldIds = new Set(fields.map(field => field.id));

    for (const [fieldId, rule] of this.#fieldRules) {
      if (rule.requireRestoration && !providedFieldIds.has(fieldId)) {
        ambiguousReasons.add('missing-placeholder');
        ambiguousFieldIds.add(fieldId);
      }
    }

    for (const field of fields) {
      const rule = this.#fieldRules.get(field.id) as FieldRestorationRule;
      const expected = new Set(rule.placeholders);
      const exactCounts = countExactPlaceholders(field.text);
      let fieldIsAmbiguous = false;

      for (const placeholder of expected) {
        const count = exactCounts.get(placeholder) || 0;
        if (count === 0) {
          ambiguousReasons.add('missing-placeholder');
          fieldIsAmbiguous = true;
        } else if (count > 1) {
          ambiguousReasons.add('duplicate-placeholder');
          fieldIsAmbiguous = true;
        }
      }

      for (const placeholder of exactCounts.keys()) {
        if (!this.#knownPlaceholders.has(placeholder)) {
          ambiguousReasons.add('unknown-placeholder');
          fieldIsAmbiguous = true;
        } else if (!expected.has(placeholder)) {
          ambiguousReasons.add('unexpected-placeholder');
          fieldIsAmbiguous = true;
        }
      }

      if (hasTransformedPlaceholder(field.text)) {
        ambiguousReasons.add('transformed-placeholder');
        fieldIsAmbiguous = true;
      }
      if (fieldIsAmbiguous) ambiguousFieldIds.add(field.id);
    }

    if (ambiguousReasons.size > 0) {
      const reasons = AMBIGUITY_REASON_PRIORITY.filter(reason => ambiguousReasons.has(reason));
      const reason = reasons[0];
      return {
        status: 'ambiguous',
        reason,
        reasons: reasons.slice(),
        fieldIds: Array.from(ambiguousFieldIds),
        message: AMBIGUITY_MESSAGES[reason]
      };
    }

    const restoredFields = fields.map(field => {
      const rule = this.#fieldRules.get(field.id) as FieldRestorationRule;
      let restoredText = field.text;
      for (const placeholder of rule.placeholders) {
        const secret = this.#secretByPlaceholder.get(placeholder) as string;
        restoredText = restoredText.replace(placeholder, secret);
      }
      return { id: field.id, text: restoredText };
    });

    return {
      status: 'ok',
      fields: restoredFields.map(field => ({ ...field }))
    };
  }

  #createPlaceholder(): string {
    this.#placeholderSequence += 1;
    return `[[LEXIBRIDGE_MASK_${this.#namespace}_${this.#placeholderSequence.toString(36).toUpperCase()}]]`;
  }
}

export function createSensitiveDataMaskingSession(): SensitiveDataMaskingSession {
  return new SensitiveDataMaskingSession();
}
