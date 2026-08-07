# LexiBridge Translate Release Checklist

Use this checklist before creating a public package or submitting to Chrome Web Store.

## Version

- [ ] Confirm `manifest.json` version is correct.
- [ ] Confirm `RELEASE_NOTES.md` matches the version.
- [ ] Confirm the generated package comes from the latest commit.

## Quality Gates

- [ ] Run `npm run type-check`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test -- --runInBand --silent`.
- [ ] Run `npm run build`.
- [ ] Regenerate `chrome-translation-extension.zip` from `dist`.

## Chrome Web Store Listing

- [ ] Use `STORE_LISTING.md` as the source draft for listing copy, permission explanations, privacy answers, and screenshot planning.
- [ ] Name: `LexiBridge Translate`.
- [ ] Short description explains web translation plus vocabulary review.
- [ ] Detailed description mentions manual page translation, selection translation, built-in dictionaries, vocabulary notebook, review, import/export, and Chrome storage sync.
- [ ] Site-rule and translation-style claims remain limited to manual page translation; do not imply page-load auto translation.
- [ ] Claim only verified, bounded document, explicit document-batch, video subtitle, explicit local-media/current-tab transcription, live caption, and image text features; describe MOBI/AZW3 as bounded text import rather than eBook rewriting, PDF output as flattened, bundled OCR as local but accuracy-dependent, and do not claim editable PDF reflow, guaranteed scanned-PDF OCR, automatic manga translation, image inpainting, background or automatic tab-audio capture, meeting bots, or account cloud sync.
- [ ] Include support contact or repository issue link.

## Screenshots

- [ ] Use `docs/release/SCREENSHOT_GUIDE.md` before capturing store screenshots.
- [ ] Popup showing translation controls and learning summary.
- [ ] Floating button on a real web page.
- [ ] Selection translation tooltip.
- [ ] Control-hover paragraph translation.
- [ ] Input box translation shortcut.
- [ ] Side-panel text translation with provider/target controls and a translated result.
- [ ] Document translator with either a bounded MOBI/AZW3 import or an idle multi-file batch queue before Start.
- [ ] Vocabulary notebook page.
- [ ] Review page.
- [ ] Options page with dictionary settings.

## Privacy practices

- [ ] Link `PRIVACY.md` or hosted equivalent.
- [ ] Disclose Chrome storage and Chrome sync use.
- [ ] Disclose all 29 implemented provider adapters and distinguish pre-granted hosts from provider hosts requested when configuration is saved.
- [ ] Disclose that provider API keys, client/application IDs, and temporary session tokens stay in local Chrome storage and are excluded from Chrome sync and learning-data exports.
- [ ] Disclose that document history is created only by Save history, stays in local storage, is size/retention bounded, and excludes binary PDF, DOCX, EPUB, MOBI, and AZW3 source bytes.
- [ ] Confirm AI neighboring context is off by default, is sent only for manual page/document translation when enabled, and is bounded before provider requests.
- [ ] Confirm AI-capable provider requests include the selected domain, normalized glossary, and custom instructions while keeping source/context in a separate untrusted-data message.
- [ ] Confirm changing AI translation settings clears the background translation cache and different contexts cannot share a cached result.
- [ ] State that there is no default telemetry.
- [ ] Confirm the listing privacy fields match the policy.

## Permissions

- [ ] `storage` is explained by settings, vocabulary, learning progress, and review state.
- [ ] `activeTab` is explained by current-tab user actions.
- [ ] `scripting` is explained by extension script/style refresh behavior.
- [ ] `tabs` is explained by active-tab messaging.
- [ ] `sidePanel` is explained by the user-invoked popup button and `Alt+S` command.
- [ ] Required `tabCapture` is explained by Chrome's source-tab authorization model; confirm the API remains unused until Capture current tab.
- [ ] Host permissions are limited to translation provider endpoints.
- [ ] Optional provider access is requested only for the configured HTTPS or localhost scheme and hostname when the user saves provider configuration.
- [ ] No new permission has been added without a user-facing reason.

## Manual Smoke Test

- [ ] Load unpacked extension from `dist`.
- [ ] Confirm extension name and icon are correct in Chrome.
- [ ] Confirm page translation does not start automatically.
- [ ] Confirm the floating button starts translation and the next click stops it.
- [ ] Confirm all three translation styles update existing translated blocks.
- [ ] Confirm exact and wildcard site rules override display/scope/style/exclusions, and a blocked site remains untranslated after a manual Start click.
- [ ] Confirm Main content excludes navigation/footer text on a representative article and Whole page includes it only after manual Start.
- [ ] Load a standards-compliant PDF, confirm original and translated page previews render, switch all three display modes, and export a flattened translated PDF.
- [ ] Load a mixed PDF page with sparse centered text plus raster content; confirm local OCR supplements the text layer and duplicate OCR/text detections are not translated twice.
- [ ] Edit a loaded PDF block and confirm its page, coordinate, column, and formula metadata remain attached; add text without safe geometry and confirm translation remains visible while Export PDF is disabled with an explanatory message.
- [ ] Load a representative two-column academic PDF; confirm blocks are ordered down the left column before the right and translated overlays do not cross the inferred gutter.
- [ ] Load a PDF with standalone equations; confirm likely formulas are labeled as preserved, send no translation request, remain visible in preview, and are not painted over in exported pages.
- [ ] Confirm an image-only PDF tries local browser OCR first, falls back to bundled Tesseract OCR, reports per-page progress, and reports pages without detected text.
- [ ] Confirm English, Simplified Chinese, Traditional Chinese, Japanese, and Korean OCR choices persist and are shared by PDF and image translation.
- [ ] Load representative SRT and VTT files; confirm selecting either file sends no translation request, translation starts only after Translate document, and export replaces cue text while preserving original timing, cue identifiers/settings, WEBVTT metadata and NOTE/STYLE/REGION sections, line endings, and other non-cue content.
- [ ] Load representative ASS and SSA files; confirm selecting the file sends no translation request, only Dialogue text is translated after Translate document, edited translations are exported, and sections/timing/styles/comments/inline tags remain unchanged while vector drawings remain original.
- [ ] Load representative MOBI and KF8-based AZW3 files; confirm selection only loads bounded content, no provider request occurs before Translate document, the 64 MiB file/4,096 chapter/8 MiB per-chapter/64 MiB extracted-HTML limits are enforced, chapters follow deterministic spine order, repeated paragraphs are retained, and translated content exports as text without claiming MOBI/AZW3 rewriting.
- [ ] Select multiple supported documents; confirm the 100-file/64 MiB per-file/128 MiB total limits are enforced, the queue remains idle and sends no provider request until Start batch, concurrency is limited to the selected 1/2/3 value, Cancel stops active work and prevents new items from starting, failed files require Queue failed plus another explicit Start, and Download ZIP is enabled only after all files succeed and produces the same deterministic archive for identical results.
- [ ] Save an edited document result to history, confirm no entry exists before Save history, reopen it without a translation request, export JSON, change 10/25/50 retention, delete an entry, and clear all history.
- [ ] Reopen PDF, DOCX, EPUB, MOBI, and AZW3 results from history; confirm results remain readable but source-format export is disabled because binary source bytes were not persisted.
- [ ] Confirm `dist/ocr` includes the worker, SIMD/non-SIMD LSTM core files, five compressed language models, and license files.
- [ ] Confirm Stop terminates an active image OCR session and removes all image overlays without starting work on another image.
- [ ] Confirm selected text shows a translation tooltip.
- [ ] Confirm selection does not speak on initialization, selection, or translation completion; click Speak explicitly, verify locale inference, and verify a second click cancels the prior utterance first.
- [ ] Confirm missing Web Speech APIs degrade without an exception and cleanup cancels active speech.
- [ ] Confirm input translation does not scan existing fields on page load, accepts `/en`, `/中文`, and `/zh-CN` prefixes, rejects unknown path-like prefixes, and preserves the default target when no prefix is present.
- [ ] Confirm desktop and mobile three-space shortcuts honor their timing windows, synthetic page/writeback events do not trigger or recurse, touchend alone does not count as a space, failures can retry, and cleanup removes listeners.
- [ ] Open the side panel from the popup and with `Alt+S`; confirm opening and mode changes send no provider request, configured providers are selectable, `Ctrl+Enter` translates, and Copy/Clear work.
- [ ] Run Polish, Rewrite, Write, Reply, and Summarize with a configured AI provider; confirm ordinary translation providers are disabled, output language/Tone/Length/Additional requirement are applied, and Use result as input works.
- [ ] Configure each credentialed provider with a test key or mock endpoint, verify masked-key display, and verify Remove configuration.
- [ ] Save Ollama without an API key, confirm Chrome requests `http://localhost/*`, and verify settings cannot activate it before provider configuration is saved.
- [ ] Confirm Image text stays idle until Start plus a click, drag, or Translate visible images action; confirm Stop cancels the remaining visible-image batch and clears overlays.
- [ ] Confirm repeated image text is reused only within the same provider, target language, settings revision, and context; changing settings while Image text remains enabled makes a fresh provider request.
- [ ] Confirm repeated Video subtitle and Live caption text also makes a fresh request after provider, target language, or translation settings change.
- [ ] Confirm Video subtitles consumes only exposed text-track/DOM caption text after Start and never requests tab audio capture.
- [ ] Open YouTube standard, Watch-form Live, explicit Live, and Shorts pages; confirm the popup reports the versioned adapter and correct page type, only the active Shorts player's captions are selected, separate timed cues with the same words remain separate, and navigating to another YouTube video stops before any cue from the new route is translated.
- [ ] Start video subtitles in two tabs at once, stop one tab while both have a request in flight, and confirm the other tab continues because request IDs are globally namespaced.
- [ ] Start a subtitle translation with a delayed provider response, click Stop, then Start again; confirm the first request is aborted and cannot render, cache, or enter the new session export.
- [ ] Confirm Live captions captures only visible DOM captions after Start, merges incremental updates, retains cues after Stop, exports TXT/SRT/VTT/JSON locally, and clears without recording audio.
- [ ] Configure OpenAI or Groq, select a supported local media file under 25 MB, click Generate subtitles, edit cue text and start/end times, export the edited values as SRT/VTT, and confirm Cancel stops the temporary upload or active per-cue translation request.
- [ ] On Chrome 116 or newer, open the contextual Generate command from YouTube standard, Live, and Shorts pages, confirm opening the generator does not capture, then click Capture current tab; verify source playback remains audible and no provider request occurs while capture is active, Stop and generate applies the source playback-time offset, and edited SRT/VTT export remains aligned.
- [ ] Confirm cancel, generator-page close, stream failure, and the 25 MB limit stop all captured tracks and discard temporary tab audio without a provider upload.
- [ ] Confirm opening the subtitle generator and selecting a file send nothing; verify media bytes are cleared after completion, cancellation, disconnection, and provider errors.
- [ ] Confirm a word can be saved and appears in the vocabulary page.
- [ ] Confirm review page can load due or new words.
- [ ] Confirm export and import controls are reachable.

## Package

- [ ] Confirm `chrome-translation-extension.zip` exists.
- [ ] Confirm `dist/manifest.json` contains release metadata.
- [ ] Confirm `dist/data/vocabularies` contains CET4, CET6, GRE, IELTS, and TOEFL files.
- [ ] Confirm `dist/pdfjs` contains the PDF.js worker, character maps, and standard fonts.
- [ ] Keep generated package out of git unless a release process explicitly requires attaching it.
