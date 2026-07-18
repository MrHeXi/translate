# LexiBridge Translate Privacy Policy

Last updated: 2026-07-17

LexiBridge Translate is a browser extension for user-triggered page translation, side-panel text translation, document text translation, selected or currently visible image text translation, video subtitle text translation, explicit local-media or current-tab audio transcription, live caption text translation and local transcript export, selection translation, vocabulary collection, and vocabulary review.

## Data Stored by the Extension

LexiBridge uses Chrome storage for product functionality:

- Settings: target language, translation provider, translation appearance and scope, domain-specific translation rules, enabled dictionaries, floating button visibility, and related preferences.
- Vocabulary notebook: saved words, translations, examples, dictionary type, mastery level, review count, and review schedule.
- Learning stats: daily goal, streaks, review accuracy, time spent learning, and dictionary progress.
- Cached data: built-in dictionary progress and temporary translation cache used to reduce repeated requests during a session.
- Translation provider credentials: API keys, client/application IDs, and provider-specific endpoint, model, or region settings entered by the user.

Chrome storage may sync data through the user's browser profile if Chrome sync is enabled. LexiBridge does not run its own account server.

Translation provider API keys and client/application IDs are stored separately in `chrome.storage.local`. They are not written to Chrome Sync, learning-data exports, translation cache keys, or extension logs. The settings page receives only masked credential summaries and never reads saved full credentials back from storage.

## Translation Provider Requests

Translation provider requests happen only after the user asks LexiBridge to translate side-panel text, run an AI side-panel writing action, transcribe a selected local media file or an explicitly captured current-tab recording, translate selected text, document text, selected image text, eligible currently visible image text, available video subtitle text, visible live caption text, or a page.

When the user submits text from the side panel, runs a side-panel writing action, translates selected text, starts page translation, translates a document in the document translator, manually starts image text translation and then clicks an image, drags over an image region, or clicks Translate visible images, manually starts video subtitle translation for a page with available caption tracks, or manually starts live caption translation for caption text already visible on a page, LexiBridge sends the requested text to the selected translation provider. Polish, rewrite, compose, reply, and summary actions send the entered text, selected output language, tone, length, and optional additional requirement to the configured AI provider chosen by the user. These writing requests are not sent to ordinary machine-translation providers.

The subtitle generator accepts either a user-selected local file or a current-tab recording started by an explicit Capture current tab click. Opening the generator, visiting a media page, or selecting a local file does not capture or upload audio. Chrome grants the declared `tabCapture` permission at installation, but LexiBridge invokes it only after Capture current tab. It records only the source tab that opened the generator and runs only while the generator page remains open. The source audio is routed back to local playback during capture. Cancel, generator-page close, capture failure, or the 25 MB limit stops the media tracks and discards the temporary recording. Clicking Stop and generate turns the in-memory recording into a local WebM file for the same transcription workflow.

After Generate subtitles or Stop and generate, the extension sends the selected or captured file directly to the configured OpenAI or Groq-compatible transcription endpoint. Files are limited to 25 MB and transferred to the background in ordered 256 KB chunks over a temporary extension connection. The selected spoken language and optional vocabulary/context prompt are included in the transcription request. Media bytes stay in memory only, are not written to Chrome storage, and are cleared after transcription completes, the user cancels, the connection closes, or an error occurs. An active provider request is aborted on cancellation or disconnection. Generated transcript segments and optional translations remain in the subtitle-generator page only and are used for local SRT/VTT export; they are not saved as a subtitle history.

Pre-granted provider hosts:

- `translate.googleapis.com`
- `api.mymemory.translated.net`
- `api-free.deepl.com` and `api.deepl.com`
- `api.cognitive.microsofttranslator.com`
- `api.openai.com`
- `generativelanguage.googleapis.com`

Additional implemented providers use a user-approved host permission when their configuration is saved. Their defaults include `api.deepseek.com`, `openrouter.ai`, `api.groq.com`, `dashscope.aliyuncs.com`, `open.bigmodel.cn`, `api.siliconflow.cn`, `api.anthropic.com`, `libretranslate.com`, `translate.api.cloud.yandex.net`, `api.niutrans.com`, `api.interpreter.caiyunai.com`, `api.modernmt.com`, and `api-b2b.backenster.com`. Azure OpenAI uses the deployment host entered by the user. Ollama may use `localhost` or `127.0.0.1`, and LibreTranslate or another compatible provider may use a user-selected self-hosted endpoint.

Users may configure a custom HTTPS endpoint, or an HTTP endpoint on `localhost` or `127.0.0.1` for a local service. When the user saves provider configuration, the extension asks Chrome for optional access to that endpoint's scheme and hostname. Chrome host match patterns cover all paths on the approved host and do not restrict permission to one URL path or port. The extension does not request a provider host until the user saves that provider configuration.

For providers that require credentials, the API key and any required client/application ID are sent directly to the selected provider using that provider's authentication contract. LexiBridge does not send those credentials to an application server operated by this project. Credentialed provider failures are returned to the user and are not silently forwarded to Google Translate or MyMemory.

The extension sends the text needed for the requested translation and the selected target language. Uploaded document files are read locally in the browser; the extension sends only the extracted text blocks that the user asks to translate. HTML files are parsed locally so readable body text can be translated without sending scripts, styles, or markup as separate content. JSON files are parsed locally to extract readable string values; LexiBridge does not execute JSON content or rewrite JSON structure. DOCX and EPUB files are read locally as document archives so readable paragraph or spine text can be extracted; translated exports are generated as new local files and do not overwrite the uploaded source. Uploaded subtitle files are parsed locally to keep cue timing for local translated `.srt` or `.vtt` export. PDFs are parsed and rendered locally with bundled Mozilla PDF.js code, character maps, and standard fonts. PDF text coordinates, inferred column regions, reading order, and page dimensions stay local. Likely standalone formulas are identified locally, kept in their original form, and excluded from translation-provider requests. Image-only pages are passed to the browser's local `TextDetector` when available and otherwise to the bundled Tesseract worker. English, Simplified Chinese, Traditional Chinese, Japanese, and Korean OCR model files ship inside the extension and do not contact an OCR server. A translated PDF export is generated locally from rendered page images and positioned translations. Only extracted PDF or OCR prose selected for translation is sent to the chosen translation provider. Image text translation extracts text locally from browser OCR, bundled offline OCR, SVG text, or image accessibility text, then sends only the extracted text after the user clicks an image, selects a region, or explicitly runs Translate visible images. A visible-image batch considers only eligible graphics intersecting the current viewport and skips hidden, offscreen, tiny, and extension-owned graphics. OCR bounding boxes and recognition confidence stay local and are used to position image-region overlays. The local OCR worker is terminated when image mode stops or PDF analysis finishes. Existing-page video subtitle and live caption translation send caption text only after the user turns the feature on; those two modes do not upload audio or request speech transcription. Meeting-style live caption adapters keep speaker labels locally when available, but send only the caption text for translation. While Live captions is enabled, the current tab keeps timestamped original and translated cues in memory so the user can explicitly download TXT, SRT, VTT, or JSON. These cues are not written to Chrome storage and are removed by Clear, page close, or extension cleanup. Existing-page video subtitle and live caption transcript exports are local downloads. Those caption-text modes do not record audio, join calls, or transcribe meeting speech. Current-tab recording is a separate subtitle-generator action and never starts from Video subtitles or Live captions. Translation and transcription provider handling is governed by each provider's own terms and privacy practices.

For AI-capable provider translation, domain choice, terminology mappings, and custom translation instructions are included in the AI request when configured. Neighboring page or document context is disabled by default. If the user enables it, LexiBridge sends a bounded window of nearby text with each manually requested page or document block so the AI provider can resolve ambiguity. The request identifies that context as reference-only data and asks the model not to output it. Side-panel AI writing requests identify entered source material separately from an explicit optional instruction and ask the model not to treat source material as instructions. Side-panel source text, results, tone, length, and additional requirements are not stored as a writing history. Glossary and prompt settings may sync through Chrome storage; API keys remain local-only.

## No Default Telemetry

No default telemetry is collected. LexiBridge does not send usage analytics, learning stats, browsing history, saved vocabulary, or review data to an application analytics service by default.

If optional analytics are added later, they must be opt-in and documented before release.

## Page Access

The extension runs a content script on pages so it can show the floating button, translate selected text, highlight enabled dictionary words, and insert user-requested page translations. The Chrome side panel is an extension page and does not read the active web page. Opening it loads settings and masked provider configuration summaries only; opening it or changing text-action modes does not send source text to a provider. A request is sent only after the user submits translation or AI writing input.

LexiBridge does not translate pages automatically. Page translation starts only after user action from the popup or floating button. Image text, video subtitle, and live caption translation also start only after user action from the popup. Opening the subtitle generator or selecting a local media file does not upload it; transcription starts only after Generate subtitles. Current-tab recording starts only after Capture current tab, and provider upload starts only after Stop and generate. Opening or scrolling a page never starts image OCR; the visible-image batch requires a separate click after Image text mode is enabled, and Stop prevents further images from being processed.

Optional site rules are stored as ordinary settings. They contain user-entered domain patterns, display preferences, and CSS selectors, but no browsing history. Rules may block manual page translation or change how a manually translated page is displayed; they do not trigger translation on page load.

Main-content detection runs locally in the page after the user starts translation. It uses page structure and local text/link density to choose a reading region; it does not send page structure, selectors, or detection scores to a translation provider.

## Permissions

LexiBridge requests these permissions:

- `storage`: save settings, vocabulary, learning progress, and review state.
- `activeTab`: interact with the current tab after user action.
- `scripting`: inject or refresh extension scripts and styles when needed.
- `tabs`: find the active tab and send extension messages.
- `sidePanel`: show the user-invoked text translation panel from the popup or `Alt+S` command.
- `tabCapture`: required so Chrome can authorize the source tab when the extension popup is invoked; the API is called only after Capture current tab and stops on Stop, Cancel, generator close, failure, or the 25 MB limit.

Required host permissions are limited to the pre-granted translation provider endpoints listed above. Optional host permission patterns let the user approve the scheme and hostname for an additional configured HTTPS or localhost translation endpoint.

## Data Export and Deletion

Users can export learning data from the extension. Provider API keys and client/application IDs are excluded from that export. Users can remove an individual provider configuration in settings, clear vocabulary, reset settings, or remove all extension data through Chrome's extension management and site data controls.

## Contact

For privacy questions, use the repository issue tracker or the support channel configured in the Chrome Web Store listing.
