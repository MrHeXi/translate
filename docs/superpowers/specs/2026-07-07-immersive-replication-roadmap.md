# Immersive Translate Feature Replication Roadmap

Goal: replicate the Immersive Translate feature family while preserving the current LexiBridge functions: manual page translation, selected-text translation, vocabulary collection, exam dictionaries, review, import/export, and Chrome storage.

## Source Feature Families

The target feature families are:

- Web page bilingual translation.
- Selected-text translation.
- Hover paragraph translation.
- Input box translation.
- PDF and document translation with layout awareness.
- Video subtitle translation for common streaming/video pages.
- Meeting subtitle translation.
- Image, manga, and OCR translation.
- Multiple translation engines and broad language-pair coverage.
- Reading-first controls that do not interrupt the page flow.

## Current Coverage

Already implemented:

- Manual page translation from popup and floating button.
- Immediate Start/Stop state that restores the page.
- Selected-text translation tooltip.
- Vocabulary notebook and review flow.
- Built-in CET4, CET6, GRE, IELTS, and TOEFL dictionaries.
- Floating button discoverability and release packaging.

Current batch:

- Hover paragraph translation using a modifier-key interaction.
- Input box translation using a deliberate shortcut.
- Six working provider integrations: Google Translate, MyMemory, DeepL, Microsoft Translator, OpenAI-compatible endpoints, and Google Gemini.
- Local-only API credential storage with masked UI summaries and exact-origin permission requests for custom endpoints.
- 20+ provider definitions and 100+ target language choices for engine/language expansion.
- Configurable page display modes: bilingual, translation only, and original only.
- Configurable page translation exclude selectors for areas that should remain original.
- Subtle, highlighted, and plain-text page translation appearance presets.
- Exact-domain and wildcard site rules with per-site allow/block, display, scope, style, and selector overrides.
- Intelligent main-content detection with whole-page and per-site scope overrides.
- Document translator page for pasted/uploaded text, HTML files, subtitle files, and locally rendered PDFs.
- JSON document string-value extraction in the document translator.
- Structure-preserving translated JSON export from the document translator.
- DOCX paragraph text and EPUB spine text extraction in the document translator.
- DOCX translated paragraph export by rewriting text into the original document archive.
- EPUB translated block export by rewriting readable spine documents into the original book archive.
- Timing-preserving subtitle file export from the document translator.
- Manual document entry prompt on detected document URLs.
- Manual video subtitle translation for pages that expose caption or subtitle text tracks.
- DOM-rendered video caption adapters for common caption containers.
- SRT export for translated subtitle cues collected during the current video session.
- Manual live caption translation for caption text already visible in the page DOM.
- Google Meet, Zoom, and Teams-style meeting caption adapters with speaker-label preservation.
- Manual image text translation for selected images, canvases, and SVGs.
- Bundled offline OCR for image-only PDFs and page images in English, Simplified Chinese, Traditional Chinese, Japanese, and Korean.

## Planned Batches

### Batch A: Web Interaction Parity

- Add modifier-key hover paragraph translation.
- Add input box translation shortcut.
- Keep page translation user-triggered.
- Verify no automatic translation happens on page load.

### Batch B: Bilingual Page Layout

- Done: improve page translation from inserted blocks to configurable bilingual layout.
- Done: add display mode controls: original only, translation only, bilingual.
- Done: add CSS selector exclusions for page areas that should not be translated.
- Done: preserve restore behavior.

### Batch B2: Site Rules and Translation Appearance

- Done: add three translation appearance presets and apply changes to existing translated blocks.
- Done: normalize exact domains, URL inputs, internationalized domains, and `*.example.com` wildcard rules.
- Done: prefer exact rules over wildcard rules and the most specific wildcard over broader matches.
- Done: allow per-site page translation blocking plus display mode, appearance, and selector overrides.
- Done: detect semantic reading regions first, score structural fallbacks by text and link density, and fall back to the full body when confidence is low.
- Done: add global Main content/Whole page scope and per-site scope overrides.
- Done: broadcast saved settings to open tabs while keeping provider credentials out of the message.
- Done: retain the manual-trigger rule; site rules never start translation on page load.

### Batch C: Translation Engine Expansion

- Done: add a provider registry with six working engines and 20+ additional provider definitions.
- Done: keep Google and MyMemory available without credentials and preserve fallback between those two public services.
- Done: integrate DeepL, Microsoft Translator, OpenAI-compatible Chat Completions endpoints, and Google Gemini with provider-specific request formats.
- Done: keep API keys in local storage, return only masked summaries to settings, and exclude keys from Chrome sync and learning-data export.
- Done: request optional host permission for the exact user-configured HTTPS or localhost endpoint.
- Done: prevent credentialed translation requests from silently falling back to another provider.
- Remaining: implement the planned provider definitions and provider-specific language filtering or capability guidance.

### Batch D: PDF and Document Translation

- Done: detect document URLs and expose a manual document translator entry.
- Done: support pasted text, text files, Markdown, HTML body text extraction, subtitle files, and a compatibility path for simple PDF text streams.
- Done: support JSON files by extracting readable string values.
- Done: export translated JSON files while preserving object and array structure.
- Done: support DOCX files by extracting WordprocessingML paragraph text.
- Done: support EPUB files by extracting readable spine document text.
- Done: export translated DOCX files by rewriting translated paragraph text into the original document archive.
- Done: export translated EPUB files by rewriting translated readable blocks into the original book archive.
- Done: export translated SRT and VTT subtitle files while preserving cue timing.
- Done: render translated document blocks with bilingual, translation-only, or original-only display.
- Done: preserve page and coordinate metadata for simple text-based PDF layout blocks.
- Done: parse standards-compliant PDFs with bundled Mozilla PDF.js, including compressed content streams, page dimensions, font maps, and positioned text lines.
- Done: render original and translated PDF pages locally with bilingual, translation-only, and original-only page views.
- Done: attempt local OCR for image-only PDF pages when browser `TextDetector` is available and retain OCR bounding boxes.
- Done: fall back to a bundled Tesseract worker when browser `TextDetector` is unavailable or returns no text.
- Done: expose a persisted OCR language choice and per-page bundled OCR progress.
- Done: export translated PDF pages locally as a flattened visual PDF.
- Remaining: editable PDF text reflow, formula handling, form/annotation preservation, scan preprocessing, mixed-language detection, and advanced multi-column/table layout fitting.

### Batch E: Video Subtitle Translation

- Done: detect browser subtitle/caption text tracks on video pages.
- Done: detect common DOM-rendered video caption containers after manual enablement.
- Done: translate active subtitle cues after the user starts Video subtitles from the popup.
- Done: render bilingual subtitle overlays without blocking playback.
- Done: export translated subtitle cues from the current session as SRT.
- Remaining: deeper site-specific optimizations, AI subtitle generation for videos without captions, and richer caption timing controls.

### Batch F: Image, Manga, and OCR Translation

- Done: add user-triggered image, canvas, and SVG selection from the popup.
- Done: extract text through browser TextDetector OCR when available, with SVG text and accessibility text fallbacks.
- Done: fall back to a reusable bundled Tesseract OCR session with five selectable recognition languages.
- Done: render translated overlays near the selected image target.
- Done: support manual drag-to-select OCR regions for images and canvases.
- Done: render separate OCR text-block overlays when the browser returns bounding boxes.
- Done: add an explicit Translate visible images command for eligible images, canvases, and SVGs intersecting the current viewport.
- Done: retain per-image overlays, reuse duplicate-text translations, and cancel remaining visible-image work when image mode stops.
- Done: skip hidden, offscreen, tiny, nested SVG, and extension-owned graphics during visible-image batches.
- Done: keep all OCR-triggering actions explicit.
- Done: terminate the local image OCR session immediately when Image text mode stops.
- Remaining: automatic manga panel and speech-bubble segmentation, source-text removal, image inpainting, and in-place typography reconstruction.

### Batch G: Meeting Subtitle Translation

- Done: detect live captions when available in the page DOM.
- Done: preserve common meeting speaker labels while translating Google Meet, Zoom, and Teams-style caption containers.
- Done: translate visible caption text in near real time after the user starts Live captions from the popup.
- Done: add a Webex-style caption adapter.
- Done: coalesce word-by-word caption growth into timestamped bilingual cues instead of duplicate fragments.
- Done: retain the current tab's transcript after Stop and export it locally as TXT, SRT, VTT, or structured JSON.
- Done: clear the in-memory transcript explicitly without stopping live caption translation.
- Done: avoid recording, joining calls, storing audio, or transcribing speech.
- Remaining: broader site-specific caption adapters and persistent cross-session transcript organization.

## Non-Negotiable Product Rules

- Do not auto-translate a page on load.
- Do not weaken existing learning functions.
- Do not claim a feature in store copy before it is implemented and verified.
- Each batch must have tests or documented acceptance checks.
- Each batch must be verified, packaged when runtime code changes, committed, and pushed before moving to the next batch.
