# LexiBridge Translate Store Listing

Use this draft as the source material for the Chrome Web Store listing, screenshots, support notes, and privacy questionnaire.

## Store Name

LexiBridge Translate

## Short Description

Translate web pages on demand, save unknown words, and review CET, GRE, IELTS, and TOEFL vocabulary.

## Detailed Description

LexiBridge Translate helps you read real web pages and text-based documents in another language while turning unknown words into review material.

Page translation is always user-triggered. Start from the extension popup or the floating page button, then stop translation with the same control to restore the page. Settings can translate an intelligently detected main reading region or the whole page, choose subtle, highlighted, or plain-text translations, and skip configured CSS selector areas such as navigation, comments, ads, or `[data-no-translate]` regions. Exact-domain and wildcard site rules can block page translation or override its display mode, scope, style, and excluded areas without translating anything on page load. LexiBridge also provides a Chrome side panel for explicit text translation plus AI-assisted polish, rewrite, drafting, reply, and summary actions. AI writing controls include output language, tone, length, optional instructions, copy, iterative reuse, and `Ctrl+Enter` submission. It supports selected-text translation, Control-hover paragraph translation, a deliberate input-box shortcut, video subtitle translation when a page exposes browser caption tracks or common DOM-rendered captions, SRT export for translated subtitle cues from the current session, and live caption translation for caption text already visible on a page with Google Meet, Zoom, Microsoft Teams, and Webex-style speaker handling. Live caption sessions can be exported locally as timestamped bilingual TXT, SRT, VTT, or JSON transcripts. Manual image text translation is available for selected image regions or eligible images currently visible in the viewport.

The document translator supports pasted text, text files, Markdown, HTML files, JSON string values, DOCX paragraph text, EPUB spine documents, subtitle files, and PDFs. Bundled Mozilla PDF.js code renders PDF pages locally and extracts positioned text lines. Confidently detected two-column pages use left-column-then-right-column reading order, and translated overlays stay inside the detected column region. Likely standalone mathematical expressions are preserved in their original form instead of being sent for translation or covered by translated overlays. The document page can show original and translated PDF pages side by side, recognize image-only pages with browser OCR or bundled offline Tesseract OCR, and export translated pages as a flattened visual PDF. Bundled OCR supports selectable English, Simplified Chinese, Traditional Chinese, Japanese, and Korean models with local progress reporting. Subtitle files can be exported after translation as `.srt` or `.vtt` files with their original cue timing preserved. JSON files can be exported after translation with the original object and array structure preserved. DOCX and EPUB files can be exported after translation by writing translated readable blocks into a new document archive. HTML files are reduced to readable body text blocks before translation, skipping scripts, styles, and markup. Image text translation can use browser or bundled offline OCR, plus SVG and accessibility text fallbacks, and it can place separate translation overlays on OCR text blocks when coordinates are available. After enabling Image text, the user can explicitly run Translate visible images; hidden, offscreen, tiny, and extension-owned graphics are skipped, and Stop cancels the remaining batch and terminates its local OCR worker. OCR accuracy is not guaranteed for every scan, formula/column detection is heuristic, exported translated PDFs are flattened, and automatic manga panel segmentation, image inpainting, audio transcription, and meeting bots are not included yet.

AI-capable provider translation can use an optional bounded window of neighboring page or document text, a selectable subject-domain expert, mandatory terminology mappings, and custom translation instructions. Neighboring context is off by default and is collected only after the user manually starts page or document translation.

The extension includes built-in CET4, CET6, GRE, IELTS, and TOEFL vocabulary sets. Enable the dictionaries you care about, collect useful words from the pages you read, and review saved or due words from the review page.

Core features:

- Manual page translation from the popup or floating button.
- Bilingual, translation-only, and original-only display with subtle, highlighted, or plain-text translation styles.
- Intelligent main-content detection with a whole-page override and safe fallback when no reliable reading region is found.
- Configurable CSS selector exclusions for page areas that should stay original.
- Exact-domain and wildcard site rules with per-site allow/block, display, scope, style, and selector overrides.
- Selection translation tooltip for quick lookups.
- Control-hover paragraph translation for quick in-page reading help.
- Input box translation by typing three trailing spaces.
- User-invoked Chrome side panel for translation and AI-assisted polish, rewrite, drafting, reply, and summary actions, available from the popup or `Alt+S`, with no provider request on panel open or mode change.
- Document translator for pasted text, text files, Markdown, HTML, JSON, DOCX, EPUB, subtitle files with timing-preserving export, and PDFs with local PDF.js rendering, two-column reading order, standalone-formula preservation, column-bounded translations, browser-plus-bundled OCR fallback, and flattened translated-PDF export.
- Video subtitle translation when caption/subtitle tracks or common DOM-rendered captions are available, with SRT export for translated cues from the current session.
- Live caption translation for caption text already visible in the page, including common meeting speaker labels, incremental-caption coalescing, timestamped in-memory cues, and local TXT/SRT/VTT/JSON transcript export.
- Manual image text translation using browser OCR or bundled offline OCR, plus SVG and accessibility text fallbacks, with click/drag selection, a user-triggered visible-image batch, and separate OCR block overlays when coordinates are available.
- 100+ target language choices in settings.
- 21 implemented provider adapters: Google Translate, MyMemory, DeepL, Microsoft Translator, OpenAI-compatible, Gemini, DeepSeek, OpenRouter, Groq, Qwen, Zhipu GLM, SiliconFlow, Ollama, Claude, Azure OpenAI, LibreTranslate, Yandex Cloud Translate, NiuTrans, Caiyun Translate, ModernMT, and Lingvanex.
- AI translation controls for AI-capable providers: opt-in neighboring context, nine domain experts, terminology mappings, and custom instructions.
- Vocabulary notebook for saved words, translations, examples, mastery level, and review schedule.
- Built-in CET4, CET6, GRE, IELTS, and TOEFL dictionaries.
- Review page for due words and new dictionary words.
- Import and export for learning data.
- Chrome storage support, with Chrome sync available when enabled in the browser profile.

Privacy summary:

- Translation and AI writing requests are sent only after the user explicitly submits selected text, side-panel input, a page, a document, available video subtitles, visible live captions, selected image text, or eligible currently visible images.
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
9. Live caption overlay and transcript export controls on a safe sample page where captions are already visible.
10. Image text translation overlays after clicking a safe sample image, dragging over a specific image region, or manually running Translate visible images.
11. Vocabulary notebook with saved words and review metadata.
12. Review page showing a due word card.
13. Side panel showing source text, provider and target controls, and a translated result.
14. Options page showing dictionary selection and translation settings.

## Permission Justifications

- `storage`: save settings, vocabulary notebook items, review schedules, learning stats, and dictionary preferences.
- `activeTab`: interact with the current tab only after the user starts translation or opens extension controls.
- `scripting`: inject or refresh extension scripts and styles when a user action needs the extension UI on the current tab.
- `tabs`: find the active tab and send messages between the popup and content script.
- `sidePanel`: open the text translation panel after the user clicks its popup button or presses `Alt+S`.
- `https://translate.googleapis.com/*`: send user-requested text to Google Translate's public translation endpoint.
- `https://api.mymemory.translated.net/*`: send user-requested text to the MyMemory translation endpoint.
- `https://api-free.deepl.com/*` and `https://api.deepl.com/*`: send user-requested text to the configured DeepL API plan.
- `https://api.cognitive.microsofttranslator.com/*`: send user-requested text to Microsoft Translator.
- `https://api.openai.com/*`: send user-requested text to the OpenAI-compatible default endpoint when configured.
- `https://generativelanguage.googleapis.com/*`: send user-requested text to Google Gemini when configured.
- Optional HTTPS or localhost host access: requested only when the user saves an additional provider configuration, for that endpoint's configured scheme and hostname.

## Privacy Questionnaire Notes

- Single purpose: user-triggered web and document text translation, selected-text translation, selected or currently visible image text translation, available subtitle/live-caption text translation and local transcript export, vocabulary collection, and vocabulary review.
- Authentication information: user-entered translation provider API keys are stored only in local Chrome storage and sent directly to the selected provider when translation is requested; LexiBridge does not collect them on its own server.
- Personal or sensitive user data: no payment data, health data, or financial data is collected by the extension.
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
- Add CSS selectors in settings to keep navigation, comments, ads, or other page areas untranslated during manual page translation.
- Use site rules for an exact domain or `*.example.com` wildcard to allow or block manual page translation and override its display, scope, style, or excluded selectors. Site rules never translate a page automatically.
- Hold Control while hovering over a paragraph to translate that paragraph only.
- Type three trailing spaces in a supported input box to translate the typed text.
- Open the side panel from the popup header or with `Alt+S`; opening it or switching modes never sends a provider request. Translate and AI writing actions submit only after the action button or `Ctrl+Enter`, and AI actions require a configured AI-capable provider.
- The document translator handles text-based documents, HTML body text extraction, JSON string value extraction and structure-preserving export, DOCX paragraph text and EPUB spine documents with translated source-file export, subtitle file timing-preserving export, and locally rendered PDFs. PDF.js extracts positioned text and renders original/translated page previews; image-only pages use browser OCR first and bundled offline OCR otherwise, and Export PDF creates flattened translated pages. OCR accuracy varies, and editable text reflow plus layout-perfect Office/eBook conversion remain later work.
- Video subtitle translation works only when the current video exposes captions or subtitles to the browser, including common DOM-rendered caption containers. Export SRT saves only subtitle cues translated during the current session. It does not record audio, generate subtitles for videos without captions, or transcribe meetings.
- Live caption translation works only with caption text already visible in the page. Common Google Meet, Zoom, Microsoft Teams, and Webex-style caption containers keep speaker labels when available. The current tab stores timestamped cues in memory for explicit TXT, SRT, VTT, or JSON export; Stop prevents new capture, while Clear or closing the page removes the session. It does not record audio, join calls, or transcribe speech.
- Image text translation starts only after the user enables Image text and then clicks an image, drags over a region, or explicitly clicks Translate visible images. The visible-image command processes eligible images in the current viewport, skips hidden, offscreen, tiny, and extension-owned graphics, and stops immediately when Image text is turned off. Opening or scrolling a page never starts OCR. Recognition depends on readable image content and the selected OCR language; separate region overlays require OCR bounding boxes.
- Vocabulary and review data are stored in Chrome storage. Chrome may sync the data if browser sync is enabled.
- Provider API keys stay in local Chrome storage, are shown only as masked summaries, and are excluded from Chrome sync and learning-data exports. Credentialed provider failures do not silently fall back to another provider.
