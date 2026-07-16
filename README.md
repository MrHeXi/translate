# LexiBridge Translate

LexiBridge Translate is a Chrome extension for reading real web pages in another language while turning unknown words into review material.

It keeps the existing translation workflow, built-in exam vocabularies, vocabulary notebook, review page, progress tracking, import/export, and settings. Page translation is user-controlled: use the popup or the manual floating button to start or stop translation.

## Product Positioning

LexiBridge is built around one idea: translate while you read, then review what you did not know.

It is best for:

- Reading English web pages, technical articles, documentation, and study material.
- Translating pasted or uploaded text documents, HTML files, JSON files, DOCX files, EPUB files, subtitle files, and simple text-based PDFs.
- Translating video captions when the page exposes subtitle/caption tracks or common DOM-rendered captions.
- Translating and locally exporting live caption text that is already visible in a page.
- Translating text from selected or currently visible images, SVGs, and canvases when readable text or browser OCR is available.
- Collecting useful words from real context.
- Reviewing CET4, CET6, GRE, IELTS, TOEFL vocabulary.
- Keeping a local-first vocabulary notebook with Chrome storage sync support.

It is not marketed as a full scanned-PDF OCR translator, layout-perfect Office/eBook converter, automatic whole-page image reader, audio transcription service, or meeting bot that records or joins calls.

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
- Use Google Translate or MyMemory without a key, or configure DeepL, Microsoft Translator, an OpenAI-compatible endpoint, or Google Gemini with your own API credentials.
- Keep provider API keys in local Chrome storage only; keys are excluded from Chrome sync and learning-data exports.

### Selection Translation

- Select text on a page to show a translation tooltip.
- Add useful words to the vocabulary notebook.
- Use the selected text as learning material instead of a one-time lookup.

### Hover and Input Translation

- Hold Control while hovering over a readable paragraph to translate it in place.
- Type three trailing spaces in a supported input box, textarea, or editable field to translate the typed text.
- Keep both interactions deliberate so pages and forms are never translated automatically.

### Document Translation

- Open the document translator from the popup or from detected document URLs.
- Paste text or upload `.txt`, `.md`, `.html`, `.htm`, `.json`, `.docx`, `.epub`, `.srt`, `.vtt`, or simple text-based `.pdf` files.
- Translate document blocks manually with bilingual, translation-only, or original-only display.
- Extract readable HTML body blocks while skipping scripts, styles, and markup.
- Extract readable string values from JSON files.
- Export translated JSON files with the original object and array structure preserved.
- Extract readable text from DOCX paragraphs and EPUB spine documents.
- Export translated DOCX files by writing translated paragraph text back into the original document archive.
- Export translated EPUB files by writing translated readable blocks back into the original book archive.
- Export translated `.srt` and `.vtt` subtitle files with their original timing preserved.
- Preserve page and coordinate metadata for simple text-based PDF layout blocks.
- Scanned PDFs, full PDF visual rendering, and full layout-perfect Office/eBook conversion are planned for later OCR/document layout batches.

### Video Subtitle Translation

- Start or stop video subtitle translation manually from the popup.
- Translate active caption or subtitle cues when the current video exposes browser text tracks or common DOM-rendered captions.
- Render a bilingual subtitle overlay without recording audio or blocking playback.
- Export translated subtitle cues from the current session as an `.srt` file.
- Deeper site-specific video support, AI subtitle generation, and richer timing controls are planned for later batches.

### Live Caption Translation

- Start or stop live caption translation manually from the popup.
- Translate caption text that is already present in the page DOM, such as browser or meeting-page live captions.
- Preserve common meeting speaker labels while translating Google Meet, Zoom, Microsoft Teams, and Webex-style caption containers.
- Capture timestamped bilingual cues only while Live captions is enabled, coalescing incremental word-by-word caption updates.
- Export the current tab's in-memory transcript as TXT, SRT, VTT, or structured JSON, and clear it explicitly from the popup.
- Keep transcript capture local to the current page session without recording audio, joining calls, or transcribing speech.
- Broader site-specific meeting adapters remain planned for later batches.

### Image Text Translation

- Start or stop image text translation manually from the popup.
- Click an image, canvas, or SVG to translate extracted text.
- Drag over an image or canvas to translate only the selected region, useful for comic speech bubbles or dense screenshots.
- Click Translate visible images to process eligible images, canvases, and SVGs currently intersecting the viewport.
- Skip hidden, offscreen, tiny, and extension-owned graphics during a visible-image batch, and stop the batch as soon as image mode is turned off.
- Use browser `TextDetector` OCR when available, with SVG text and image accessibility text as fallbacks.
- Render separate translation overlays for detected OCR text blocks when the browser provides bounding boxes.
- Keep every OCR action explicit; opening or scrolling a page never starts image translation.
- Full scanned-document OCR and automatic manga panel segmentation are planned for later batches.

### Vocabulary Learning

- Built-in dictionaries: CET4, CET6, GRE, IELTS, TOEFL.
- Highlight enabled dictionary words on pages.
- Track vocabulary progress and mastery.
- Review due words and new built-in words from the review page.

### Data Management

- Store settings, vocabulary, review progress, and learning stats in Chrome storage.
- Use Chrome sync where available.
- Export and import learning data.
- Store user-supplied translation provider API keys only in `chrome.storage.local`, with masked summaries in the settings UI.
- Keep default telemetry off.

## Install for Local Testing

1. Build the extension:

```bash
npm run build
```

2. Open Chrome and go to `chrome://extensions/`.
3. Enable Developer mode.
4. Choose `Load unpacked`.
5. Select the `dist` folder from this repository.

The generated test package is `chrome-translation-extension.zip`.

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
3. Add useful words to the vocabulary notebook when needed.

### Translate While Hovering

1. Hover over a paragraph on a regular web page.
2. Hold Control to insert an on-demand translation below that paragraph.

### Translate in an Input Box

1. Type text into a supported input, textarea, or editable field.
2. Press Space three times at the end of the text.
3. LexiBridge replaces the typed text with the translation.

### Configure a Translation Provider

1. Open the options page and choose DeepL, Microsoft Translator, OpenAI compatible, or Google Gemini.
2. Enter the provider API key and any provider-specific endpoint, model, or region setting.
3. Save credentials before saving that provider as the active translation engine.
4. A custom OpenAI-compatible or DeepL endpoint must use HTTPS, except for HTTP endpoints on localhost. LexiBridge requests access only to that endpoint's origin.

Google Translate and MyMemory remain available without user credentials. Credentialed providers do not silently fall back to another service when authentication or configuration fails.

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

### Translate Subtitle Files

1. Open the document translator.
2. Choose a `.srt` or `.vtt` subtitle file.
3. Click Translate document.
4. Click Export subtitles to download a translated subtitle file with the original cue timing.

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

### Translate Live Captions

1. Open a page that is already showing live captions.
2. Open the extension popup.
3. Click Start in Live captions.
4. Reopen the popup to export captured bilingual cues as TXT, SRT, VTT, or JSON, or clear the current tab's transcript.
5. Click Stop to remove the overlay and stop capturing new cues; already captured cues remain available until cleared or the page closes.

### Translate Image Text

1. Open the extension popup.
2. Click Start in Image text.
3. Click an image, canvas, or SVG, drag over a specific image region, or click Translate visible images to process eligible graphics in the current viewport.
4. Click Stop to cancel any active visible-image batch, remove its overlays, and exit image text translation mode.

### Study Vocabulary

1. Open the options page and enable the dictionaries you care about.
2. Browse English content and collect words from context.
3. Open the vocabulary page to manage saved words.
4. Open the review page to practice due or new words.

## Development

### Requirements

- Node.js 16+
- npm 8+
- Chrome

### Commands

```bash
npm install
npm run type-check
npm run lint
npm test
npm run build
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

See `RELEASE_CHECKLIST.md` before packaging or submitting to Chrome Web Store.

## Privacy

See `PRIVACY.md` for storage, sync, translation provider, and telemetry details.

## License

MIT License.
