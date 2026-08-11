import {
  ACADEMIC_HANDOFF_MAX_BLOCKS,
  createAcademicDocumentHandoff
} from '../AcademicDocumentHandoff';

describe('AcademicDocumentHandoff', () => {
  it('creates a deterministic bilingual Markdown handoff with safe metadata', () => {
    const result = createAcademicDocumentHandoff({
      title: 'Paper translation',
      sourceName: 'research/paper.pdf',
      sourceUrl: 'https://example.com/paper.pdf?download=1',
      provider: 'google',
      targetLanguage: 'zh-CN',
      exportedAt: '2026-08-11T03:00:00.000Z',
      blocks: [{
        label: 'Page 1 Block 1',
        originalText: 'Original paragraph.',
        translatedText: 'Translated paragraph.'
      }]
    });

    expect(result).toEqual(expect.objectContaining({
      schemaVersion: 1,
      blockCount: 1,
      filename: 'research-paper.bilingual-research-note.md'
    }));
    expect(result.content).toContain('# Paper translation');
    expect(result.content).toContain('- Source URL: [https://example.com/paper.pdf?download=1]');
    expect(result.content).toContain('- Translation provider: google');
    expect(result.content).toContain('## Page 1 Block 1');
    expect(result.content).toContain('```text\nOriginal paragraph.\n```');
    expect(result.content).toContain('```text\nTranslated paragraph.\n```');
  });

  it('uses a longer Markdown fence when source text contains backticks', () => {
    const result = createAcademicDocumentHandoff({
      title: 'Code sample',
      provider: 'openai',
      targetLanguage: 'en',
      exportedAt: '2026-08-11T03:00:00.000Z',
      blocks: [{
        label: 'Block 1',
        originalText: 'Use ```code``` here.',
        translatedText: 'Translated.'
      }]
    });

    expect(result.content).toContain('````text\nUse ```code``` here.\n````');
  });

  it('omits unsafe source URL schemes', () => {
    const result = createAcademicDocumentHandoff({
      title: 'Local note',
      sourceUrl: 'javascript:alert(1)',
      provider: 'google',
      targetLanguage: 'fr',
      exportedAt: '2026-08-11T03:00:00.000Z',
      blocks: [{ label: 'Block 1', originalText: 'Hello', translatedText: 'Bonjour' }]
    });

    expect(result.content).not.toContain('Source URL');
    expect(result.content).not.toContain('javascript:');
  });

  it('rejects empty and oversized block collections', () => {
    const base = {
      title: 'Research note',
      provider: 'google',
      targetLanguage: 'zh-CN',
      exportedAt: '2026-08-11T03:00:00.000Z'
    };

    expect(() => createAcademicDocumentHandoff({ ...base, blocks: [] })).toThrow(
      'Translate document text before exporting a research note.'
    );
    expect(() => createAcademicDocumentHandoff({
      ...base,
      blocks: Array.from({ length: ACADEMIC_HANDOFF_MAX_BLOCKS + 1 }, (_, index) => ({
        label: `Block ${index + 1}`,
        originalText: 'source',
        translatedText: 'translation'
      }))
    })).toThrow(`at most ${ACADEMIC_HANDOFF_MAX_BLOCKS} blocks`);
  });
});
