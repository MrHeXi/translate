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
- [ ] Claim only verified, bounded document, video subtitle, explicit local-media/current-tab transcription, live caption, and image text features; describe PDF output as flattened, bundled OCR as local but accuracy-dependent, and do not claim editable PDF reflow, guaranteed scanned-PDF OCR, automatic manga translation, image inpainting, background or automatic tab-audio capture, meeting bots, or account cloud sync.
- [ ] Include support contact or repository issue link.

## Screenshots

- [ ] Use `docs/release/SCREENSHOT_GUIDE.md` before capturing store screenshots.
- [ ] Popup showing translation controls and learning summary.
- [ ] Floating button on a real web page.
- [ ] Selection translation tooltip.
- [ ] Control-hover paragraph translation.
- [ ] Input box translation shortcut.
- [ ] Side-panel text translation with provider/target controls and a translated result.
- [ ] Vocabulary notebook page.
- [ ] Review page.
- [ ] Options page with dictionary settings.

## Privacy practices

- [ ] Link `PRIVACY.md` or hosted equivalent.
- [ ] Disclose Chrome storage and Chrome sync use.
- [ ] Disclose all 24 implemented provider adapters and distinguish pre-granted hosts from provider hosts requested when configuration is saved.
- [ ] Disclose that provider API keys and client/application IDs stay in local Chrome storage and are excluded from Chrome sync and learning-data exports.
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
- [ ] Load a representative two-column academic PDF; confirm blocks are ordered down the left column before the right and translated overlays do not cross the inferred gutter.
- [ ] Load a PDF with standalone equations; confirm likely formulas are labeled as preserved, send no translation request, remain visible in preview, and are not painted over in exported pages.
- [ ] Confirm an image-only PDF tries local browser OCR first, falls back to bundled Tesseract OCR, reports per-page progress, and reports pages without detected text.
- [ ] Confirm English, Simplified Chinese, Traditional Chinese, Japanese, and Korean OCR choices persist and are shared by PDF and image translation.
- [ ] Confirm `dist/ocr` includes the worker, SIMD/non-SIMD LSTM core files, five compressed language models, and license files.
- [ ] Confirm Stop terminates an active image OCR session and removes all image overlays without starting work on another image.
- [ ] Confirm selected text shows a translation tooltip.
- [ ] Open the side panel from the popup and with `Alt+S`; confirm opening and mode changes send no provider request, configured providers are selectable, `Ctrl+Enter` translates, and Copy/Clear work.
- [ ] Run Polish, Rewrite, Write, Reply, and Summarize with a configured AI provider; confirm ordinary translation providers are disabled, output language/Tone/Length/Additional requirement are applied, and Use result as input works.
- [ ] Configure each credentialed provider with a test key or mock endpoint, verify masked-key display, and verify Remove configuration.
- [ ] Save Ollama without an API key, confirm Chrome requests `http://localhost/*`, and verify settings cannot activate it before provider configuration is saved.
- [ ] Confirm Image text stays idle until Start plus a click, drag, or Translate visible images action; confirm Stop cancels the remaining visible-image batch and clears overlays.
- [ ] Confirm Video subtitles consumes only exposed text-track/DOM caption text after Start and never requests tab audio capture.
- [ ] Confirm Live captions captures only visible DOM captions after Start, merges incremental updates, retains cues after Stop, exports TXT/SRT/VTT/JSON locally, and clears without recording audio.
- [ ] Configure OpenAI or Groq, select a supported local media file under 25 MB, click Generate subtitles, confirm timed cues can be translated and exported as SRT/VTT, and confirm Cancel stops the temporary upload.
- [ ] On Chrome 116 or newer, open Generate from media from a regular media tab, click Capture current tab, confirm source playback remains audible and no provider request occurs while capture is active; then Stop and generate and export SRT/VTT.
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
