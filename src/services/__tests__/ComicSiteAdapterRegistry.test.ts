import {
  COMIC_CHAPTER_LIMITS,
  ComicSiteAdapterRegistry
} from '../ComicSiteAdapterRegistry';

const setImageGeometry = (image: HTMLImageElement, width = 720, height = 1200): void => {
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: width });
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: height });
  Object.defineProperty(image, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 5000,
      left: 0,
      top: 5000,
      right: width,
      bottom: 5000 + height,
      width,
      height,
      toJSON: () => ({})
    })
  });
};

describe('ComicSiteAdapterRegistry', () => {
  const registry = new ComicSiteAdapterRegistry();

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('discovers a fixed MangaDex chapter snapshot without decoding or scrolling', () => {
    document.body.innerHTML = `
      <main id="chapter-container">
        <img id="page-1" src="/page-1.jpg">
        <img id="page-2" src="/page-2.jpg">
        <img id="duplicate" src="/page-2.jpg">
      </main>
      <aside><img id="ad" src="/ad.jpg"></aside>
    `;
    const decode = jest.fn();
    document.querySelectorAll('img').forEach(image => {
      setImageGeometry(image as HTMLImageElement);
      Object.defineProperty(image, 'decode', { configurable: true, value: decode });
    });

    const result = registry.discover(document, new URL('https://mangadex.org/chapter/123?page=1'));

    expect(result).toEqual(expect.objectContaining({
      adapterId: 'mangadex-v1',
      adapterVersion: 1,
      siteLabel: 'MangaDex',
      navigationKey: 'https://mangadex.org/chapter/123?page=1',
      limitReached: false
    }));
    expect(result.candidates.map(candidate => candidate.element.id)).toEqual(['page-1', 'page-2']);
    expect(result.candidates.map(candidate => candidate.order)).toEqual([0, 1]);
    expect(decode).not.toHaveBeenCalled();
  });

  it('caps a generic chapter snapshot at 48 images in DOM order', () => {
    const main = document.createElement('main');
    main.className = 'chapter-reader';
    for (let index = 0; index < COMIC_CHAPTER_LIMITS.maxImages + 5; index += 1) {
      const image = document.createElement('img');
      image.id = `page-${index}`;
      image.src = `/page-${index}.jpg`;
      setImageGeometry(image);
      main.appendChild(image);
    }
    document.body.appendChild(main);

    const result = registry.discover(document, new URL('https://example.com/read/chapter-1'));

    expect(result.adapterId).toBe('generic-dom-v1');
    expect(result.candidates).toHaveLength(COMIC_CHAPTER_LIMITS.maxImages);
    expect(result.candidates[0].element.id).toBe('page-0');
    expect(result.candidates.at(-1)?.element.id).toBe('page-47');
    expect(result.limitReached).toBe(true);
  });

  it('collects chapter images across separate reader roots in document order', () => {
    document.body.innerHTML = Array.from({ length: 4 }, (_item, index) => (
      `<section class="reader-page"><img id="page-${index}" src="/page-${index}.jpg"></section>`
    )).join('');
    document.querySelectorAll('img').forEach(image => setImageGeometry(image as HTMLImageElement));

    const result = registry.discover(document, new URL('https://example.com/read/chapter-2'));

    expect(result.candidates.map(candidate => candidate.element.id)).toEqual([
      'page-0', 'page-1', 'page-2', 'page-3'
    ]);
  });

  it('invalidates a discovery when chapter membership is added or reordered', () => {
    document.body.innerHTML = `
      <main class="reader">
        <img id="page-1" src="/page-1.jpg">
        <img id="page-2" src="/page-2.jpg">
      </main>
    `;
    document.querySelectorAll('img').forEach(image => setImageGeometry(image as HTMLImageElement));
    const location = new URL('https://example.com/chapter/membership');
    const discovery = registry.discover(document, location);
    const main = document.querySelector('main')!;
    const added = document.createElement('img');
    added.id = 'page-3';
    added.src = '/page-3.jpg';
    setImageGeometry(added);
    main.appendChild(added);

    expect(registry.isDiscoveryCurrent(discovery, document, location)).toBe(false);

    added.remove();
    main.prepend(document.getElementById('page-2')!);
    expect(registry.isDiscoveryCurrent(discovery, document, location)).toBe(false);
  });

  it('stops DOM traversal at the scanned-node safety limit', () => {
    const main = document.createElement('main');
    main.className = 'reader';
    for (let index = 0; index < COMIC_CHAPTER_LIMITS.maxScannedNodes + 20; index += 1) {
      main.appendChild(document.createElement('div'));
    }
    const lateImage = document.createElement('img');
    lateImage.src = '/late.jpg';
    setImageGeometry(lateImage);
    main.appendChild(lateImage);
    document.body.appendChild(main);

    const result = registry.discover(document, new URL('https://example.com/chapter/large-dom'));

    expect(result.scannedNodeCount).toBe(COMIC_CHAPTER_LIMITS.maxScannedNodes);
    expect(result.limitReached).toBe(true);
    expect(result.candidates).toHaveLength(0);
  });

  it('invalidates a snapshot after source, geometry, class, connection, or navigation changes', () => {
    document.body.innerHTML = '<main class="reader"><img id="page" src="/page.jpg"></main>';
    const image = document.getElementById('page') as HTMLImageElement;
    setImageGeometry(image);
    const location = new URL('https://example.com/chapter/one');
    const discovery = registry.discover(document, location);
    const candidate = discovery.candidates[0];

    expect(registry.isCandidateCurrent(candidate, location, discovery.navigationKey)).toBe(true);
    image.className = 'changed';
    expect(registry.isCandidateCurrent(candidate, location, discovery.navigationKey)).toBe(false);
    expect(registry.isCandidateCurrent(candidate, new URL('https://example.com/chapter/two'), discovery.navigationKey))
      .toBe(false);
    image.remove();
    expect(registry.isCandidateCurrent(candidate, location, discovery.navigationKey)).toBe(false);
  });
});
