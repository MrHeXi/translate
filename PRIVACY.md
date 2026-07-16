# LexiBridge Translate Privacy Policy

Last updated: 2026-07-17

LexiBridge Translate is a browser extension for user-triggered page translation, document text translation, selected or currently visible image text translation, video subtitle text translation, live caption text translation and local transcript export, selection translation, vocabulary collection, and vocabulary review.

## Data Stored by the Extension

LexiBridge uses Chrome storage for product functionality:

- Settings: target language, translation provider, translation appearance and scope, domain-specific translation rules, enabled dictionaries, floating button visibility, and related preferences.
- Vocabulary notebook: saved words, translations, examples, dictionary type, mastery level, review count, and review schedule.
- Learning stats: daily goal, streaks, review accuracy, time spent learning, and dictionary progress.
- Cached data: built-in dictionary progress and temporary translation cache used to reduce repeated requests during a session.
- Translation provider credentials: API keys and provider-specific endpoint, model, or region settings entered by the user.

Chrome storage may sync data through the user's browser profile if Chrome sync is enabled. LexiBridge does not run its own account server.

Translation provider API keys are stored separately in `chrome.storage.local`. They are not written to Chrome Sync, learning-data exports, translation cache keys, or extension logs. The settings page receives only a masked key summary and never reads a saved full key back from storage.

## Translation Provider Requests

Translation provider requests happen only after the user asks LexiBridge to translate selected text, document text, selected image text, eligible currently visible image text, available video subtitle text, visible live caption text, or a page.

When the user translates selected text, starts page translation, translates a document in the document translator, manually starts image text translation and then clicks an image, drags over an image region, or clicks Translate visible images, manually starts video subtitle translation for a page with available caption tracks, or manually starts live caption translation for caption text already visible on a page, LexiBridge sends the requested text to the selected translation provider.

Pre-granted provider hosts:

- `translate.googleapis.com`
- `api.mymemory.translated.net`
- `api-free.deepl.com` and `api.deepl.com`
- `api.cognitive.microsofttranslator.com`
- `api.openai.com`
- `generativelanguage.googleapis.com`

Additional implemented providers use a user-approved host permission when their configuration is saved. Their defaults include `api.deepseek.com`, `openrouter.ai`, `api.groq.com`, `dashscope.aliyuncs.com`, `open.bigmodel.cn`, `api.siliconflow.cn`, `api.anthropic.com`, `libretranslate.com`, `translate.api.cloud.yandex.net`, `api.niutrans.com`, `api.interpreter.caiyunai.com`, `api.modernmt.com`, and `api-b2b.backenster.com`. Azure OpenAI uses the deployment host entered by the user. Ollama may use `localhost` or `127.0.0.1`, and LibreTranslate or another compatible provider may use a user-selected self-hosted endpoint.

Users may configure a custom HTTPS endpoint, or an HTTP endpoint on `localhost` or `127.0.0.1` for a local service. When the user saves provider configuration, the extension asks Chrome for optional access to that endpoint's scheme and hostname. Chrome host match patterns cover all paths on the approved host and do not restrict permission to one URL path or port. The extension does not request a provider host until the user saves that provider configuration.

For providers that require credentials, the API key is sent directly to the selected provider in the provider's authentication header. LexiBridge does not send that key to an application server operated by this project. Credentialed provider failures are returned to the user and are not silently forwarded to Google Translate or MyMemory.

The extension sends the text needed for the requested translation and the selected target language. Uploaded document files are read locally in the browser; the extension sends only the extracted text blocks that the user asks to translate. HTML files are parsed locally so readable body text can be translated without sending scripts, styles, or markup as separate content. JSON files are parsed locally to extract readable string values; LexiBridge does not execute JSON content or rewrite JSON structure. DOCX and EPUB files are read locally as document archives so readable paragraph or spine text can be extracted; translated exports are generated as new local files and do not overwrite the uploaded source. Uploaded subtitle files are parsed locally to keep cue timing for local translated `.srt` or `.vtt` export. PDFs are parsed and rendered locally with bundled Mozilla PDF.js code, character maps, and standard fonts. PDF text coordinates and page dimensions stay local; image-only pages are passed to the browser's local `TextDetector` when available and otherwise to the bundled Tesseract worker. English, Simplified Chinese, Traditional Chinese, Japanese, and Korean OCR model files ship inside the extension and do not contact an OCR server. A translated PDF export is generated locally from rendered page images and positioned translations. Only extracted PDF or OCR text selected for translation is sent to the chosen translation provider. Image text translation extracts text locally from browser OCR, bundled offline OCR, SVG text, or image accessibility text, then sends only the extracted text after the user clicks an image, selects a region, or explicitly runs Translate visible images. A visible-image batch considers only eligible graphics intersecting the current viewport and skips hidden, offscreen, tiny, and extension-owned graphics. OCR bounding boxes and recognition confidence stay local and are used to position image-region overlays. The local OCR worker is terminated when image mode stops or PDF analysis finishes. Video subtitle and live caption translation send caption text only after the user turns the feature on. Meeting-style live caption adapters keep speaker labels locally when available, but send only the caption text for translation. While Live captions is enabled, the current tab keeps timestamped original and translated cues in memory so the user can explicitly download TXT, SRT, VTT, or JSON. These cues are not written to Chrome storage and are removed by Clear, page close, or extension cleanup. Video subtitle and live caption transcript exports are local downloads; they do not upload audio or request a speech transcription service. LexiBridge does not record audio, join calls, or transcribe speech for these features. Translation provider handling is governed by the provider's own terms and privacy practices.

For AI-capable provider translation, domain choice, terminology mappings, and custom translation instructions are included in the AI request when configured. Neighboring page or document context is disabled by default. If the user enables it, LexiBridge sends a bounded window of nearby text with each manually requested page or document block so the AI provider can resolve ambiguity. The request identifies that context as reference-only data and asks the model not to output it. Glossary and prompt settings may sync through Chrome storage; API keys remain local-only.

## No Default Telemetry

No default telemetry is collected. LexiBridge does not send usage analytics, learning stats, browsing history, saved vocabulary, or review data to an application analytics service by default.

If optional analytics are added later, they must be opt-in and documented before release.

## Page Access

The extension runs a content script on pages so it can show the floating button, translate selected text, highlight enabled dictionary words, and insert user-requested page translations.

LexiBridge does not translate pages automatically. Page translation starts only after user action from the popup or floating button. Image text, video subtitle, and live caption translation also start only after user action from the popup. Opening or scrolling a page never starts image OCR; the visible-image batch requires a separate click after Image text mode is enabled, and Stop prevents further images from being processed.

Optional site rules are stored as ordinary settings. They contain user-entered domain patterns, display preferences, and CSS selectors, but no browsing history. Rules may block manual page translation or change how a manually translated page is displayed; they do not trigger translation on page load.

Main-content detection runs locally in the page after the user starts translation. It uses page structure and local text/link density to choose a reading region; it does not send page structure, selectors, or detection scores to a translation provider.

## Permissions

LexiBridge requests these permissions:

- `storage`: save settings, vocabulary, learning progress, and review state.
- `activeTab`: interact with the current tab after user action.
- `scripting`: inject or refresh extension scripts and styles when needed.
- `tabs`: find the active tab and send extension messages.

Required host permissions are limited to the pre-granted translation provider endpoints listed above. Optional host permission patterns let the user approve the scheme and hostname for an additional configured HTTPS or localhost translation endpoint.

## Data Export and Deletion

Users can export learning data from the extension. Provider API keys are excluded from that export. Users can remove an individual provider configuration in settings, clear vocabulary, reset settings, or remove all extension data through Chrome's extension management and site data controls.

## Contact

For privacy questions, use the repository issue tracker or the support channel configured in the Chrome Web Store listing.
