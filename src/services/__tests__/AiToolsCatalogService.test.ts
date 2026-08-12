import { AiExpertRegistry, validateAiExpertDefinition } from '../AiExpertService';
import {
  AI_TOOLS_CATALOG_SCHEMA_VERSION,
  AI_TOOLS_CATALOG_VERSION,
  AiToolsCatalogError,
  AiToolsCatalogItem,
  AiToolsCatalogSelection,
  AiToolsCatalogService,
  canonicalizeAiToolsCatalogValue,
  sha256AiToolsCatalogText
} from '../AiToolsCatalogService';
import { validatePromptTemplate } from '../PromptTemplateService';

function select(item: AiToolsCatalogItem): AiToolsCatalogSelection {
  return {
    catalogVersion: item.catalogVersion,
    kind: item.kind,
    id: item.id,
    version: item.version,
    integrity: item.integrity
  };
}

function expectCatalogError(action: () => unknown, code: AiToolsCatalogError['code']): void {
  try {
    action();
    throw new Error('Expected AiToolsCatalogError');
  } catch (error) {
    expect(error).toBeInstanceOf(AiToolsCatalogError);
    expect((error as AiToolsCatalogError).code).toBe(code);
  }
}

describe('AiToolsCatalogService', () => {
  it('discovers only fixed, versioned metadata with HTTPS attribution and SHA-256 integrity', () => {
    const catalog = new AiToolsCatalogService();
    const items = catalog.list();

    expect(items).toHaveLength(4);
    expect(items.map(item => `${item.kind}:${item.id}`)).toEqual([
      'ai-expert:scientific-reviewer',
      'ai-expert:developer-docs-reviewer',
      'prompt-template:curated-faithful-translation',
      'prompt-template:curated-register-aware'
    ]);
    expect(items.map(item => item.integrity)).toEqual([
      'sha256-b421da77325ad21ff5a75722c5e8f83ea9660157103ec3124a587c6ab02584bb',
      'sha256-708cda41e28bd10cdbbd01405c54fe4aa5ca402bd58ca87cf58b07489e24624f',
      'sha256-549c43f35d4d123da384ee647aa0dc07620c4d4bdca60fe074195f7bfee1daff',
      'sha256-d6e313392ccae7c169d93ccd18c5b5cb449512f753cb7739fb46c829478d9540'
    ]);
    expect(items.every(item => (
      item.schemaVersion === AI_TOOLS_CATALOG_SCHEMA_VERSION
      && item.catalogVersion === AI_TOOLS_CATALOG_VERSION
      && new URL(item.sourceUrl).protocol === 'https:'
      && /^sha256-[a-f0-9]{64}$/.test(item.integrity)
      && item.summary.length > 0
      && item.version.length > 0
      && Object.isFrozen(item)
    ))).toBe(true);
    expect(Object.isFrozen(items)).toBe(true);
    expect(items.every(item => !('payload' in item) && !('definition' in item) && !('template' in item)))
      .toBe(true);
  });

  it('returns detached immutable discovery snapshots without exposing catalog internals', () => {
    const catalog = new AiToolsCatalogService();
    const first = catalog.list();
    const second = catalog.list();
    const item = first[0]!;

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(catalog.get(item.kind, item.id)).toEqual(item);
    expect(catalog.get(item.kind, item.id)).not.toBe(item);
    expect(catalog.get('ai-expert', 'missing')).toBeUndefined();
    expect(() => {
      (item as { name: string }).name = 'Changed';
    }).toThrow();
    expect(catalog.list()[0]?.name).not.toBe('Changed');
  });

  it('uses deterministic canonical data and a standards-compatible local SHA-256 implementation', () => {
    expect(canonicalizeAiToolsCatalogValue({ z: 1, a: ['x', { c: true, b: null }] }))
      .toBe('{"a":["x",{"b":null,"c":true}],"z":1}');
    expect(canonicalizeAiToolsCatalogValue({ b: 2, a: 1 }))
      .toBe(canonicalizeAiToolsCatalogValue({ a: 1, b: 2 }));
    expect(sha256AiToolsCatalogText('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(sha256AiToolsCatalogText('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );

    let getterInvoked = false;
    const unsafe = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => {
        getterInvoked = true;
        return 'not data';
      }
    });
    expect(() => canonicalizeAiToolsCatalogValue(unsafe)).toThrow(/data field/);
    expect(getterInvoked).toBe(false);
  });

  it('requires an exact advertised selection before revealing a revalidated candidate', () => {
    const catalog = new AiToolsCatalogService();
    const expertItem = catalog.list().find(item => item.kind === 'ai-expert')!;
    const templateItem = catalog.list().find(item => item.kind === 'prompt-template')!;
    const registry = new AiExpertRegistry();

    expect(registry.get(expertItem.id)).toBeUndefined();
    const expertCandidate = catalog.prepareSelection(select(expertItem));
    expect(expertCandidate.kind).toBe('ai-expert');
    if (expertCandidate.kind === 'ai-expert') {
      expect(validateAiExpertDefinition(expertCandidate.definition)).toEqual(expertCandidate.definition);
      expect(Object.isFrozen(expertCandidate.definition)).toBe(true);
    }
    expect(registry.get(expertItem.id)).toBeUndefined();

    const templateCandidate = catalog.prepareSelection(select(templateItem));
    expect(templateCandidate.kind).toBe('prompt-template');
    if (templateCandidate.kind === 'prompt-template') {
      expect(validatePromptTemplate(templateCandidate.template)).toEqual(templateCandidate.template);
      expect(Object.isFrozen(templateCandidate.template)).toBe(true);
      expect(Object.isFrozen(templateCandidate.template.variables)).toBe(true);
    }
    expect(Object.isFrozen(expertCandidate)).toBe(true);
    expect(Object.isFrozen(expertCandidate.catalogItem)).toBe(true);
    expect(Object.isFrozen(templateCandidate)).toBe(true);
  });

  it('rejects missing, extra, stale, unknown, and accessor-based selections', () => {
    const catalog = new AiToolsCatalogService();
    const item = catalog.list()[0]!;
    const selection = select(item);

    expectCatalogError(() => catalog.prepareSelection({}), 'INVALID_SELECTION');
    expectCatalogError(() => catalog.prepareSelection({ ...selection, approved: true }), 'INVALID_SELECTION');
    expectCatalogError(() => catalog.prepareSelection({
      ...selection,
      catalogVersion: '0.9.0'
    }), 'CATALOG_VERSION_MISMATCH');
    expectCatalogError(() => catalog.prepareSelection({
      ...selection,
      id: 'not-in-the-curated-catalog'
    }), 'ITEM_NOT_FOUND');
    expectCatalogError(() => catalog.prepareSelection({ ...selection, version: '99.0.0' }),
      'ITEM_VERSION_MISMATCH');
    expectCatalogError(() => catalog.prepareSelection({
      ...selection,
      integrity: `sha256-${'0'.repeat(64)}`
    }), 'ITEM_INTEGRITY_MISMATCH');

    let getterInvoked = false;
    const unsafeSelection = Object.defineProperty({
      ...selection
    }, 'integrity', {
      enumerable: true,
      get: () => {
        getterInvoked = true;
        return item.integrity;
      }
    });
    expectCatalogError(() => catalog.prepareSelection(unsafeSelection), 'INVALID_SELECTION');
    expect(getterInvoked).toBe(false);
  });

  it('audits every built-in payload locally without fetching or executing remote content', () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = jest.fn(() => Promise.reject(new Error('Network access is forbidden')));
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchSpy
    });

    try {
      const catalog = new AiToolsCatalogService();
      const report = catalog.audit();
      for (const item of catalog.list()) catalog.prepareSelection(select(item));

      expect(report).toEqual({
        schemaVersion: AI_TOOLS_CATALOG_SCHEMA_VERSION,
        catalogVersion: AI_TOOLS_CATALOG_VERSION,
        itemCount: 4,
        catalogIntegrity: expect.stringMatching(/^sha256-[a-f0-9]{64}$/)
      });
      expect(Object.isFrozen(report)).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: originalFetch
      });
    }
  });
});
