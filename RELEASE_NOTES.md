# LexiBridge Translate Release Notes

## 1.0.0 - 2026-07-17

Initial productized release candidate for local Chrome/Firefox testing and browser-store preparation.

### Included

- User-triggered page translation from the popup or floating page button.
- Immediate Start/Stop behavior that restores the page when translation mode is turned off.
- Configurable CSS selector exclusions for page areas that should stay original during manual page translation.
- Subtle, highlighted, and plain-text translation appearance presets that update existing page translations.
- Exact-domain and wildcard site rules with per-site page translation allow/block, display mode, scope, style, and exclusion overrides.
- Intelligent main-content detection with semantic-region priority, text/link density fallback, whole-page mode, and per-site scope overrides.
- Immediate settings broadcasts to open tabs without exposing local translation provider secrets.
- Bottom-right floating button with a visible "Translate page" hint.
- Selected-text translation tooltip with vocabulary collection actions and explicit click-to-speak speech using script-aware locales; selection and translation completion never start speech.
- Control-hover paragraph translation for on-demand reading help.
- Input box translation by typing three trailing spaces, with language prefixes such as `/en`, `/zh`, and `/zh-CN`, mobile input/touch support, timeout protection, trusted-user-event enforcement, and no initialization scan.
- Native Chrome side-panel and Firefox sidebar text translation opened from the popup or `Alt+S`, with configured-provider filtering, provider-specific target languages, `Ctrl+Enter`, copy, and clear controls; Firefox keeps install-time auto-open disabled.
- AI-assisted side-panel polish, rewrite, drafting, reply, summary, proofreading, explanation, key-point extraction, and academic rewrite actions with configured-AI-provider enforcement, output-language, tone, length, optional-instruction, and iterative-use controls.
- Side-panel initialization and mode switching load or update local controls only and never send a provider request until the user submits text.
- Document translator for pasted text, text files, HTML, JSON, DOCX, EPUB, MOBI/AZW3, subtitle files, and PDFs, with bounded MOBI parsing and deterministic spine ordering, bundled PDF.js page rendering, positioned text extraction, browser-plus-bundled offline OCR for image-only pages, side-by-side original/translated previews, and flattened translated-PDF export.
- Explicit multi-file document translation queue with selectable concurrency from one to three workers, per-file status, immediate cancellation, failed-file retry, and deterministic ZIP export after every file succeeds; selecting files never starts translation.
- Structure-preserving SRT/VTT batch translation that rewrites cue text while retaining metadata, notes, styles, regions, identifiers, timing settings, and source line endings.
- Structure-preserving ASS/SSA subtitle import and export with timing, styles, comments, inline tags, and comma-bearing dialogue text retained; vector-drawing dialogue remains original.
- Editable translated document blocks whose final text is used by subtitle, JSON, DOCX, EPUB, PDF, and history exports.
- Explicit versioned document history in local Chrome storage with reopen-without-translation, JSON export, delete/clear controls, 10/25/50 retention, 512 KiB per-entry and 4 MiB total limits, and no binary PDF/DOCX/EPUB/MOBI/AZW3 source persistence.
- Explicit local bilingual Markdown research-note export with bounded blocks, source/provider/language metadata, safe variable-length code fences, and no direct Zotero connection or automatic export.
- Explicit BabelDOC local-workflow guide export after a PDF is loaded, with bounded language mapping, sanitized file names, shell-quoted PowerShell/POSIX command templates, absolute-path placeholders, and no PDF upload, command execution, path discovery, or API-key inclusion.
- Mixed PDF pages with sparse text layers are supplemented by local OCR when PDF.js identifies raster content; text-layer and OCR blocks are merged and duplicate detections are removed.
- Editing a loaded PDF preserves block IDs, page geometry, column metadata, and formula metadata when safe; newly inserted text without safe source geometry remains translatable but disables PDF export rather than being silently omitted.
- Conservative two-column PDF detection with left-column-then-right-column reading order and translated overlays constrained to inferred column regions.
- Local standalone-formula detection that preserves likely mathematical expressions, excludes them from direct translation and neighboring AI context, and does not paint over them in translated previews or PDF exports.
- Video subtitle translation for pages that expose caption/subtitle text tracks or common DOM-rendered caption containers.
- Versioned YouTube Adapter v1 for standard videos, Live pages, Shorts, and `youtu.be`, with active-player-scoped captions, route checks before every cue request/result, same-text timed-cue preservation, bounded export retention, and immediate Stop instead of automatic translation after SPA video navigation.
- Dedicated contract-tested video adapters for Netflix, Vimeo, Bilibili, Udemy, Coursera, Khan Academy, Nebula, and Bloomberg, with exact-domain matching, stable content identities, site-first selectors, generic fallbacks, and no resolver-side DOM writes.
- YouTube Live DOM captions now settle before a provider request, cancel an in-flight partial request when the cue grows, and merge translated incremental growth into one final exported cue.
- Video subtitles and Live captions remain text-only modes and never start tab recording.
- SRT export for translated video subtitle cues from the current session.
- User-invoked AI subtitle generation for selected local audio/video files up to 25 MB through configured OpenAI or Groq transcription endpoints.
- Provider-specific speech-model selection: OpenAI Whisper 1 and Groq Whisper models retain provider-timed segments, while OpenAI GPT-4o Transcribe and GPT-4o mini Transcribe support bounded SSE partial text after explicit submission and visibly labeled editable fallback timing.
- Local transcription input support now includes FLAC and OGG alongside MP3, MP4, MPEG/MPGA, M4A, WAV, and WebM.
- Explicit Chrome current-tab audio capture from the Capture current tab control while the subtitle generator remains open, using the required permission only after that click, preserving local playback, sending no provider request before Stop and generate, and cleaning up on cancel, page close, failure, or the 25 MB limit. Firefox omits the unsupported permission, disables that button, and keeps explicit local-media transcription available.
- Ordered 256 KB media upload chunks over a long-lived extension connection, immediate cancellation, abortable provider requests, and in-memory media cleanup after completion, cancellation, provider error, or disconnect.
- Timestamped transcript normalization, optional caption translation, bilingual preview, and local SRT/VTT export without page-load or background tab-audio capture.
- Contextual YouTube subtitle-generation entry points that only open the generator; capture still requires its own click, records the source playback offset at recorder start when available, exposes bounded editable cue text/start/end controls, uses indeterminate provider progress, and cancels globally namespaced per-cue translation requests.
- Local generated-caption timeline editing with a proportional overlap-aware cue track, bounded global time shifts, Unicode-safe text-cursor splitting, adjacent-cue merging that refuses text-loss overflow, automatic renumbering, cue deletion, and a bounded 50-snapshot Undo/Redo history; these edits never play media, open a transcription connection, or send a translation request.
- Explicit Apply to source video and Clear source video subtitles controls for generated bilingual cues. Applying is user-triggered, never starts playback, replaces prior generated-caption bindings, stays mutually exclusive with live subtitle translation, and clears on video or route changes.
- Live caption translation for caption text already visible in the page DOM, with Google Meet, Zoom, Microsoft Teams, and Webex-style speaker label handling.
- YouTube Live caption-container support in Live captions mode, semantic filtering that rejects unrelated ARIA status regions, and immediate two-way mutual exclusion between Video subtitles and Live captions.
- Timestamped bilingual live-caption transcripts with incremental-caption coalescing, in-memory session retention after Stop, explicit Clear, and local TXT/SRT/VTT/JSON export.
- Explicit live-caption transcript Save with bounded `chrome.storage.local` history, sanitized source origins, private-tab rejection, newest-first preview, local TXT/SRT/VTT/JSON export, per-session Delete, Clear all, and 10/25/50 retention controls; loading a page or stopping captions never saves automatically.
- Manual image text translation for selected images, canvases, SVGs, dragged image regions, and eligible graphics currently visible in the viewport, using browser OCR first and bundled offline OCR otherwise while retaining separate per-image or OCR-block overlays.
- Explicit image entry points for a frame-aware right-click command, hover actions available only after Image text is started, and a one-shot freeform `Z` lasso; opening a page, showing the hover controls, or pressing `Z` does not run OCR until the user chooses Translate or releases a valid selection. Blur, page hide, and pointer cancellation discard unfinished gestures.
- Per-image Retranslate, Apply, Undo, and reconstructed-canvas Download PNG actions. Retranslate bypasses completed and pending translation caches, Apply commits only extension-owned overlays, Undo restores the untouched source, and object URLs are revoked after downloads.
- Right-click image commands target the originating frame, inject the content bundle once into eligible pre-existing tabs when needed, wait for content initialization, reject ambiguous duplicate image URLs, and never enable persistent page-wide image click handlers.
- Persisted offline OCR language selection for English, Simplified Chinese, Traditional Chinese, Japanese, and Korean, with PDF page progress and local worker cleanup on Stop.
- Explicit Translate visible images command with hidden/offscreen/tiny/extension-owned filtering, duplicate-text request caching, and immediate batch cancellation when Image text stops.
- Deterministic local comic reconstruction for safe regular bubbles: bounded panel/bubble detection, OCR line grouping, contrast text masks, flat/smooth-background repair, and measured CJK/word/RTL-aware text fitting in a temporary canvas overlay without changing the source image.
- Browser OCR corner polygons constrain rotated source masks. Vertical CJK source columns use right-to-left column order and vertical presentation forms only when the translated text is predominantly CJK; Latin, mixed Latin-dominant, and RTL translations remain horizontal.
- Explicit two-step current-page comic translation: Scan comic chapter reads a fixed bounded DOM snapshot without OCR or provider work, then Translate N images starts recognition and translation. Membership, order, source, geometry, settings, or navigation changes invalidate the snapshot; Stop aborts work and removes chapter results.
- Chapter discovery is bounded to 2,048 DOM elements and 48 images, with 1,200 text blocks, 120,000 source characters, and 16 million retained reconstruction pixels per confirmed run. Safety-limit results are labeled partial instead of complete.
- Source-resolution overlapping tiled OCR for long/high-resolution page images, with deterministic core ownership, bounded fuzzy overlap deduplication, sequential OCR, explicit source/tile/text/comparison limits, and immediate worker cancellation on Stop.
- Image OCR surfaces are capped at 3 megapixels, distinct OCR blocks at 200, provider concurrency at four, and full-canvas comic reconstruction at 1.5 megapixels/64 positioned blocks. Larger safe images use source-positioned bubble patches, with retained chapter patches capped at 16 million pixels; final glyph painting is clipped to each bubble.
- Non-destructive image fallback for cross-origin-tainted pixels, whole-image OCR boxes, CSS transforms or non-fill object fitting, cross-tile bubbles, bounded-limit failures, textured artwork, unsafe masks, and translations that cannot fit; Stop aborts provider/reconstruction work and rejects late patch or canvas commits.
- Freeform lasso results always use non-destructive overlays so reconstruction cannot alter pixels outside the selected polygon.
- Content-owned visible-image batch progress survives popup closure and duplicate batch commands coalesce into one operation.
- Image results follow source movement, invalidate when the source URL, dimensions, or DOM connection changes, and never replace or rewrite source image nodes.
- Dedicated local Image Translator workspace for up to 12 bounded JPG/JPEG, PNG, or WEBP files loaded by picker, drop, or clipboard paste. Serialized loading enforces the 100 MB/32-million-decoded-pixel queue limits; previews and control changes stay idle until Translate image or Translate all.
- Local-image Retranslate, Apply/Undo original-versus-translated preview switching, original-resolution completed PNG download, sequential overlapping OCR/analysis tiles capped at 1.5 megapixels, source-object-URL cleanup, and optional per-image local-only quality ratings that omit source text, translated text, pixels, and file names.
- A real local-image Translate/Stop toggle aborts OCR and background provider requests, cancels pending PNG encoding, yields between bounded reconstruction stages so Stop can run, and rejects late OCR/provider/render/download results.
- Content, image, video-subtitle, and live-caption translation caches include provider, target language, settings revision, source text, and context; a single MessageManager listener owns content-script command dispatch so each toggle executes once.
- 100+ target language choices in settings.
- 29 implemented provider adapters: Google Translate, MyMemory, DeepL, Microsoft Translator, OpenAI-compatible, Gemini, DeepSeek, OpenRouter, Groq, Qwen, Zhipu GLM/ChatGLM, SiliconFlow, Ollama, Claude, Azure OpenAI, LibreTranslate, Yandex Cloud Translate, NiuTrans, Caiyun Translate, ModernMT, Lingvanex, Naver Papago, Baidu Translate, Volcengine Translate, Alibaba Machine Translation, Amazon Translate, IBM Watson Language Translator, Youdao Translate, and SYSTRAN Translate.
- AI translation controls for AI-capable providers, including opt-in neighboring page/document context, nine domain experts, normalized terminology mappings, custom instructions, and context-aware cache isolation.
- Strict duplicate-key-safe JSON installation for versioned AI experts, full instruction and attribution review, enable/disable state, protected built-ins, upgrade-only replacement, and safe fallback when a selected custom expert is disabled or removed.
- Structured YAML prompt-template import/export with bounded declared variables, required-variable validation, multiline JSON override values, deterministic local preview, rollback to the trusted default, and no provider request from management or preview actions.
- Fixed local curated expert/template discovery with versioned metadata, HTTPS attribution, pinned SHA-256 integrity, exact explicit selection, confirmation before installation, and no network, dynamic execution, or automatic installation.
- Fixed extension-owned AI system requirements with source, context, glossary, custom instructions, installed experts, and imported prompt templates isolated as untrusted user-message data.
- Opt-in request-scoped masking for supported email, phone, Luhn-valid payment-card, IPv4, strictly validated IPv6, IBAN, strict JWT, validated PEM private keys, high-confidence AWS/GitHub/OpenAI/GitLab/Slack/Stripe/Google credentials, Azure Storage account keys, database-URI passwords, checksum-valid Chinese resident IDs, and sensitive URL-query values, with local restoration and fail-closed result rejection on missing, duplicated, transformed, unknown, or unexpected placeholders.
- Abortable side-panel translation and AI-writing requests with unique IDs and a real Run/Stop toggle that immediately cancels the provider request and ignores late responses, including Clear and panel-close cancellation.
- Sync-failure user-data fallback that takes precedence over stale synchronized settings, retries pending fields on recovery, remains equivalent when fallback cleanup fails, preserves learning preferences, and filters imports to settings and learning data so provider credentials and local AI libraries never enter Chrome Sync.
- Local-only API credential storage with masked settings summaries for API keys, client/application IDs, and temporary session tokens; explicit configured-host approval; keyless Ollama configuration; and no credentialed-provider fallback to unrelated services.
- Provider-specific target-language filtering for published narrow capability sets, including DeepL and Caiyun, with Simplified/Traditional Chinese mappings preserved.
- Explicit LibreTranslate and SYSTRAN language discovery from the saved instance, with bounded response parsing, source-target pair enforcement, locally cached capabilities, endpoint/credential invalidation, original provider language-code preservation, and no discovery request until the user clicks Refresh languages.
- Automated request-contract coverage for every implemented provider adapter. Credentialed services still require valid user accounts and provider-side live availability.
- Built-in CET4, CET6, GRE, IELTS, and TOEFL vocabulary dictionaries.
- Vocabulary notebook, review page, learning progress, import/export, and settings.
- Local-first data storage through browser extension storage, with profile sync support when enabled by the browser.
- Separate Chrome and Firefox Desktop manifests and production directories, Firefox MV3 background scripts/native sidebar, alarm-based background cache cleanup, target-specific integrity metadata, strict cross-target byte checks, and deterministic ZIP packaging.
- Versioned platform capability boundaries that report Chrome/Firefox behavior, reject unknown platforms or capabilities, require explicit user action for interactive features, and mark Safari, userscript, Zotero, iOS, and Android unsupported rather than implying compatibility.
- Firefox Desktop 140+ built-in data-collection consent declarations with a stable Gecko ID; Firefox Add-ons lint completes with zero errors while dependency/API/static-analysis warnings remain documented for AMO review.
- Store listing draft, privacy policy, release checklist, and screenshot guide.

### Verification

Verified on 2026-08-12:

- `tsc --noEmit`: passed.
- `eslint src --ext .ts,.js`: passed.
- `jest --runInBand`: passed, 78 test suites and 864 tests.
- `npm run package`: passed for Chrome and Firefox Desktop.
- `web-ext lint --source-dir dist-firefox`: passed with 0 errors, 0 notices, and 31 warnings retained for AMO review.
- Chrome build metadata: source `BCA74FE02AE12AECA1B1AA1EBC9364C25056C78719D17030F156832E814FD5C1`, manifest `E105181215EF2F2030818523211C187353EEC836130ADC7FCA04DF312168887C`, payload `92AC5261B27BA990CEA0F5CBFCED7D14A4C7950A729A7826542BCAF65E498F6C`.
- Firefox build metadata: source `99ED4603E304AE6DF755D4EB53A1A0970E369AE3F33266A04CEC9C5EAF91EEA0`, manifest `F280485846217ACDC7E58E0719AE800943FD2C3A07262789D8FE975D8A2D1C55`, payload `61B4377C1618E32E63D68AAACBCC5E95BA0C56B32E7C8B9D860D0DE56E1B4953`.
- Both production directories contain exactly 246 files; forbidden tests, TypeScript declarations/sources, and source maps are absent, and every non-manifest/non-metadata file is byte-identical across targets.
- Both ZIPs were generated twice from sorted forward-slash paths with fixed timestamps, compared byte-for-byte, CRC-checked, and reloaded to match every production file.

Expected build warnings:

- Built-in vocabulary JSON files exceed the default webpack asset-size recommendation.
- The PDF.js document bundle and worker also exceed the recommendation because PDF parsing, rendering, fonts, and character maps are shipped locally instead of loaded from a CDN.
- Bundled OCR language models and WebAssembly cores also exceed the recommendation because recognition runs locally without an OCR server.
- These warnings are accepted because the dictionaries, PDF runtime, and OCR runtime are bundled product data.
- Firefox lint warnings cover the desktop-only data-consent minimum-version validator, capability-gated `system.memory`, static `innerHTML` analysis, and dynamic-function code in bundled/runtime dependencies. They are not suppressed and require review before AMO submission.

### Local Install Package

- Chrome unpacked folder: `dist`
- Chrome test package: `chrome-translation-extension.zip`
- Chrome ZIP size: `17,853,749` bytes
- Chrome SHA-256: `8BBDD576247BB7A2E0A1846A3993E12DC31BF12AF5ADADA619CFF9D43B6E3F2C`
- Firefox unpacked folder: `dist-firefox`
- Firefox test package: `firefox-translation-extension.zip`
- Firefox ZIP size: `17,853,920` bytes
- Firefox SHA-256: `221AAF5B63579D83ADE23A500446B9E0DAB0C5738F201A01CB6AFEC5A6C17BA2`

Keep generated package artifacts out of git unless a release process explicitly requires attaching them.
