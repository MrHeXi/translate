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
- For a JSON sample, readable string values visible with the Export JSON control after translation.
- For a DOCX sample, extracted readable text blocks visible with the Export DOCX control after translation, without implying full layout-perfect Office conversion.
- For an EPUB sample, extracted readable text blocks visible with the Export EPUB control after translation, without implying full layout-perfect eBook conversion.
- For a subtitle sample, translated cues visible with the Export subtitles control after translation.
- For a text-based PDF sample, page and coordinate metadata visible on translated blocks.

### Video Subtitles

Capture a regular video page with available text-track or DOM-rendered captions after manually starting Video subtitles from the popup:

- The bilingual subtitle overlay visible.
- The Export SRT control visible if the current session has translated subtitle cues to demonstrate local subtitle export.
- Playback controls or the video context visible enough to show this is a video subtitle flow.
- No claim or visual implication that LexiBridge records audio or transcribes meetings.

### Live Captions

Capture a safe sample page where captions are already visible after manually starting Live captions from the popup:

- The bilingual live caption overlay visible.
- The original caption text visible on the page or clearly represented in the sample, with a safe speaker label if demonstrating meeting captions.
- The cue count, TXT/SRT/VTT/JSON format menu, Export, and Clear controls visible in the popup.
- No private names, meeting details, audio recording indicator, or implication that audio is being transcribed.

### Image Text

Capture a safe sample page after manually starting Image text from the popup and clicking an image, dragging over a region, or clicking Translate visible images:

- The Translate visible images command visible in the popup, or multiple image text translation overlays visible after that explicit command.
- If the browser OCR sample provides bounding boxes, separate region overlays visible on detected text blocks.
- The source images, canvases, or SVGs visible enough to show the user-triggered targets.
- No hidden, offscreen, tiny, or extension-owned graphic presented as a translated batch result.
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
- A credentialed provider configuration panel may be shown with only a masked key summary; never expose a full API key.
- Translation style and site-rule controls visible with a non-private sample domain.
- Main content or Whole page translation scope visible.
- Floating button setting visible.
- Page translation exclude selectors visible.

## Do Not Show

- Private browsing data or account details.
- Any claim that translation starts automatically.
- Private intranet domains or personal site-rule entries.
- Unsupported feature claims beyond web page translation, text-based document translation, selected-text translation, vocabulary collection, review, import/export, and Chrome storage sync.
- Claims for full scanned PDF OCR, automatic manga segmentation, or layout-preserving PDF translation.
- Claims for layout-perfect Office/eBook conversion.
- Claims for audio transcription, automatic subtitle generation, meeting bots, or guaranteed support for every video site.
- Console errors, developer tools, or local file explorer windows.

## Final Check

Before upload, compare the screenshots with `STORE_LISTING.md` and `RELEASE_CHECKLIST.md` so the listing copy, screenshots, privacy answers, and permission explanations describe the same product.
