# LexiBridge Translate Release Notes

## 1.0.0 - 2026-07-17

Initial productized release candidate for local testing and Chrome Web Store preparation.

### Included

- User-triggered page translation from the popup or floating page button.
- Immediate Start/Stop behavior that restores the page when translation mode is turned off.
- Configurable CSS selector exclusions for page areas that should stay original during manual page translation.
- Subtle, highlighted, and plain-text translation appearance presets that update existing page translations.
- Exact-domain and wildcard site rules with per-site page translation allow/block, display mode, scope, style, and exclusion overrides.
- Intelligent main-content detection with semantic-region priority, text/link density fallback, whole-page mode, and per-site scope overrides.
- Immediate settings broadcasts to open tabs without exposing local translation provider secrets.
- Bottom-right floating button with a visible "Translate page" hint.
- Selected-text translation tooltip with vocabulary collection actions.
- Control-hover paragraph translation for on-demand reading help.
- Input box translation by typing three trailing spaces.
- Chrome side-panel text translation opened from the popup or `Alt+S`, with configured-provider filtering, provider-specific target languages, `Ctrl+Enter`, copy, and clear controls.
- AI-assisted side-panel polish, rewrite, drafting, reply, and summary actions with configured-AI-provider enforcement, output-language, tone, length, optional-instruction, and iterative-use controls.
- Side-panel initialization and mode switching load or update local controls only and never send a provider request until the user submits text.
- Document translator for pasted text, text files, HTML, JSON, DOCX, EPUB, subtitle files, and PDFs, with bundled PDF.js page rendering, positioned text extraction, browser-plus-bundled offline OCR for image-only pages, side-by-side original/translated previews, and flattened translated-PDF export.
- Conservative two-column PDF detection with left-column-then-right-column reading order and translated overlays constrained to inferred column regions.
- Local standalone-formula detection that preserves likely mathematical expressions without sending them to translation providers or painting over them in translated previews and PDF exports.
- Video subtitle translation for pages that expose caption/subtitle text tracks or common DOM-rendered caption containers.
- Video subtitles and Live captions remain text-only modes and never start tab recording.
- SRT export for translated video subtitle cues from the current session.
- User-invoked AI subtitle generation for selected local audio/video files up to 25 MB through configured OpenAI or Groq transcription endpoints.
- Explicit current-tab audio capture from the Capture current tab control while the subtitle generator remains open, using the required permission only after that click, preserving local playback, sending no provider request before Stop and generate, and cleaning up on cancel, page close, failure, or the 25 MB limit. Chrome 116 or newer is required.
- Ordered 256 KB media upload chunks over a long-lived extension connection, immediate cancellation, abortable provider requests, and in-memory media cleanup after completion, cancellation, provider error, or disconnect.
- Timestamped transcript normalization, optional caption translation, bilingual preview, and local SRT/VTT export without page-load or background tab-audio capture.
- Live caption translation for caption text already visible in the page DOM, with Google Meet, Zoom, Microsoft Teams, and Webex-style speaker label handling.
- Timestamped bilingual live-caption transcripts with incremental-caption coalescing, in-memory session retention after Stop, explicit Clear, and local TXT/SRT/VTT/JSON export.
- Manual image text translation for selected images, canvases, SVGs, dragged image regions, and eligible graphics currently visible in the viewport, using browser OCR first and bundled offline OCR otherwise while retaining separate per-image or OCR-block overlays.
- Persisted offline OCR language selection for English, Simplified Chinese, Traditional Chinese, Japanese, and Korean, with PDF page progress and local worker cleanup on Stop.
- Explicit Translate visible images command with hidden/offscreen/tiny/extension-owned filtering, duplicate-text request caching, and immediate batch cancellation when Image text stops.
- 100+ target language choices in settings.
- 29 implemented provider adapters: Google Translate, MyMemory, DeepL, Microsoft Translator, OpenAI-compatible, Gemini, DeepSeek, OpenRouter, Groq, Qwen, Zhipu GLM/ChatGLM, SiliconFlow, Ollama, Claude, Azure OpenAI, LibreTranslate, Yandex Cloud Translate, NiuTrans, Caiyun Translate, ModernMT, Lingvanex, Naver Papago, Baidu Translate, Volcengine Translate, Alibaba Machine Translation, Amazon Translate, IBM Watson Language Translator, Youdao Translate, and SYSTRAN Translate.
- AI translation controls for AI-capable providers, including opt-in neighboring page/document context, nine domain experts, normalized terminology mappings, custom instructions, and context-aware cache isolation.
- Local-only API credential storage with masked settings summaries for API keys, client/application IDs, and temporary session tokens; explicit configured-host approval; keyless Ollama configuration; and no credentialed-provider fallback to unrelated services.
- Provider-specific target-language filtering for published narrow capability sets, including DeepL and Caiyun, with Simplified/Traditional Chinese mappings preserved.
- Automated request-contract coverage for every implemented provider adapter. Credentialed services still require valid user accounts and provider-side live availability.
- Built-in CET4, CET6, GRE, IELTS, and TOEFL vocabulary dictionaries.
- Vocabulary notebook, review page, learning progress, import/export, and settings.
- Local-first data storage through Chrome storage, with Chrome sync support when enabled in the browser profile.
- Store listing draft, privacy policy, release checklist, and screenshot guide.

### Verification

Verified on 2026-07-18:

- `tsc --noEmit`: passed.
- `eslint src --ext .ts,.js`: passed.
- `jest --runInBand --silent`: passed, 49 test suites and 376 tests.
- `webpack --mode=production`: passed.
- `chrome-translation-extension.zip`: regenerated from `dist`.

Expected build warnings:

- Built-in vocabulary JSON files exceed the default webpack asset-size recommendation.
- The PDF.js document bundle and worker also exceed the recommendation because PDF parsing, rendering, fonts, and character maps are shipped locally instead of loaded from a CDN.
- Bundled OCR language models and WebAssembly cores also exceed the recommendation because recognition runs locally without an OCR server.
- These warnings are accepted because the dictionaries, PDF runtime, and OCR runtime are bundled product data.

### Local Install Package

- Unpacked extension folder: `dist`
- Test package: `chrome-translation-extension.zip`
- ZIP size: `17,729,941` bytes
- SHA-256: `8A1731A34C50D8AA0460EDEA59F95E1655CB97101825B773BD69B71A441AAA9A`

Keep generated package artifacts out of git unless a release process explicitly requires attaching them.
