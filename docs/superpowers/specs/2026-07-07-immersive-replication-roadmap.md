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
- User-invoked Chrome side-panel text translation with popup and `Alt+S` entry points.
- Side-panel AI polish, rewrite, compose, reply, and summary actions with language, tone, length, optional instruction, and iterative-use controls.
- 28 implemented provider adapters spanning public machine translation, hosted AI, self-hosted AI, and local Ollama endpoints.
- AI-capable provider context-aware translation with opt-in neighboring text, domain experts, terminology mappings, and custom instructions.
- Local-only API credential storage with masked UI summaries and exact-origin permission requests for custom endpoints.
- 100+ target language choices with provider-specific filtering where a provider publishes a narrower target set.
- Configurable page display modes: bilingual, translation only, and original only.
- Configurable page translation exclude selectors for areas that should remain original.
- Subtle, highlighted, and plain-text page translation appearance presets.
- Exact-domain and wildcard site rules with per-site allow/block, display, scope, style, and selector overrides.
- Intelligent main-content detection with whole-page and per-site scope overrides.
- Document translator page for pasted/uploaded text, HTML files, subtitle files, and locally rendered PDFs.
- Conservative two-column PDF reading order, column-bounded translated overlays, and local standalone-formula preservation.
- JSON document string-value extraction in the document translator.
- Structure-preserving translated JSON export from the document translator.
- DOCX paragraph text and EPUB spine text extraction in the document translator.
- DOCX translated paragraph export by rewriting text into the original document archive.
- EPUB translated block export by rewriting readable spine documents into the original book archive.
- Timing-preserving subtitle file export from the document translator.
- Manual document entry prompt on detected document URLs.
- Manual video subtitle translation for pages that expose caption or subtitle text tracks.
- User-invoked local-media transcription through configured OpenAI/Groq endpoints with optional caption translation and SRT/VTT export.
- Explicit current-tab audio capture in the open subtitle generator with source-tab authorization, click-only API use, local playback preservation, bounded memory, and Stop-and-generate submission.
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

- Done: add 28 implemented provider adapters: Google, MyMemory, DeepL, Microsoft, OpenAI-compatible, Gemini, DeepSeek, OpenRouter, Groq, Qwen, Zhipu GLM/ChatGLM, SiliconFlow, Ollama, Claude, Azure OpenAI, LibreTranslate, Yandex, NiuTrans, Caiyun, ModernMT, Lingvanex, Papago, Baidu, Volcengine, Alibaba, IBM Watson, Youdao, and SYSTRAN.
- Done: keep ChatGLM under the existing Zhipu GLM adapter instead of duplicating the same provider, and track the current supported GLM default model.
- Done: keep Google and MyMemory available without credentials and preserve fallback between those two public services.
- Done: integrate OpenAI-compatible Chat Completions, Gemini, Claude Messages, Azure OpenAI, LibreTranslate, Yandex Cloud, NiuTrans, Caiyun, ModernMT, and Lingvanex request/response contracts.
- Done: keep API keys, access-key IDs, and optional temporary session tokens in local storage, return only masked summaries to settings, and exclude credentials from Chrome sync and learning-data export.
- Done: request optional host permission for the configured HTTPS or localhost scheme and hostname when provider configuration is saved, including keyless Ollama and LibreTranslate configurations.
- Done: prevent credentialed translation requests from silently falling back to another provider.
- Done: add nine domain-specific AI translation experts for AI-capable providers.
- Done: add normalized terminology mappings and bounded custom translation instructions.
- Done: add opt-in neighboring page/document context, isolate source/context as untrusted request data, and include AI preferences in cache identity.
- Remaining: reassess Tencent Cloud TMT text translation because the current official product SDK no longer exposes the legacy `TextTranslate` action; implement Amazon Translate and evaluate a supported Reverso integration; add dynamic language discovery for self-hosted LibreTranslate and SYSTRAN instances plus broader source-target pair guidance; complete real-account smoke tests for credentialed services.

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
- Done: prevent same-height fragments from confidently separated PDF columns from being merged into one line.
- Done: detect conservative two-column regions, order left-column text before right-column text, and keep translated overlays inside the inferred column boundary.
- Done: identify likely standalone formulas locally and preserve them without provider requests or translated-preview/export overlays.
- Done: render original and translated PDF pages locally with bilingual, translation-only, and original-only page views.
- Done: attempt local OCR for image-only PDF pages when browser `TextDetector` is available and retain OCR bounding boxes.
- Done: fall back to a bundled Tesseract worker when browser `TextDetector` is unavailable or returns no text.
- Done: expose a persisted OCR language choice and per-page bundled OCR progress.
- Done: export translated PDF pages locally as a flattened visual PDF.
- Remaining: editable PDF text reflow, structural MathML/LaTeX reconstruction, form/annotation preservation, scan preprocessing, mixed-language detection, and advanced multi-column/table layout fitting beyond conservative two-column detection.

### Batch E: Video Subtitle Translation

- Done: detect browser subtitle/caption text tracks on video pages.
- Done: detect common DOM-rendered video caption containers after manual enablement.
- Done: translate active subtitle cues after the user starts Video subtitles from the popup.
- Done: render bilingual subtitle overlays without blocking playback.
- Done: keep Video subtitles text-only; it never starts current-tab recording.
- Done: export translated subtitle cues from the current session as SRT.
- Done: generate timestamped captions from explicitly selected local audio/video files through configured OpenAI or Groq transcription endpoints.
- Done: upload media in bounded ordered chunks, abort on cancellation/disconnect, keep bytes in memory only, optionally translate normalized cues, and export bilingual SRT/VTT.
- Done: declare `tabCapture` so Chrome can authorize the source tab when the popup is invoked, call it only after an explicit subtitle-generator click, preserve local playback, and stop/discard on cancel, page close, failure, or the 25 MB limit.
- Remaining: deeper site-specific optimizations, additional speech providers, files above provider limits, live partial transcription, and richer caption timing/editing controls.

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

### Batch H: Side Panel and Keyboard Entry

- Done: add a Chrome side panel with provider and target-language controls.
- Done: disable configurable providers until their saved configuration is ready.
- Done: keep panel initialization idle and translate only after Translate or `Ctrl+Enter`.
- Done: add copy, clear, and provider-settings controls.
- Done: open the panel from the popup and the `Alt+S` extension command.
- Done: add AI-assisted polish, rewrite, compose, reply, and summary workflows with explicit submission only.
- Done: restrict writing actions to configured AI-capable providers and support output language, tone, length, bounded custom instructions, and iterative result reuse.
- Remaining: cross-browser side-panel equivalents and additional specialized text-processing templates.

## Non-Negotiable Product Rules

- Do not auto-translate a page on load.
- Do not capture tab audio on page load, from Video subtitles, or from Live captions.
- Keep the required tab-audio API unused until Capture current tab; keep recordings local until Stop and generate and discard them on cancel, page close, failure, or limit overflow.
- Do not weaken existing learning functions.
- Do not claim a feature in store copy before it is implemented and verified.
- Each batch must have tests or documented acceptance checks.
- Each batch must be verified, packaged when runtime code changes, committed, and pushed before moving to the next batch.
