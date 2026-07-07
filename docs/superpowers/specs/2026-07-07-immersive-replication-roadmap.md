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

## Planned Batches

### Batch A: Web Interaction Parity

- Add modifier-key hover paragraph translation.
- Add input box translation shortcut.
- Keep page translation user-triggered.
- Verify no automatic translation happens on page load.

### Batch B: Bilingual Page Layout

- Improve page translation from inserted blocks to configurable bilingual layout.
- Add per-page display mode controls: original only, translation only, bilingual.
- Preserve restore behavior.

### Batch C: Translation Engine Expansion

- Add a provider registry for multiple engines.
- Add provider capability metadata and failure fallback.
- Keep Google and MyMemory as existing providers.

### Batch D: PDF and Document Translation

- Detect PDF/document pages or uploads.
- Extract text while preserving reading order where possible.
- Render bilingual overlays or translated text blocks.
- Document limitations for scanned PDFs until OCR is available.

### Batch E: Video Subtitle Translation

- Detect subtitle/caption tracks on common video pages.
- Translate active subtitle cues.
- Render bilingual subtitle overlays without blocking playback.

### Batch F: Image, Manga, and OCR Translation

- Add user-triggered image selection.
- Extract text through OCR.
- Render translated overlays.
- Keep all OCR-triggering actions explicit.

### Batch G: Meeting Subtitle Translation

- Detect live captions when available in the page DOM.
- Translate caption text in near real time.
- Avoid recording or storing meeting audio.

## Non-Negotiable Product Rules

- Do not auto-translate a page on load.
- Do not weaken existing learning functions.
- Do not claim a feature in store copy before it is implemented and verified.
- Each batch must have tests or documented acceptance checks.
- Each batch must be verified, packaged when runtime code changes, committed, and pushed before moving to the next batch.
