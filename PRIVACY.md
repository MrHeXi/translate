# LexiBridge Translate Privacy Policy

Last updated: 2026-07-06

LexiBridge Translate is a browser extension for user-triggered page translation, document text translation, video subtitle text translation, selection translation, vocabulary collection, and vocabulary review.

## Data Stored by the Extension

LexiBridge uses Chrome storage for product functionality:

- Settings: target language, translation provider, enabled dictionaries, floating button visibility, and related preferences.
- Vocabulary notebook: saved words, translations, examples, dictionary type, mastery level, review count, and review schedule.
- Learning stats: daily goal, streaks, review accuracy, time spent learning, and dictionary progress.
- Cached data: built-in dictionary progress and temporary translation cache used to reduce repeated requests during a session.

Chrome storage may sync data through the user's browser profile if Chrome sync is enabled. LexiBridge does not run its own account server.

## Translation Provider Requests

Translation provider requests happen only after the user asks LexiBridge to translate selected text, document text, available video subtitle text, or a page.

When the user translates selected text, starts page translation, translates a document in the document translator, or manually starts video subtitle translation for a page with available caption tracks, LexiBridge sends the requested text to the selected translation provider.

Current provider hosts:

- `translate.googleapis.com`
- `api.mymemory.translated.net`

The extension sends the text needed for the requested translation and the selected target language. Uploaded document files are read locally in the browser; the extension sends only the extracted text blocks that the user asks to translate. Video subtitle translation sends caption or subtitle text only after the user turns it on, and LexiBridge does not record audio for this feature. Translation provider handling is governed by the provider's own terms and privacy practices.

## No Default Telemetry

No default telemetry is collected. LexiBridge does not send usage analytics, learning stats, browsing history, saved vocabulary, or review data to an application analytics service by default.

If optional analytics are added later, they must be opt-in and documented before release.

## Page Access

The extension runs a content script on pages so it can show the floating button, translate selected text, highlight enabled dictionary words, and insert user-requested page translations.

LexiBridge does not translate pages automatically. Page translation starts only after user action from the popup or floating button. Video subtitle translation also starts only after user action from the popup.

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
