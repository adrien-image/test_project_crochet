import { describe, expect, it } from 'vitest';
import { layoutPage, type Item } from '../src/pdf/layout';

// Words laid out like a PDF: each string becomes one item, 6 units per character.
function line(text: string, x: number, y: number, h = 10): Item[] {
  const out: Item[] = [];
  let cx = x;
  for (const w of text.split(' ')) {
    out.push({ str: w, x: cx, y, w: w.length * 6, h });
    cx += w.length * 6 + 4;
  }
  return out;
}

describe('layout', () => {
  it('two columns under a full-width title', () => {
    const items = [
      ...line('BUNNY PATTERN TITLE ACROSS THE WHOLE PAGE WIDTH', 40, 20, 18),
      ...line('HEAD', 40, 60), ...line('R1: 6 sc in MR (6)', 40, 75), ...line('R2: inc around (12)', 40, 90), ...line('R3: sc around (12)', 40, 105),
      ...line('EARS', 320, 60), ...line('R1: 4 sc in MR (4)', 320, 75), ...line('R2: sc around (4)', 320, 90), ...line('R3: sc around (4)', 320, 105),
    ];
    const lines = layoutPage(items, 600, 800, 1).map((l) => l.text);
    expect(lines).toEqual([
      'BUNNY PATTERN TITLE ACROSS THE WHOLE PAGE WIDTH',
      'HEAD', 'R1: 6 sc in MR (6)', 'R2: inc around (12)', 'R3: sc around (12)',
      'EARS', 'R1: 4 sc in MR (4)', 'R2: sc around (4)', 'R3: sc around (4)',
    ]);
  });

  it('sidebar after main text', () => {
    const items = [
      ...line('Tip:', 20, 60), ...line('use a', 20, 75), ...line('marker', 20, 90), ...line('always', 20, 105),
      ...line('R1: 6 sc in MR (6) and a long line of text', 200, 60), ...line('R2: inc around (12) and more text here', 200, 75),
      ...line('R3: sc around (12) and more text here ok', 200, 90), ...line('R4: sc around (12) and more text here ok', 200, 105),
    ];
    const lines = layoutPage(items, 600, 800, 1).map((l) => l.text);
    expect(lines[0]).toMatch(/^R1/);
    expect(lines[4]).toBe('Tip:');
  });

  it('keeps superscripts on their line', () => {
    const items: Item[] = [
      { str: '4', x: 40, y: 100, w: 6, h: 10 },
      { str: 'th', x: 46, y: 97, w: 8, h: 6 },
      { str: 'rnd: sc around', x: 58, y: 100, w: 80, h: 10 },
    ];
    expect(layoutPage(items, 600, 800, 1).map((l) => l.text)).toEqual(['4th rnd: sc around']);
  });

  it('table rows stay together', () => {
    const items = [
      ...line('Round', 40, 50), ...line('Instructions', 120, 50), ...line('Count', 400, 50),
      ...line('1', 40, 65), ...line('6 sc in MR', 120, 65), ...line('6', 400, 65),
      ...line('2', 40, 80), ...line('inc around', 120, 80), ...line('12', 400, 80),
      ...line('3', 40, 95), ...line('(sc, inc) x6', 120, 95), ...line('18', 400, 95),
    ];
    expect(layoutPage(items, 600, 800, 1).map((l) => l.text)).toEqual([
      'Round | Instructions | Count', '1 | 6 sc in MR | 6', '2 | inc around | 12', '3 | (sc, inc) x6 | 18',
    ]);
  });
});
