# LexiBridge Translate

LexiBridge Translate is a Chrome and Firefox Desktop extension for reading real web pages in another language while turning unknown words into review material.

It keeps the existing translation workflow, built-in exam vocabularies, vocabulary notebook, review page, progress tracking, import/export, and settings. Page translation is user-controlled: use the popup or the manual floating button to start or stop translation.

## Product Positioning

LexiBridge is built around one idea: translate while you read, then review what you did not know.

It is best for:

- Reading English web pages, technical articles, documentation, and study material.
- Translating pasted or uploaded text documents, HTML files, JSON files, DOCX files, EPUB files, bounded MOBI/AZW3 eBooks, subtitle files, and PDFs with local page rendering.
- Queuing multiple local documents for an explicit batch run with bounded concurrency, cancellation, failed-file retry, and deterministic ZIP download.
- Translating video captions when the page exposes subtitle/caption tracks or common DOM-rendered captions.
- Generating timed subtitles from a user-selected local audio or video file through a configured OpenAI or Groq transcription service.
- Capturing audio from the source tab in Chrome only after an explicit click, then generating subtitles after the user stops capture. Firefox keeps local-media subtitle generation but disables unsupported current-tab capture.
- Translating live caption text already visible in a page, with explicit local export and bounded cross-session history.
- Translating text from selected or currently visible images, SVGs, and canvases with browser OCR or the bundled offline OCR fallback.
- Collecting useful words from real context.
- Reviewing CET4, CET6, GRE, IELTS, TOEFL vocabulary.
- Keeping a local-first vocabulary notebook with browser extension storage sync support.

It is not marketed as guaranteed OCR for every scanned PDF, an editable layout-perfect Office/eBook converter, an automatic whole-page image reader, background or automatic browser-tab audio capture, or a meeting bot that records or joins calls.

## Core Features

### Web Page Translation

- Translate page text from the extension popup or the floating page button.
- Keep translation mode off until the user explicitly enables it.
- Turn translation mode off immediately to remove added page translations.
- Show page translation progress without blocking the whole page.
- Choose page display mode: bilingual, translation only, or original only.
- Choose a translation appearance: subtle panel, highlighted block, or plain text.
- Choose intelligent main-content translation or whole-page translation after manually starting the page.
- Skip configured page areas such as navigation, comments, ads, or `[data-no-translate]` regions during manual page translation.
- Create exact-domain or wildcard site rules that can block page translation or override display mode, translation scope, style, and excluded selectors.
- Choose from 100+ target language options in settings.
- Choose from 29 implemented provider adapters: Google Translate, MyMemory, DeepL, Microsoft Translator, OpenAI-compatible, Gemini, DeepSeek, OpenRouter, Groq, Qwen, Zhipu GLM/ChatGLM, SiliconFlow, Ollama, Claude, Azure OpenAI, LibreTranslate, Yandex Cloud Translate, NiuTrans, Caiyun Translate, ModernMT, Lingvanex, Naver Papago, Baidu Translate, Volcengine Translate, Alibaba Machine Translation, Amazon Translate, IBM Watson Language Translator, Youdao Translate, and SYSTRAN Translate.
- With AI-capable providers, choose a domain expert, enforce a local terminology glossary, add custom translation instructions, and optionally use neighboring page or document text as reference context.
- Keep neighboring-context sharing off by default. Context is collected only after a manual page or document translation starts and is bounded before it is sent to the selected AI provider.
- Install versioned AI expert definitions from strict duplicate-key-safe JSON, review their source attribution and full instruction text, enable or disable them, and safely remove custom definitions without replacing trusted built-ins.
- Import and export validated YAML prompt templates, set bounded declared variables as a JSON object, preview the separated system and user messages locally, and return to the built-in template without a provider request.
- Optionally mask supported emails, phone numbers, Luhn-valid payment card numbers, IPv4 addresses, IBANs, and sensitive URL query values before provider requests. Restoration happens locally; ambiguous placeholder output is discarded with an error.
- Keep provider API keys, client/application IDs, and temporary session tokens in local Chrome storage only; credentials are excluded from Chrome sync and learning-data exports.

### Selection Translation

- Select text on a page to show a translation tooltip.
- Click the tooltip's speech action when you want the selected text read aloud; selecting text or finishing a translation never starts speech automatically.
- Infer speech locale from the selected script for English, Simplified Chinese, Japanese, Korean, and Russian text, and cancel an existing utterance before a new explicit click.
- Add useful words to the vocabulary notebook.
- Use the selected text as learning material instead of a one-time lookup.

### Hover and Input Translation

- Hold Control while hovering over a readable paragraph to translate it in place.
- Type three trailing spaces in a supported input box, textarea, or editable field to translate the typed text; the shortcut also works with mobile input/touch events.
- Prefix the text with a known language such as `/en`, `/中文`, or `/zh-CN` to override the output language for that input only.
- Keep both interactions deliberate so pages and forms are never translated automatically.

### Side Panel Text Translation

- Open the Chrome side panel from the popup header or with `Alt+S`.
- Translate with any configured provider, or use a configured AI-capable provider to polish, rewrite, compose, reply, or summarize.
- For AI writing actions, choose the output language or keep the input language, then select tone, length, and an optional additional requirement.
- Use `Ctrl+Enter` to submit, copy the result, move a result back into the input for another pass, or clear the current text without storing a side-panel history.
- Keep all side-panel actions idle when the panel opens or the user changes modes; no text is sent until the user submits it.

### Document Translation

- Open the document translator from the popup or from detected document URLs.
- Paste text or upload `.txt`, `.md`, `.html`, `.htm`, `.json`, `.docx`, `.epub`, `.mobi`, `.azw3`, `.srt`, `.vtt`, `.ass`, `.ssa`, or `.pdf` files.
- Keep every selected document idle until you explicitly click Translate document or Start batch; opening the page, choosing files, changing the queue, and retrying failed files never start translation by themselves.
- Translate document blocks manually with bilingual, translation-only, or original-only display.
- Edit translated blocks directly before exporting or saving the result.
- Extract readable HTML body blocks while skipping scripts, styles, and markup.
- Extract readable string values from JSON files.
- Export translated JSON files with the original object and array structure preserved.
- Extract readable text from DOCX paragraphs and EPUB spine documents.
- Import MOBI and KF8-based AZW3 files up to 64 MiB, with at most 4,096 chapters, 8 MiB per chapter, and 64 MiB of extracted HTML; preserve deterministic spine order and duplicate paragraphs. Translated MOBI/AZW3 content is exported as text rather than rewritten as an eBook.
- Export translated DOCX files by writing translated paragraph text back into the original document archive.
- Export translated EPUB files by writing translated readable blocks back into the original book archive.
- Export translated `.srt` and `.vtt` subtitle files by replacing cue text only, preserving original timing, cue identifiers/settings, WEBVTT metadata and NOTE/STYLE/REGION sections, line endings, and other non-cue content.
- Import and export `.ass` and `.ssa` subtitles while preserving script sections, timing, styles, comments, commas inside dialogue text, and inline override tags; vector-drawing dialogue remains untouched.
- Queue up to 100 supported documents, limited to 64 MiB per file and 128 MiB total, choose concurrency 1, 2, or 3, and click Start batch explicitly. Cancel an active batch, queue failed files for an explicit retry, and download a deterministic ZIP only after every file succeeds.
- Save document results explicitly to versioned local history, reopen them without starting translation, export an entry as JSON, delete entries, clear all history, and keep the latest 10, 25, or 50 entries.
- Keep document history in `chrome.storage.local` only with bounded entry and total sizes. Binary PDF, DOCX, EPUB, MOBI, and AZW3 source bytes are never stored, so source-format export is unavailable after reopening those files from history.
- Parse and render PDF pages locally with Mozilla PDF.js, including compressed text streams, font mappings, page sizes, and positioned text lines.
- Detect confidently separated two-column PDF text, keep left-column-then-right-column reading order, and constrain translated overlays to the detected column region.
- Identify likely standalone mathematical expressions, preserve them in their original form, and exclude them from translation-provider requests and translated overlays.
- Show original and translated PDF pages side by side, or switch to translation-only or original-only display.
- Supplement sparse text layers on raster-backed PDF pages with browser `TextDetector` first and bundled Tesseract fallback, merge/deduplicate OCR and text-layer blocks, and retain detected bounding boxes for positioned translations.
- Preserve PDF block identity and geometry through safe source edits; inserted text without safe source geometry remains visible for translation but disables flattened PDF export.
- Choose bundled OCR recognition for English, Simplified Chinese, Traditional Chinese, Japanese, or Korean and see per-page recognition progress.
- Export translated PDF pages locally as a flattened visual PDF so browser fonts and the rendered source page remain visible.
- OCR quality still depends on scan resolution, contrast, orientation, language choice, and page complexity. Formula and column detection are conservative heuristics; editable text reflow, complex table fitting, form/annotation editing, and layout-perfect Office/eBook conversion remain later work.

### Video Subtitle Translation

- Start or stop video subtitle translation manually from the popup.
- Use the versioned YouTube adapter on standard videos, Live pages, and Shorts; it prioritizes the active player and stops when YouTube SPA navigation changes to another video, requiring another explicit Start.
- Use dedicated, contract-tested adapters for Netflix, Vimeo, Bilibili, Udemy, Coursera, and Khan Academy, with exact-domain matching, stable content navigation keys, site-first player/caption selectors, and generic fallbacks.
- Settle incremental YouTube Live DOM captions before translation, abort an in-flight partial request when the cue grows, and coalesce translated growth into one final exported cue.
- Translate active caption or subtitle cues when the current video exposes browser text tracks or common DOM-rendered captions.
- Render a bilingual subtitle overlay without recording audio or blocking playback.
- Export translated subtitle cues from the current session as an `.srt` file.
- Keep video subtitle sessions isolated with abortable translation requests, bounded cue retention, DOM caption deduplication, and native text-track restoration on Stop.
- Open the subtitle generator from the popup to select a local `.mp3`, `.mp4`, `.mpeg`, `.mpga`, `.m4a`, `.wav`, or `.webm` file up to 25 MB.
- On YouTube standard, Live, or Shorts pages, use the contextual Generate button to open the generator without starting capture, then explicitly click Capture current tab and Stop and generate.
- From another regular media page, explicitly click Capture current tab, keep the generator open, and click Stop and generate when enough audio has played.
- Generate timestamped captions through a configured OpenAI or Groq transcription service, optionally translate them with any configured translation provider, and export bilingual SRT or VTT.
- Edit each generated cue's start time, end time, original text, and translated text before export. Current-tab captures begin at the source video's playback position when the page exposes it.
- Click Apply to source video to load the edited bilingual cues into the originating page and synchronize them with its active video. Apply never starts playback, and Clear source video subtitles removes the overlay and listeners immediately.
- Keep selected local media idle until Generate subtitles is clicked; current-tab audio remains local until Stop and generate. Stream submitted media to the background in bounded chunks and clear buffers after completion, cancellation, provider errors, or disconnection.
- Use the declared `tabCapture` permission only after the explicit capture button; cancel also aborts active per-cue translation, while page close, stream failure, or the 25 MB limit stops and discards the temporary recording. This workflow requires Chrome 116 or newer.
- Video translation still requires captions exposed by the current site. Real-account smoke testing for the dedicated adapters, adapters for additional documented sites, more speech providers, files above provider limits, and live partial transcription remain later work.

### Live Caption Translation

- Start or stop live caption translation manually from the popup.
- Translate caption text that is already present in the page DOM, such as browser or meeting-page live captions.
- Preserve common meeting speaker labels while translating Google Meet, Zoom, Microsoft Teams, and Webex-style caption containers.
- Capture timestamped bilingual cues only while Live captions is enabled, coalescing incremental word-by-word caption updates.
- Export the current tab's in-memory transcript as TXT, SRT, VTT, or structured JSON, save it explicitly to bounded local history, or clear it from the popup.
- Browse saved sessions newest-first, preview bilingual cues, export TXT/SRT/VTT/JSON, delete individual sessions, clear all, and retain 10, 25, or 50 sessions without provider requests.
- Keep transcript capture local without recording audio, joining calls, or transcribing speech; page load, Stop, popup close, and page close never save automatically.
- Broader site-specific meeting adapters remain planned for later batches.

### Image Text Translation

- Start or stop image text translation manually from the popup.
- Click an image, canvas, or SVG to translate extracted text.
- Draw a freeform lasso over an image or canvas to translate only the selected region; OCR starts only when the pointer is released, and an incomplete gesture is canceled on blur or page hide.
- Click Translate visible images to process eligible images, canvases, and SVGs currently intersecting the viewport.
- Skip hidden, offscreen, tiny, and extension-owned graphics during a visible-image batch, and stop the batch as soon as image mode is turned off.
- Use browser `TextDetector` OCR when available, then fall back to bundled offline Tesseract OCR for English, Simplified Chinese, Traditional Chinese, Japanese, or Korean.
- Process large page images in overlapping source-resolution OCR tiles capped at 3 megapixels each, deduplicate boundary text, retain at most 200 distinct OCR blocks, and send no more than four image-text provider requests concurrently.
- For regular comic bubbles with reliable OCR geometry and locally readable pixels, detect panel gutters and bubble regions, mask the source glyphs, apply bounded flat/smooth-background repair, and fit translated text back into a temporary canvas overlay.
- Preserve browser OCR source polygons so rotated text masks stay inside the detected geometry, infer vertical CJK source columns, and use vertical presentation forms only when the translated text is predominantly CJK. Latin and RTL translations remain horizontal.
- Scan supported current-page comic readers only after clicking Scan comic chapter, then require a separate Translate N images confirmation before OCR or provider work begins. A changed image list, source, order, geometry, or route invalidates the snapshot and requires another scan.
- Bound chapter discovery and translation to 2,048 traversed DOM nodes, 48 images, 1,200 text blocks, 120,000 source characters, and 16 million retained reconstruction pixels. Stop aborts chapter work and removes its results immediately; partial results say when a safety limit was reached.
- Keep the source image untouched. Full-canvas reconstruction is limited to 1.5 megapixels and 64 positioned blocks; larger safe static images use bounded source-positioned bubble patches. Canvas elements, cross-origin-tainted pixels, whole-image OCR fallback boxes, CSS-transformed or non-fill images, cross-tile bubbles, safety-limit failures, complex artwork, and translations that cannot fit safely use the separate DOM text-block overlay instead.
- Scope content, image, video-subtitle, and live-caption translation caches to the current provider, target language, settings revision, source text, and context.
- Keep every OCR action explicit; opening or scrolling a page never starts image translation.
- Open the dedicated image workspace to choose, drop, or paste up to 12 JPG/JPEG, PNG, or WEBP files. Loading and changing settings never starts OCR; Translate image or Translate all is required.
- Stop a local-image run immediately, retranslate one image, switch between the untouched original and translated canvas with Apply/Undo, download a completed PNG, and record optional quality feedback in local Chrome storage without source text or file names.
- Local uploads are bounded to 20 MB each, 100 MB and 32 million decoded pixels per queue, and 16 million pixels per image. Large files keep their original dimensions and are processed sequentially in overlapping OCR/analysis tiles capped at 1.5 megapixels; completed PNG output retains the original dimensions, while source files remain untouched and are never uploaded as image pixels.
- Freeform selections use non-destructive overlays rather than modifying pixels outside the lasso. Source-resolution tiled OCR, overlap deduplication, bounded local patch reconstruction, strict cancellation, and explicit tile/character/memory failures are implemented; broader reader-specific optimization remains planned.

### Vocabulary Learning

- Built-in dictionaries: CET4, CET6, GRE, IELTS, TOEFL.
- Highlight enabled dictionary words on pages.
- Track vocabulary progress and mastery.
- Review due words and new built-in words from the review page.

### Data Management

- Store settings, vocabulary, review progress, and learning stats in browser extension storage.
- Use the browser's extension sync storage where available.
- Export and import learning data.
- Store user-supplied translation provider API keys, client/application IDs, and temporary session tokens only in `chrome.storage.local`, with masked summaries in the settings UI.
- Store installed AI expert and prompt-template definitions only in `chrome.storage.local`; selected IDs, declared variable values, and the masking preference remain ordinary settings.
- Keep default telemetry off.

## Install for Local Testing

Build both browser targets:

```bash
npm run build:all
```

### Chrome

1. Open Chrome and go to `chrome://extensions/`.
2. Enable Developer mode.
3. Choose `Load unpacked`.
4. Select the `dist` folder from this repository.

The generated Chrome test package is `chrome-translation-extension.zip`.

### Firefox Desktop

Firefox 140 or newer is required because the Firefox manifest uses Mozilla's built-in data-collection consent declaration.

1. Open Firefox and go to `about:debugging`.
2. Choose `This Firefox`.
3. Choose `Load Temporary Add-on`.
4. Select `dist-firefox/manifest.json`.

The generated Firefox test package is `firefox-translation-extension.zip`. An unsigned ZIP can be loaded temporarily for testing; normal persistent Firefox installation requires an AMO-signed XPI.

Firefox uses its native sidebar and never opens it automatically at install. Current-tab audio capture is unavailable because Firefox does not provide Chrome's `tabCapture` API; choose a local audio/video file in the subtitle generator instead.

## Usage

### Start Page Translation

1. Open a web page.
2. Click the extension popup or the manual floating button.
3. Click again to stop translation and restore the page.
4. In settings, choose whether translated pages show bilingual text, translation only, or original only.
5. Optional: add CSS selectors in settings for page areas that should not be translated.

### Translate a Selection

1. Select text on any page.
2. Read the translation tooltip.
3. Click Speak only when you want browser speech; it is never started by selection or translation completion.
4. Add useful words to the vocabulary notebook when needed.

### Translate While Hovering

1. Hover over a paragraph on a regular web page.
2. Hold Control to insert an on-demand translation below that paragraph.

### Translate in an Input Box

1. Type text into a supported input, textarea, or editable field.
2. Optionally start with `/en`, `/中文`, or another supported language code.
3. Press Space three times at the end of the text; mobile input/touch interaction uses the same deliberate shortcut.
4. LexiBridge replaces the typed text with the translation and does not trigger from existing text at page load.

### Translate Text in the Side Panel

1. Click the side-panel button in the popup header or press `Alt+S`.
2. Choose Translate, Polish, Rewrite, Write, Reply, or Summarize.
3. Choose a configured provider and output language. Writing actions require an AI-capable provider.
4. For a writing action, optionally select tone, length, and an additional requirement.
5. Enter text and click the action button or press `Ctrl+Enter`.
6. Copy the result, use it as the next input, or clear the panel.

### Configure a Translation Provider

1. Open the options page and choose one of the 29 implemented providers.
2. Enter the provider API key and any provider-specific client/application ID, temporary session token, endpoint, model, or region setting. Papago, Baidu, and Youdao require both an ID and secret; Volcengine, Alibaba, and Amazon use the ID field for the Access Key ID, the API key field for the Access Key Secret, and optionally accept a short-lived STS session token. Amazon also requires an AWS region and derives the official regional Translate endpoint from it. IBM Watson requires its API key and service endpoint; SYSTRAN requires an API key. Ollama requires an endpoint and model but no API key; LibreTranslate accepts an optional key for instances that require one.
3. Save provider configuration before saving any configurable provider as the active translation engine. This is also when Chrome asks for access to that provider host.
4. For LibreTranslate and SYSTRAN, use **Refresh languages** after saving. The extension contacts that configured instance only after this click, caches its source-target language pairs locally, and filters translation targets across settings, documents, images, subtitles, and the side panel. Loading a page or extension view never performs language discovery.
5. Provider endpoints must use HTTPS, except for HTTP endpoints on `localhost` or `127.0.0.1`. Chrome host match patterns grant the configured scheme and host for all paths; they do not restrict access to one URL path or port.

Google Translate and MyMemory remain available without provider configuration. Credentialed providers do not silently fall back to another service when authentication or configuration fails. Provider request formats and failure behavior are covered by automated contract tests; live use still depends on a valid provider account, API plan, endpoint, model, and regional availability.

For cloud providers that use account-level access keys, create dedicated least-privilege credentials and prefer short-lived STS credentials when available. Local extension storage prevents Chrome Sync and export leakage, but it is not a server-side secret manager.

For AI-capable providers, the AI translation controls in settings can select a subject domain, define terminology as `source term => required translation`, and add custom instructions. The AI tools section manages installable JSON experts and YAML prompt templates; import, export, enable/disable, removal, and prompt preview are local actions and never start translation. Imported expert/template content is sent only as untrusted user-level translation preferences and cannot replace the extension-owned system requirements. Neighboring context is opt-in and applies to manually translated page batches and document blocks only. Configured AI-capable providers also power the side-panel writing actions; ordinary machine-translation providers remain translation-only.

Sensitive-data masking is an opt-in provider privacy setting. When enabled, supported values are replaced with request-scoped ASCII placeholders before text, context, glossary, expert, template, or AI-writing instruction content reaches a provider. The extension restores required placeholders only when every expected token is present exactly once. A missing, duplicated, unknown, or transformed token causes the provider result to be discarded. Pattern matching can have false negatives, so masking is not a substitute for reviewing content before translation.

### Configure Site Rules

1. Open the options page and choose the global page translation display mode and translation style.
2. Add an exact domain such as `docs.example.com` or a wildcard such as `*.example.com`.
3. Choose whether page translation is allowed, then optionally override the display mode, translation scope, style, and excluded selectors for that domain.
4. Edit or delete saved rules from the same settings section.

Site rules are applied to manual page translation only. They never start translation when a page opens.

In Main content scope, LexiBridge prefers semantic `article`, `main`, and `[role="main"]` regions, then falls back to text-density and link-density scoring. If no reliable reading region is found, it safely uses the whole page.

### Translate Video Subtitles

1. Open a page with a video that has captions or subtitles.
2. Open the extension popup.
3. Click Start in Video subtitles.
4. Click the same control again to remove the overlay and stop subtitle translation.
5. Click Export SRT to download subtitle cues that were translated during the current session.

### Generate Subtitles From Local Media

1. Open the extension popup and click Generate from media.
2. Choose a supported local audio or video file up to 25 MB.
3. Choose a configured OpenAI or Groq speech service, spoken language, and optional vocabulary context.
4. Choose whether to translate the generated captions, then click Generate subtitles.
5. Export the generated captions as bilingual SRT or VTT.

### Generate Subtitles From Current Tab Audio

1. Open the extension popup while the source video or audio page is active and click Generate from media.
2. Choose a configured OpenAI or Groq speech service and optional translation controls.
3. Click Capture current tab; the installed `tabCapture` permission is not used before this click.
4. Keep the subtitle generator open while the source plays, then click Stop and generate.
5. Export the generated captions as bilingual SRT or VTT.

### Translate Subtitle Files

1. Open the document translator.
2. Choose a `.srt`, `.vtt`, `.ass`, or `.ssa` subtitle file.
3. Confirm that choosing the file only loads it and sends no translation request, then click Translate document.
4. Edit any translated cue if needed.
5. Click Export subtitles. SRT/VTT exports preserve the original cue timing, identifiers/settings, metadata sections, non-cue content, and line endings; ASS/SSA exports preserve supported script metadata.

### Use Local Document History

1. Translate at least one document block and edit the translated text if needed.
2. Click Save history; opening or translating a document never saves history automatically.
3. Use Open to restore source text and translated blocks without sending a translation request.
4. Use Export to download a JSON record, or Delete/Clear all to remove local entries.
5. Choose whether to keep the latest 10, 25, or 50 entries.

### Translate JSON Files

1. Open the document translator.
2. Choose a `.json` file.
3. Click Translate document.
4. Click Export JSON to download a translated JSON file with the original structure preserved.

### Translate DOCX Files

1. Open the document translator.
2. Choose a `.docx` file.
3. Click Translate document.
4. Click Export DOCX to download a translated DOCX file with paragraph text rewritten.

### Translate EPUB Files

1. Open the document translator.
2. Choose an `.epub` file.
3. Click Translate document.
4. Click Export EPUB to download a translated EPUB file with readable blocks rewritten.

### Translate MOBI or AZW3 Files

1. Open the document translator and choose a `.mobi` or `.azw3` file up to 64 MiB; parsing is also limited to 4,096 chapters, 8 MiB per chapter, and 64 MiB of extracted HTML.
2. Review the extracted chapters in deterministic spine order; choosing the file does not start translation.
3. Click Translate document explicitly.
4. Click Export text to download the translated reading content; LexiBridge does not claim to rewrite the original MOBI/AZW3 container.

### Translate Multiple Documents

1. Open the document translator and choose up to 100 supported files for the batch queue, with a 64 MiB per-file and 128 MiB total limit.
2. Confirm every file remains idle and no provider request occurs after selection.
3. Choose concurrency 1, 2, or 3, then click Start batch explicitly.
4. Use Cancel to stop active work, or queue failed files and click Start batch again to retry them.
5. After every file succeeds, click Download ZIP to create the deterministic result archive; incomplete or failed queues cannot be downloaded as a successful batch.

### Translate PDF Files

1. Open the document translator and choose a `.pdf` file.
2. Choose the OCR language that matches image-only pages in the file.
3. Review the locally rendered pages and any reported OCR limitations before clicking Translate document.
4. Choose bilingual, translation-only, or original-only display for the page preview.
5. Click Export PDF to download flattened translated page images as a new PDF.

### Translate Live Captions

1. Open a page that is already showing live captions.
2. Open the extension popup.
3. Click Start in Live captions.
4. Reopen the popup to export, explicitly save, or clear the current tab's bilingual transcript. History opens the local transcript library.
5. Click Stop to remove the overlay and stop capturing new cues; already captured cues remain available until cleared or the page closes, and are persisted only after Save.

### Translate Image Text

1. Choose the image and PDF OCR language in settings when the image is not English.
2. Open the extension popup and click Start in Image text.
3. Click an image, canvas, or SVG, complete a freeform region drag, or click Translate visible images to process eligible graphics in the current viewport.
4. For a supported comic reader, click Scan comic chapter, review the fixed image count, then click Translate N images. Scanning alone does not OCR or contact a provider.
5. Click Stop to cancel active recognition, a visible-image batch, or chapter translation, terminate its local OCR session, remove overlays, and exit image text translation mode.

For local files, click Open image translator in the popup, choose, drop, or paste JPG/JPEG, PNG, or WEBP files, then click Translate image or Translate all. Use the same button as Stop while work is active; Apply/Undo switches the preview without changing the source file.

### Study Vocabulary

1. Open the options page and enable the dictionaries you care about.
2. Browse English content and collect words from context.
3. Open the vocabulary page to manage saved words.
4. Open the review page to practice due or new words.

## Development

### Requirements

- Node.js 16+
- npm 8+
- Chrome 116+
- Firefox Desktop 140+

### Commands

```bash
npm install
npm run type-check
npm run lint
npm test
npm run build:all
npm run verify:package
npm run package
```

### Project Structure

```text
src/background/   extension service worker
src/content/      page translation, floating button, selection UI
src/options/      settings, document translator, vocabulary, review pages
src/popup/        browser action popup
src/services/     translation, dictionary, learning, review, storage services
src/data/         built-in vocabulary dictionaries
scripts/          data generation scripts
icons/            extension icons
```

## Release Notes

See `RELEASE_CHECKLIST.md` before packaging or submitting to Chrome Web Store or Firefox Add-ons.

## Privacy

See `PRIVACY.md` for storage, sync, translation provider, and telemetry details.

## License

MIT License.
