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
    expect(manifest.permissions).toEqual(['storage', 'activeTab', 'scripting', 'tabs', 'sidePanel']);
    expect(manifest.side_panel).toEqual({ default_path: 'sidepanel.html' });
    expect(manifest.commands.openTranslationSidePanel).toEqual({
      suggested_key: { default: 'Alt+S' },
      description: 'Open the LexiBridge translation side panel'
    });
    expect(manifest.host_permissions).toEqual([
      'https://translate.googleapis.com/*',
      'https://api.mymemory.translated.net/*',
      'https://api-free.deepl.com/*',
      'https://api.deepl.com/*',
      'https://api.cognitive.microsofttranslator.com/*',
      'https://api.openai.com/*',
      'https://generativelanguage.googleapis.com/*'
    ]);
    expect(manifest.optional_host_permissions).toEqual([
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*'
    ]);
    expect(JSON.stringify(manifest)).not.toMatch(/[�]|缈|鎻|馃/);
    expect(manifest.description).not.toMatch(/pdf|video|ocr|meeting/i);
    expect(manifest.content_security_policy.extension_pages).toContain("'wasm-unsafe-eval'");
    expect(manifest.content_security_policy.extension_pages).toContain("worker-src 'self'");
    expect(JSON.stringify(manifest.web_accessible_resources)).not.toContain('src/');
    expect(JSON.stringify(manifest.web_accessible_resources)).toContain('ocr/worker.min.js');
    expect(JSON.stringify(manifest.web_accessible_resources)).toContain('ocr/core/*');
    expect(JSON.stringify(manifest.web_accessible_resources)).toContain('ocr/lang/*');
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
    expect(readme).toContain('Skip configured page areas');
    expect(readme).toContain('translation appearance: subtle panel, highlighted block, or plain text');
    expect(readme).toContain('exact-domain or wildcard site rules');
    expect(readme).toContain('intelligent main-content translation or whole-page translation');
    expect(readme).toContain('text-density and link-density scoring');
    expect(readme).toContain('They never start translation when a page opens');
    expect(readme).toContain('Hold Control while hovering');
    expect(readme).toContain('Press Space three times');
    expect(readme).toContain('Side Panel Text Translation');
    expect(readme).toContain('no text is sent until the user submits it');
    expect(readme).toContain('polish, rewrite, compose, reply, or summarize');
    expect(readme).toContain('keep the input language');
    expect(readme).toContain('ordinary machine-translation providers remain translation-only');
    expect(readme).toContain('Document Translation');
    expect(readme).toContain('Video Subtitle Translation');
    expect(readme).toContain('Export translated subtitle cues from the current session as an `.srt` file');
    expect(readme).toContain('common DOM-rendered captions');
    expect(readme).toContain('Live Caption Translation');
    expect(readme).toContain('Google Meet, Zoom, Microsoft Teams, and Webex-style caption containers');
    expect(readme).toContain('TXT, SRT, VTT, or structured JSON');
    expect(readme).toContain('coalescing incremental word-by-word caption updates');
    expect(readme).toContain('Image Text Translation');
    expect(readme).toContain('Translate visible images');
    expect(readme).toContain('opening or scrolling a page never starts image translation');
    expect(readme).toContain('`.html`, `.htm`');
    expect(readme).toContain('`.json`');
    expect(readme).toContain('`.docx`, `.epub`');
    expect(readme).toContain('Extract readable HTML body blocks');
    expect(readme).toContain('Extract readable string values from JSON files');
    expect(readme).toContain('Export translated JSON files');
    expect(readme).toContain('Extract readable text from DOCX paragraphs and EPUB spine documents');
    expect(readme).toContain('Export translated DOCX files');
    expect(readme).toContain('Export translated EPUB files');
    expect(readme).toContain('Export translated `.srt` and `.vtt` subtitle files');
    expect(readme).toContain('Parse and render PDF pages locally with Mozilla PDF.js');
    expect(readme).toContain('left-column-then-right-column reading order');
    expect(readme).toContain('exclude them from translation-provider requests');
    expect(readme).toContain('Export translated PDF pages locally as a flattened visual PDF');
    expect(readme).toContain('Attempt local OCR on image-only PDF pages');
    expect(readme).toContain('bundled Tesseract fallback');
    expect(readme).toContain('Simplified Chinese, Traditional Chinese, Japanese, or Korean');
    expect(readme).toContain('separate translation overlays for detected OCR text blocks');
    expect(readme).toContain('without recording audio');
    expect(readme).toContain('100+ target language options');
    expect(readme).toContain('21 implemented provider adapters');
    expect(readme).toContain('Ollama requires an endpoint and model but no API key');
    expect(readme).toContain('Provider request formats and failure behavior are covered by automated contract tests');
    expect(readme).toContain('choose a domain expert');
    expect(readme).toContain('Neighboring context is opt-in');
    expect(readme).toContain('API keys in local Chrome storage only');
    expect(readme).toContain('CET4, CET6, GRE, IELTS, TOEFL');
    expect(readme).not.toMatch(/automatic audio transcription|records calls|joins calls automatically/i);
    expect(readme).toContain('not marketed as guaranteed OCR for every scanned PDF');

    const privacy = readProjectFile('PRIVACY.md');
    expect(privacy).toContain('No default telemetry');
    expect(privacy).toContain('Chrome storage');
    expect(privacy).toContain('Translation provider requests');
    expect(privacy).toContain('side-panel text');
    expect(privacy).toContain('Opening it loads settings and masked provider configuration summaries only');
    expect(privacy).toContain('translate.googleapis.com');
    expect(privacy).toContain('api.mymemory.translated.net');
    expect(privacy).toContain('api-free.deepl.com');
    expect(privacy).toContain('api.cognitive.microsofttranslator.com');
    expect(privacy).toContain('api.openai.com');
    expect(privacy).toContain('generativelanguage.googleapis.com');
    expect(privacy).toContain('api.deepseek.com');
    expect(privacy).toContain('api.anthropic.com');
    expect(privacy).toContain('api.interpreter.caiyunai.com');
    expect(privacy).toContain('not written to Chrome Sync');
    expect(privacy).toContain("endpoint's scheme and hostname");
    expect(privacy).toContain('do not restrict permission to one URL path or port');
    expect(privacy).toContain('domain-specific translation rules');
    expect(privacy).toContain('do not trigger translation on page load');
    expect(privacy).toContain('Main-content detection runs locally');
    expect(privacy).toContain('bundled Tesseract worker');
    expect(privacy).toContain('inferred column regions');
    expect(privacy).toContain('excluded from translation-provider requests');
    expect(privacy).toContain('do not contact an OCR server');
    expect(privacy).toContain('local OCR worker is terminated');
    expect(privacy).toContain('Neighboring page or document context is disabled by default');
    expect(privacy).toContain('Glossary and prompt settings may sync through Chrome storage');

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
    expect(listing).toContain('Configurable CSS selector exclusions');
    expect(listing).toContain('subtle, highlighted, or plain-text translation styles');
    expect(listing).toContain('Exact-domain and wildcard site rules');
    expect(listing).toContain('Intelligent main-content detection');
    expect(listing).toContain('Site rules never translate a page automatically');
    expect(listing).toContain('Selection translation tooltip');
    expect(listing).toContain('Control-hover paragraph translation');
    expect(listing).toContain('Input box translation');
    expect(listing).toContain('User-invoked Chrome side panel');
    expect(listing).toContain('Document translator');
    expect(listing).toContain('HTML files');
    expect(listing).toContain('JSON string values');
    expect(listing).toContain('structure-preserving export');
    expect(listing).toContain('DOCX paragraph text');
    expect(listing).toContain('translated source-file export');
    expect(listing).toContain('EPUB spine documents');
    expect(listing).toContain('subtitle files with timing-preserving export');
    expect(listing).toContain('skipping scripts, styles, and markup');
    expect(listing).toContain('local PDF.js rendering');
    expect(listing).toContain('two-column reading order');
    expect(listing).toContain('standalone-formula preservation');
    expect(listing).toContain('flattened translated-PDF export');
    expect(listing).toContain('Video subtitle translation');
    expect(listing).toContain('common DOM-rendered captions');
    expect(listing).toContain('SRT export for translated cues from the current session');
    expect(listing).toContain('Live caption translation');
    expect(listing).toContain('common meeting speaker labels');
    expect(listing).toContain('local TXT/SRT/VTT/JSON transcript export');
    expect(listing).toContain('Manual image text translation');
    expect(listing).toContain('user-triggered visible-image batch');
    expect(listing).toContain('Opening or scrolling a page never starts OCR');
    expect(listing).toContain('bundled offline OCR');
    expect(listing).toContain('selected OCR language');
    expect(listing).toContain('separate OCR block overlays');
    expect(listing).toContain('does not record audio');
    expect(listing).toContain('does not record audio, join calls, or transcribe speech');
    expect(listing).toContain('100+ target language choices');
    expect(listing).toContain('21 implemented provider adapters');
    expect(listing).toContain('AI-capable providers');
    expect(listing).toContain('nine domain experts');
    expect(listing).toContain('Neighboring context is off by default');
    expect(listing).toContain('Provider API keys stay in local Chrome storage');
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

    expect(releaseNotes).toContain('1.0.0 - 2026-07-17');
    expect(releaseNotes).toContain('45 test suites and 323 tests');
    expect(releaseNotes).toContain('17,701,388');
    expect(releaseNotes).toContain('B0E2C294D007892B58105CE883288D3D14B4264AC09F92599A46C9E0B3FB2446');
    expect(releaseNotes).toContain('chrome-translation-extension.zip');
    expect(releaseNotes).toContain('webpack --mode=production');
    expect(releaseNotes).toContain('Expected build warnings');

    expect(screenshotGuide).toContain('Popup Overview');
    expect(screenshotGuide).toContain('Floating Button');
    expect(screenshotGuide).toContain('Manual Page Translation');
    expect(screenshotGuide).toContain('Selection Translation');
    expect(screenshotGuide).toContain('Hover Translation');
    expect(screenshotGuide).toContain('Input Box Translation');
    expect(screenshotGuide).toContain('Side Panel Text Translation');
    expect(screenshotGuide).toContain('Document Translator');
    expect(screenshotGuide).toContain('without raw tags or script/style content');
    expect(screenshotGuide).toContain('readable string values');
    expect(screenshotGuide).toContain('Export JSON');
    expect(screenshotGuide).toContain('DOCX sample');
    expect(screenshotGuide).toContain('Export DOCX');
    expect(screenshotGuide).toContain('EPUB sample');
    expect(screenshotGuide).toContain('Export EPUB');
    expect(screenshotGuide).toContain('Export subtitles');
    expect(screenshotGuide).toContain('Export PDF');
    expect(screenshotGuide).toContain('original and translated rendered pages');
    expect(screenshotGuide).toContain('left/right column boundaries');
    expect(screenshotGuide).toContain('preserved standalone formula');
    expect(screenshotGuide).toContain('Video Subtitles');
    expect(screenshotGuide).toContain('Export SRT');
    expect(screenshotGuide).toContain('Live Captions');
    expect(screenshotGuide).toContain('TXT/SRT/VTT/JSON format menu');
    expect(screenshotGuide).toContain('Image Text');
    expect(screenshotGuide).toContain('Translate visible images');
    expect(screenshotGuide).toContain('separate region overlays');
    expect(screenshotGuide).toContain('Vocabulary Notebook');
    expect(screenshotGuide).toContain('Review Page');
    expect(screenshotGuide).toContain('Options');
    expect(screenshotGuide).toContain('Page translation exclude selectors');
    expect(screenshotGuide).toContain('Translation style and site-rule controls');
    expect(screenshotGuide).toContain('AI translation controls');
    expect(screenshotGuide).toContain('Main content or Whole page translation scope');
    expect(screenshotGuide).toContain('No translated page text yet');
    expect(screenshotGuide).toContain('STORE_LISTING.md');
  });

  it('tracks the expanded Immersive Translate replication scope', () => {
    const roadmap = readProjectFile('docs/superpowers/specs/2026-07-07-immersive-replication-roadmap.md');

    expect(roadmap).toContain('Web page bilingual translation');
    expect(roadmap).toContain('Configurable page translation exclude selectors');
    expect(roadmap).toContain('Site Rules and Translation Appearance');
    expect(roadmap).toContain('score structural fallbacks by text and link density');
    expect(roadmap).toContain('site rules never start translation on page load');
    expect(roadmap).toContain('Hover paragraph translation');
    expect(roadmap).toContain('Input box translation');
    expect(roadmap).toContain('PDF and document translation');
    expect(roadmap).toContain('HTML body text extraction');
    expect(roadmap).toContain('JSON document string-value extraction');
    expect(roadmap).toContain('translated JSON export');
    expect(roadmap).toContain('DOCX paragraph text and EPUB spine text extraction');
    expect(roadmap).toContain('DOCX translated paragraph export');
    expect(roadmap).toContain('EPUB translated block export');
    expect(roadmap).toContain('Timing-preserving subtitle file export');
    expect(roadmap).toContain('bundled Mozilla PDF.js');
    expect(roadmap).toContain('order left-column text before right-column text');
    expect(roadmap).toContain('identify likely standalone formulas locally');
    expect(roadmap).toContain('flattened visual PDF');
    expect(roadmap).toContain('browser `TextDetector`');
    expect(roadmap).toContain('bundled Tesseract worker');
    expect(roadmap).toContain('five selectable recognition languages');
    expect(roadmap).toContain('Video subtitle translation');
    expect(roadmap).toContain('DOM-rendered video caption adapters');
    expect(roadmap).toContain('SRT export for translated subtitle cues');
    expect(roadmap).toContain('Meeting subtitle translation');
    expect(roadmap).toContain('meeting caption adapters with speaker-label preservation');
    expect(roadmap).toContain('timestamped bilingual cues');
    expect(roadmap).toContain('TXT, SRT, VTT, or structured JSON');
    expect(roadmap).toContain('Image, manga, and OCR translation');
    expect(roadmap).toContain('separate OCR text-block overlays');
    expect(roadmap).toContain('Translate visible images');
    expect(roadmap).toContain('Multiple translation engines');
    expect(roadmap).toContain('21 implemented provider adapters');
    expect(roadmap).toContain('Papago, Baidu, Tencent Cloud TMT');
    expect(roadmap).toContain('nine domain-specific AI translation experts');
    expect(roadmap).toContain('include AI preferences in cache identity');
    expect(roadmap).toContain('Do not auto-translate a page on load');
  });

  it('packages the local PDF runtime and document-page controls', () => {
    const packageJson = JSON.parse(readProjectFile('package.json'));
    const webpackConfig = readProjectFile('webpack.config.js');
    const documentHtml = readProjectFile('src/options/document.html');

    expect(packageJson.dependencies).toEqual(expect.objectContaining({
      'pdf-lib': expect.any(String),
      'pdfjs-dist': expect.any(String),
      'tesseract.js': expect.any(String),
      '@tesseract.js-data/eng': expect.any(String),
      '@tesseract.js-data/chi_sim': expect.any(String),
      '@tesseract.js-data/chi_tra': expect.any(String),
      '@tesseract.js-data/jpn': expect.any(String),
      '@tesseract.js-data/kor': expect.any(String)
    }));
    expect(webpackConfig).toContain('pdf.worker.min.js');
    expect(webpackConfig).toContain("path.join(pdfjsRoot, 'cmaps')");
    expect(webpackConfig).toContain("path.join(pdfjsRoot, 'standard_fonts')");
    expect(webpackConfig).toContain("path.join(tesseractRoot, 'dist/worker.min.js')");
    expect(webpackConfig).toContain('tesseract-core-simd-lstm.wasm');
    expect(webpackConfig).toContain('ocrLanguagePackages');
    expect(documentHtml).toContain('id="pdfViewer"');
    expect(documentHtml).toContain('id="exportPdfFile"');
    expect(documentHtml).toContain('id="ocrLanguage"');
    const optionsHtml = readProjectFile('src/options/options.html');
    expect(optionsHtml).toContain('id="documentOcrLanguage"');
    expect(optionsHtml).toContain('id="aiContextEnabled"');
    expect(optionsHtml).toContain('id="aiTranslationDomain"');
    expect(optionsHtml).toContain('id="translationGlossary"');
    expect(optionsHtml).toContain('id="aiCustomPrompt"');
    expect(optionsHtml).toContain('Save provider configuration');
    expect(optionsHtml).toContain('Remove configuration');
    expect(webpackConfig).toContain("sidepanel: './src/sidepanel/sidepanel.ts'");
    expect(webpackConfig).toContain("from: 'src/sidepanel/sidepanel.html'");
    const sidePanelHtml = readProjectFile('src/sidepanel/sidepanel.html');
    expect(sidePanelHtml).toContain('id="translateText"');
    expect(sidePanelHtml).toContain('id="copyTranslation"');
    expect(sidePanelHtml).toContain('data-mode="polish"');
    expect(sidePanelHtml).toContain('data-mode="compose"');
    expect(sidePanelHtml).toContain('data-mode="reply"');
    expect(sidePanelHtml).toContain('data-mode="summarize"');
    expect(sidePanelHtml).toContain('id="writingTone"');
    expect(sidePanelHtml).toContain('id="writingLength"');
    expect(sidePanelHtml).toContain('id="writingInstruction"');
    expect(sidePanelHtml).toContain('id="useResultAsInput"');
    expect(readProjectFile('src/popup/popup.html')).toContain('id="openSidePanelBtn"');
  });
});
