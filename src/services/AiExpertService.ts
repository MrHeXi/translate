import { JSON_SCHEMA, load } from 'js-yaml';

export const AI_EXPERT_SCHEMA_VERSION = 1 as const;
export const AI_EXPERT_MAX_JSON_BYTES = 64 * 1024;

export const AI_EXPERT_DEFINITION_LIMITS = Object.freeze({
  id: 64,
  name: 80,
  version: 20,
  description: 500,
  instruction: 8000,
  sourceName: 160,
  sourceUrl: 2048,
  installedDefinitions: 100
});

export interface AiExpertSourceAttribution {
  readonly name: string;
  readonly url?: string;
}

export interface AiExpertDefinition {
  readonly schemaVersion: typeof AI_EXPERT_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly instruction: string;
  readonly source: AiExpertSourceAttribution;
}

export interface AiExpertRegistryEntry {
  readonly definition: AiExpertDefinition;
  readonly enabled: boolean;
  readonly builtIn: boolean;
}

interface StoredAiExpertRegistryEntry {
  definition: AiExpertDefinition;
  enabled: boolean;
  builtIn: boolean;
}

const DEFINITION_FIELDS = [
  'schemaVersion',
  'id',
  'name',
  'version',
  'description',
  'instruction',
  'source'
] as const;
const SOURCE_REQUIRED_FIELDS = ['name'] as const;
const SOURCE_OPTIONAL_FIELDS = ['url'] as const;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

type StrictDataRecord = Record<string, unknown>;

function hasForbiddenControlCharacter(value: string): boolean {
  return Array.from(value).some(character => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 8
      || codePoint === 11
      || codePoint === 12
      || (codePoint >= 14 && codePoint <= 31)
      || codePoint === 127;
  });
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x7f) byteLength += 1;
    else if (codePoint <= 0x7ff) byteLength += 2;
    else if (codePoint <= 0xffff) byteLength += 3;
    else byteLength += 4;
  }
  return byteLength;
}

function validationError(path: string, reason: string): Error {
  return new Error(`Invalid AI expert definition at ${path}: ${reason}.`);
}

function readStrictDataRecord(
  value: unknown,
  path: string,
  requiredFields: readonly string[],
  optionalFields: readonly string[] = []
): StrictDataRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(path, 'expected a plain data object');
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw validationError(path, 'expected a plain data object');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw validationError(path, 'symbol fields are not allowed');
  }

  const allowedFields = new Set([...requiredFields, ...optionalFields]);
  const fieldNames = Object.getOwnPropertyNames(value);
  for (const fieldName of fieldNames) {
    if (!allowedFields.has(fieldName)) {
      throw validationError(`${path}.${fieldName}`, 'unknown field');
    }
  }
  for (const requiredField of requiredFields) {
    if (!fieldNames.includes(requiredField)) {
      throw validationError(`${path}.${requiredField}`, 'missing required field');
    }
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: StrictDataRecord = Object.create(null) as StrictDataRecord;
  for (const fieldName of fieldNames) {
    const descriptor = descriptors[fieldName];
    if (!descriptor || descriptor.get || descriptor.set || !descriptor.enumerable) {
      throw validationError(`${path}.${fieldName}`, 'only enumerable data fields are allowed');
    }
    result[fieldName] = descriptor.value;
  }
  return result;
}

function readBoundedString(
  value: unknown,
  path: string,
  maximumCodePoints: number,
  singleLine: boolean
): string {
  if (typeof value !== 'string') {
    throw validationError(path, 'expected a string');
  }
  if (!value || value !== value.trim()) {
    throw validationError(path, 'must be non-empty and have no surrounding whitespace');
  }
  if (Array.from(value).length > maximumCodePoints) {
    throw validationError(path, `must not exceed ${maximumCodePoints} Unicode characters`);
  }
  if (hasForbiddenControlCharacter(value) || (singleLine && /[\r\n\t]/.test(value))) {
    throw validationError(path, 'contains a forbidden control character');
  }
  return value;
}

function readId(value: unknown): string {
  const id = readBoundedString(value, 'definition.id', AI_EXPERT_DEFINITION_LIMITS.id, true);
  if (!ID_PATTERN.test(id)) {
    throw validationError(
      'definition.id',
      'must start with a lowercase letter and contain only lowercase letters, digits, and single hyphens'
    );
  }
  return id;
}

function parseVersion(value: unknown, path: string): readonly [number, number, number] {
  const version = readBoundedString(value, path, AI_EXPERT_DEFINITION_LIMITS.version, true);
  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw validationError(path, 'must use MAJOR.MINOR.PATCH with non-negative decimal components');
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function readSource(value: unknown): AiExpertSourceAttribution {
  const source = readStrictDataRecord(
    value,
    'definition.source',
    SOURCE_REQUIRED_FIELDS,
    SOURCE_OPTIONAL_FIELDS
  );
  const name = readBoundedString(
    source.name,
    'definition.source.name',
    AI_EXPERT_DEFINITION_LIMITS.sourceName,
    true
  );

  if (!Object.prototype.hasOwnProperty.call(source, 'url')) {
    return Object.freeze({ name });
  }

  const urlValue = readBoundedString(
    source.url,
    'definition.source.url',
    AI_EXPERT_DEFINITION_LIMITS.sourceUrl,
    true
  );
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw validationError('definition.source.url', 'must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw validationError(
      'definition.source.url',
      'must be an HTTPS URL with a hostname and without embedded credentials'
    );
  }
  return Object.freeze({ name, url: urlValue });
}

function cloneAndFreezeDefinition(definition: AiExpertDefinition): AiExpertDefinition {
  const source = definition.source.url === undefined
    ? Object.freeze({ name: definition.source.name })
    : Object.freeze({ name: definition.source.name, url: definition.source.url });
  return Object.freeze({
    schemaVersion: definition.schemaVersion,
    id: definition.id,
    name: definition.name,
    version: definition.version,
    description: definition.description,
    instruction: definition.instruction,
    source
  });
}

export function validateAiExpertDefinition(value: unknown): AiExpertDefinition {
  const definition = readStrictDataRecord(value, 'definition', DEFINITION_FIELDS);
  if (definition.schemaVersion !== AI_EXPERT_SCHEMA_VERSION) {
    throw validationError(
      'definition.schemaVersion',
      `must equal ${AI_EXPERT_SCHEMA_VERSION}`
    );
  }

  const id = readId(definition.id);
  const name = readBoundedString(
    definition.name,
    'definition.name',
    AI_EXPERT_DEFINITION_LIMITS.name,
    true
  );
  const version = readBoundedString(
    definition.version,
    'definition.version',
    AI_EXPERT_DEFINITION_LIMITS.version,
    true
  );
  parseVersion(version, 'definition.version');
  const description = readBoundedString(
    definition.description,
    'definition.description',
    AI_EXPERT_DEFINITION_LIMITS.description,
    true
  );
  const instruction = readBoundedString(
    definition.instruction,
    'definition.instruction',
    AI_EXPERT_DEFINITION_LIMITS.instruction,
    false
  );

  return cloneAndFreezeDefinition({
    schemaVersion: AI_EXPERT_SCHEMA_VERSION,
    id,
    name,
    version,
    description,
    instruction,
    source: readSource(definition.source)
  });
}

export function parseAiExpertDefinitionJson(jsonText: string): AiExpertDefinition {
  if (typeof jsonText !== 'string') {
    throw validationError('JSON', 'expected a string');
  }
  if (utf8ByteLength(jsonText) > AI_EXPERT_MAX_JSON_BYTES) {
    throw validationError('JSON', `must not exceed ${AI_EXPERT_MAX_JSON_BYTES} UTF-8 bytes`);
  }

  try {
    JSON.parse(jsonText);
  } catch {
    throw validationError('JSON', 'must use standard JSON syntax');
  }

  let parsed: unknown;
  try {
    parsed = load(jsonText, {
      schema: JSON_SCHEMA,
      json: false
    });
  } catch {
    throw validationError('JSON', 'contains duplicate keys or cannot be parsed safely');
  }

  return validateAiExpertDefinition(parsed);
}

export function compareAiExpertVersions(left: string, right: string): number {
  const leftParts = parseVersion(left, 'leftVersion');
  const rightParts = parseVersion(right, 'rightVersion');
  for (let index = 0; index < leftParts.length; index++) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

function definitionsEqual(left: AiExpertDefinition, right: AiExpertDefinition): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.id === right.id
    && left.name === right.name
    && left.version === right.version
    && left.description === right.description
    && left.instruction === right.instruction
    && left.source.name === right.source.name
    && left.source.url === right.source.url;
}

const BUILT_IN_SOURCE = Object.freeze({
  name: 'LexiBridge',
  url: 'https://github.com/MrHeXi/translate'
});

const BUILT_IN_DEFINITION_DATA: readonly AiExpertDefinition[] = [
  {
    schemaVersion: 1,
    id: 'general',
    name: 'General',
    version: '1.0.0',
    description: 'Natural, neutral translation for general-purpose content.',
    instruction: 'Use natural, neutral language.',
    source: BUILT_IN_SOURCE
  },
  {
    schemaVersion: 1,
    id: 'academic',
    name: 'Academic',
    version: '1.0.0',
    description: 'Precise translation for research, scholarship, and formal publications.',
    instruction: 'Preserve scholarly precision, citations, and formal tone.',
    source: BUILT_IN_SOURCE
  },
  {
    schemaVersion: 1,
    id: 'technical',
    name: 'Technical',
    version: '1.0.0',
    description: 'Terminology-aware translation for technical and procedural material.',
    instruction: 'Preserve technical terminology, units, identifiers, and procedural clarity.',
    source: BUILT_IN_SOURCE
  },
  {
    schemaVersion: 1,
    id: 'software',
    name: 'Software',
    version: '1.0.0',
    description: 'Translation for software documentation, interfaces, and developer content.',
    instruction: 'Preserve code, API names, command names, paths, and product identifiers.',
    source: BUILT_IN_SOURCE
  },
  {
    schemaVersion: 1,
    id: 'business',
    name: 'Business',
    version: '1.0.0',
    description: 'Concise professional translation for workplace and commercial content.',
    instruction: 'Use concise professional business language.',
    source: BUILT_IN_SOURCE
  },
  {
    schemaVersion: 1,
    id: 'finance',
    name: 'Finance',
    version: '1.0.0',
    description: 'Precision translation for financial reports, markets, and risk disclosures.',
    instruction: 'Preserve financial terminology, figures, currencies, and risk wording.',
    source: BUILT_IN_SOURCE
  },
  {
    schemaVersion: 1,
    id: 'legal',
    name: 'Legal',
    version: '1.0.0',
    description: 'Careful translation for agreements, policies, and legal analysis.',
    instruction: 'Preserve defined terms, obligations, conditions, and legal nuance.',
    source: BUILT_IN_SOURCE
  },
  {
    schemaVersion: 1,
    id: 'medical',
    name: 'Medical',
    version: '1.0.0',
    description: 'Terminology-aware translation for clinical and health-related content.',
    instruction: 'Preserve clinical terminology, measurements, warnings, and uncertainty.',
    source: BUILT_IN_SOURCE
  },
  {
    schemaVersion: 1,
    id: 'creative',
    name: 'Creative',
    version: '1.0.0',
    description: 'Expressive translation for literary, editorial, and creative writing.',
    instruction: 'Preserve voice, rhythm, imagery, and emotional tone where possible.',
    source: BUILT_IN_SOURCE
  }
];

export const BUILT_IN_AI_EXPERTS: readonly AiExpertDefinition[] = Object.freeze(
  BUILT_IN_DEFINITION_DATA.map(definition => validateAiExpertDefinition(definition))
);

export const BUILTIN_AI_EXPERTS = BUILT_IN_AI_EXPERTS;

function snapshotEntry(entry: StoredAiExpertRegistryEntry): AiExpertRegistryEntry {
  return Object.freeze({
    definition: cloneAndFreezeDefinition(entry.definition),
    enabled: entry.enabled,
    builtIn: entry.builtIn
  });
}

export class AiExpertRegistry {
  private readonly entries = new Map<string, StoredAiExpertRegistryEntry>();

  constructor() {
    for (const definition of BUILT_IN_AI_EXPERTS) {
      this.entries.set(definition.id, {
        definition: cloneAndFreezeDefinition(definition),
        enabled: true,
        builtIn: true
      });
    }
  }

  get size(): number {
    return this.entries.size;
  }

  list(): readonly AiExpertRegistryEntry[] {
    return Object.freeze(Array.from(this.entries.values(), snapshotEntry));
  }

  listEnabled(): readonly AiExpertRegistryEntry[] {
    return Object.freeze(
      Array.from(this.entries.values())
        .filter(entry => entry.enabled)
        .map(snapshotEntry)
    );
  }

  get(id: string): AiExpertRegistryEntry | undefined {
    const entry = typeof id === 'string' ? this.entries.get(id) : undefined;
    return entry ? snapshotEntry(entry) : undefined;
  }

  install(value: unknown): AiExpertRegistryEntry {
    const definition = validateAiExpertDefinition(value);
    const current = this.entries.get(definition.id);

    if (!current) {
      if (this.entries.size >= AI_EXPERT_DEFINITION_LIMITS.installedDefinitions) {
        throw new Error(
          `AI expert registry cannot exceed ${AI_EXPERT_DEFINITION_LIMITS.installedDefinitions} definitions.`
        );
      }
      const installed: StoredAiExpertRegistryEntry = {
        definition: cloneAndFreezeDefinition(definition),
        enabled: true,
        builtIn: false
      };
      this.entries.set(definition.id, installed);
      return snapshotEntry(installed);
    }

    if (current.builtIn) {
      if (definitionsEqual(definition, current.definition)) return snapshotEntry(current);
      throw new Error(`Built-in AI expert ${definition.id} cannot be replaced.`);
    }

    const comparison = compareAiExpertVersions(definition.version, current.definition.version);
    if (comparison < 0) {
      throw new Error(
        `Cannot downgrade AI expert ${definition.id} from ${current.definition.version} to ${definition.version}.`
      );
    }
    if (comparison === 0) {
      if (!definitionsEqual(definition, current.definition)) {
        throw new Error(
          `AI expert ${definition.id} version ${definition.version} is already installed with different content.`
        );
      }
      return snapshotEntry(current);
    }

    current.definition = cloneAndFreezeDefinition(definition);
    return snapshotEntry(current);
  }

  setEnabled(id: string, enabled: boolean): AiExpertRegistryEntry | undefined {
    if (typeof enabled !== 'boolean') {
      throw new Error('AI expert enabled state must be a boolean.');
    }
    const current = typeof id === 'string' ? this.entries.get(id) : undefined;
    if (!current) return undefined;
    current.enabled = enabled;
    return snapshotEntry(current);
  }

  enable(id: string): AiExpertRegistryEntry | undefined {
    return this.setEnabled(id, true);
  }

  disable(id: string): AiExpertRegistryEntry | undefined {
    return this.setEnabled(id, false);
  }

  remove(id: string): boolean {
    const current = typeof id === 'string' ? this.entries.get(id) : undefined;
    if (!current || current.builtIn) return false;
    return this.entries.delete(id);
  }
}

export function createAiExpertRegistry(): AiExpertRegistry {
  return new AiExpertRegistry();
}
