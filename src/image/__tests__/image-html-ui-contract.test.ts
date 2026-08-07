import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('image workspace HTML contract', () => {
  const html = readFileSync(resolve(__dirname, '..', 'image.html'), 'utf8');

  it('ships explicit local image controls without an automatic source URL path', () => {
    expect(html).toContain('id="imageFiles"');
    expect(html).toContain('multiple');
    expect(html).toContain('image/jpeg,image/png,image/webp');
    expect(html).toContain('id="imageDropZone"');
    expect(html).toContain('id="translateAllImages"');
    expect(html).toContain('id="translateImage"');
    expect(html).toContain('id="applyTranslation"');
    expect(html).toContain('id="undoTranslation"');
    expect(html).toContain('id="downloadTranslation"');
    expect(html).toContain('id="qualityGood"');
    expect(html).toContain('id="qualityPoor"');
    expect(html).not.toContain('sourceUrl');
  });
});
