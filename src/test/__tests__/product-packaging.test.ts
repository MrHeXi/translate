import { existsSync, readFileSync } from 'fs';
import path from 'path';

const {
  calculateBuildInputDigest,
  calculateManifestDigest,
  calculatePayloadTreeDigest
} = require('../../../scripts/build-integrity') as {
  calculateBuildInputDigest: (rootDir: string, target?: string) => string;
  calculateManifestDigest: (rootDir: string, target?: string) => string;
  calculatePayloadTreeDigest: (outputDirectory: string) => string;
};

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath: string): string =>
  readFileSync(path.join(rootDir, relativePath), 'utf8');

describe('product packaging contract', () => {
  it('rejects stale build artifacts using the runtime source fingerprint', () => {
    const webpackConfig = readProjectFile('webpack.config.js');
    expect(webpackConfig).toContain('BuildIntegrityPlugin');
    expect(webpackConfig).toContain("'build-meta.json'");

    const packageVersion = JSON.parse(readProjectFile('package.json')).version;
    const targets = [
      { target: 'chrome', outputDirectory: 'dist', manifest: 'manifest.json' },
      { target: 'firefox', outputDirectory: 'dist-firefox', manifest: 'manifest.firefox.json' }
    ];

    targets.forEach(({ target, outputDirectory, manifest }) => {
      const outputPath = path.join(rootDir, outputDirectory);
      if (!existsSync(outputPath)) return;
      const buildMetadataPath = path.join(outputPath, 'build-meta.json');
      expect(existsSync(buildMetadataPath)).toBe(true);
      expect(readFileSync(path.join(outputPath, 'manifest.json')))
        .toEqual(readFileSync(path.join(rootDir, manifest)));
      const metadata = JSON.parse(readFileSync(buildMetadataPath, 'utf8'));
      expect(metadata).toEqual({
        schemaVersion: 2,
        target,
        mode: 'production',
        version: packageVersion,
        sourceSha256: calculateBuildInputDigest(rootDir, target),
        manifestSha256: calculateManifestDigest(rootDir, target),
        payloadTreeSha256: calculatePayloadTreeDigest(outputPath)
      });
      const artifactNames = Array.from(new Set(
        require('../../../scripts/build-integrity').collectPayloadEntries(outputPath)
          .map((entry: { name: string }) => entry.name)
      ));
      expect(artifactNames).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/(^|\/)(?:test|__tests__)(\/|$)|\.(?:d\.ts|map|ts)$/i)
      ]));
    });
  });

  it('uses promotable extension metadata without mojibake or overclaimed features', () => {
    const manifest = JSON.parse(readProjectFile('manifest.json'));

    expect(manifest.name).toBe('LexiBridge Translate');
    expect(manifest.action.default_title).toBe('LexiBridge Translate');
    expect(manifest.description).toBe(
      'Translate web pages, collect unknown words, and review CET, GRE, IELTS, and TOEFL vocabulary.'
    );
    expect(manifest.permissions).toEqual([
      'storage',
      'activeTab',
      'scripting',
      'tabs',
      'contextMenus',
      'alarms',
      'sidePanel',
      'tabCapture'
    ]);
    expect(manifest.optional_permissions).toBeUndefined();
    expect(manifest.minimum_chrome_version).toBe('116');
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

  it('uses a Firefox-specific manifest without Chromium-only capabilities', () => {
    const manifest = JSON.parse(readProjectFile('manifest.firefox.json'));

    expect(manifest.permissions).toEqual([
      'storage',
      'activeTab',
      'scripting',
      'tabs',
      'contextMenus',
      'alarms'
    ]);
    expect(manifest.minimum_chrome_version).toBeUndefined();
    expect(manifest.background).toEqual({ scripts: ['background.js'] });
    expect(manifest.side_panel).toBeUndefined();
    expect(manifest.sidebar_action).toEqual({
      default_panel: 'sidepanel.html',
      default_title: 'LexiBridge Translate',
      default_icon: {
        '16': 'icons/icon16.png',
        '32': 'icons/icon32.png'
      },
      open_at_install: false
    });
    expect(manifest.browser_specific_settings.gecko).toEqual({
      id: 'lexibridge-translate@mrhexi.github.com',
      strict_min_version: '140.0',
      data_collection_permissions: {
        required: [
          'personallyIdentifyingInfo',
          'healthInfo',
          'financialAndPaymentInfo',
          'authenticationInfo',
          'personalCommunications',
          'locationInfo',
          'websiteContent',
          'searchTerms'
        ]
      }
    });
    expect(JSON.stringify(manifest)).not.toMatch(/[�]|缈|鎻|馃/);
  });

  it('defines target-specific builds and deterministic dual-browser packages', () => {
    const packageJson = JSON.parse(readProjectFile('package.json'));
    const packageScript = readProjectFile('scripts/package-extensions.js');
    const verificationScript = readProjectFile('scripts/verify-build-targets.js');

    expect(packageJson.scripts['build:chrome']).toContain('target=chrome');
    expect(packageJson.scripts['build:firefox']).toContain('target=firefox');
    expect(packageJson.scripts.package).toContain('build:all');
    expect(packageJson.scripts.package).toContain('lint:firefox');
    expect(packageJson.scripts.package).toContain('package-extensions.js');
    expect(packageJson.devDependencies).toEqual(expect.objectContaining({
      jszip: expect.any(String),
      'web-ext': expect.any(String)
    }));
    expect(packageScript).toContain("new Date('1980-01-01T00:00:00.000Z')");
    expect(packageScript).toContain('generation is not deterministic');
    expect(packageScript).toContain("checkCRC32: true");
    expect(verificationScript).toContain('payload bytes differ');
    expect(verificationScript).toContain('Forbidden ${target} artifact');
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
    expect(readme).toContain('Click the tooltip\'s speech action');
    expect(readme).toContain('mobile input/touch events');
    expect(readme).toContain('`/en`, `/中文`, or `/zh-CN`');
    expect(readme).toContain('does not trigger from existing text at page load');
    expect(readme).toContain('Firefox Desktop 140+');
    expect(readme).toContain('firefox-translation-extension.zip');
    expect(readme).toContain('Current-tab audio capture is unavailable');
    expect(readme).toContain('Side Panel Text Translation');
    expect(readme).toContain('no text is sent until the user submits it');
    expect(readme).toContain('polish, rewrite, compose, reply, or summarize');
    expect(readme).toContain('keep the input language');
    expect(readme).toContain('ordinary machine-translation providers remain translation-only');
    expect(readme).toContain('Document Translation');
    expect(readme).toContain('Video Subtitle Translation');
    expect(readme).toContain('Export translated subtitle cues from the current session as an `.srt` file');
    expect(readme).toContain('Generate Subtitles From Local Media');
    expect(readme).toContain('Generate Subtitles From Current Tab Audio');
    expect(readme).toContain('configured OpenAI or Groq transcription service');
    expect(readme).toContain('Capturing audio from the source tab in Chrome only after an explicit click');
    expect(readme).toContain('click Stop and generate when enough audio has played');
    expect(readme).toContain('Use the declared `tabCapture` permission only after the explicit capture button');
    expect(readme).toContain('requires Chrome 116 or newer');
    expect(readme).toContain('current-tab audio remains local until Stop and generate');
    expect(readme).toContain('clear buffers after completion, cancellation, provider errors, or disconnection');
    expect(readme).toContain('common DOM-rendered captions');
    expect(readme).toContain('Live Caption Translation');
    expect(readme).toContain('Google Meet, Zoom, Microsoft Teams, and Webex-style caption containers');
    expect(readme).toContain('TXT, SRT, VTT, or structured JSON');
    expect(readme).toContain('coalescing incremental word-by-word caption updates');
    expect(readme).toContain('Image Text Translation');
    expect(readme).toContain('Translate visible images');
    expect(readme).toContain('opening or scrolling a page never starts image translation');
    expect(readme).toContain('Open the dedicated image workspace');
    expect(readme).toContain('Loading and changing settings never starts OCR');
    expect(readme).toContain('quality feedback in local Chrome storage without source text or file names');
    expect(readme).toContain('`.html`, `.htm`');
    expect(readme).toContain('`.json`');
    expect(readme).toContain('`.docx`, `.epub`');
    expect(readme).toMatch(/MOBI.*AZW3/i);
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
    expect(readme).toContain('merge/deduplicate OCR and text-layer blocks');
    expect(readme).toContain('bundled Tesseract fallback');
    expect(readme).toContain('Simplified Chinese, Traditional Chinese, Japanese, or Korean');
    expect(readme).toContain('temporary canvas overlay');
    expect(readme).toContain('separate DOM text-block overlay instead');
    expect(readme).toContain('without recording audio');
    expect(readme).toContain('100+ target language options');
    expect(readme).toContain('29 implemented provider adapters');
    expect(readme).toContain('Amazon also requires an AWS region');
    expect(readme).toContain('Ollama requires an endpoint and model but no API key');
    expect(readme).toContain('Provider request formats and failure behavior are covered by automated contract tests');
    expect(readme).toContain('choose a domain expert');
    expect(readme).toContain('Neighboring context is opt-in');
    expect(readme).toContain('API keys, client/application IDs, and temporary session tokens in local Chrome storage only');
    expect(readme).toContain('CET4, CET6, GRE, IELTS, TOEFL');
    expect(readme).toContain('background or automatic browser-tab audio capture');
    expect(readme).toContain('meeting bot that records or joins calls');
    expect(readme).not.toMatch(/automatic audio transcription|records calls|joins calls automatically/i);
    expect(readme).toContain('not marketed as guaranteed OCR for every scanned PDF');
    expect(readme).toContain('Supplement sparse text layers on raster-backed PDF pages');
    expect(readme).toContain('inserted text without safe source geometry remains visible for translation');
    expect(readme).toContain('Scope content, image, video-subtitle, and live-caption translation caches');

    const privacy = readProjectFile('PRIVACY.md');
    expect(privacy).toContain('No default telemetry');
    expect(privacy).toContain('Chrome storage');
    expect(privacy).toContain('Translation provider requests');
    expect(privacy).toContain('side-panel text');
    expect(privacy).toContain(
      'current-tab recording started by an explicit Capture current tab click'
    );
    expect(privacy).toContain(
      'Opening the generator, visiting a media page, or selecting a local file does not capture or upload audio'
    );
    expect(privacy).toContain("Chrome grants the declared `tabCapture` permission at installation");
    expect(privacy).toContain('LexiBridge invokes it only after Capture current tab');
    expect(privacy).toContain('records only the source tab that opened the generator');
    expect(privacy).toContain('runs only while the generator page remains open');
    expect(privacy).toContain('Clicking Stop and generate turns the in-memory recording into a local WebM file');
    expect(privacy).toContain('After Generate subtitles or Stop and generate');
    expect(privacy).toContain('provider upload starts only after Stop and generate');
    expect(privacy).toContain('ordered 256 KB chunks');
    expect(privacy).toContain('Media bytes stay in memory only');
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
    expect(privacy).toContain('translate.volcengineapi.com');
    expect(privacy).toContain('mt.cn-hangzhou.aliyuncs.com');
    expect(privacy).toContain('translate.us-east-1.amazonaws.com');
    expect(privacy).toContain('temporary session tokens');
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
    expect(privacy).toContain('Choosing, dropping, or pasting JPG/JPEG, PNG, or WEBP files only loads local previews');
    expect(privacy).toContain('processed sequentially in overlapping OCR/analysis tiles capped at 1.5 megapixels');
    expect(privacy).toContain('completed output keeps the original dimensions');
    expect(privacy).toContain('Local image quality feedback is optional, stays in local Chrome storage');
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
    expect(checklist).toContain('mixed PDF page with sparse centered text plus raster content');
    expect(checklist).toContain('add text without safe geometry');
    expect(checklist).toContain('changing settings while Image text remains enabled makes a fresh provider request');
    expect(checklist).toContain('repeated Video subtitle and Live caption text also makes a fresh request');
    expect(checklist).toMatch(/MOBI.*AZW3/i);
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
    expect(listing).toContain('editable SRT/VTT/ASS/SSA subtitle results');
    expect(listing).toContain('ASS/SSA export preserves script sections, timing, styles, comments, and inline tags');
    expect(listing).toContain('Document history is stored only after Save history in local Chrome storage');
    expect(listing).toContain('skipping scripts, styles, and markup');
    expect(listing).toContain('local PDF.js rendering');
    expect(listing).toContain('two-column reading order');
    expect(listing).toContain('standalone-formula preservation');
    expect(listing).toContain('flattened translated-PDF export');
    expect(listing).toContain('Video subtitle translation');
    expect(listing).toContain('Explicit subtitle generation for a selected local audio/video file up to 25 MB');
    expect(listing).toContain('Explicit current-tab audio capture while the subtitle generator remains open');
    expect(listing).toContain('using the declared permission only after Capture current tab');
    expect(listing).toContain('Stop-and-generate submission');
    expect(listing).toContain('no page-load recording');
    expect(listing).toContain('common DOM-rendered captions');
    expect(listing).toContain('SRT export for translated cues from the current session');
    expect(listing).toContain('Live caption translation');
    expect(listing).toContain('common meeting speaker labels');
    expect(listing).toContain('local TXT/SRT/VTT/JSON transcript export');
    expect(listing).toContain('Manual image text translation');
    expect(listing).toContain('visible-image batch');
    expect(listing).toContain('freeform `Z` lasso');
    expect(listing).toContain('explicit Scan then Translate chapter entry points');
    expect(listing).toContain('scanning only reads a bounded DOM snapshot and does not start OCR');
    expect(listing).toContain('predominantly CJK vertical text');
    expect(listing).toContain('Opening or scrolling a page never starts OCR');
    expect(listing).toContain('bundled offline OCR');
    expect(listing).toContain('selected OCR language');
    expect(listing).toContain('bounded local comic-bubble reconstruction when safe');
    expect(listing).toContain('source-resolution overlapping tiles');
    expect(listing).toContain('original-resolution completed PNG download');
    expect(listing).toContain('separate non-destructive text overlays');
    expect(listing).toContain('frame-aware right-click menu');
    expect(listing).toContain('Per-image Retranslate');
    expect(listing).toContain('Dedicated local image workspace');
    expect(listing).toContain('remains idle after choose/drop/paste');
    expect(listing).toContain('Download PNG is offered only for safe reconstructed canvases');
    expect(listing).toContain('does not record audio, join calls, or transcribe speech');
    expect(listing).toContain('100+ target language choices');
    expect(listing).toContain('29 implemented provider adapters');
    expect(listing).toContain('AI-capable providers');
    expect(listing).toContain('nine trusted built-in experts');
    expect(listing).toContain('validated YAML prompt templates');
    expect(listing).toContain('Opt-in local masking');
    expect(listing).toContain('Neighboring context is off by default');
    expect(listing).toContain('Provider API keys, client/application IDs, and temporary session tokens stay in local Chrome storage');
    expect(listing).toContain('Vocabulary notebook');
    expect(listing).toContain('CET4');
    expect(listing).toContain('CET6');
    expect(listing).toContain('GRE');
    expect(listing).toContain('IELTS');
    expect(listing).toContain('TOEFL');
    expect(listing).toContain('Screenshot Plan');
    expect(listing).toContain('Permission Justifications');
    expect(listing).toContain('Privacy Questionnaire Notes');
    expect(listing).toContain('`tabCapture`: required so Chrome can authorize the source tab');
    expect(listing).toContain('`contextMenus`: show Translate text in this image');
    expect(listing).toContain('uploads only after Generate subtitles or Stop and generate');
    expect(listing).toContain('Stop and generate is required before provider upload');
    expect(listing).toContain('does not start automatically or join meetings');
    expect(listing).toContain('explicit local-media or current-tab transcription');
    expect(listing).toContain('selected or explicitly captured media submitted for transcription');
    expect(listing).toContain('selected translation or transcription provider');
    expect(listing).toContain('No default telemetry');
    expect(listing).toContain('Translate page');
    expect(listing).toContain('bottom-right');
    expect(listing).not.toMatch(/PDF layout translator|automatic manga panel translation included|meeting translator|account-based cloud/i);
  });

  it('records release verification and screenshot capture guidance', () => {
    const releaseNotes = readProjectFile('RELEASE_NOTES.md');
    const screenshotGuide = readProjectFile('docs/release/SCREENSHOT_GUIDE.md');

    expect(releaseNotes).toContain('1.0.0 - 2026-07-17');
    expect(releaseNotes).toContain('74 test suites and 737 tests');
    expect(releaseNotes).toContain('17,832,610');
    expect(releaseNotes).toContain('D3099375DDD6B08CBB0C73D4BA59BB18C0892DF7D10F33568942FE4F42CD2CFA');
    expect(releaseNotes).toContain('17,832,784');
    expect(releaseNotes).toContain('5413AD8CEE93905D2D53CE976AB0A8C66D15396A41A1AB0A7C42DE1EE966C23A');
    expect(releaseNotes).toContain('981A9419BDFE02CBEB0839477F255A805BDC4F4433250B0ECF7ABDD36AD982D3');
    expect(releaseNotes).toContain('6EA81F8B3FF1FE5F6E757148FDBFA0D66D80E9AE27B85DD65ADAC355C5D9F8F6');
    expect(releaseNotes).toContain('chrome-translation-extension.zip');
    expect(releaseNotes).toContain('firefox-translation-extension.zip');
    expect(releaseNotes).toContain('`npm run package`: passed');
    expect(releaseNotes).toContain('Expected build warnings');
    expect(releaseNotes).toContain('Mixed PDF pages with sparse text layers');
    expect(releaseNotes).toContain('newly inserted text without safe source geometry remains translatable');
    expect(releaseNotes).toContain('single MessageManager listener owns content-script command dispatch');
    expect(releaseNotes).toContain('explicit click-to-speak speech using script-aware locales');
    expect(releaseNotes).toContain('Structure-preserving ASS/SSA subtitle import and export');
    expect(releaseNotes).toContain('MOBI/AZW3');
    expect(releaseNotes).toContain('Explicit multi-file document translation queue');
    expect(releaseNotes).toContain('selecting files never starts translation');
    expect(releaseNotes).toContain('Structure-preserving SRT/VTT batch translation');
    expect(releaseNotes).toContain('Explicit versioned document history in local Chrome storage');
    expect(releaseNotes).toContain('Explicit live-caption transcript Save');
    expect(releaseNotes).toContain('language prefixes such as `/en`, `/zh`, and `/zh-CN`');
    expect(releaseNotes).toContain('YouTube Adapter v1');
    expect(releaseNotes).toContain('Contextual YouTube subtitle-generation entry points');
    expect(releaseNotes).toContain('globally namespaced per-cue translation requests');
    expect(releaseNotes).toContain('Strict duplicate-key-safe JSON installation');
    expect(releaseNotes).toContain('Fixed extension-owned AI system requirements');
    expect(releaseNotes).toContain('real Run/Stop toggle');
    expect(releaseNotes).toContain('Sync-failure user-data fallback');
    expect(releaseNotes).toContain('Deterministic local comic reconstruction for safe regular bubbles');
    expect(releaseNotes).toContain('Source-resolution overlapping tiled OCR');
    expect(releaseNotes).toContain('original-resolution completed PNG download');
    expect(releaseNotes).toContain('Content-owned visible-image batch progress survives popup closure');
    expect(releaseNotes).toContain('frame-aware right-click command');
    expect(releaseNotes).toContain('one-shot freeform `Z` lasso');
    expect(releaseNotes).toContain('Scan comic chapter reads a fixed bounded DOM snapshot without OCR or provider work');
    expect(releaseNotes).toContain('120,000 source characters');
    expect(releaseNotes).toContain('Per-image Retranslate, Apply, Undo');
    expect(releaseNotes).toContain('Dedicated local Image Translator workspace');
    expect(releaseNotes).toContain('optional per-image local-only quality ratings');

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
    expect(screenshotGuide).toMatch(/MOBI\/AZW3/i);
    expect(screenshotGuide).toMatch(/multi-file document batch/i);
    expect(screenshotGuide).toContain('Start batch');
    expect(screenshotGuide).toMatch(/file selection sends no translation request and does not start work/i);
    expect(screenshotGuide).toContain('Export subtitles');
    expect(screenshotGuide).toContain('Export PDF');
    expect(screenshotGuide).toContain('original and translated rendered pages');
    expect(screenshotGuide).toContain('left/right column boundaries');
    expect(screenshotGuide).toContain('preserved standalone formula');
    expect(screenshotGuide).toContain('Video Subtitles');
    expect(screenshotGuide).toContain("YouTube, show the popup's Standard video, Live, or Shorts adapter context");
    expect(screenshotGuide).toContain('Export SRT');
    expect(screenshotGuide).toContain('Local Media Subtitle Generator');
    expect(screenshotGuide).toContain('show the source context carried from a standard video, Live page, or Short');
    expect(screenshotGuide).toContain('use a separate screenshot with no generated captions or provider progress');
    expect(screenshotGuide).toContain('do not imply any upload before Stop and generate');
    expect(screenshotGuide).toContain('Export VTT');
    expect(screenshotGuide).toContain('Live Captions');
    expect(screenshotGuide).toContain('TXT/SRT/VTT/JSON format menu');
    expect(screenshotGuide).toContain('Image Text');
    expect(screenshotGuide).toContain('Translate visible images');
    expect(screenshotGuide).toContain('temporary reconstructed canvas');
    expect(screenshotGuide).toContain('non-destructive region overlay fallback');
    expect(screenshotGuide).toContain('freeform lasso before release');
    expect(screenshotGuide).toContain('Scan comic chapter with a fixed image count');
    expect(screenshotGuide).toContain('Download PNG');
    expect(screenshotGuide).toContain('dedicated Image Translator');
    expect(screenshotGuide).toContain('loading a preview does not start translation');
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
    expect(roadmap).toContain('Baseline release: Immersive Translate `v1.32.1`');
    expect(roadmap).toContain('product implementation is closed source');
    expect(roadmap).toContain('Intentional parity exception');
    expect(roadmap).toContain('never translates a page automatically on load');
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
    expect(roadmap).toContain('Structure-preserving SRT/VTT subtitle export');
    expect(roadmap).toContain('bundled Mozilla PDF.js');
    expect(roadmap).toContain('order left-column text before right-column text');
    expect(roadmap).toContain('identify likely standalone formulas locally');
    expect(roadmap).toContain('flattened visual PDF');
    expect(roadmap).toContain('supplement sparse text layers on raster-backed pages');
    expect(roadmap).toContain('preserve loaded PDF block identity, page geometry');
    expect(roadmap).toContain('exclude standalone formula blocks from neighboring AI context');
    expect(roadmap).toContain('generated real PDF.js fixtures cover text extraction');
    expect(roadmap).toContain('browser `TextDetector`');
    expect(roadmap).toContain('bundled Tesseract worker');
    expect(roadmap).toContain('five selectable recognition languages');
    expect(roadmap).toContain('Video subtitle translation');
    expect(roadmap).toContain('selected local audio/video files');
    expect(roadmap).toContain('upload media in bounded ordered chunks');
    expect(roadmap).toContain(
      'Explicit current-tab audio capture in the open subtitle generator with source-tab authorization'
    );
    expect(roadmap).toContain('bounded memory, and Stop-and-generate submission');
    expect(roadmap).toContain(
      'Done: declare `tabCapture` so Chrome can authorize the source tab when the popup is invoked'
    );
    expect(roadmap).toContain('call it only after an explicit subtitle-generator click');
    expect(roadmap).toContain('stop/discard on cancel, page close, failure, or the 25 MB limit');
    expect(roadmap).not.toContain('Remaining: automatic current-tab media capture');
    expect(roadmap).toContain('DOM-rendered video caption adapters');
    expect(roadmap).toContain('SRT export for translated subtitle cues');
    expect(roadmap).toContain('Meeting subtitle translation');
    expect(roadmap).toContain('meeting caption adapters with speaker-label preservation');
    expect(roadmap).toContain('timestamped bilingual cues');
    expect(roadmap).toContain('TXT, SRT, VTT, or structured JSON');
    expect(roadmap).toContain('Image, manga, and OCR translation');
    expect(roadmap).toContain('separate OCR text-block overlays');
    expect(roadmap).toContain('Translate visible images');
    expect(roadmap).toContain('converge production content initialization on the MessageManager listener');
    expect(roadmap).toContain('isolate content, image, video-subtitle, and live-caption translation caches');
    expect(roadmap).toContain('infer deterministic whitespace panels and seeded white/black bubble regions');
    expect(roadmap).toContain('reconstruct regular flat or smooth bubbles locally');
    expect(roadmap).toContain('fall back to non-destructive DOM overlays');
    expect(roadmap).toContain('visible-image batch state content-owned and recoverable after popup closure');
    expect(roadmap).toContain('cache-bypassing Retranslate, non-destructive Apply/Undo');
    expect(roadmap).toContain('dedicated local image workspace');
    expect(roadmap).toContain('quality ratings locally without source text, pixels, or file names');
    expect(roadmap).toContain('preserve bounded browser OCR source polygons');
    expect(roadmap).toContain('infer right-to-left vertical CJK source columns');
    expect(roadmap).toContain('explicit two-step Scan then Translate workflow');
    expect(roadmap).toContain('120,000 source characters');
    expect(roadmap).toContain('Done: add tiled OCR and reconstruction for very long high-resolution comic strips');
    expect(roadmap).toContain('Multiple translation engines');
    expect(roadmap).toContain('29 implemented provider adapters');
    expect(roadmap).toContain('Papago, Baidu, Volcengine, Alibaba, Amazon, IBM Watson, Youdao, and SYSTRAN');
    expect(roadmap).toContain('Done: integrate Amazon Translate with region-derived official endpoints');
    expect(roadmap).toContain('Remaining: reassess Tencent Cloud TMT text translation');
    expect(roadmap).toContain('ChatGLM under the existing Zhipu GLM adapter');
    expect(roadmap).toContain('nine domain-specific AI translation experts');
    expect(roadmap).toContain('include AI preferences in cache identity');
    expect(roadmap).toContain('Document Formats, Batch Workflows, and History');
    expect(roadmap).toContain('Done: add ASS/SSA subtitle import/export');
    expect(roadmap).toContain('Done: add bounded MOBI and KF8-based AZW3 import');
    expect(roadmap).toMatch(
      /Done: add explicit multi-file batch translation[^\r\n]*stays idle after file selection/
    );
    expect(roadmap).not.toContain('Remaining: add MOBI import');
    expect(roadmap).toContain('explicit local translation history');
    expect(roadmap).toContain('Versioned YouTube standard/Live/Shorts video adapters');
    expect(roadmap).toContain('Done: add a side-effect-free versioned adapter registry and YouTube Adapter v1');
    expect(roadmap).toContain('Remaining: add verified adapters for the other officially documented video sites');
    expect(roadmap).toContain('installable Schema v1 AI expert definitions');
    expect(roadmap).toContain('request-scoped masking for supported emails');
    expect(roadmap).toContain('separate Chrome and Firefox Desktop manifests');
    expect(roadmap).toContain('capability-gate Chrome `tabCapture`');
    expect(roadmap).toContain('web-ext lint` with zero errors');
    expect(roadmap).toContain('Safari, userscript, Zotero, iOS, and Android');
    expect(roadmap).toContain('Do not auto-translate a page on load');
  });

  it('packages the local PDF runtime and document-page controls', () => {
    const packageJson = JSON.parse(readProjectFile('package.json'));
    const webpackConfig = readProjectFile('webpack.config.js');
    const documentHtml = readProjectFile('src/options/document.html');
    const imageHtml = readProjectFile('src/image/image.html');

    expect(packageJson.dependencies).toEqual(expect.objectContaining({
      '@lingo-reader/mobi-parser': '0.4.6',
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
    expect(webpackConfig).toContain('stream: false');
    expect(documentHtml).toContain('id="pdfViewer"');
    expect(documentHtml).toContain('id="exportPdfFile"');
    expect(documentHtml).toContain('id="ocrLanguage"');
    expect(documentHtml).toContain('.ass,.ssa');
    expect(documentHtml).toContain('.mobi,.azw3');
    expect(documentHtml).toContain('id="batchDocumentFiles"');
    expect(documentHtml).toContain('id="batchConcurrency"');
    expect(documentHtml).toContain('id="startDocumentBatch"');
    expect(documentHtml).toContain('id="cancelDocumentBatch"');
    expect(documentHtml).toContain('id="retryDocumentBatch"');
    expect(documentHtml).toContain('id="downloadDocumentBatch"');
    expect(documentHtml).toContain('id="clearDocumentBatch"');
    expect(documentHtml).toContain('id="batchDocumentQueue"');
    expect(documentHtml).toContain('id="saveDocumentHistory"');
    expect(documentHtml).toContain('id="historyRetention"');
    expect(documentHtml).toContain('id="documentHistoryList"');
    const optionsHtml = readProjectFile('src/options/options.html');
    expect(optionsHtml).toContain('id="documentOcrLanguage"');
    expect(optionsHtml).toContain('id="aiContextEnabled"');
    expect(optionsHtml).toContain('id="aiTranslationDomain"');
    expect(optionsHtml).toContain('id="translationGlossary"');
    expect(optionsHtml).toContain('id="aiCustomPrompt"');
    expect(optionsHtml).toContain('Save provider configuration');
    expect(optionsHtml).toContain('Remove configuration');
    expect(webpackConfig).toContain("image: './src/image/image.ts'");
    expect(webpackConfig).toContain("'image-processor-worker': './src/image/image-processor-worker.ts'");
    expect(webpackConfig).toContain("from: 'src/image/image.html'");
    expect(webpackConfig).toContain("from: 'src/image/image.css'");
    expect(imageHtml).toContain('id="imageFiles"');
    expect(imageHtml).toContain('id="translateAllImages"');
    expect(imageHtml).toContain('id="translateImage"');
    expect(imageHtml).toContain('id="downloadTranslation"');
    expect(imageHtml).toContain('id="qualityGood"');
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
    expect(webpackConfig).toContain("subtitles: './src/subtitles/subtitles.ts'");
    expect(webpackConfig).toContain("from: 'src/subtitles/subtitles.html'");
    expect(webpackConfig).toContain("'live-caption-history': './src/options/live-caption-history.ts'");
    expect(webpackConfig).toContain("from: 'src/options/live-caption-history.html'");
    const subtitlesHtml = readProjectFile('src/subtitles/subtitles.html');
    const subtitlesScript = readProjectFile('src/subtitles/subtitles.ts');
    const subtitlesStyles = readProjectFile('src/subtitles/subtitles.css');
    const contentScript = readProjectFile('src/content/content.ts');
    const messageManager = readProjectFile('src/services/MessageManager.ts');
    const transcriptionService = readProjectFile('src/services/MediaTranscriptionService.ts');
    const videoSiteRegistry = readProjectFile('src/services/VideoSiteAdapterRegistry.ts');
    const generatedSubtitleDocument = readProjectFile('src/services/GeneratedSubtitleDocument.ts');
    const translationRequestId = readProjectFile('src/services/TranslationRequestId.ts');
    expect(subtitlesHtml).toContain('id="mediaFile"');
    expect(subtitlesHtml).toMatch(
      /<button[^>]*id="toggleTabCapture"[^>]*>Capture current tab<\/button>/
    );
    expect(subtitlesHtml).toContain('id="generateSubtitles"');
    expect(subtitlesHtml).toContain('id="exportSrt"');
    expect(subtitlesHtml).toContain('id="exportVtt"');
    expect(subtitlesScript).toContain("action: 'getVideoPlaybackPosition'");
    expect(subtitlesScript).toContain("action: 'cancelTranslationRequest'");
    expect(subtitlesScript).toContain('updateGeneratedSubtitleCue');
    expect(subtitlesStyles).toContain('.cue-time-input');
    expect(subtitlesStyles).toContain('.cue-translation-field');
    expect(contentScript).toContain('__lexibridgeContentScriptV1');
    expect(contentScript).toContain("'getVideoPlaybackPosition'");
    expect(messageManager).toContain('private initialize(): void');
    expect(messageManager).toContain('registerHandler(action: string, handler: MessageHandler): void');
    expect(messageManager).toMatch(/registerHandler[\s\S]*?this\.initialize\(\);/);
    expect(transcriptionService).toContain("progressMode: 'indeterminate'");
    expect(transcriptionService).toContain('supportsTimedSegments: true');
    expect(videoSiteRegistry).toContain('VIDEO_SITE_ADAPTER_SCHEMA_VERSION = 1');
    expect(videoSiteRegistry).toContain("pageType: 'shorts'");
    expect(generatedSubtitleDocument).toContain('GENERATED_SUBTITLE_MIN_DURATION_SECONDS');
    expect(generatedSubtitleDocument).toContain('GENERATED_SUBTITLE_MAX_TIME_SECONDS');
    expect(generatedSubtitleDocument).toContain("format: 'srt' | 'vtt'");
    expect(translationRequestId).toContain('createTranslationRequestNamespace');
    expect(readProjectFile('src/popup/popup.html')).toContain('id="openSubtitleGenerator"');
    expect(readProjectFile('src/popup/popup.html')).toContain('id="videoSubtitleContextStatus"');
    expect(readProjectFile('src/popup/popup.html')).toContain('id="openSidePanelBtn"');
    expect(readProjectFile('src/popup/popup.html')).toContain('id="saveLiveCaptionTranscript"');
    expect(readProjectFile('src/popup/popup.html')).toContain('id="openLiveCaptionHistory"');
    const liveCaptionHistoryHtml = readProjectFile('src/options/live-caption-history.html');
    const liveCaptionHistoryScript = readProjectFile('src/options/live-caption-history.ts');
    const liveCaptionHistoryService = readProjectFile('src/services/LiveCaptionHistoryService.ts');
    expect(liveCaptionHistoryHtml).toContain('id="liveCaptionHistoryList"');
    expect(liveCaptionHistoryHtml).toContain('id="liveCaptionHistoryRetention"');
    expect(liveCaptionHistoryHtml).toContain('id="clearLiveCaptionHistory"');
    expect(liveCaptionHistoryHtml).toContain('id="exportLiveCaptionHistory"');
    expect(liveCaptionHistoryScript).toContain("action: 'getLiveCaptionHistory'");
    expect(liveCaptionHistoryScript).toContain("action: 'deleteLiveCaptionHistory'");
    expect(liveCaptionHistoryScript).not.toContain("action: 'translate'");
    expect(liveCaptionHistoryService).toContain("LIVE_CAPTION_HISTORY_STORAGE_KEY = 'liveCaptionHistory'");
    expect(liveCaptionHistoryService).toContain('chrome.storage.local');
    expect(liveCaptionHistoryService).toContain('LIVE_CAPTION_HISTORY_ENTRY_MAX_BYTES');
  });
});
