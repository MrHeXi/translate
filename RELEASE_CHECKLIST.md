# LexiBridge Translate Release Checklist

Use this checklist before creating a public package or submitting to Chrome Web Store.

## Version

- [ ] Confirm `manifest.json` version is correct.
- [ ] Confirm release notes match the version.
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
- [ ] Do not claim document layout translation, video subtitles, image reading, meeting translation, or account cloud sync.
- [ ] Include support contact or repository issue link.

## Screenshots

- [ ] Popup showing translation controls and learning summary.
- [ ] Floating button on a real web page.
- [ ] Selection translation tooltip.
- [ ] Vocabulary notebook page.
- [ ] Review page.
- [ ] Options page with dictionary settings.

## Privacy practices

- [ ] Link `PRIVACY.md` or hosted equivalent.
- [ ] Disclose Chrome storage and Chrome sync use.
- [ ] Disclose Translation provider requests to `translate.googleapis.com` and `api.mymemory.translated.net`.
- [ ] State that there is no default telemetry.
- [ ] Confirm the listing privacy fields match the policy.

## Permissions

- [ ] `storage` is explained by settings, vocabulary, learning progress, and review state.
- [ ] `activeTab` is explained by current-tab user actions.
- [ ] `scripting` is explained by extension script/style refresh behavior.
- [ ] `tabs` is explained by active-tab messaging.
- [ ] Host permissions are limited to translation provider endpoints.
- [ ] No new permission has been added without a user-facing reason.

## Manual Smoke Test

- [ ] Load unpacked extension from `dist`.
- [ ] Confirm extension name and icon are correct in Chrome.
- [ ] Confirm page translation does not start automatically.
- [ ] Confirm the floating button starts translation and the next click stops it.
- [ ] Confirm selected text shows a translation tooltip.
- [ ] Confirm a word can be saved and appears in the vocabulary page.
- [ ] Confirm review page can load due or new words.
- [ ] Confirm export and import controls are reachable.

## Package

- [ ] Confirm `chrome-translation-extension.zip` exists.
- [ ] Confirm `dist/manifest.json` contains release metadata.
- [ ] Confirm `dist/data/vocabularies` contains CET4, CET6, GRE, IELTS, and TOEFL files.
- [ ] Keep generated package out of git unless a release process explicitly requires attaching it.
