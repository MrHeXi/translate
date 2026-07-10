import { TextDecoder, TextEncoder } from 'util';
import { DocumentTextExtractor } from '../DocumentTextExtractor';

Object.assign(globalThis, {
  TextDecoder,
  TextEncoder
});

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};

const writeUint16 = (bytes: Uint8Array, offset: number, value: number): void => {
  new DataView(bytes.buffer).setUint16(offset, value, true);
};

const writeUint32 = (bytes: Uint8Array, offset: number, value: number): void => {
  new DataView(bytes.buffer).setUint32(offset, value, true);
};

const createStoredZip = (files: Array<{ name: string; content: string }>): Uint8Array => {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const localHeader = new Uint8Array(30 + nameBytes.length);

    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 8, 0);
    writeUint32(localHeader, 18, dataBytes.length);
    writeUint32(localHeader, 22, dataBytes.length);
    writeUint16(localHeader, 26, nameBytes.length);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 10, 0);
    writeUint32(centralHeader, 20, dataBytes.length);
    writeUint32(centralHeader, 24, dataBytes.length);
    writeUint16(centralHeader, 28, nameBytes.length);
    writeUint32(centralHeader, 42, localOffset);
    centralHeader.set(nameBytes, 46);

    localChunks.push(localHeader, dataBytes);
    centralChunks.push(centralHeader);
    localOffset += localHeader.length + dataBytes.length;
  }

  const centralDirectory = concatBytes(centralChunks);
  const endOfCentralDirectory = new Uint8Array(22);
  writeUint32(endOfCentralDirectory, 0, 0x06054b50);
  writeUint16(endOfCentralDirectory, 8, files.length);
  writeUint16(endOfCentralDirectory, 10, files.length);
  writeUint32(endOfCentralDirectory, 12, centralDirectory.length);
  writeUint32(endOfCentralDirectory, 16, localOffset);

  return concatBytes([...localChunks, centralDirectory, endOfCentralDirectory]);
};

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

  it('extracts SRT subtitle cue text while preserving timing metadata', () => {
    const blocks = DocumentTextExtractor.splitIntoBlocks([
      '1',
      '00:00:01,000 --> 00:00:03,000',
      'Welcome to the lecture.',
      '',
      '2',
      '00:00:04,000 --> 00:00:06,000',
      'This part should be translated.'
    ].join('\n'));

    expect(blocks).toEqual([
      {
        id: 1,
        originalText: 'Welcome to the lecture.',
        subtitle: {
          format: 'srt',
          index: '1',
          timing: '00:00:01,000 --> 00:00:03,000',
          textLines: ['Welcome to the lecture.']
        }
      },
      {
        id: 2,
        originalText: 'This part should be translated.',
        subtitle: {
          format: 'srt',
          index: '2',
          timing: '00:00:04,000 --> 00:00:06,000',
          textLines: ['This part should be translated.']
        }
      }
    ]);
  });

  it('extracts VTT subtitle cue text while preserving identifiers and timing settings', () => {
    const blocks = DocumentTextExtractor.extractBlocksFromSubtitleText([
      'WEBVTT',
      '',
      'intro-cue',
      '00:00:01.000 --> 00:00:03.000 align:start position:10%',
      'Welcome to the lecture.',
      '',
      '00:00:04.000 --> 00:00:06.000',
      'This part should be translated.'
    ].join('\n'));

    expect(blocks).toEqual([
      {
        id: 1,
        originalText: 'Welcome to the lecture.',
        subtitle: {
          format: 'vtt',
          identifier: 'intro-cue',
          timing: '00:00:01.000 --> 00:00:03.000 align:start position:10%',
          textLines: ['Welcome to the lecture.']
        }
      },
      {
        id: 2,
        originalText: 'This part should be translated.',
        subtitle: {
          format: 'vtt',
          timing: '00:00:04.000 --> 00:00:06.000',
          textLines: ['This part should be translated.']
        }
      }
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
    expect(blocks.map(block => block.json?.path)).toEqual([
      ['title'],
      ['sections', 0, 'heading'],
      ['sections', 0, 'body'],
      ['sections', 1, 'heading'],
      ['sections', 1, 'body']
    ]);
  });

  it('rewrites translated JSON string values while preserving structure', () => {
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
        }
      ]
    });
    const blocks = DocumentTextExtractor.extractBlocksFromJson(json);
    const rewritten = DocumentTextExtractor.rewriteJsonWithTranslations(json, [
      { block: blocks[0]!, translatedText: 'Translated quick start' },
      { block: blocks[1]!, translatedText: 'Translated install the extension' },
      { block: blocks[2]!, translatedText: 'Translated load the unpacked folder.' }
    ]);

    expect(JSON.parse(rewritten)).toEqual({
      title: 'Translated quick start',
      metadata: {
        version: 1,
        published: true
      },
      sections: [
        {
          heading: 'Translated install the extension',
          body: 'Translated load the unpacked folder.'
        }
      ]
    });

    const rootStringBlocks = DocumentTextExtractor.extractBlocksFromJson('"Standalone string"');
    const rewrittenRootString = DocumentTextExtractor.rewriteJsonWithTranslations('"Standalone string"', [
      { block: rootStringBlocks[0]!, translatedText: 'Translated standalone string' }
    ]);

    expect(JSON.parse(rewrittenRootString)).toBe('Translated standalone string');
  });

  it('falls back to plain text blocks when JSON parsing fails', () => {
    const blocks = DocumentTextExtractor.extractBlocksFromJson('{"title": "Broken"\n\nSecond fallback block.');

    expect(blocks.map(block => block.originalText)).toEqual([
      '{"title": "Broken"',
      'Second fallback block.'
    ]);
  });

  it('extracts readable DOCX paragraph text from WordprocessingML entries', async () => {
    const docxBytes = createStoredZip([
      {
        name: 'word/document.xml',
        content: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
          '<w:body>',
          '<w:p><w:r><w:t>First DOCX paragraph.</w:t></w:r></w:p>',
          '<w:p><w:r><w:t>Second </w:t></w:r><w:r><w:t>paragraph &amp; details.</w:t></w:r></w:p>',
          '</w:body>',
          '</w:document>'
        ].join('')
      }
    ]);

    const blocks = await DocumentTextExtractor.extractBlocksFromDocxBytes(docxBytes);

    expect(blocks.map(block => block.originalText)).toEqual([
      'First DOCX paragraph.',
      'Second paragraph & details.'
    ]);
    expect(blocks.map(block => block.docx)).toEqual([
      { entryName: 'word/document.xml', paragraphIndex: 0 },
      { entryName: 'word/document.xml', paragraphIndex: 1 }
    ]);
  });

  it('rewrites translated DOCX paragraphs while preserving the document archive', async () => {
    const docxBytes = createStoredZip([
      {
        name: '[Content_Types].xml',
        content: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
      },
      {
        name: 'word/document.xml',
        content: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
          '<w:body>',
          '<w:p><w:r><w:t>First DOCX paragraph.</w:t></w:r></w:p>',
          '<w:p><w:r><w:t>Second </w:t></w:r><w:r><w:t>paragraph.</w:t></w:r></w:p>',
          '</w:body>',
          '</w:document>'
        ].join('')
      }
    ]);
    const blocks = await DocumentTextExtractor.extractBlocksFromDocxBytes(docxBytes);
    const rewritten = await DocumentTextExtractor.rewriteDocxWithTranslations(docxBytes, [
      { block: blocks[0]!, translatedText: 'Translated first paragraph.' },
      { block: blocks[1]!, translatedText: 'Translated second paragraph.' }
    ]);

    const rewrittenArchiveText = new TextDecoder('utf-8').decode(rewritten);
    expect(rewrittenArchiveText).toContain('[Content_Types].xml');
    expect(rewrittenArchiveText).toContain('<w:body>');
    expect(rewrittenArchiveText).toContain('Translated first paragraph.');
    expect(rewrittenArchiveText).toContain('Translated second paragraph.');
    expect(rewrittenArchiveText).not.toContain('First DOCX paragraph.');
    expect(rewrittenArchiveText).not.toContain('Second ');

    const rewrittenBlocks = await DocumentTextExtractor.extractBlocksFromDocxBytes(rewritten);
    expect(rewrittenBlocks.map(block => block.originalText)).toEqual([
      'Translated first paragraph.',
      'Translated second paragraph.'
    ]);
  });

  it('extracts EPUB spine documents in reading order', async () => {
    const epubBytes = createStoredZip([
      {
        name: 'META-INF/container.xml',
        content: [
          '<?xml version="1.0"?>',
          '<container version="1.0">',
          '<rootfiles>',
          '<rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>',
          '</rootfiles>',
          '</container>'
        ].join('')
      },
      {
        name: 'OPS/package.opf',
        content: [
          '<package>',
          '<manifest>',
          '<item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>',
          '<item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>',
          '</manifest>',
          '<spine>',
          '<itemref idref="chapter1"/>',
          '<itemref idref="chapter2"/>',
          '</spine>',
          '</package>'
        ].join('')
      },
      {
        name: 'OPS/chapter1.xhtml',
        content: '<html><body><h1>Chapter One</h1><p>Open with the first scene.</p></body></html>'
      },
      {
        name: 'OPS/chapter2.xhtml',
        content: '<html><body><h1>Chapter Two</h1><p>Continue with the second scene.</p></body></html>'
      }
    ]);

    const blocks = await DocumentTextExtractor.extractBlocksFromEpubBytes(epubBytes);

    expect(blocks.map(block => block.originalText)).toEqual([
      'Chapter One',
      'Open with the first scene.',
      'Chapter Two',
      'Continue with the second scene.'
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
