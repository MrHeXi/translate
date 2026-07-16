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
- Side-panel initialization loads settings only and never sends a translation request until the user submits text.
- Document translator for pasted text, text files, HTML, JSON, DOCX, EPUB, subtitle files, and PDFs, with bundled PDF.js page rendering, positioned text extraction, browser-plus-bundled offline OCR for image-only pages, side-by-side original/translated previews, and flattened translated-PDF export.
- Video subtitle translation for pages that expose caption/subtitle text tracks or common DOM-rendered caption containers.
- SRT export for translated video subtitle cues from the current session.
- Live caption translation for caption text already visible in the page DOM, with Google Meet, Zoom, Microsoft Teams, and Webex-style speaker label handling.
- Timestamped bilingual live-caption transcripts with incremental-caption coalescing, in-memory session retention after Stop, explicit Clear, and local TXT/SRT/VTT/JSON export.
- Manual image text translation for selected images, canvases, SVGs, dragged image regions, and eligible graphics currently visible in the viewport, using browser OCR first and bundled offline OCR otherwise while retaining separate per-image or OCR-block overlays.
- Persisted offline OCR language selection for English, Simplified Chinese, Traditional Chinese, Japanese, and Korean, with PDF page progress and local worker cleanup on Stop.
- Explicit Translate visible images command with hidden/offscreen/tiny/extension-owned filtering, duplicate-text request caching, and immediate batch cancellation when Image text stops.
- 100+ target language choices in settings.
- 21 implemented provider adapters: Google Translate, MyMemory, DeepL, Microsoft Translator, OpenAI-compatible, Gemini, DeepSeek, OpenRouter, Groq, Qwen, Zhipu GLM, SiliconFlow, Ollama, Claude, Azure OpenAI, LibreTranslate, Yandex Cloud Translate, NiuTrans, Caiyun Translate, ModernMT, and Lingvanex.
- AI translation controls for AI-capable providers, including opt-in neighboring page/document context, nine domain experts, normalized terminology mappings, custom instructions, and context-aware cache isolation.
- Local-only API credential storage with masked settings summaries, explicit configured-host approval, keyless Ollama configuration, and no credentialed-provider fallback to unrelated services.
- Provider-specific target-language filtering for published narrow capability sets, including DeepL and Caiyun, with Simplified/Traditional Chinese mappings preserved.
- Automated request-contract coverage for every implemented provider adapter. Credentialed services still require valid user accounts and provider-side live availability.
- Built-in CET4, CET6, GRE, IELTS, and TOEFL vocabulary dictionaries.
- Vocabulary notebook, review page, learning progress, import/export, and settings.
- Local-first data storage through Chrome storage, with Chrome sync support when enabled in the browser profile.
- Store listing draft, privacy policy, release checklist, and screenshot guide.

### Verification

Verified on 2026-07-17:

- `tsc --noEmit`: passed.
- `eslint src --ext .ts,.js`: passed.
- `jest --runInBand --silent`: passed, 44 test suites and 314 tests.
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
- ZIP size: `17,694,408` bytes
- SHA-256: `2CE049151C7C71AB21852DC6B06B6203695D0D152A19D5DC91C6F3D849585704`

Keep generated package artifacts out of git unless a release process explicitly requires attaching them.
