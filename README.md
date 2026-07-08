# LexiBridge Translate

LexiBridge Translate is a Chrome extension for reading real web pages in another language while turning unknown words into review material.

It keeps the existing translation workflow, built-in exam vocabularies, vocabulary notebook, review page, progress tracking, import/export, and settings. Page translation is user-controlled: use the popup or the manual floating button to start or stop translation.

## Product Positioning

LexiBridge is built around one idea: translate while you read, then review what you did not know.

It is best for:

- Reading English web pages, technical articles, documentation, and study material.
- Translating pasted or uploaded text documents, HTML files, subtitle files, and simple text-based PDFs.
- Translating video captions when the page exposes subtitle or caption tracks.
- Translating live caption text that is already visible in a page.
- Translating text from selected images, SVGs, and canvases when readable text or browser OCR is available.
- Collecting useful words from real context.
- Reviewing CET4, CET6, GRE, IELTS, TOEFL vocabulary.
- Keeping a local-first vocabulary notebook with Chrome storage sync support.

It is not marketed as a full scanned-PDF OCR translator, automatic whole-page image reader, audio transcription service, or meeting bot that records or joins calls.

## Core Features

### Web Page Translation

- Translate page text from the extension popup or the floating page button.
- Keep translation mode off until the user explicitly enables it.
- Turn translation mode off immediately to remove added page translations.
- Show page translation progress without blocking the whole page.
- Choose page display mode: bilingual, translation only, or original only.
- Choose from 100+ target language options in settings.
- Use Google Translate or MyMemory today, with a 20+ provider roadmap tracked for future engine expansion.

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
- Paste text or upload `.txt`, `.md`, `.html`, `.htm`, `.srt`, `.vtt`, or simple text-based `.pdf` files.
- Translate document blocks manually with bilingual, translation-only, or original-only display.
- Extract readable HTML body blocks while skipping scripts, styles, and markup.
- Preserve page and coordinate metadata for simple text-based PDF layout blocks.
- Scanned PDFs and full PDF visual rendering are planned for later OCR/document layout batches.

### Video Subtitle Translation

- Start or stop video subtitle translation manually from the popup.
- Translate active caption or subtitle cues when the current video exposes browser text tracks.
- Render a bilingual subtitle overlay without recording audio or blocking playback.
- Site-specific video support and subtitle export are planned for later batches.

### Live Caption Translation

- Start or stop live caption translation manually from the popup.
- Translate caption text that is already present in the page DOM, such as browser or meeting-page live captions.
- Render a bilingual overlay without recording audio, joining calls, or creating transcripts.
- Site-specific meeting caption adapters are planned for later batches.

### Image Text Translation

- Start or stop image text translation manually from the popup.
- Click an image, canvas, or SVG to translate extracted text.
- Drag over an image or canvas to translate only the selected region, useful for comic speech bubbles or dense screenshots.
- Use browser `TextDetector` OCR when available, with SVG text and image accessibility text as fallbacks.
- Render separate translation overlays for detected OCR text blocks when the browser provides bounding boxes.
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

### Translate Video Subtitles

1. Open a page with a video that has captions or subtitles.
2. Open the extension popup.
3. Click Start in Video subtitles.
4. Click the same control again to remove the overlay and stop subtitle translation.

### Translate Live Captions

1. Open a page that is already showing live captions.
2. Open the extension popup.
3. Click Start in Live captions.
4. Click the same control again to remove the overlay and stop live caption translation.

### Translate Image Text

1. Open the extension popup.
2. Click Start in Image text.
3. Click an image, canvas, or SVG that contains readable text, or drag over a specific image region.
4. Click the same control again to exit image text translation mode.

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
