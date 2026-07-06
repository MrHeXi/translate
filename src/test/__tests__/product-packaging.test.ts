import { existsSync, readFileSync } from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath: string): string =>
  readFileSync(path.join(rootDir, relativePath), 'utf8');

describe('product packaging contract', () => {
  it('uses promotable extension metadata without mojibake or overclaimed features', () => {
    const manifest = JSON.parse(readProjectFile('manifest.json'));

    expect(manifest.name).toBe('LexiBridge Translate');
    expect(manifest.action.default_title).toBe('LexiBridge Translate');
    expect(manifest.description).toBe(
      'Translate web pages, collect unknown words, and review CET, GRE, IELTS, and TOEFL vocabulary.'
    );
    expect(manifest.permissions).toEqual(['storage', 'activeTab', 'scripting', 'tabs']);
    expect(manifest.host_permissions).toEqual([
      'https://translate.googleapis.com/*',
      'https://api.mymemory.translated.net/*'
    ]);
    expect(JSON.stringify(manifest)).not.toMatch(/[�]|缈|鎻|馃/);
    expect(JSON.stringify(manifest)).not.toMatch(/pdf|video|ocr|meeting/i);
    expect(JSON.stringify(manifest.web_accessible_resources)).not.toContain('src/');
  });

  it('ships release-ready user documentation and privacy disclosure', () => {
    const expectedDocs = ['README.md', 'PRIVACY.md', 'RELEASE_CHECKLIST.md', 'STORE_LISTING.md'];

    expectedDocs.forEach(relativePath => {
      const absolutePath = path.join(rootDir, relativePath);
      expect(existsSync(absolutePath)).toBe(true);
      expect(readProjectFile(relativePath)).not.toMatch(/[�]|馃|缈|鎻|TBD|TODO|待定/);
    });

    const readme = readProjectFile('README.md');
    expect(readme).toContain('LexiBridge Translate');
    expect(readme).toContain('manual floating button');
    expect(readme).toContain('CET4, CET6, GRE, IELTS, TOEFL');
    expect(readme).not.toMatch(/PDF|video subtitles|OCR|meeting translation/);

    const privacy = readProjectFile('PRIVACY.md');
    expect(privacy).toContain('No default telemetry');
    expect(privacy).toContain('Chrome storage');
    expect(privacy).toContain('Translation provider requests');
    expect(privacy).toContain('translate.googleapis.com');
    expect(privacy).toContain('api.mymemory.translated.net');

    const checklist = readProjectFile('RELEASE_CHECKLIST.md');
    expect(checklist).toContain('Chrome Web Store');
    expect(checklist).toContain('STORE_LISTING.md');
    expect(checklist).toContain('Privacy practices');
    expect(checklist).toContain('Screenshots');
    expect(checklist).toContain('Permissions');
    expect(checklist).toContain('Version');
  });

  it('provides store listing copy with permission, privacy, and screenshot guidance', () => {
    const listing = readProjectFile('STORE_LISTING.md');

    expect(listing).toContain('LexiBridge Translate');
    expect(listing).toContain('Translate web pages on demand');
    expect(listing).toContain('Manual page translation');
    expect(listing).toContain('Selection translation tooltip');
    expect(listing).toContain('Vocabulary notebook');
    expect(listing).toContain('CET4');
    expect(listing).toContain('CET6');
    expect(listing).toContain('GRE');
    expect(listing).toContain('IELTS');
    expect(listing).toContain('TOEFL');
    expect(listing).toContain('Screenshot Plan');
    expect(listing).toContain('Permission Justifications');
    expect(listing).toContain('Privacy Questionnaire Notes');
    expect(listing).toContain('No default telemetry');
    expect(listing).toContain('Translate page');
    expect(listing).toContain('bottom-right');
    expect(listing).not.toMatch(/PDF layout translator|video subtitle|OCR\/image reader|meeting translator|account-based cloud/i);
  });
});
