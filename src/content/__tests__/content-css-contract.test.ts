import { readFileSync } from 'fs';
import { join } from 'path';

describe('content stylesheet contract', () => {
  const css = readFileSync(join(__dirname, '..', 'content.css'), 'utf8');

  it('leaves the floating icon under component-controlled inline styles', () => {
    expect(css).not.toMatch(/#translation-floating-icon/);
  });
});
