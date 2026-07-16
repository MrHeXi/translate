import { MainContentDetector } from '../MainContentDetector';

describe('MainContentDetector', () => {
  const detector = new MainContentDetector();

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers a semantic article over navigation and side content', () => {
    document.body.innerHTML = `
      <nav><a href="#one">Home</a> <a href="#two">Archive</a></nav>
      <article id="story">
        <h1>A practical article</h1>
        <p>${'Readable article sentence. '.repeat(20)}</p>
        <p>${'Another detailed paragraph. '.repeat(12)}</p>
      </article>
      <aside>${'Related links '.repeat(20)}</aside>
    `;

    expect(detector.findMainContentRoot(document).id).toBe('story');
  });

  it('chooses a dense top-level content region when semantic markup is absent', () => {
    document.body.innerHTML = `
      <div id="toolbar"><a href="#a">A</a> <a href="#b">B</a> <a href="#c">C</a></div>
      <div id="reader">
        <h2>Guide</h2>
        <p>${'Long-form documentation text with useful details. '.repeat(16)}</p>
        <p>${'A second paragraph keeps the reading flow coherent. '.repeat(12)}</p>
      </div>
    `;

    expect(detector.findMainContentRoot(document).id).toBe('reader');
  });

  it('falls back to the body for short pages without a reliable content region', () => {
    document.body.innerHTML = `
      <div>
        <script>${'fake script text '.repeat(100)}</script>
        <span>Short status</span>
      </div>
    `;

    expect(detector.findMainContentRoot(document)).toBe(document.body);
  });

  it('ignores hidden and link-heavy semantic candidates', () => {
    document.body.innerHTML = `
      <main id="hidden-main" hidden>${'Hidden text '.repeat(100)}</main>
      <article id="links">${'<a href="#x">Catalog link</a>'.repeat(50)}</article>
      <main id="reader"><p>${'Visible readable content. '.repeat(20)}</p></main>
    `;

    expect(detector.findMainContentRoot(document).id).toBe('reader');
  });
});
