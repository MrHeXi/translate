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
- Translation provider registry with Google Translate and MyMemory available.
- 20+ provider definitions and 100+ target language choices for engine/language expansion.
- Configurable page display modes: bilingual, translation only, and original only.
- Document translator page for pasted/uploaded text, HTML files, subtitle files, and simple text-based PDFs.
- Manual document entry prompt on detected document URLs.
- Manual video subtitle translation for pages that expose caption or subtitle text tracks.
- Manual live caption translation for caption text already visible in the page DOM.
- Manual image text translation for selected images, canvases, and SVGs.

## Planned Batches

### Batch A: Web Interaction Parity

- Add modifier-key hover paragraph translation.
- Add input box translation shortcut.
- Keep page translation user-triggered.
- Verify no automatic translation happens on page load.

### Batch B: Bilingual Page Layout

- Done: improve page translation from inserted blocks to configurable bilingual layout.
- Done: add display mode controls: original only, translation only, bilingual.
- Done: preserve restore behavior.

### Batch C: Translation Engine Expansion

- Add a provider registry for multiple engines.
- Add provider capability metadata and failure fallback.
- Keep Google and MyMemory as existing providers.

### Batch D: PDF and Document Translation

- Done: detect document URLs and expose a manual document translator entry.
- Done: support pasted text, text files, Markdown, HTML body text extraction, subtitle files, and simple text-based PDFs.
- Done: render translated document blocks with bilingual, translation-only, or original-only display.
- Done: preserve page and coordinate metadata for simple text-based PDF layout blocks.
- Remaining: full visual PDF rendering and scanned PDF OCR.

### Batch E: Video Subtitle Translation

- Done: detect browser subtitle/caption text tracks on video pages.
- Done: translate active subtitle cues after the user starts Video subtitles from the popup.
- Done: render bilingual subtitle overlays without blocking playback.
- Remaining: site-specific optimizations, subtitle file export, and richer caption timing controls.

### Batch F: Image, Manga, and OCR Translation

- Done: add user-triggered image, canvas, and SVG selection from the popup.
- Done: extract text through browser TextDetector OCR when available, with SVG text and accessibility text fallbacks.
- Done: render translated overlays near the selected image target.
- Done: support manual drag-to-select OCR regions for images and canvases.
- Done: render separate OCR text-block overlays when the browser returns bounding boxes.
- Done: keep all OCR-triggering actions explicit.
- Remaining: full scanned-document OCR and automatic manga panel segmentation.

### Batch G: Meeting Subtitle Translation

- Done: detect live captions when available in the page DOM.
- Done: translate visible caption text in near real time after the user starts Live captions from the popup.
- Done: avoid recording, joining calls, storing audio, or generating meeting transcripts.
- Remaining: site-specific meeting caption adapters and richer speaker/timing handling.

## Non-Negotiable Product Rules

- Do not auto-translate a page on load.
- Do not weaken existing learning functions.
- Do not claim a feature in store copy before it is implemented and verified.
- Each batch must have tests or documented acceptance checks.
- Each batch must be verified, packaged when runtime code changes, committed, and pushed before moving to the next batch.
