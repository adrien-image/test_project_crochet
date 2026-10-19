import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Our own source must stay parseable by Safari before 16.4, which rejects
// regex lookbehind outright and leaves a blank page.
describe('browser compatibility', () => {
  it('no regex lookbehind in the source', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const offenders = walk('src')
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /\(\?<[!=]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
