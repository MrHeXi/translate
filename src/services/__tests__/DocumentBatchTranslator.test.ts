import { TextDecoder, TextEncoder } from 'util';
import { DocumentBatchTranslator } from '../DocumentBatchTranslator';
import { DocumentTextExtractor } from '../DocumentTextExtractor';
import { PdfDocumentService } from '../PdfDocumentService';

Object.assign(globalThis, { TextDecoder, TextEncoder });

const createFile = (name: string, content: string | Uint8Array, type = 'text/plain'): File => {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return {
    name,
    type,
    size: bytes.byteLength,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.slice().buffer
  } as File;
};

const createOptions = (overrides: Partial<Parameters<DocumentBatchTranslator['translateFile']>[1]> = {}) => ({
  targetLanguage: 'zh-CN',
  provider: 'google',
  ocrLanguage: 'eng' as const,
  requestIdPrefix: 'document-batch:task-1',
  signal: new AbortController().signal,
  translateText: jest.fn(async (text: string) => `Translated: ${text}`),
  ...overrides
});

describe('DocumentBatchTranslator', () => {
  afterEach(() => jest.restoreAllMocks());

  it('translates plain-text blocks in order with stable request IDs and progress', async () => {
    const translateText = jest.fn(async (
      text: string,
      _context: string,
      _requestId: string,
      _signal: AbortSignal
    ) => text.toUpperCase());
    const onProgress = jest.fn();
    const translator = new DocumentBatchTranslator();

    const output = await translator.translateFile(
      createFile('notes.txt', 'First paragraph.\n\nSecond paragraph.'),
      createOptions({ translateText, onProgress })
    );

    expect(translateText.mock.calls.map(call => [call[0], call[2]])).toEqual([
      ['First paragraph.', 'document-batch:task-1:block-1'],
      ['Second paragraph.', 'document-batch:task-1:block-2']
    ]);
    expect(new TextDecoder().decode(output.bytes)).toBe(
      'FIRST PARAGRAPH.\n\nSECOND PARAGRAPH.\n'
    );
    expect(output).toEqual(expect.objectContaining({
      sourceFileName: 'notes.txt',
      fileName: 'notes.translated.txt',
      mimeType: 'text/plain;charset=utf-8',
      blockCount: 2,
      translatedBlockCount: 2,
      preservedFormulaCount: 0
    }));
    expect(onProgress).toHaveBeenLastCalledWith({ completedBlocks: 2, totalBlocks: 2 });
  });

  it('preserves JSON and ASS structure in deterministic native-format outputs', async () => {
    const translator = new DocumentBatchTranslator();
    const jsonOutput = await translator.translateFile(
      createFile('data.json', '{"title":"Hello","items":["World",7]}', 'application/json'),
      createOptions({ translateText: async text => `T:${text}` })
    );
    expect(JSON.parse(new TextDecoder().decode(jsonOutput.bytes))).toEqual({
      title: 'T:Hello',
      items: ['T:World', 7]
    });
    expect(jsonOutput.fileName).toBe('data.translated.json');

    const ass = [
      '[Script Info]',
      'Title: Demo',
      '[Events]',
      'Format: Layer, Start, End, Style, Text',
      'Dialogue: 0,0:00:01.00,0:00:03.00,Default,{\\i1}Hello, world{\\i0}'
    ].join('\r\n');
    const assOutput = await translator.translateFile(
      createFile('captions.ass', ass),
      createOptions({ translateText: async () => 'Bonjour, monde' })
    );
    const rewritten = new TextDecoder().decode(assOutput.bytes);
    expect(rewritten).toContain('Dialogue: 0,0:00:01.00,0:00:03.00,Default,{\\i1}Bonjour, monde{\\i0}');
    expect(rewritten).toContain('Title: Demo\r\n');
    expect(assOutput.fileName).toBe('captions.translated.ass');
  });

  it('preserves VTT metadata and non-cue sections while replacing cue text', async () => {
    const source = [
      'WEBVTT',
      'Kind: captions',
      'Language: en',
      '',
      'STYLE',
      '::cue { color: lime; }',
      '',
      'NOTE This note must stay local',
      '',
      'intro',
      '00:00:01.000 --> 00:00:03.000 line:90%',
      'Hello world',
      ''
    ].join('\r\n');
    const translator = new DocumentBatchTranslator();

    const output = await translator.translateFile(
      createFile('captions.vtt', source, 'text/vtt'),
      createOptions({ translateText: async () => 'Bonjour le monde' })
    );
    const rewritten = new TextDecoder().decode(output.bytes);

    expect(rewritten).toBe(source.replace('Hello world', 'Bonjour le monde'));
    expect(rewritten).toContain('STYLE\r\n::cue { color: lime; }');
    expect(rewritten).toContain('NOTE This note must stay local');
    expect(rewritten).toContain('00:00:01.000 --> 00:00:03.000 line:90%');
  });

  it('imports MOBI/KF8 through the bounded extractor and exports translated text', async () => {
    const mobiExtractor = jest.spyOn(DocumentTextExtractor, 'extractBlocksFromMobiBytes')
      .mockResolvedValue([
        { id: 1, originalText: 'Chapter one' },
        { id: 2, originalText: 'Chapter two' }
      ]);
    const translator = new DocumentBatchTranslator();

    const output = await translator.translateFile(
      createFile('book.azw3', new Uint8Array([1, 2, 3]), 'application/octet-stream'),
      createOptions({ translateText: async text => `译文 ${text}` })
    );

    expect(mobiExtractor).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'kf8',
      1200,
      expect.any(AbortSignal)
    );
    expect(output.fileName).toBe('book.translated.txt');
    expect(new TextDecoder().decode(output.bytes)).toBe(
      '译文 Chapter one\n\n译文 Chapter two\n'
    );
  });

  it('preserves PDF formulas, exports a visual PDF, and destroys its session', async () => {
    const session = {
      analyze: jest.fn(async () => ({
        blocks: [
          { id: 1, originalText: 'Prose' },
          {
            id: 2,
            originalText: 'E = mc^2',
            layout: {
              pageNumber: 1,
              x: 1,
              y: 2,
              width: 30,
              height: 10,
              source: 'pdf-text' as const,
              contentKind: 'formula' as const
            }
          }
        ]
      })),
      exportTranslatedPdf: jest.fn(async (results: any[]) => {
        expect(results).toEqual([
          expect.objectContaining({ translatedText: 'Translated prose' }),
          expect.objectContaining({ translatedText: 'E = mc^2', preservedOriginal: true })
        ]);
        return new Uint8Array([37, 80, 68, 70]);
      }),
      destroy: jest.fn(async () => undefined)
    };
    const pdfService = {
      open: jest.fn(async () => session)
    } as unknown as PdfDocumentService;
    const translateText = jest.fn(async () => 'Translated prose');
    const translator = new DocumentBatchTranslator(pdfService);

    const output = await translator.translateFile(
      createFile('paper.pdf', new Uint8Array([37, 80, 68, 70]), 'application/pdf'),
      createOptions({
        translateText,
        scanPreprocessing: 'binarize',
        mixedLanguageOcr: true
      })
    );

    expect(pdfService.open).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        ocrLanguage: 'eng',
        scanPreprocessing: 'binarize',
        mixedLanguageOcr: true
      })
    );
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(output).toEqual(expect.objectContaining({
      fileName: 'paper.translated.pdf',
      blockCount: 2,
      translatedBlockCount: 1,
      preservedFormulaCount: 1
    }));
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it('aborts an active translation and never emits a partial output', async () => {
    const controller = new AbortController();
    const translateText = jest.fn((_text: string, _context: string, _requestId: string, signal: AbortSignal) => (
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('cancelled');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      })
    ));
    const translator = new DocumentBatchTranslator();
    const translation = translator.translateFile(
      createFile('cancel.txt', 'Do not finish'),
      createOptions({ signal: controller.signal, translateText })
    );

    await Promise.resolve();
    controller.abort();

    await expect(translation).rejects.toMatchObject({ name: 'AbortError' });
  });
});
