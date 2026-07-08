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
