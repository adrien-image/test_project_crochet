import { describe, expect, it } from 'vitest';
import { parsePattern } from '../src/parser/pattern';
import { estimateSize, estimateYarn, hookComparison, weightCategory } from '../src/core/yarn';
import { EXAMPLES } from '../src/core/examples';

describe('yarn and size', () => {
  const bee = parsePattern(EXAMPLES[2].text);
  it('weight category from the hook', () => {
    expect(weightCategory(2.5, true)).toBe(2);
    expect(weightCategory(5, false)).toBe(3);
    expect(weightCategory(12, false)).toBe(6);
  });
  it('estimates per colour, with pieces', () => {
    const y = estimateYarn(bee, 3, EXAMPLES[2].text);
    const names = y.lines.map((l) => l.name).sort();
    expect(names).toEqual(['black', 'white', 'yellow']);
    const yellow = y.lines.find((l) => l.name === 'yellow')!;
    expect(yellow.pieces).toEqual(['Body']);
    // A 36-stitch ball takes some tens of metres, not hundreds.
    expect(y.totalMeters).toBeGreaterThan(10);
    expect(y.totalMeters).toBeLessThan(80);
  });
  it('size is a plausible order of magnitude', () => {
    const s = estimateSize(bee, 3)!;
    expect(s.widthCm).toBeGreaterThan(4);
    expect(s.widthCm).toBeLessThan(8);
    expect(s.heightCm).toBeGreaterThan(5);
    expect(s.heightCm).toBeLessThan(12);
  });
  it('a bigger hook makes a bigger piece', () => {
    const rows = hookComparison(bee, 3, EXAMPLES[2].text);
    const sizes = rows.map((r) => r.size!.widthCm);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(rows.find((r) => r.hookMm === 3)).toBeDefined();
  });
});
