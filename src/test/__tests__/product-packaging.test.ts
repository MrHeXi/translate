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
    const expectedDocs = [
      'README.md',
      'PRIVACY.md',
      'RELEASE_CHECKLIST.md',
      'RELEASE_NOTES.md',
      'STORE_LISTING.md',
      'docs/release/SCREENSHOT_GUIDE.md',
      'docs/superpowers/specs/2026-07-07-immersive-replication-roadmap.md'
    ];

    expectedDocs.forEach(relativePath => {
      const absolutePath = path.join(rootDir, relativePath);
      expect(existsSync(absolutePath)).toBe(true);
      expect(readProjectFile(relativePath)).not.toMatch(/[�]|馃|缈|鎻|TBD|TODO|待定/);
    });

    const readme = readProjectFile('README.md');
    expect(readme).toContain('LexiBridge Translate');
    expect(readme).toContain('manual floating button');
    expect(readme).toContain('Hold Control while hovering');
    expect(readme).toContain('Press Space three times');
    expect(readme).toContain('Document Translation');
    expect(readme).toContain('Video Subtitle Translation');
    expect(readme).toContain('Live Caption Translation');
    expect(readme).toContain('Image Text Translation');
    expect(readme).toContain('simple text-based `.pdf` files');
    expect(readme).toContain('Preserve page and coordinate metadata');
    expect(readme).toContain('separate translation overlays for detected OCR text blocks');
    expect(readme).toContain('without recording audio');
    expect(readme).toContain('100+ target language options');
    expect(readme).toContain('20+ provider roadmap');
    expect(readme).toContain('CET4, CET6, GRE, IELTS, TOEFL');
    expect(readme).not.toMatch(/automatic audio transcription|records calls|joins calls automatically/i);
    expect(readme).toContain('not marketed as a full scanned-PDF OCR translator');

    const privacy = readProjectFile('PRIVACY.md');
    expect(privacy).toContain('No default telemetry');
    expect(privacy).toContain('Chrome storage');
    expect(privacy).toContain('Translation provider requests');
    expect(privacy).toContain('translate.googleapis.com');
    expect(privacy).toContain('api.mymemory.translated.net');

    const checklist = readProjectFile('RELEASE_CHECKLIST.md');
    expect(checklist).toContain('Chrome Web Store');
    expect(checklist).toContain('STORE_LISTING.md');
    expect(checklist).toContain('RELEASE_NOTES.md');
    expect(checklist).toContain('docs/release/SCREENSHOT_GUIDE.md');
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
    expect(listing).toContain('Control-hover paragraph translation');
    expect(listing).toContain('Input box translation');
    expect(listing).toContain('Text-based document translator');
    expect(listing).toContain('layout block metadata');
    expect(listing).toContain('Video subtitle translation');
    expect(listing).toContain('Live caption translation');
    expect(listing).toContain('Manual image text translation');
    expect(listing).toContain('OCR depends on browser support');
    expect(listing).toContain('separate OCR block overlays');
    expect(listing).toContain('does not record audio');
    expect(listing).toContain('does not record audio, join calls, or create meeting transcripts');
    expect(listing).toContain('100+ target language choices');
    expect(listing).toContain('20+ provider definitions');
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
    expect(listing).not.toMatch(/PDF layout translator|automatic manga panel translation included|meeting translator|account-based cloud/i);
  });

  it('records release verification and screenshot capture guidance', () => {
    const releaseNotes = readProjectFile('RELEASE_NOTES.md');
    const screenshotGuide = readProjectFile('docs/release/SCREENSHOT_GUIDE.md');

    expect(releaseNotes).toContain('1.0.0 - 2026-07-08');
    expect(releaseNotes).toContain('32 test suites and 204 tests');
    expect(releaseNotes).toContain('chrome-translation-extension.zip');
    expect(releaseNotes).toContain('webpack --mode=production');
    expect(releaseNotes).toContain('Expected build warnings');

    expect(screenshotGuide).toContain('Popup Overview');
    expect(screenshotGuide).toContain('Floating Button');
    expect(screenshotGuide).toContain('Manual Page Translation');
    expect(screenshotGuide).toContain('Selection Translation');
    expect(screenshotGuide).toContain('Hover Translation');
    expect(screenshotGuide).toContain('Input Box Translation');
    expect(screenshotGuide).toContain('Document Translator');
    expect(screenshotGuide).toContain('Video Subtitles');
    expect(screenshotGuide).toContain('Live Captions');
    expect(screenshotGuide).toContain('Image Text');
    expect(screenshotGuide).toContain('separate region overlays');
    expect(screenshotGuide).toContain('Vocabulary Notebook');
    expect(screenshotGuide).toContain('Review Page');
    expect(screenshotGuide).toContain('Options');
    expect(screenshotGuide).toContain('No translated page text yet');
    expect(screenshotGuide).toContain('STORE_LISTING.md');
  });

  it('tracks the expanded Immersive Translate replication scope', () => {
    const roadmap = readProjectFile('docs/superpowers/specs/2026-07-07-immersive-replication-roadmap.md');

    expect(roadmap).toContain('Web page bilingual translation');
    expect(roadmap).toContain('Hover paragraph translation');
    expect(roadmap).toContain('Input box translation');
    expect(roadmap).toContain('PDF and document translation');
    expect(roadmap).toContain('Video subtitle translation');
    expect(roadmap).toContain('Meeting subtitle translation');
    expect(roadmap).toContain('Image, manga, and OCR translation');
    expect(roadmap).toContain('separate OCR text-block overlays');
    expect(roadmap).toContain('Multiple translation engines');
    expect(roadmap).toContain('Do not auto-translate a page on load');
  });
});
