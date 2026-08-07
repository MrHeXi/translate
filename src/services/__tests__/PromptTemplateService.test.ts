import { dump, JSON_SCHEMA } from 'js-yaml';
import {
  DEFAULT_PROMPT_TEMPLATE,
  exportPromptTemplate,
  importPromptTemplate,
  PROMPT_TEMPLATE_LIMITS,
  PROMPT_TEMPLATE_MAX_RENDERED_CODE_POINTS,
  PROMPT_TEMPLATE_MAX_VARIABLES,
  PROMPT_TEMPLATE_MAX_YAML_BYTES,
  PROMPT_TEMPLATE_SCHEMA_VERSION,
  PROMPT_TEMPLATE_SYSTEM_VARIABLES,
  PromptTemplate,
  PromptTemplateError,
  renderPromptTemplatePreview,
  rollbackPromptTemplateToDefault,
  validatePromptTemplate
} from '../PromptTemplateService';

const createTemplate = (overrides: Partial<PromptTemplate> = {}): PromptTemplate => ({
  schemaVersion: PROMPT_TEMPLATE_SCHEMA_VERSION,
  id: 'test-template',
  name: 'Test Template',
  version: 2,
  source: 'test-suite',
  systemPrompt: 'Translate {{sourceLanguage}} to {{targetLanguage}} with {{tone}}.',
  variables: [{
    name: 'tone',
    description: 'Desired writing tone',
    defaultValue: 'neutral'
  }],
  ...overrides
});

const expectPromptError = (
  action: () => unknown,
  code: PromptTemplateError['code'],
  message?: string
): void => {
  try {
    action();
    throw new Error('Expected PromptTemplateError');
  } catch (error) {
    expect(error).toBeInstanceOf(PromptTemplateError);
    expect((error as PromptTemplateError).code).toBe(code);
    if (message) expect((error as Error).message).toContain(message);
  }
};

describe('PromptTemplateService', () => {
  it('provides an immutable built-in template and a fresh rollback copy', () => {
    expect(DEFAULT_PROMPT_TEMPLATE.schemaVersion).toBe(1);
    expect(DEFAULT_PROMPT_TEMPLATE.variables).toEqual([]);
    expect(Object.isFrozen(DEFAULT_PROMPT_TEMPLATE)).toBe(true);
    expect(PROMPT_TEMPLATE_SYSTEM_VARIABLES).toEqual([
      'sourceLanguage',
      'targetLanguage',
      'domainInstruction',
      'glossary',
      'customInstructions'
    ]);

    const first = rollbackPromptTemplateToDefault();
    const second = rollbackPromptTemplateToDefault();
    first.name = 'Changed locally';
    expect(second).toEqual(DEFAULT_PROMPT_TEMPLATE);
    expect(second).not.toBe(first);
  });

  it('exports deterministic YAML in canonical field order and round-trips it', () => {
    const template = createTemplate();
    const first = exportPromptTemplate(template);
    const second = exportPromptTemplate({ ...template, variables: template.variables.map(item => ({ ...item })) });

    expect(first).toBe(second);
    expect(first.indexOf('schemaVersion:')).toBeLessThan(first.indexOf('id:'));
    expect(first.indexOf('id:')).toBeLessThan(first.indexOf('name:'));
    expect(first).toContain('systemPrompt:');
    expect(importPromptTemplate(first)).toEqual(template);
  });

  it('uses js-yaml structured syntax for quoted and block scalar values', () => {
    const yaml = [
      'schemaVersion: 1',
      'id: structured-yaml',
      'name: "Structured: YAML"',
      'version: 3',
      'source: local',
      'systemPrompt: |- ',
      '  Translate {{sourceLanguage}} to {{targetLanguage}}.',
      '  Use {{tone}}.',
      'variables:',
      '  - name: tone',
      '    description: "Style: controlled"',
      '    defaultValue: concise'
    ].join('\n');

    expect(importPromptTemplate(yaml)).toMatchObject({
      name: 'Structured: YAML',
      systemPrompt: 'Translate {{sourceLanguage}} to {{targetLanguage}}.\nUse {{tone}}.'
    });
  });

  it('renders declared values and defaults without accepting undeclared input', () => {
    const template = createTemplate({
      systemPrompt: [
        '{{sourceLanguage}} -> {{targetLanguage}}',
        '{{domainInstruction}}',
        '{{glossary}}',
        '{{customInstructions}}',
        'Tone: {{tone}}'
      ].join('\n')
    });

    expect(renderPromptTemplatePreview(template, {
      systemVariables: {
        sourceLanguage: 'English',
        targetLanguage: 'Chinese',
        domainInstruction: 'Use technical terminology.',
        glossary: 'API => application programming interface',
        customInstructions: 'Keep code unchanged.'
      },
      variables: { tone: 'formal' }
    })).toBe([
      'English -> Chinese',
      'Use technical terminology.',
      'API => application programming interface',
      'Keep code unchanged.',
      'Tone: formal'
    ].join('\n'));

    expect(renderPromptTemplatePreview(template, {
      systemVariables: {
        sourceLanguage: 'English',
        targetLanguage: 'Chinese',
        domainInstruction: '',
        glossary: '',
        customInstructions: ''
      }
    })).toContain('Tone: neutral');

    expectPromptError(() => renderPromptTemplatePreview(template, {
      systemVariables: { sourceLanguage: 'English', targetLanguage: 'Chinese' },
      variables: { undeclared: 'content' }
    }), 'UNKNOWN_FIELD', 'undeclared');
  });

  it('reports missing variables and unknown or malformed placeholders', () => {
    const required = createTemplate({
      systemPrompt: '{{sourceLanguage}} / {{tone}}',
      variables: [{ name: 'tone', description: 'Required tone' }]
    });
    expectPromptError(() => renderPromptTemplatePreview(required, {
      systemVariables: { sourceLanguage: 'English' }
    }), 'MISSING_VARIABLE', 'tone');

    expectPromptError(() => renderPromptTemplatePreview(required, {
      systemVariables: {},
      variables: { tone: 'formal' }
    }), 'MISSING_VARIABLE', 'sourceLanguage');

    expectPromptError(() => validatePromptTemplate(createTemplate({
      systemPrompt: '{{unknownVariable}}'
    })), 'UNKNOWN_PLACEHOLDER', 'unknownVariable');
    expectPromptError(() => validatePromptTemplate(createTemplate({
      systemPrompt: '{{source-language}}'
    })), 'UNKNOWN_PLACEHOLDER', 'source-language');
    expectPromptError(() => validatePromptTemplate(createTemplate({
      systemPrompt: '{{sourceLanguage'
    })), 'UNKNOWN_PLACEHOLDER', 'Malformed');
  });

  it.each(['sourceText', 'referenceContext', 'pageContent', 'documentContent', 'subtitleText', 'ocrText']) (
    'rejects untrusted page-content variable %s from the system prompt',
    variableName => {
      expectPromptError(() => validatePromptTemplate(createTemplate({
        systemPrompt: `{{${variableName}}}`,
        variables: [{ name: variableName, description: 'Untrusted content' }]
      })), 'INVALID_SCHEMA', 'untrusted page content');

      expectPromptError(() => validatePromptTemplate(createTemplate({
        systemPrompt: `{{${variableName}}}`,
        variables: []
      })), 'UNKNOWN_PLACEHOLDER', 'Untrusted page content');
    }
  );

  it('rejects unknown fields at every schema level and missing required fields', () => {
    expectPromptError(() => validatePromptTemplate({
      ...createTemplate(),
      unexpected: true
    }), 'UNKNOWN_FIELD', 'unexpected');
    expectPromptError(() => validatePromptTemplate(createTemplate({
      variables: [{
        name: 'tone',
        description: 'Tone',
        defaultValue: 'neutral',
        extra: 'no'
      } as any]
    })), 'UNKNOWN_FIELD', 'extra');

    const missingName = createTemplate() as unknown as Record<string, unknown>;
    delete missingName.name;
    expectPromptError(() => validatePromptTemplate(missingName), 'INVALID_SCHEMA', 'name');
  });

  it('enforces schema types, version, identifiers, duplicates, and reserved names', () => {
    expectPromptError(() => validatePromptTemplate(createTemplate({
      schemaVersion: 2 as 1
    })), 'INVALID_SCHEMA', 'schemaVersion');
    expectPromptError(() => validatePromptTemplate(createTemplate({
      version: 0
    })), 'INVALID_SCHEMA', 'version');
    expectPromptError(() => validatePromptTemplate(createTemplate({
      id: 'Invalid ID'
    })), 'INVALID_SCHEMA', 'id');
    expectPromptError(() => validatePromptTemplate(createTemplate({
      variables: [
        { name: 'tone', description: 'One' },
        { name: 'tone', description: 'Two' }
      ]
    })), 'INVALID_SCHEMA', 'duplicate');
    expectPromptError(() => validatePromptTemplate(createTemplate({
      systemPrompt: '{{sourceLanguage}}',
      variables: [{ name: 'sourceLanguage', description: 'Reserved' }]
    })), 'INVALID_SCHEMA', 'reserved');
  });

  it('enforces variable count and all declared text limits', () => {
    expectPromptError(() => validatePromptTemplate(createTemplate({
      variables: Array.from({ length: PROMPT_TEMPLATE_MAX_VARIABLES + 1 }, (_, index) => ({
        name: `variable${index}`,
        description: 'Variable'
      }))
    })), 'INVALID_SCHEMA', 'at most 20');

    expectPromptError(() => validatePromptTemplate(createTemplate({
      name: 'n'.repeat(PROMPT_TEMPLATE_LIMITS.nameCodePoints + 1)
    })), 'INVALID_SCHEMA', 'name');
    expectPromptError(() => validatePromptTemplate(createTemplate({
      systemPrompt: 'p'.repeat(PROMPT_TEMPLATE_LIMITS.systemPromptCodePoints + 1)
    })), 'INVALID_SCHEMA', 'systemPrompt');
    expectPromptError(() => validatePromptTemplate(createTemplate({
      variables: [{
        name: 'tone',
        description: 'd'.repeat(PROMPT_TEMPLATE_LIMITS.variableDescriptionCodePoints + 1)
      }]
    })), 'INVALID_SCHEMA', 'description');
    expectPromptError(() => validatePromptTemplate(createTemplate({
      variables: [{
        name: 'tone',
        description: 'Tone',
        defaultValue: 'v'.repeat(PROMPT_TEMPLATE_LIMITS.variableDefaultCodePoints + 1)
      }]
    })), 'INVALID_SCHEMA', 'defaultValue');
  });

  it('measures the YAML input limit in UTF-8 bytes before parsing', () => {
    const oversizedAscii = 'a'.repeat(PROMPT_TEMPLATE_MAX_YAML_BYTES + 1);
    expectPromptError(() => importPromptTemplate(oversizedAscii), 'INPUT_TOO_LARGE', 'UTF-8 bytes');

    const oversizedMultibyte = '\u754c'.repeat(Math.floor(PROMPT_TEMPLATE_MAX_YAML_BYTES / 3) + 1);
    expect(Buffer.byteLength(oversizedMultibyte, 'utf8')).toBeGreaterThan(PROMPT_TEMPLATE_MAX_YAML_BYTES);
    expectPromptError(() => importPromptTemplate(oversizedMultibyte), 'INPUT_TOO_LARGE', 'UTF-8 bytes');
  });

  it('rejects YAML anchors and aliases, including recursive alias graphs', () => {
    const anchored = [
      'schemaVersion: 1',
      'id: aliases',
      'name: Alias',
      'version: 1',
      'source: test',
      'systemPrompt: "{{sourceLanguage}}"',
      'variables:',
      '  - &shared',
      '    name: tone',
      '    description: Shared',
      '  - *shared'
    ].join('\n');
    expectPromptError(() => importPromptTemplate(anchored), 'YAML_ALIAS_NOT_ALLOWED', 'anchors');

    const anchorWithoutAlias = [
      'schemaVersion: 1',
      'id: anchor-only',
      'name: Anchor only',
      'version: 1',
      'source: &source test',
      'systemPrompt: "{{sourceLanguage}}"',
      'variables: []'
    ].join('\n');
    expectPromptError(() => importPromptTemplate(anchorWithoutAlias), 'YAML_ALIAS_NOT_ALLOWED', 'anchors');

    const recursive = 'root: &root\n  self: *root\n';
    expectPromptError(() => importPromptTemplate(recursive), 'YAML_ALIAS_NOT_ALLOWED');
  });

  it('rejects deeply nested and high-node YAML before schema validation', () => {
    let deeplyNested = 'leaf';
    for (let index = 0; index < PROMPT_TEMPLATE_LIMITS.yamlDepth + 2; index += 1) {
      deeplyNested = `[${deeplyNested}]`;
    }
    expectPromptError(() => importPromptTemplate(deeplyNested), 'YAML_COMPLEXITY_LIMIT', 'nesting');

    const manyNodes = `[${Array.from({ length: PROMPT_TEMPLATE_LIMITS.yamlNodes + 20 }, () => 'null').join(',')}]`;
    expect(manyNodes.length).toBeLessThan(PROMPT_TEMPLATE_MAX_YAML_BYTES);
    expectPromptError(() => importPromptTemplate(manyNodes), 'YAML_COMPLEXITY_LIMIT', 'node count');
  });

  it('uses JSON schema and rejects unsafe tags and duplicate keys', () => {
    expectPromptError(() => importPromptTemplate('value: !!js/function function() {}'), 'INVALID_YAML');
    expectPromptError(() => importPromptTemplate('schemaVersion: 1\nschemaVersion: 1'), 'INVALID_YAML');

    const yamlWithDate = dump({
      ...createTemplate({ systemPrompt: '{{sourceLanguage}}' }),
      source: '2026-08-07'
    }, { schema: JSON_SCHEMA, noRefs: true });
    expect(importPromptTemplate(yamlWithDate).source).toBe('2026-08-07');
  });

  it('bounds rendered output and refuses control characters', () => {
    const template = createTemplate({
      systemPrompt: '{{sourceLanguage}}{{targetLanguage}}',
      variables: []
    });
    expectPromptError(() => renderPromptTemplatePreview(template, {
      systemVariables: {
        sourceLanguage: 'a'.repeat(PROMPT_TEMPLATE_MAX_RENDERED_CODE_POINTS),
        targetLanguage: 'b'
      }
    }), 'OUTPUT_TOO_LONG', 'Rendered prompt');

    expectPromptError(() => renderPromptTemplatePreview(template, {
      systemVariables: {
        sourceLanguage: 'English\u0000',
        targetLanguage: 'Chinese'
      }
    }), 'INVALID_SCHEMA', 'control characters');
  });
});
