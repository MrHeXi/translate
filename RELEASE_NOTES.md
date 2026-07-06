# LexiBridge Translate Release Notes

## 1.0.0 - 2026-07-06

Initial productized release candidate for local testing and Chrome Web Store preparation.

### Included

- User-triggered page translation from the popup or floating page button.
- Immediate Start/Stop behavior that restores the page when translation mode is turned off.
- Bottom-right floating button with a visible "Translate page" hint.
- Selected-text translation tooltip with vocabulary collection actions.
- Built-in CET4, CET6, GRE, IELTS, and TOEFL vocabulary dictionaries.
- Vocabulary notebook, review page, learning progress, import/export, and settings.
- Local-first data storage through Chrome storage, with Chrome sync support when enabled in the browser profile.
- Store listing draft, privacy policy, release checklist, and screenshot guide.

### Verification

Verified on 2026-07-06:

- `tsc --noEmit`: passed.
- `eslint src --ext .ts,.js`: passed.
- `jest --runInBand --silent`: passed, 23 test suites and 163 tests.
- `webpack --mode=production`: passed.
- `chrome-translation-extension.zip`: regenerated from `dist`.

Expected build warnings:

- Built-in vocabulary JSON files exceed the default webpack asset-size recommendation.
- The warning is accepted for this release because the dictionaries are bundled product data.

### Local Install Package

- Unpacked extension folder: `dist`
- Test package: `chrome-translation-extension.zip`

Keep generated package artifacts out of git unless a release process explicitly requires attaching them.
