# LexiBridge Translate Store Listing

Use this draft as the source material for the Chrome Web Store and Firefox Add-ons listings, screenshots, support notes, and privacy questionnaires. Keep the platform-specific permission notes separate.

## Store Name

LexiBridge Translate

## Short Description

Translate web pages on demand, save unknown words, and review CET, GRE, IELTS, and TOEFL vocabulary.

## Detailed Description

LexiBridge Translate helps you read real web pages and text-based documents in another language while turning unknown words into review material.

Page translation is always user-triggered. Start from the extension popup or the floating page button, then stop translation with the same control to restore the page. Settings can translate an intelligently detected main reading region or the whole page, choose subtle, highlighted, or plain-text translations, and skip configured CSS selector areas such as navigation, comments, ads, or `[data-no-translate]` regions. Exact-domain and wildcard site rules can block page translation or override its display mode, scope, style, and excluded areas without translating anything on page load. LexiBridge also provides a Chrome side panel for explicit text translation plus AI-assisted polish, rewrite, drafting, reply, and summary actions. AI writing controls include output language, tone, length, optional instructions, copy, iterative reuse, and `Ctrl+Enter` submission. It supports selected-text translation, Control-hover paragraph translation, a deliberate input-box shortcut, video subtitle translation when a page exposes browser caption tracks or common DOM-rendered captions, SRT export for translated subtitle cues from the current session, and user-invoked subtitle generation for a selected local audio/video file or an explicitly captured source-tab recording through separately configured OpenAI, Groq, Deepgram, or Cloudflare Workers AI transcription. Generated timed captions can be translated, previewed bilingually, and exported as SRT or VTT. Live caption translation handles caption text already visible on a page with Google Meet, Zoom, Microsoft Teams, Webex, Slack Huddles, Jitsi Meet, and BigBlueButton-style speaker handling. Live caption sessions can be exported locally as timestamped bilingual TXT, SRT, VTT, or JSON transcripts. Manual image text translation is available for selected page images, eligible images currently visible in the viewport, and bounded local JPG/JPEG, PNG, or WEBP files chosen, dropped, or pasted into the image workspace.

The document translator supports pasted text, text files, Markdown, HTML files, JSON string values, DOCX paragraph text, EPUB spine documents, SRT/VTT/ASS/SSA subtitle files, and PDFs capped at 64 MiB, 1,000 pages, 32 Mi rendered pixels per page, and 1,024 Mi rendered pixels total. Translated blocks can be edited before export. ASS/SSA export preserves script sections, timing, styles, comments, and inline tags while leaving vector-drawing dialogue untouched. Document results can be saved explicitly to bounded local-only history, reopened without a translation request, exported as JSON, or deleted; binary PDF/DOCX/EPUB source bytes are not kept in history. Bundled Mozilla PDF.js code renders PDF pages locally and extracts positioned text lines. Confidently detected two-column pages use left-column-then-right-column reading order, and translated overlays stay inside the detected column region. Likely standalone mathematical expressions are preserved in their original form instead of being sent for translation or covered by translated overlays. The document page can show original and translated PDF pages side by side, recognize image-only pages with browser OCR or bundled offline Tesseract OCR, and export translated pages as a flattened visual PDF. An explicit alternative adds translated page overlays while preserving supported original AcroForm fields, widgets, links, and annotations; the complete saved object graph is checked and signed PDFs, scripts, automatic actions, embedded or associated files, unsafe links, dangerous annotations, over-limit structures, and preservation mismatches are rejected without silently switching to flattened output. Bundled OCR supports selectable English, Simplified Chinese, Traditional Chinese, Japanese, and Korean models with local progress reporting. JSON files can be exported after translation with the original object and array structure preserved. DOCX and EPUB files can be exported after translation by writing translated readable blocks into a new document archive. HTML files are reduced to readable body text blocks before translation, skipping scripts, styles, and markup. Image text translation can use browser or bundled offline OCR, plus SVG and accessibility text fallbacks. For locally readable regular comic bubbles with reliable OCR geometry, it can detect bounded panel/bubble regions, remove source glyphs from flat or smooth backgrounds, and fit translated text into a temporary canvas overlay without modifying the source image. Long/high-resolution images are processed in bounded overlapping source-resolution tiles, with overlap text deduplicated and safe translated bubble patches positioned over the source. Cross-origin-tainted, safety-limit-exceeding, transformed, textured, whole-image OCR, cross-tile, or otherwise unsafe page inputs use separate non-destructive text overlays. Images can be translated explicitly from the frame-aware right-click menu, from the hover action shown after Image text starts, by completing a freeform `Z`-armed lasso, or with Translate visible images. OCR polygons keep rotated masks bounded, and predominantly CJK vertical text can remain vertical while Latin and RTL translations stay horizontal. Supported current-page comic readers use a separate Scan comic chapter action followed by Translate N images; scanning only reads a bounded DOM snapshot and does not start OCR or contact a provider. Changed chapter membership or navigation requires another scan, and Stop aborts the chapter run and removes its results. Per-image Retranslate bypasses the page-image cache; Apply and Undo affect only extension-owned results; Download PNG is offered only for safe reconstructed canvases on the page. The local image workspace accepts up to 12 bounded files, remains idle after choose/drop/paste, and starts OCR only after Translate image or Translate all. Its active command becomes Stop, single images can be retranslated, Apply/Undo switches between the untouched original and translated canvas, completed results preserve the original pixel dimensions and can be downloaded as PNG, and optional quality feedback remains local without source text, pixels, or file names. Hidden, offscreen, tiny, and extension-owned page graphics are skipped, and Stop cancels remaining tile work and terminates the local OCR worker. OCR accuracy and comic reconstruction are not guaranteed for every image, formula/column detection is heuristic, editable PDF reflow remains unsupported, and background or page-load browser-tab audio capture and meeting bots are not included.

AI-capable provider translation can use an optional bounded window of neighboring page or document text, versioned built-in or locally installed experts, mandatory terminology mappings, custom translation instructions, and validated YAML prompt templates with declared variables and local preview. Imported expert and template content remains untrusted user-level preference data; it is never inserted into the extension-owned system message. Neighboring context is off by default and is collected only after the user manually starts page or document translation. Expert/template management and preview are local actions and never submit text for translation.

The extension includes built-in CET4, CET6, GRE, IELTS, and TOEFL vocabulary sets. Enable the dictionaries you care about, collect useful words from the pages you read, and review saved or due words from the review page.

Waveform generation is a separate local action: selecting media remains idle until Generate waveform is clicked, the same control becomes Stop waveform while decoding, and frame-rate snapping edits caption times locally without a transcription or translation request. PDF scan cleanup and optional mixed-language OCR likewise run only after the user clicks Translate document; loading a PDF or changing those settings does not start OCR or translation.

Core features:

- Manual page translation from the popup or floating button.
- Bilingual, translation-only, and original-only display with subtle, highlighted, or plain-text translation styles.
- Intelligent main-content detection with a whole-page override and safe fallback when no reliable reading region is found.
- Configurable CSS selector exclusions for page areas that should stay original.
- Exact-domain and wildcard site rules with per-site allow/block, display, scope, style, and selector overrides.
- Selection translation tooltip for quick lookups.
- Control-hover paragraph translation for quick in-page reading help.
- Input box translation by typing three trailing spaces.
- User-invoked Chrome side panel for translation and AI-assisted polish, rewrite, drafting, reply, summary, proofreading, explanation, key-point extraction, and academic rewrite actions, available from the popup or `Alt+S`, with no provider request on panel open or mode change.
- Document translator for pasted text, text files, Markdown, HTML, JSON, DOCX, EPUB, editable SRT/VTT/ASS/SSA subtitle results, explicit local-only history, and PDFs with local PDF.js rendering, two-column reading order, standalone-formula preservation, column-bounded translations, browser-plus-bundled OCR fallback, flattened translated-PDF export, optional interaction-preserving PDF export, and an explicit local BabelDOC command guide that never runs or uploads the PDF.
- Video subtitle translation when caption/subtitle tracks or common DOM-rendered captions are available, with SRT export for translated cues from the current session.
- Explicit subtitle generation for a selected local audio/video file up to 25 MB through separately configured OpenAI, Groq, Deepgram, or Cloudflare Workers AI transcription, with provider-specific speech models, bounded JSON/SSE responses, Cloudflare language/context input, strict provider timing normalization, optional translation, editable fallback timing for untimed responses, a local overlap-aware cue timeline, whole-timeline shift/split/merge/delete and Undo/Redo controls, bilingual preview, cancellation, and SRT/VTT export.
- Explicit current-tab audio capture while the subtitle generator remains open, using the declared permission only after Capture current tab, with Stop-and-generate submission, a 25 MB memory limit, and no page-load recording.
- Live caption translation for caption text already visible in the page, including common meeting speaker labels, incremental-caption coalescing, timestamped in-memory cues, and local TXT/SRT/VTT/JSON transcript export.
- Manual image text translation using browser OCR or bundled offline OCR, plus SVG and accessibility text fallbacks, with click, freeform `Z` lasso, right-click, hover, visible-image batch, and explicit Scan then Translate chapter entry points; includes bounded source polygons, target-aware vertical CJK layout, per-image Retranslate/Apply/Undo, reconstructed-canvas PNG download, source-resolution overlapping tiles, bounded local comic-bubble reconstruction when safe, and non-destructive OCR block overlays otherwise.
- Dedicated local image workspace for explicit JPG/JPEG, PNG, and WEBP choose/drop/paste queues, true Translate/Stop controls, source-resolution sequential tile processing, single-image retranslation, Apply/Undo preview switching, original-resolution completed PNG download, and optional local-only quality feedback.
- Each page-image OCR tile is limited to 3 megapixels, with 200 distinct blocks and four concurrent text requests; full-canvas comic reconstruction is limited to same-origin static images up to 1.5 megapixels and 64 positioned blocks, while safe larger images use bounded bubble patches.
- 100+ target language choices in settings.
- 29 implemented provider adapters: Google Translate, MyMemory, DeepL, Microsoft Translator, OpenAI-compatible, Gemini, DeepSeek, OpenRouter, Groq, Qwen, Zhipu GLM/ChatGLM, SiliconFlow, Ollama, Claude, Azure OpenAI, LibreTranslate, Yandex Cloud Translate, NiuTrans, Caiyun Translate, ModernMT, Lingvanex, Naver Papago, Baidu Translate, Volcengine Translate, Alibaba Machine Translation, Amazon Translate, IBM Watson Language Translator, Youdao Translate, and SYSTRAN Translate.
- AI translation controls for AI-capable providers: opt-in neighboring context, nine trusted built-in experts, versioned JSON expert installation, a fixed local curated catalog with explicit confirmed installation, terminology mappings, custom instructions, and validated YAML prompt templates with local preview.
- Opt-in local masking for supported email, phone, Luhn-valid card, IPv4/IPv6, IBAN, JWT, validated PEM private keys, high-confidence cloud/developer credentials, Azure Storage keys, database-URI passwords, checksum-valid Chinese resident IDs, and sensitive URL-query values before provider requests; unsafe placeholder restoration discards the result visibly.
- Vocabulary notebook for saved words, translations, examples, mastery level, and review schedule.
- Built-in CET4, CET6, GRE, IELTS, and TOEFL dictionaries.
- Review page for due words and new dictionary words.
- Import and export for learning data.
- Chrome storage support, with Chrome sync available when enabled in the browser profile.

Privacy summary:

- Translation, AI writing, and media transcription requests are sent only after the user explicitly submits the corresponding text, page, document, image, caption, selected file, or stopped tab recording.
- The subtitle generator uploads only after Generate subtitles or Stop and generate; selected or captured media bytes stay in temporary memory and are cleared after completion, cancellation, disconnection, error, page close, or the 25 MB limit.
- Settings, vocabulary, review progress, and learning stats are stored in Chrome storage.
- Document history is stored only after Save history in local Chrome storage; it is bounded, never synced, and never contains binary PDF, DOCX, or EPUB source bytes.
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
9. Subtitle generator with a harmless local media filename, timed bilingual captions, and SRT/VTT controls visible.
10. Live caption overlay and transcript export controls on a safe sample page where captions are already visible.
11. Image text translation after a safe click, completed freeform lasso, Translate visible images, or the separate Scan comic chapter then Translate N images confirmation.
12. Vocabulary notebook with saved words and review metadata.
13. Review page showing a due word card.
14. Side panel showing source text, provider and target controls, and a translated result.
15. Options page showing dictionary selection and translation settings.

## Permission Justifications

- `storage`: save settings, vocabulary notebook items, review schedules, learning stats, dictionary preferences, and explicitly saved local document history.
- `activeTab`: interact with the current tab only after the user starts translation or opens extension controls.
- `scripting`: inject or refresh extension scripts and styles when a user action needs the extension UI on the current tab.
- `tabs`: find the active tab and send messages between the popup and content script.
- `contextMenus`: show Translate text in this image only for user right-clicks on images in HTTP/HTTPS pages; the command targets that frame and starts no work until clicked.
- `sidePanel`: open the text translation panel after the user clicks its popup button or presses `Alt+S`.
- `tabCapture`: required so Chrome can authorize the source tab when the popup is invoked; capture is called only after Capture current tab and is limited to that source until Stop, Cancel, page close, failure, or the 25 MB limit.
- `https://translate.googleapis.com/*`: send user-requested text to Google Translate's public translation endpoint.
- `https://api.mymemory.translated.net/*`: send user-requested text to the MyMemory translation endpoint.
- `https://api-free.deepl.com/*` and `https://api.deepl.com/*`: send user-requested text to the configured DeepL API plan.
- `https://api.cognitive.microsofttranslator.com/*`: send user-requested text to Microsoft Translator.
- `https://api.openai.com/*`: send user-requested text or explicitly submitted selected/captured media to the configured OpenAI endpoint.
- `https://api.deepgram.com/*`: send explicitly submitted selected/captured media to Deepgram only after Generate subtitles or Stop and generate.
- `https://api.cloudflare.com/*`: send explicitly submitted selected/captured media to the configured Cloudflare Workers AI account only after Generate subtitles or Stop and generate.
- `https://generativelanguage.googleapis.com/*`: send user-requested text to Google Gemini when configured.
- Optional HTTPS or localhost host access: requested only when the user saves an additional provider configuration, for that endpoint's configured scheme and hostname.

## Firefox Add-ons Notes

- The Firefox Desktop package requires Firefox 140 or newer, uses a background script and native `sidebar_action`, and sets `open_at_install` to false.
- It omits the Chrome-only `sidePanel` and `tabCapture` permissions. The subtitle generator keeps explicit local-media transcription but disables current-tab capture with a visible local-file alternative.
- The Firefox manifest declares Mozilla's required data-collection categories for website content and any personal, health, financial, authentication, communication, location, or search-term information that user-submitted text may contain. Data goes directly to the provider the user selects; LexiBridge has no collection server.
- An unsigned Firefox ZIP is for temporary local testing. Persistent distribution requires an AMO-signed XPI and a completed Firefox manual smoke test.

## Privacy Questionnaire Notes

- Single purpose: user-triggered web and document text translation, selected-text translation, selected or currently visible image text translation, available subtitle/live-caption text translation, explicit local-media or current-tab transcription and local transcript export, vocabulary collection, and vocabulary review.
- Authentication information: user-entered translation provider API keys, client/application IDs, and temporary session tokens are stored only in local Chrome storage and sent directly to the selected provider when translation is requested; LexiBridge does not collect them on its own server.
- Personal or sensitive user data: text, selected files, or explicitly captured tab recordings may contain personal, payment, health, financial, or proprietary content. It is processed only after the corresponding user action. Optional pattern-based masking covers specific verified text formats but can have false negatives and does not replace user review.
- Website, document, and media content: only text needed for a requested translation and selected or explicitly captured media submitted for transcription are sent to the provider selected by the user.
- User activity: learning progress and review stats are stored for product functionality, not default analytics.
- Data sharing: translation text and explicitly submitted selected/captured media are shared only with the selected translation or transcription provider after the corresponding user action.
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
- The document translator handles text-based documents, HTML body text extraction, JSON string value extraction and structure-preserving export, DOCX paragraph text and EPUB spine documents with translated source-file export, editable SRT/VTT/ASS/SSA translations, and bounded locally rendered PDFs. Save history is explicit and local-only; Open restores saved results without translating, and binary document source bytes are not persisted. PDF.js extracts positioned text and renders original/translated page previews; image-only pages use browser OCR first and bundled offline OCR otherwise. Export PDF defaults to flattened translated pages, while an explicit option preserves supported AcroForm fields, widgets, links, and annotations after checking the complete saved object graph. Signed PDFs, active content, embedded or associated files, unsafe links, dangerous annotations, over-limit structures, and preservation mismatches are rejected without silent fallback. OCR accuracy varies, and editable PDF reflow plus layout-perfect Office/eBook conversion remain later work.
- Start Video subtitles works only when the current page exposes captions or subtitles to the browser, including common DOM-rendered caption containers and dedicated contract-tested adapters for YouTube, Netflix, Vimeo, Bilibili, Udemy, Coursera, Khan Academy, Nebula, Bloomberg, Twitch, Dailymotion, TED, and Prime Video. Export SRT saves only cues translated during that page session. Generate from media is a separate explicit workflow: it accepts a selected local file or records the source tab only after Capture current tab, then uploads up to 25 MB to separately configured OpenAI, Groq, Deepgram, or Cloudflare Workers AI transcription and optionally translates/exports timed captions. The generator must stay open, the declared capture permission is unused before the explicit click, and Stop and generate is required before provider upload. It does not start automatically or join meetings.
- Live caption translation works only with caption text already visible in the page. Common Google Meet, Zoom, Microsoft Teams, Webex, Slack Huddles, Jitsi Meet, and BigBlueButton-style caption containers keep speaker labels when available. The current tab stores timestamped cues in memory for explicit TXT, SRT, VTT, or JSON export; Stop cancels pending translation and prevents new capture, while Clear or closing the page removes the session. It does not record audio, join calls, or transcribe speech.
- Image text translation starts only after an explicit image command: enable Image text and click or drag, click a hover action, choose Translate text in this image from the right-click menu, complete a `Z`-armed region drag, or click Translate visible images. Opening or scrolling a page never starts OCR. Showing hover controls or pressing `Z` without completing a selection also starts no OCR. Retranslate bypasses the cache; Apply and Undo modify only extension overlays; Download PNG appears only for safe reconstructed canvases or bounded tiled patch results. Stop aborts current OCR/provider/reconstruction work, prevents later tiles or late commits, and clears results. Recognition depends on readable content and the selected OCR language; unsafe or cross-origin cases retain the source image and use separate region overlays.
- Vocabulary and review data are stored in Chrome storage. Chrome may sync the data if browser sync is enabled.
- Provider API keys, client/application IDs, and temporary session tokens stay in local Chrome storage, are shown only as masked summaries, and are excluded from Chrome sync and learning-data exports. Credentialed provider failures do not silently fall back to another provider.
- Installed AI expert definitions, enabled states, and prompt templates stay in local Chrome storage. Selected IDs, template-variable values, and the masking preference are ordinary settings and may sync through Chrome.
