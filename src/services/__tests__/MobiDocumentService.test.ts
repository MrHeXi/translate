import { TextEncoder } from 'util';
import { DocumentTextExtractor } from '../DocumentTextExtractor';
import {
  MOBI_DOCUMENT_MAX_FILE_BYTES,
  MobiDocumentService,
  mobiDocumentService
} from '../MobiDocumentService';

Object.assign(globalThis, { TextEncoder });

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createParser = (overrides: Partial<{
  getSpine: () => Array<{ id: string; text?: string }>;
  loadChapter: (id: string) => { html: string } | undefined;
  destroy: () => void;
}> = {}) => ({
  getSpine: jest.fn(() => [] as Array<{ id: string; text?: string }>),
  loadChapter: jest.fn((_id: string) => undefined as { html: string } | undefined),
  destroy: jest.fn(),
  ...overrides
});

describe('MobiDocumentService', () => {
  it('uses raw MOBI spine HTML in deterministic order and always destroys the parser', async () => {
    const parser = createParser({
      getSpine: jest.fn(() => [
        { id: 'chapter-2', text: '<p>Second</p>' },
        { id: 'blank', text: '  ' },
        { id: 'chapter-1', text: '<p>First</p>' }
      ])
    });
    const mobiFactory = jest.fn(async () => parser);
    const kf8Factory = jest.fn(async () => createParser());
    const service = new MobiDocumentService({ mobi: mobiFactory, kf8: kf8Factory });
    const source = new Uint8Array([1, 2, 3]);

    const chapters = await service.extractChapters(source, 'mobi');

    expect(chapters).toEqual([
      { id: 'chapter-2', index: 0, html: '<p>Second</p>' },
      { id: 'chapter-1', index: 2, html: '<p>First</p>' }
    ]);
    expect(mobiFactory).toHaveBeenCalledWith(source);
    expect(kf8Factory).not.toHaveBeenCalled();
    expect(parser.loadChapter).not.toHaveBeenCalled();
    expect(parser.destroy).toHaveBeenCalledTimes(1);
  });

  it('loads KF8 chapters by spine id and skips unavailable chapters', async () => {
    const parser = createParser({
      getSpine: jest.fn(() => [{ id: 'a' }, { id: 'missing' }, { id: 'b' }]),
      loadChapter: jest.fn((id: string) => (
        id === 'missing' ? undefined : { html: `<p>${id.toUpperCase()}</p>` }
      ))
    });
    const service = new MobiDocumentService({
      mobi: jest.fn(async () => createParser()),
      kf8: jest.fn(async () => parser)
    });

    await expect(service.extractChapters(new Uint8Array([7]), 'kf8')).resolves.toEqual([
      { id: 'a', index: 0, html: '<p>A</p>' },
      { id: 'b', index: 2, html: '<p>B</p>' }
    ]);
    expect(parser.loadChapter).toHaveBeenCalledTimes(3);
    expect(parser.destroy).toHaveBeenCalledTimes(1);
  });

  it('enforces file, spine, chapter, and total extracted HTML bounds', async () => {
    const createService = (spine: Array<{ id: string; text: string }>) => new MobiDocumentService({
      mobi: jest.fn(async () => createParser({ getSpine: () => spine })),
      kf8: jest.fn(async () => createParser())
    });

    await expect(createService([]).extractChapters(new Uint8Array(), 'mobi'))
      .rejects.toThrow(/empty/i);
    await expect(createService([]).extractChapters(
      new Uint8Array(MOBI_DOCUMENT_MAX_FILE_BYTES + 1),
      'mobi'
    )).rejects.toThrow(/cannot exceed/i);
    await expect(createService([
      { id: '1', text: 'a' },
      { id: '2', text: 'b' }
    ]).extractChapters(new Uint8Array([1]), 'mobi', { maxChapters: 1 }))
      .rejects.toThrow(/spine items/i);
    await expect(createService([{ id: '1', text: 'abcd' }]).extractChapters(
      new Uint8Array([1]),
      'mobi',
      { maxChapterBytes: 3 }
    )).rejects.toThrow(/spine item 1/i);
    await expect(createService([
      { id: '1', text: 'abc' },
      { id: '2', text: 'def' }
    ]).extractChapters(new Uint8Array([1]), 'mobi', { maxTotalHtmlBytes: 5 }))
      .rejects.toThrow(/extracted HTML/i);
  });

  it('aborts before initialization and between chapters, with parser cleanup', async () => {
    const beforeStart = new AbortController();
    beforeStart.abort();
    const untouchedFactory = jest.fn(async () => createParser());
    const untouchedService = new MobiDocumentService({
      mobi: untouchedFactory,
      kf8: untouchedFactory
    });

    await expect(untouchedService.extractChapters(
      new Uint8Array([1]),
      'mobi',
      { signal: beforeStart.signal }
    )).rejects.toMatchObject({ name: 'AbortError' });
    expect(untouchedFactory).not.toHaveBeenCalled();

    const duringParse = new AbortController();
    const spine = [
      { id: 'one', text: '<p>One</p>' },
      { id: 'two', text: '<p>Two</p>' }
    ];
    const parser = createParser({
      getSpine: () => spine
    });
    Object.defineProperty(spine[0], 'text', {
      get: () => {
        duringParse.abort();
        return '<p>One</p>';
      }
    });
    const service = new MobiDocumentService({
      mobi: jest.fn(async () => parser),
      kf8: jest.fn(async () => parser)
    });

    await expect(service.extractChapters(
      new Uint8Array([1]),
      'mobi',
      { signal: duringParse.signal }
    )).rejects.toMatchObject({ name: 'AbortError' });
    expect(parser.destroy).toHaveBeenCalledTimes(1);
  });

  it('returns immediately when parser initialization is cancelled and destroys a late parser', async () => {
    const parserResult = deferred<ReturnType<typeof createParser>>();
    const controller = new AbortController();
    const service = new MobiDocumentService({
      mobi: jest.fn(() => parserResult.promise),
      kf8: jest.fn(() => parserResult.promise)
    });

    const extraction = service.extractChapters(
      new Uint8Array([1]),
      'mobi',
      { signal: controller.signal }
    );
    await Promise.resolve();
    controller.abort();
    await expect(extraction).rejects.toMatchObject({ name: 'AbortError' });

    const parser = createParser();
    parserResult.resolve(parser);
    await Promise.resolve();
    await Promise.resolve();
    expect(parser.destroy).toHaveBeenCalledTimes(1);
  });

});

describe('DocumentTextExtractor MOBI integration', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps spine, readable-block, and chunk order in block metadata', async () => {
    jest.spyOn(mobiDocumentService, 'extractChapters').mockResolvedValue([
      {
        id: 'chapter-b',
        index: 0,
        html: '<h1>Heading</h1><p>Alpha beta gamma delta</p><p>Heading</p>'
      },
      {
        id: 'chapter-a',
        index: 1,
        html: '<p>Final chapter</p>'
      }
    ]);

    const blocks = await DocumentTextExtractor.extractBlocksFromMobiBytes(
      new Uint8Array([1]),
      'mobi',
      12
    );

    expect(blocks.map(block => block.originalText)).toEqual([
      'Heading',
      'Alpha beta',
      'gamma delta',
      'Heading',
      'Final',
      'chapter'
    ]);
    expect(blocks.map(block => block.mobi)).toEqual([
      { format: 'mobi', chapterId: 'chapter-b', chapterIndex: 0, blockIndex: 0, chunkIndex: 0 },
      { format: 'mobi', chapterId: 'chapter-b', chapterIndex: 0, blockIndex: 1, chunkIndex: 0 },
      { format: 'mobi', chapterId: 'chapter-b', chapterIndex: 0, blockIndex: 1, chunkIndex: 1 },
      { format: 'mobi', chapterId: 'chapter-b', chapterIndex: 0, blockIndex: 2, chunkIndex: 0 },
      { format: 'mobi', chapterId: 'chapter-a', chapterIndex: 1, blockIndex: 0, chunkIndex: 0 },
      { format: 'mobi', chapterId: 'chapter-a', chapterIndex: 1, blockIndex: 0, chunkIndex: 1 }
    ]);
    expect(blocks.every(block => Array.from(block.originalText).length <= 12)).toBe(true);
  });

  it('routes .mobi and .azw3 files through the bounded MOBI extractor', async () => {
    const extractor = jest.spyOn(DocumentTextExtractor, 'extractBlocksFromMobiBytes')
      .mockResolvedValue([{ id: 1, originalText: 'Book text' }]);

    const mobiFile = {
      name: 'book.mobi',
      type: 'application/x-mobipocket-ebook',
      arrayBuffer: async () => new Uint8Array([1]).buffer
    } as File;
    const kf8File = {
      name: 'book.azw3',
      type: 'application/octet-stream',
      arrayBuffer: async () => new Uint8Array([2]).buffer
    } as File;

    await expect(DocumentTextExtractor.extractBlocksFromFile(mobiFile)).resolves.toHaveLength(1);
    await expect(DocumentTextExtractor.extractBlocksFromFile(kf8File)).resolves.toHaveLength(1);
    expect(extractor.mock.calls.map(call => call[1])).toEqual(['mobi', 'kf8']);
  });
});
