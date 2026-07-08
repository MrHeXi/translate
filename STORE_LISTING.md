# LexiBridge Translate Store Listing

Use this draft as the source material for the Chrome Web Store listing, screenshots, support notes, and privacy questionnaire.

## Store Name

LexiBridge Translate

## Short Description

Translate web pages on demand, save unknown words, and review CET, GRE, IELTS, and TOEFL vocabulary.

## Detailed Description

LexiBridge Translate helps you read real web pages and text-based documents in another language while turning unknown words into review material.

Page translation is always user-triggered. Start from the extension popup or the floating page button, then stop translation with the same control to restore the page. LexiBridge also supports selected-text translation, Control-hover paragraph translation, a deliberate input-box shortcut, video subtitle translation when a page exposes browser caption tracks, SRT export for translated subtitle cues from the current session, live caption translation for caption text already visible on a page, and manual image text translation for selected images or selected image regions.

The document translator supports pasted text, text files, Markdown, HTML files, JSON string values, subtitle files, and simple text-based PDFs with page and coordinate metadata for detected PDF text blocks. HTML files are reduced to readable body text blocks before translation, skipping scripts, styles, and markup. Image text translation can use browser OCR when available, plus SVG and accessibility text fallbacks, and it can place separate translation overlays on OCR text blocks when the browser provides bounding boxes. Full scanned-PDF OCR, full PDF visual rendering, structure-preserving JSON rewrite, automatic manga panel segmentation, audio transcription, and meeting bots are not included yet.

The extension includes built-in CET4, CET6, GRE, IELTS, and TOEFL vocabulary sets. Enable the dictionaries you care about, collect useful words from the pages you read, and review saved or due words from the review page.

Core features:

- Manual page translation from the popup or floating button.
- Selection translation tooltip for quick lookups.
- Control-hover paragraph translation for quick in-page reading help.
- Input box translation by typing three trailing spaces.
- Text-based document translator for pasted text, text files, Markdown, HTML files, JSON string values, subtitle files, and simple PDFs with layout block metadata.
- Video subtitle translation when caption or subtitle tracks are available, with SRT export for translated cues from the current session.
- Live caption translation for caption text already visible in the page.
- Manual image text translation using browser OCR when available, plus SVG and accessibility text fallbacks, with drag-to-select image regions and separate OCR block overlays when coordinates are available.
- 100+ target language choices in settings.
- Google Translate and MyMemory are available today, with 20+ provider definitions prepared for future engine expansion.
- Vocabulary notebook for saved words, translations, examples, mastery level, and review schedule.
- Built-in CET4, CET6, GRE, IELTS, and TOEFL dictionaries.
- Review page for due words and new dictionary words.
- Import and export for learning data.
- Chrome storage support, with Chrome sync available when enabled in the browser profile.

Privacy summary:

- Translation requests are sent only after the user asks LexiBridge to translate selected text, a page, a document, available video subtitles, visible live captions, or selected image text.
- Settings, vocabulary, review progress, and learning stats are stored in Chrome storage.
- LexiBridge does not run its own account server.
- No default telemetry is collected.

LexiBridge is designed for reading, vocabulary collection, and review. Do not add unsupported claims beyond the features listed here.

## Search Keywords

translation, page translation, document translation, vocabulary, English learning, CET4, CET6, GRE, IELTS, TOEFL, review, study, reading, dictionary, selection translation

## Screenshot Plan

1. Popup with Start/Stop translation control, active dictionary count, and recent saved words.
2. Web page with the bottom-right floating button and the "Translate page" hint visible.
3. Web page after manual translation starts, showing progress without a full-page blocking overlay.
4. Selected text translation tooltip with save-to-vocabulary action.
5. Paragraph hover translation created by holding Control over readable text.
6. Input box translation shortcut before and after state.
7. Document translator with bilingual translated blocks.
8. Video subtitle overlay on a sample page with available captions and the Export SRT control visible.
9. Live caption overlay on a safe sample page where captions are already visible.
10. Image text translation overlay after clicking a safe sample image, dragging over a specific image region, or using OCR block overlays when bounding boxes are available.
11. Vocabulary notebook with saved words and review metadata.
12. Review page showing a due word card.
13. Options page showing dictionary selection and translation settings.

## Permission Justifications

- `storage`: save settings, vocabulary notebook items, review schedules, learning stats, and dictionary preferences.
- `activeTab`: interact with the current tab only after the user starts translation or opens extension controls.
- `scripting`: inject or refresh extension scripts and styles when a user action needs the extension UI on the current tab.
- `tabs`: find the active tab and send messages between the popup and content script.
- `https://translate.googleapis.com/*`: send user-requested text to Google Translate's public translation endpoint.
- `https://api.mymemory.translated.net/*`: send user-requested text to the MyMemory translation endpoint.

## Privacy Questionnaire Notes

- Single purpose: user-triggered web and document text translation, selected-text translation, selected image text translation, available subtitle/live-caption text translation, vocabulary collection, and vocabulary review.
- Personal or sensitive user data: no account credentials, payment data, health data, financial data, or personal communications are collected by the extension.
- Website and document content: only the text needed for the user-requested translation is sent to the selected translation provider.
- User activity: learning progress and review stats are stored for product functionality, not default analytics.
- Data sharing: translation text is shared with the selected translation provider only when the user requests translation.
- Remote code: no remote executable code is used.
- Telemetry: no default telemetry is collected.

## Support Notes

Suggested support contact:

- Repository issues or the support URL configured by the publisher account.

Common support answers:

- Page translation does not start automatically. Use the popup Start button or the floating page button.
- The floating button appears near the bottom-right of regular web pages. It is not shown on browser-owned pages such as `chrome://` URLs.
- Click the same Start/Stop control again to stop translation and restore the page.
- Hold Control while hovering over a paragraph to translate that paragraph only.
- Type three trailing spaces in a supported input box to translate the typed text.
- The document translator handles text-based documents, HTML body text extraction, JSON string value extraction, and simple text-based PDFs. Scanned PDFs, structure-preserving JSON rewrite, and full visual PDF rendering need later batches.
- Video subtitle translation works only when the current video exposes captions or subtitles to the browser. Export SRT saves only subtitle cues translated during the current session. It does not record audio, generate subtitles for videos without captions, or transcribe meetings.
- Live caption translation works only with caption text already visible in the page. It does not record audio, join calls, or create meeting transcripts.
- Image text translation starts only after the user enables Image text and clicks an image, canvas, or SVG, or drags over a specific image region. OCR depends on browser support and readable image content; separate region overlays require OCR bounding boxes.
- Vocabulary and review data are stored in Chrome storage. Chrome may sync the data if browser sync is enabled.
