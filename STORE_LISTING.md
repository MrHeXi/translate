# LexiBridge Translate Store Listing

Use this draft as the source material for the Chrome Web Store listing, screenshots, support notes, and privacy questionnaire.

## Store Name

LexiBridge Translate

## Short Description

Translate web pages on demand, save unknown words, and review CET, GRE, IELTS, and TOEFL vocabulary.

## Detailed Description

LexiBridge Translate helps you read real web pages in another language and turn unknown words into review material.

Page translation is always user-triggered. Start from the extension popup or the floating page button, then stop translation with the same control to restore the page. LexiBridge also supports selected-text translation, so you can look up a phrase without translating the whole page.

The extension includes built-in CET4, CET6, GRE, IELTS, and TOEFL vocabulary sets. Enable the dictionaries you care about, collect useful words from the pages you read, and review saved or due words from the review page.

Core features:

- Manual page translation from the popup or floating button.
- Selection translation tooltip for quick lookups.
- Vocabulary notebook for saved words, translations, examples, mastery level, and review schedule.
- Built-in CET4, CET6, GRE, IELTS, and TOEFL dictionaries.
- Review page for due words and new dictionary words.
- Import and export for learning data.
- Chrome storage support, with Chrome sync available when enabled in the browser profile.

Privacy summary:

- Translation requests are sent only after the user asks LexiBridge to translate selected text or a page.
- Settings, vocabulary, review progress, and learning stats are stored in Chrome storage.
- LexiBridge does not run its own account server.
- No default telemetry is collected.

LexiBridge is designed for reading, vocabulary collection, and review. Do not add unsupported claims beyond the features listed here.

## Search Keywords

translation, page translation, vocabulary, English learning, CET4, CET6, GRE, IELTS, TOEFL, review, study, reading, dictionary, selection translation

## Screenshot Plan

1. Popup with Start/Stop translation control, active dictionary count, and recent saved words.
2. Web page with the bottom-right floating button and the "Translate page" hint visible.
3. Web page after manual translation starts, showing progress without a full-page blocking overlay.
4. Selected text translation tooltip with save-to-vocabulary action.
5. Vocabulary notebook with saved words and review metadata.
6. Review page showing a due word card.
7. Options page showing dictionary selection and translation settings.

## Permission Justifications

- `storage`: save settings, vocabulary notebook items, review schedules, learning stats, and dictionary preferences.
- `activeTab`: interact with the current tab only after the user starts translation or opens extension controls.
- `scripting`: inject or refresh extension scripts and styles when a user action needs the extension UI on the current tab.
- `tabs`: find the active tab and send messages between the popup and content script.
- `https://translate.googleapis.com/*`: send user-requested text to Google Translate's public translation endpoint.
- `https://api.mymemory.translated.net/*`: send user-requested text to the MyMemory translation endpoint.

## Privacy Questionnaire Notes

- Single purpose: user-triggered web translation, selected-text translation, vocabulary collection, and vocabulary review.
- Personal or sensitive user data: no account credentials, payment data, health data, financial data, or personal communications are collected by the extension.
- Website content: only the text needed for the user-requested translation is sent to the selected translation provider.
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
- Vocabulary and review data are stored in Chrome storage. Chrome may sync the data if browser sync is enabled.
