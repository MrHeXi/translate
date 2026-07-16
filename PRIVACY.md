# LexiBridge Translate Privacy Policy

Last updated: 2026-07-16

LexiBridge Translate is a browser extension for user-triggered page translation, document text translation, selected or currently visible image text translation, video subtitle text translation, live caption text translation and local transcript export, selection translation, vocabulary collection, and vocabulary review.

## Data Stored by the Extension

LexiBridge uses Chrome storage for product functionality:

- Settings: target language, translation provider, enabled dictionaries, floating button visibility, and related preferences.
- Vocabulary notebook: saved words, translations, examples, dictionary type, mastery level, review count, and review schedule.
- Learning stats: daily goal, streaks, review accuracy, time spent learning, and dictionary progress.
- Cached data: built-in dictionary progress and temporary translation cache used to reduce repeated requests during a session.

Chrome storage may sync data through the user's browser profile if Chrome sync is enabled. LexiBridge does not run its own account server.

## Translation Provider Requests

Translation provider requests happen only after the user asks LexiBridge to translate selected text, document text, selected image text, eligible currently visible image text, available video subtitle text, visible live caption text, or a page.

When the user translates selected text, starts page translation, translates a document in the document translator, manually starts image text translation and then clicks an image, drags over an image region, or clicks Translate visible images, manually starts video subtitle translation for a page with available caption tracks, or manually starts live caption translation for caption text already visible on a page, LexiBridge sends the requested text to the selected translation provider.

Current provider hosts:

- `translate.googleapis.com`
- `api.mymemory.translated.net`

The extension sends the text needed for the requested translation and the selected target language. Uploaded document files are read locally in the browser; the extension sends only the extracted text blocks that the user asks to translate. HTML files are parsed locally so readable body text can be translated without sending scripts, styles, or markup as separate content. JSON files are parsed locally to extract readable string values; LexiBridge does not execute JSON content or rewrite JSON structure. DOCX and EPUB files are read locally as document archives so readable paragraph or spine text can be extracted; LexiBridge does not rewrite the original Office or eBook file. Uploaded subtitle files are parsed locally to keep cue timing for local translated `.srt` or `.vtt` export. For simple text-based PDFs, page and coordinate metadata may be used locally to render layout-aware blocks, but the translation request sends the extracted text. Image text translation extracts text locally from browser OCR when available, SVG text, or image accessibility text, then sends only the extracted text after the user clicks an image, selects a region, or explicitly runs Translate visible images. A visible-image batch considers only eligible graphics intersecting the current viewport and skips hidden, offscreen, tiny, and extension-owned graphics. OCR bounding boxes, when available, are used locally to position image-region overlays and are not sent as a separate data payload. Video subtitle and live caption translation send caption text only after the user turns the feature on. Meeting-style live caption adapters keep speaker labels locally when available, but send only the caption text for translation. While Live captions is enabled, the current tab keeps timestamped original and translated cues in memory so the user can explicitly download TXT, SRT, VTT, or JSON. These cues are not written to Chrome storage and are removed by Clear, page close, or extension cleanup. Video subtitle and live caption transcript exports are local downloads; they do not upload audio or request a speech transcription service. LexiBridge does not record audio, join calls, or transcribe speech for these features. Translation provider handling is governed by the provider's own terms and privacy practices.

## No Default Telemetry

No default telemetry is collected. LexiBridge does not send usage analytics, learning stats, browsing history, saved vocabulary, or review data to an application analytics service by default.

If optional analytics are added later, they must be opt-in and documented before release.

## Page Access

The extension runs a content script on pages so it can show the floating button, translate selected text, highlight enabled dictionary words, and insert user-requested page translations.

LexiBridge does not translate pages automatically. Page translation starts only after user action from the popup or floating button. Image text, video subtitle, and live caption translation also start only after user action from the popup. Opening or scrolling a page never starts image OCR; the visible-image batch requires a separate click after Image text mode is enabled, and Stop prevents further images from being processed.

## Permissions

LexiBridge requests these permissions:

- `storage`: save settings, vocabulary, learning progress, and review state.
- `activeTab`: interact with the current tab after user action.
- `scripting`: inject or refresh extension scripts and styles when needed.
- `tabs`: find the active tab and send extension messages.

Host permissions are limited to the translation provider endpoints listed above.

## Data Export and Deletion

Users can export learning data from the extension. Users can clear vocabulary, reset settings, or remove extension data through Chrome's extension management and site data controls.

## Contact

For privacy questions, use the repository issue tracker or the support channel configured in the Chrome Web Store listing.
