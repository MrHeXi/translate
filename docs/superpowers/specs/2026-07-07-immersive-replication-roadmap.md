# Immersive Translate Feature Replication Roadmap

Goal: replicate the Immersive Translate feature family while preserving the current LexiBridge functions: manual page translation, selected-text translation, vocabulary collection, exam dictionaries, review, import/export, and Chrome storage.

## Audited Parity Baseline

- Baseline release: Immersive Translate `v1.32.1`, audited from official product documentation and changelog on 2026-08-08.
- The official Immersive Translate repository is used for release and issue evidence; the product implementation is closed source, so parity is measured from official documentation, published configuration, and observable behavior rather than copied source code.
- Official feature references audited for this roadmap cover webpage, input, PDF, EPUB, subtitle, video, image, manga, prompt, sensitive-data, and installation workflows.
- Intentional parity exception: LexiBridge never translates a page automatically on load, even though Immersive Translate supports automatic and per-site automatic translation. A popup, floating button, shortcut, or another explicit user command must start every translation, OCR, transcription, or capture workflow.
- Completion means functional and behavioral parity with documented workflows, not merely a similarly named control. Each batch requires tests, cancellation/restore checks, production packaging, and an independently reviewed diff.

## Source Feature Families

The target feature families are:

- Web page bilingual translation.
- Selected-text translation.
- Selected-text translation with optional text-to-speech.
- Hover paragraph translation.
- Input box translation with language prefixes and mobile gestures.
- PDF and document translation with layout awareness.
- MOBI, EPUB, DOCX, PDF, HTML, subtitle, and batch document workflows with local history.
- BabelDOC and Zotero-oriented academic-document workflows.
- Video subtitle translation for common streaming/video pages.
- YouTube Live and Shorts subtitle workflows, AI subtitle generation, and site-specific video adapters.
- Meeting subtitle translation.
- Image, manga, and OCR translation with panel/bubble structure, source removal, and typography reconstruction.
- Multiple translation engines and broad language-pair coverage.
- Installable AI experts, full prompt/YAML templates, and sensitive-data masking.
- Chrome, Firefox, Safari, iOS, Android, userscript, and Zotero distribution paths.
- Reading-first controls that do not interrupt the page flow.

## Current Coverage

Already implemented:

- Manual page translation from popup and floating button.
- Immediate Start/Stop state that restores the page.
- Selected-text translation tooltip with explicit click-to-speak speech and script-aware locale selection.
- Input box translation with language prefixes, desktop/mobile deliberate shortcuts, timeout protection, and initialization no-op behavior.
- Vocabulary notebook and review flow.
- Built-in CET4, CET6, GRE, IELTS, and TOEFL dictionaries.
- Floating button discoverability and release packaging.

Current batch:

- Hover paragraph translation using a modifier-key interaction.
- Input box translation using a deliberate shortcut.
- User-invoked Chrome side-panel text translation with popup and `Alt+S` entry points.
- Side-panel AI polish, rewrite, compose, reply, and summary actions with language, tone, length, optional instruction, and iterative-use controls.
- 29 implemented provider adapters spanning public machine translation, hosted AI, self-hosted AI, and local Ollama endpoints.
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
- Bounded MOBI/KF8-based AZW3 text import with deterministic spine ordering and duplicate paragraph preservation.
- DOCX translated paragraph export by rewriting text into the original document archive.
- EPUB translated block export by rewriting readable spine documents into the original book archive.
- Structure-preserving SRT/VTT subtitle export that changes cue text only and retains timing, identifiers/settings, WEBVTT metadata sections, non-cue content, and original line endings.
- Explicit multi-file document batch translation that remains idle after selection, starts only on command, limits concurrency to 1/2/3, supports cancellation and explicit failed-file retry, and emits a deterministic ZIP only after all files succeed.
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
- Single-owner content message dispatch with exactly-once image/video/live-caption command execution.
- Content, image, video-subtitle, and live-caption cache identity includes provider, target language, settings revision, and source text/context.
- Versioned YouTube standard/Live/Shorts video adapters with active-player selection and manual restart after SPA video navigation.
- Explicit subtitle generation with provider capability declarations, true request cancellation, source playback-time offsets, editable cue text/timing, and deterministic SRT/VTT export.

## Planned Batches

### Batch A: Web Interaction Parity

- Add modifier-key hover paragraph translation.
- Done: add input box translation shortcut with language prefixes and mobile gesture handling.
- Done: add explicit selection speech with locale inference and cancellation.
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

- Done: add 29 implemented provider adapters: Google, MyMemory, DeepL, Microsoft, OpenAI-compatible, Gemini, DeepSeek, OpenRouter, Groq, Qwen, Zhipu GLM/ChatGLM, SiliconFlow, Ollama, Claude, Azure OpenAI, LibreTranslate, Yandex, NiuTrans, Caiyun, ModernMT, Lingvanex, Papago, Baidu, Volcengine, Alibaba, Amazon, IBM Watson, Youdao, and SYSTRAN.
- Done: keep ChatGLM under the existing Zhipu GLM adapter instead of duplicating the same provider, and track the current supported GLM default model.
- Done: keep Google and MyMemory available without credentials and preserve fallback between those two public services.
- Done: integrate OpenAI-compatible Chat Completions, Gemini, Claude Messages, Azure OpenAI, LibreTranslate, Yandex Cloud, NiuTrans, Caiyun, ModernMT, and Lingvanex request/response contracts.
- Done: keep API keys, access-key IDs, and optional temporary session tokens in local storage, return only masked summaries to settings, and exclude credentials from Chrome sync and learning-data export.
- Done: request optional host permission for the configured HTTPS or localhost scheme and hostname when provider configuration is saved, including keyless Ollama and LibreTranslate configurations.
- Done: prevent credentialed translation requests from silently falling back to another provider.
- Done: add nine domain-specific AI translation experts for AI-capable providers.
- Done: add normalized terminology mappings and bounded custom translation instructions.
- Done: add opt-in neighboring page/document context, isolate source/context as untrusted request data, and include AI preferences in cache identity.
- Done: integrate Amazon Translate with region-derived official endpoints, AWS Signature Version 4, optional STS credentials, its published target-language set, and the 10,000-byte synchronous text limit.
- Done: add explicit, bounded dynamic language discovery for configured LibreTranslate and SYSTRAN instances, cache the discovered capabilities locally, preserve source-target pairs and provider-native language codes, invalidate on endpoint or credential changes, and keep all discovery off page/view initialization.
- Remaining: reassess Tencent Cloud TMT text translation because the current official product SDK no longer exposes the legacy `TextTranslate` action; evaluate a supported Reverso integration; complete real-account smoke tests for credentialed services.

### Batch D: PDF and Document Translation

- Done: detect document URLs and expose a manual document translator entry.
- Done: support pasted text, text files, Markdown, HTML body text extraction, subtitle files, and a compatibility path for simple PDF text streams.
- Done: support JSON files by extracting readable string values.
- Done: export translated JSON files while preserving object and array structure.
- Done: support DOCX files by extracting WordprocessingML paragraph text.
- Done: support EPUB files by extracting readable spine document text.
- Done: export translated DOCX files by rewriting translated paragraph text into the original document archive.
- Done: export translated EPUB files by rewriting translated readable blocks into the original book archive.
- Done: export translated SRT and VTT subtitle files by replacing cue text only while preserving timing, identifiers/settings, WEBVTT metadata and NOTE/STYLE/REGION sections, line endings, and other non-cue content.
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
- Done: supplement sparse text layers on raster-backed pages, merge OCR/text blocks in deterministic reading order, deduplicate overlapping equivalent blocks, and reject unusable browser OCR results before falling back to bundled Tesseract.
- Done: preserve loaded PDF block identity, page geometry, column metadata, and formula metadata through source edits; map inserted text only to adjacent prose geometry and disable PDF export when no safe geometry exists.
- Done: exclude standalone formula blocks from neighboring AI context as well as direct translation requests.
- Verified: generated real PDF.js fixtures cover text extraction, columns/formulas, and a real raster-backed mixed page; flattened export remains covered as a visual-PDF contract.
- Remaining: editable block-level PDF reflow beyond safe geometry mapping, structural MathML/LaTeX reconstruction, form/annotation preservation, scan preprocessing, mixed-language detection, and advanced multi-column/table layout fitting beyond conservative two-column detection.

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
- Done: support manual freeform lasso OCR regions for images and canvases; begin OCR only on a valid pointer release and cancel unfinished gestures on blur, page hide, or pointer cancellation.
- Done: render separate OCR text-block overlays when the browser returns bounding boxes.
- Done: add an explicit Translate visible images command for eligible images, canvases, and SVGs intersecting the current viewport.
- Done: retain per-image overlays, reuse duplicate-text translations, and cancel remaining visible-image work when image mode stops.
- Done: skip hidden, offscreen, tiny, nested SVG, and extension-owned graphics during visible-image batches.
- Done: keep all OCR-triggering actions explicit.
- Done: terminate the local image OCR session immediately when Image text mode stops.
- Done: converge production content initialization on the MessageManager listener and add exactly-once behavioral coverage for image commands while retaining all media actions.
- Done: isolate content, image, video-subtitle, and live-caption translation caches by provider, target language, settings revision, source text, and context.
- Done: retain bounded source-pixel rectangles and OCR confidence, infer deterministic whitespace panels and seeded white/black bubble regions, group adjacent OCR lines, and keep whole-image OCR fallbacks out of source removal.
- Done: bound OCR surfaces to 3 megapixels, retain at most 200 distinct blocks, limit image-text provider concurrency to four, and restrict synchronous comic reconstruction to 1.5 megapixels and 64 positioned blocks.
- Done: reconstruct regular flat or smooth bubbles locally with contrast masks, bounded solid/diffusion repair, clipped CJK/word/RTL-aware line fitting, and a temporary translated canvas that never mutates the source image.
- Done: fall back to non-destructive DOM overlays for cross-origin-tainted pixels, CSS transforms/non-fill object fitting, oversized sources, page-level OCR geometry, textured artwork, unsafe masks, or translations that cannot fit.
- Done: make visible-image batch state content-owned and recoverable after popup closure, coalesce duplicate commands, abort provider/reconstruction work on Stop, terminate OCR, and reject late canvas commits by run ID and source fingerprint.
- Done: add an HTTP/HTTPS-only frame-aware image context menu with one-time content injection for eligible older tabs, initialization polling, recent-target validation, unique-URL fallback, and no persistent page-wide image handlers for one-shot commands.
- Done: add a closeable hover toolbar after manual Image text Start, a global explicit `Z` one-shot region arm that runs no OCR before a valid drag, editable/IME/modifier protection, and Escape/Stop cancellation.
- Done: add per-image cache-bypassing Retranslate, non-destructive Apply/Undo, reconstructed-canvas-only Download PNG with object-URL cleanup, overlay movement synchronization, and stale source invalidation.
- Done: add a dedicated local image workspace for bounded JPG/JPEG, PNG, and WEBP choose/drop/paste queues; selection and settings changes stay idle until Translate image or Translate all, and the active command becomes an immediate Stop.
- Done: keep local-image source dimensions intact, process large images sequentially in overlapping source-resolution OCR/analysis tiles, cancel OCR/provider/reconstruction work by run ID, preserve original-resolution PNG output, support per-image Retranslate and Apply/Undo preview switching, and store optional per-image quality ratings locally without source text, pixels, or file names.
- Done: preserve bounded browser OCR source polygons, keep rotated erase masks inside those polygons, and use non-destructive overlays for freeform selections so reconstruction never alters pixels outside the lasso.
- Done: infer right-to-left vertical CJK source columns, use common vertical presentation forms for predominantly CJK targets, and keep Latin-dominant and RTL targets horizontal.
- Done: add data-driven current-page comic reader adapters with an explicit two-step Scan then Translate workflow. Scanning is DOM-only and bounded; changed membership/order/source/geometry/navigation invalidates confirmation; Stop aborts work and removes chapter results.
- Done: bound chapter discovery to 2,048 DOM elements and 48 images, and confirmed runs to 1,200 text blocks, 120,000 source characters, and 16 million retained reconstruction pixels with visible partial-result messaging.
- Done: add tiled OCR and reconstruction for very long high-resolution comic strips with deterministic core ownership, bounded fuzzy overlap deduplication, source-positioned bubble patches, cross-tile safety fallback, exact retained-pixel budgeting, explicit tile/text/memory limits, and immediate cancellation.
- Remaining: broader reader-specific optimization and evidence-backed adapters for newly documented sites.

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
- Done: add a Firefox native sidebar equivalent with install-time auto-open disabled and popup/`Alt+S` user-action entry points.
- Remaining: additional specialized text-processing templates and side-panel equivalents for other target platforms.

### Batch I: Document Formats, Batch Workflows, and History

- Done: add ASS/SSA subtitle import/export while preserving script structure, timing, style/comment fields, inline override tags, and comma-bearing dialogue text; leave vector-drawing dialogue untouched.
- Done: make translated document blocks editable and use the edited values for subtitle, JSON, DOCX, EPUB, PDF, and history exports.
- Done: add explicit local translation history with source metadata, provider/language identity, reopen/export/delete/clear controls, configurable 10/25/50 retention, bounded storage, and no cloud synchronization or binary source persistence.
- Done: add bounded MOBI and KF8-based AZW3 import with a 64 MiB file limit, 4,096-chapter limit, 8 MiB per-chapter limit, 64 MiB extracted-HTML limit, deterministic spine/text ordering, duplicate paragraph preservation, cancellation, and translated-text export without claiming eBook container rewriting.
- Done: add explicit multi-file batch translation with 100-file, 64 MiB per-file, and 128 MiB total limits that stays idle after file selection, starts only after Start batch, limits concurrency to 1/2/3, reports per-file status, supports cancellation and explicit failed-file retry, and creates a deterministic ZIP only after all files succeed.
- Remaining: add BabelDOC-compatible PDF workflow guidance and a Zotero-oriented handoff without claiming unsupported third-party integration.

### Batch J: Video and Site Adapter Parity

- Done: add a side-effect-free versioned adapter registry and YouTube Adapter v1 for standard videos, Live pages, Shorts, and `youtu.be`, with page classification, active-player-scoped selectors, route checks before cue requests/results, DOM caption normalization, same-text timed-cue preservation, bounded cue retention, and immediate Stop when SPA navigation changes videos.
- Done: expose YouTube-specific manual generator entry points while retaining the explicit second Capture click; declare OpenAI/Groq timed-segment and cancellation capabilities, show indeterminate transcription progress, offset captured cues by the source playback position, allow cue text/start/end editing, abort active translation requests, and export edited bilingual SRT/VTT.
- Remaining: add verified adapters for the other officially documented video sites, richer YouTube Live incremental/final cue handling, generated-caption playback in the source player, additional speech providers, files above provider limits, and live partial transcription.
- Keep every subtitle-generation and media-capture path user-triggered; visiting or playing a video never starts capture, OCR, transcription, or translation.

### Batch K: AI Experts, Prompt Templates, and Privacy

- Done: add installable Schema v1 AI expert definitions with strict validation, HTTPS source attribution, semantic version upgrade protection, immutable trusted built-ins, enable/disable controls, local-only persistence, and safe selected-expert fallback on disable/removal.
- Done: add structured `js-yaml` prompt-template import/export with aliases and unsafe tags disabled, deterministic output, schema/complexity/variable/render limits, local preview, selected-template removal fallback, and rollback to the built-in default.
- Done: add opt-in request-scoped masking for supported emails, phone numbers, Luhn-valid cards, IPv4 addresses, valid IBANs, and sensitive URL query values across source/context/prompt fields; restore required source placeholders locally and discard ambiguous provider output visibly.
- Done: keep webpage, document, subtitle, OCR, neighboring context, installed experts, YAML templates, glossary entries, and custom preferences in the untrusted user-message channel; reject page-content template variables; and keep the extension-owned source-isolation and exact-placeholder requirements fixed in a separate system message.
- Remaining: broaden sensitive-pattern coverage with carefully measured false-positive/false-negative tests, add a curated expert/template discovery channel without executing remote content, and complete real-provider prompt-adherence smoke tests.

### Batch L: Cross-Platform Distribution

- Done: add separate Chrome and Firefox Desktop manifests, production output directories, target-aware source/manifest/payload fingerprints, strict cross-target byte checks, and deterministic ZIP archives.
- Done: use Firefox MV3 background scripts and native `sidebar_action`, preserve user-invoked popup/keyboard entry points, and keep the sidebar closed at install.
- Done: migrate recurring background cache cleanup from an in-memory interval to `alarms` so suspended workers and event pages can resume the task.
- Done: capability-gate Chrome `tabCapture`; Firefox disables only current-tab recording with a local-media alternative and never starts capture, OCR, transcription, or translation automatically.
- Done: declare a stable Gecko ID, Firefox Desktop 140 minimum, and Mozilla built-in data-collection consent categories; run `web-ext lint` with zero errors and retain warnings for explicit AMO review.
- Remaining: complete hands-on Firefox smoke testing and AMO signing, then add Safari, userscript, Zotero, iOS, and Android feasibility gates without claiming one browser bundle works everywhere.

## Non-Negotiable Product Rules

- Do not auto-translate a page on load.
- Do not copy Immersive Translate's automatic or per-site automatic translation behavior; this is an intentional user-required parity exception.
- Do not translate because the document page opens, files are selected, the queue changes, or failed files are queued for retry; only an explicit Translate document or Start batch command may begin document translation.
- Do not OCR or translate because the image workspace opens, files are chosen/dropped/pasted, previews are switched, or provider/language settings change; only Translate image, Retranslate, or Translate all may begin local-image work.
- Do not capture tab audio on page load, from Video subtitles, or from Live captions.
- Do not keep Video subtitles active across a YouTube SPA change to another video; restore the previous track and require another explicit Start.
- Keep the required tab-audio API unused until Capture current tab; keep recordings local until Stop and generate and discard them on cancel, page close, failure, or limit overflow.
- Do not weaken existing learning functions.
- Do not claim a feature in store copy before it is implemented and verified.
- Each batch must have tests or documented acceptance checks.
- Each batch must be verified, packaged when runtime code changes, committed, and pushed before moving to the next batch.
