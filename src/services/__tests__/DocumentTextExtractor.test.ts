import { DocumentTextExtractor } from '../DocumentTextExtractor';

describe('DocumentTextExtractor', () => {
  it('splits prose documents into stable translation blocks', () => {
    const blocks = DocumentTextExtractor.splitIntoBlocks([
      'First paragraph with useful context.',
      '',
      'Second paragraph should become another block.'
    ].join('\n'));

    expect(blocks).toEqual([
      { id: 1, originalText: 'First paragraph with useful context.' },
      { id: 2, originalText: 'Second paragraph should become another block.' }
    ]);
  });

  it('extracts subtitle cue text without indexes or timestamps', () => {
    const blocks = DocumentTextExtractor.splitIntoBlocks([
      '1',
      '00:00:01,000 --> 00:00:03,000',
      'Welcome to the lecture.',
      '',
      '2',
      '00:00:04,000 --> 00:00:06,000',
      'This part should be translated.'
    ].join('\n'));

    expect(blocks.map(block => block.originalText)).toEqual([
      'Welcome to the lecture.',
      'This part should be translated.'
    ]);
  });

  it('extracts readable text blocks from HTML without scripts or tags', () => {
    const html = [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<style>.hidden { display: none; }</style>',
      '<script>window.secret = "do not translate";</script>',
      '</head>',
      '<body>',
      '<article>',
      '<h1>Install &amp; setup</h1>',
      '<p>First <strong>paragraph</strong> with&nbsp;spacing.</p>',
      '<ul>',
      '<li>Keep manual control.</li>',
      '<li>Review saved words.</li>',
      '</ul>',
      '</article>',
      '</body>',
      '</html>'
    ].join('');

    const blocks = DocumentTextExtractor.extractBlocksFromHtml(html);

    expect(blocks.map(block => block.originalText)).toEqual([
      'Install & setup',
      'First paragraph with spacing.',
      'Keep manual control.',
      'Review saved words.'
    ]);
    expect(blocks.map(block => block.originalText).join('\n')).not.toContain('do not translate');
    expect(blocks.map(block => block.originalText).join('\n')).not.toContain('<strong>');
  });

  it('uses HTML extraction when loading HTML files', async () => {
    const html = [
      '<main>',
      '<h1>Release notes</h1>',
      '<p>Translate the document body.</p>',
      '<script>Translate nothing from scripts.</script>',
      '</main>'
    ].join('');
    const file = new File([html], 'notes.html', { type: 'text/html' });
    Object.defineProperty(file, 'text', {
      value: async () => html,
      configurable: true
    });

    const blocks = await DocumentTextExtractor.extractBlocksFromFile(file);

    expect(blocks.map(block => block.originalText)).toEqual([
      'Release notes',
      'Translate the document body.'
    ]);
  });

  it('extracts readable string values from JSON documents', () => {
    const json = JSON.stringify({
      title: 'Quick start',
      metadata: {
        version: 1,
        published: true
      },
      sections: [
        {
          heading: 'Install the extension',
          body: 'Open Chrome extensions and load the unpacked folder.'
        },
        {
          heading: 'Translate manually',
          body: 'Click Start only when you want page translation.'
        }
      ]
    });

    const blocks = DocumentTextExtractor.extractBlocksFromJson(json);

    expect(blocks.map(block => block.originalText)).toEqual([
      'Quick start',
      'Install the extension',
      'Open Chrome extensions and load the unpacked folder.',
      'Translate manually',
      'Click Start only when you want page translation.'
    ]);
  });

  it('falls back to plain text blocks when JSON parsing fails', () => {
    const blocks = DocumentTextExtractor.extractBlocksFromJson('{"title": "Broken"\n\nSecond fallback block.');

    expect(blocks.map(block => block.originalText)).toEqual([
      '{"title": "Broken"',
      'Second fallback block.'
    ]);
  });

  it('extracts text from simple text-based PDF operators', () => {
    const pdf = [
      '%PDF-1.4',
      'BT',
      '(Hello from PDF) Tj',
      '[( and ) 20 (array text)] TJ',
      '<FEFF4F60597D> Tj',
      'ET'
    ].join('\n');
    const bytes = new Uint8Array([...pdf].map(character => character.charCodeAt(0)));

    const text = DocumentTextExtractor.extractTextFromPdfBytes(bytes);

    expect(text).toContain('Hello from PDF');
    expect(text).toContain('and array text');
    expect(text).toContain('\u4F60\u597D');
  });

  it('extracts layout blocks from simple PDF text streams', () => {
    const pdf = [
      '%PDF-1.4',
      'stream',
      'BT',
      '1 0 0 1 72 720 Tm',
      '(First page heading) Tj',
      '1 0 0 1 72 690 Tm',
      '[(First ) 20 (page body)] TJ',
      'ET',
      'endstream',
      'stream',
      'BT',
      '1 0 0 1 64 700 Tm',
      '(Second page text) Tj',
      'ET',
      'endstream'
    ].join('\n');
    const bytes = new Uint8Array([...pdf].map(character => character.charCodeAt(0)));

    const blocks = DocumentTextExtractor.extractLayoutBlocksFromPdfBytes(bytes);

    expect(blocks).toEqual([
      {
        id: 1,
        originalText: 'First page heading',
        layout: {
          pageNumber: 1,
          x: 72,
          y: 720,
          width: 126,
          height: 18,
          source: 'pdf-text'
        }
      },
      {
        id: 2,
        originalText: 'First page body',
        layout: {
          pageNumber: 1,
          x: 72,
          y: 690,
          width: 105,
          height: 18,
          source: 'pdf-text'
        }
      },
      {
        id: 3,
        originalText: 'Second page text',
        layout: {
          pageNumber: 2,
          x: 64,
          y: 700,
          width: 112,
          height: 18,
          source: 'pdf-text'
        }
      }
    ]);
  });
});
