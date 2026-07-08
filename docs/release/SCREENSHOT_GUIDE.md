# LexiBridge Translate Screenshot Guide

Use this guide to capture Chrome Web Store screenshots from the verified local build in `dist`.

## Setup

1. Run the release quality gates and production build.
2. Load the unpacked extension from `dist` in Chrome.
3. Use a regular web page with readable English content. Browser-owned pages such as `chrome://` URLs do not show content-script UI.
4. Avoid pages with private data, account names, notifications, or unrelated browser extensions.
5. Keep the capture style consistent: same browser theme, no developer tools, and a clean page zoom level.

## Required Screenshots

### Popup Overview

Capture the extension popup with:

- The Start/Stop translation control visible.
- Active dictionary count visible.
- Recent saved words or the empty learning state visible.

### Floating Button

Capture a normal web page before translation starts with:

- The bottom-right floating button visible.
- The "Translate page" hint visible.
- No translated page text yet, to show that translation is user-triggered.

### Manual Page Translation

Capture the same page immediately after clicking Start with:

- Page translation progress visible near the top.
- No full-page blocking overlay.
- The floating button in the Stop state.

### Selection Translation

Capture selected text on a page with:

- The translation tooltip visible.
- The save-to-vocabulary action visible.
- The tooltip positioned inside the viewport with comfortable margins.

### Hover Translation

Capture a readable paragraph after holding Control while hovering with:

- The generated hover translation visible below the paragraph.
- The original paragraph still visible.
- No page-wide translation mode active.

### Input Box Translation

Capture a supported input box, textarea, or editable field with:

- The deliberate three-space shortcut described in nearby test notes or release notes, not as visible page text.
- The translated text inserted back into the field.
- No private form data visible.

### Document Translator

Capture the document translator page with:

- Source text or a safe sample document loaded.
- Bilingual translated blocks visible.
- Target language, provider, and display mode controls visible.
- For an HTML sample, readable body text blocks visible without raw tags or script/style content.
- For a text-based PDF sample, page and coordinate metadata visible on translated blocks.

### Video Subtitles

Capture a regular video page with available captions after manually starting Video subtitles from the popup:

- The bilingual subtitle overlay visible.
- The Export SRT control visible if the current session has translated subtitle cues to demonstrate local subtitle export.
- Playback controls or the video context visible enough to show this is a video subtitle flow.
- No claim or visual implication that LexiBridge records audio or transcribes meetings.

### Live Captions

Capture a safe sample page where captions are already visible after manually starting Live captions from the popup:

- The bilingual live caption overlay visible.
- The original caption text visible on the page or clearly represented in the sample.
- No private names, meeting details, audio recording indicator, or transcript export claim.

### Image Text

Capture a safe sample image or SVG after manually starting Image text from the popup and clicking the image or dragging over a region:

- The image text translation overlay visible.
- If the browser OCR sample provides bounding boxes, separate region overlays visible on detected text blocks.
- The source image, canvas, or SVG visible enough to show the user-triggered click or selected region target.
- No claim that every scanned document, manga page, or image can be OCR-translated automatically.

### Vocabulary Notebook

Capture the vocabulary page with:

- Saved words visible.
- Translation, example, mastery, or review metadata visible.
- Search or filtering controls visible if the notebook has enough words.

### Review Page

Capture the review page with:

- A due or new word card visible.
- Review action buttons visible.
- Progress or review context visible.

### Options

Capture the options page with:

- Dictionary selection visible.
- Translation provider and target language controls visible.
- Floating button setting visible.

## Do Not Show

- Private browsing data or account details.
- Any claim that translation starts automatically.
- Unsupported feature claims beyond web page translation, text-based document translation, selected-text translation, vocabulary collection, review, import/export, and Chrome storage sync.
- Claims for full scanned PDF OCR, automatic manga segmentation, or layout-preserving PDF translation.
- Claims for audio transcription, automatic subtitle generation, meeting translation, or guaranteed support for every video site.
- Console errors, developer tools, or local file explorer windows.

## Final Check

Before upload, compare the screenshots with `STORE_LISTING.md` and `RELEASE_CHECKLIST.md` so the listing copy, screenshots, privacy answers, and permission explanations describe the same product.
