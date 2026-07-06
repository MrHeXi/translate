import { readFileSync } from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readHtml = (relativePath: string): string =>
  readFileSync(path.join(rootDir, relativePath), 'utf8');

const mojibakePattern = /[�]|馃|缈|鎻|鍔|鐢|澶|璇|鏄|寮|涓|浠|绠|鈫|鉁|脳/;

describe('first-run and empty-state copy', () => {
  const htmlFiles = [
    'src/popup/popup.html',
    'src/options/vocabulary.html',
    'src/options/review.html',
    'src/options/options.html'
  ];

  it('keeps user-facing HTML free of mojibake', () => {
    htmlFiles.forEach(relativePath => {
      expect(readHtml(relativePath)).not.toMatch(mojibakePattern);
    });
  });

  it('explains the core workflow in the popup without turning it into a landing page', () => {
    const popupHtml = readHtml('src/popup/popup.html');

    expect(popupHtml).toContain('LexiBridge Translate');
    expect(popupHtml).toContain('Translate while you read. Save words you want to review.');
    expect(popupHtml).toContain('Page translation');
    expect(popupHtml).toContain('manual floating button');
    expect(popupHtml).toContain('Start');
    expect(popupHtml).toContain('Vocabulary notebook');
    expect(popupHtml).toContain('Review words');
    expect(popupHtml).toContain('Recent words');
    expect(popupHtml).toContain('No saved words yet');
  });

  it('gives useful empty-state guidance on vocabulary and review pages', () => {
    const vocabularyHtml = readHtml('src/options/vocabulary.html');
    const reviewHtml = readHtml('src/options/review.html');

    expect(vocabularyHtml).toContain('No saved words yet');
    expect(vocabularyHtml).toContain('Select text on a page, save the word, then review it here.');
    expect(vocabularyHtml).toContain('Choose a built-in dictionary to browse exam words.');

    expect(reviewHtml).toContain('No due words yet?');
    expect(reviewHtml).toContain('Choose New words to practice from enabled built-in dictionaries.');
  });

  it('describes each built-in dictionary in options', () => {
    const optionsHtml = readHtml('src/options/options.html');

    expect(optionsHtml).toContain('GRE graduate exam vocabulary');
    expect(optionsHtml).toContain('TOEFL academic vocabulary');
    expect(optionsHtml).toContain('IELTS exam vocabulary');
    expect(optionsHtml).toContain('CET4 college English vocabulary');
    expect(optionsHtml).toContain('CET6 college English vocabulary');
    expect(optionsHtml).toContain('Highlight enabled dictionary words while reading');
  });
});
