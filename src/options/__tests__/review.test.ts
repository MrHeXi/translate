import fs from 'fs';
import path from 'path';

const loadReviewHtml = (): void => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'review.html'),
    'utf8'
  );
  const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1] || '';
  document.body.innerHTML = body;
};

const flushPromises = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('Review page', () => {
  beforeEach(() => {
    jest.resetModules();
    loadReviewHtml();

    (global as any).alert = jest.fn();
    (global as any).confirm = jest.fn().mockReturnValue(true);

    (global as any).chrome = {
      runtime: {
        lastError: null,
        getURL: jest.fn((url: string) => `chrome-extension://test/${url}`),
        sendMessage: jest.fn((message: any, callback: (response: any) => void) => {
          if (message.action === 'getDueReviewCount') {
            callback({ success: true, data: 0 });
            return;
          }

          if (message.action === 'getReviewItems') {
            callback({
              success: true,
              data: [
                {
                  word: 'ability',
                  translation: '能力',
                  context: 'ability example.',
                  sourceUrl: 'built-in:cet4',
                  addedDate: new Date().toISOString(),
                  reviewCount: 0,
                  masteryLevel: 0,
                  nextReviewDate: new Date().toISOString(),
                  dictionaryType: 'cet4',
                  fromBuiltInDictionary: true
                },
                { word: 'abandon', translation: '放弃', context: '', sourceUrl: 'built-in:cet4' },
                { word: 'absent', translation: '缺席', context: '', sourceUrl: 'built-in:cet4' },
                { word: 'accept', translation: '接受', context: '', sourceUrl: 'built-in:cet4' },
                { word: 'access', translation: '进入', context: '', sourceUrl: 'built-in:cet4' },
                { word: 'account', translation: '账户', context: '', sourceUrl: 'built-in:cet4' }
              ]
            });
            return;
          }

          callback({ success: true });
        })
      },
      tabs: {
        create: jest.fn()
      }
    };
  });

  it('renders a review card in the current review page markup', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    jest.isolateModules(() => {
      require('../review');
    });
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    document.getElementById('startReview')?.click();
    await flushPromises();

    expect(document.getElementById('reviewSetup')?.style.display).toBe('none');
    expect(document.getElementById('reviewMain')?.style.display).toBe('flex');
    expect(document.getElementById('questionText')?.textContent).toBe('ability');
    expect(document.getElementById('contextText')?.textContent).toBe('ability example.');
    expect(Array.from(document.querySelectorAll('.option-btn')).some(
      button => button.textContent === '能力'
    )).toBe(true);

    randomSpy.mockRestore();
  });
});
