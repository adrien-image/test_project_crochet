import { describe, expect, it } from 'vitest';
import {
  convertTables, fillChartCounts, fixOcrLine, inferCounts, inferRoundNumbers, isJunkOcrLine, joinWrapped, looksGarbled,
  removeHeadersFooters, removePhotoRefs, repeatedHeader, splitRunTogether, type SrcLine,
} from '../src/pdf/cleanup';

const L = (text: string, page = 1, y = 0.5): SrcLine => ({ text, page, box: [0.1, y, 0.9, y + 0.02] });

describe('headers and footers', () => {
  it('removes repeated margins and page numbers', () => {
    const lines = [L('My Bunny — pattern', 1, 0.02), L('R1: 6 sc in MR (6)', 1), L('1', 1, 0.95), L('My Bunny — pattern', 2, 0.02), L('R2: inc around (12)', 2), L('2', 2, 0.95)];
    expect(removeHeadersFooters(lines, 2).map((l) => l.text)).toEqual(['R1: 6 sc in MR (6)', 'R2: inc around (12)']);
    expect(repeatedHeader(lines, 2)).toBe('My Bunny — pattern');
  });
});

describe('tables', () => {
  it('converts round tables', () => {
    const out = convertTables([L('Round | Instructions | Count'), L('1 | 6 sc in MR | 6'), L('2-3 | sc around | 6'), L('4 | inc around | (12)')]);
    expect(out.map((l) => l.text)).toEqual(['R1: 6 sc in MR (6)', 'R2-R3: sc around (6)', 'R4: inc around (12)']);
  });
  it('chart-only tables and inferred counts', () => {
    const out = fillChartCounts(convertTables([L('Round # | Stitch count'), L('1 | 6'), L('2 | 12'), L('3 | '), L('4 | 24'), L('5 |')]));
    expect(out.map((l) => l.text)).toEqual(['R1: (6)', 'R2: (12)', 'R3: (18)', 'R4: (24)', 'R5: (30)']);
  });
  it('inferCounts', () => {
    expect(inferCounts([6, undefined, 18, undefined, 30])).toEqual([6, 12, 18, 24, 30]);
    expect(inferCounts([undefined, 12, 18])).toEqual([6, 12, 18]);
  });
});

describe('clean-up', () => {
  it('joins wrapped rounds', () => {
    const out = joinWrapped([L('R3: (sc, inc) x6,'), L('then sc 2 (20)'), L('R4: sc around (20)'), L('Stuff the head.')]);
    expect(out.map((l) => l.text)).toEqual(['R3: (sc, inc) x6, then sc 2 (20)', 'R4: sc around (20)', 'Stuff the head.']);
  });
  it('removes photo references but keeps counts', () => {
    expect(removePhotoRefs('Sew the ears [3] to the head.')).toBe('Sew the ears to the head.');
    expect(removePhotoRefs('R4: sc around [18]')).toBe('R4: sc around [18]');
    expect(removePhotoRefs('Place the eyes (see photo 2).')).toBe('Place the eyes.');
  });
});

describe('OCR fixes', () => {
  it.each([
    ['R1: 6 ms dans un cm', 'fr', 'R1: 6 ms dans un cm'],
    ['R3%: sc around', 'en', 'R34: sc around'],
    ['Rl2: sc around', 'en', 'R12: sc around'],
    ['R2: (| ms, | aug) x6', 'fr', 'R2: (1 ms, 1 aug) x6'],
    ['R4: 6 ma', 'fr', 'R4: 6 ms'],
    ['R1: 6msdans un cm', 'fr', 'R1: 6ms dans un cm'],
    ['R5: sc inEach st', 'en', 'R5: sc in Each st'],
  ])('%s', (input, lang, out) => expect(fixOcrLine(input, lang as 'fr')).toBe(out));
  it('splitRunTogether leaves real words', () => {
    expect(splitRunTogether('rembourrer', 'fr')).toBe('rembourrer');
    expect(splitRunTogether('chaquemaille', 'fr')).toBe('chaque maille');
  });
  it('infers unreadable round numbers', () => {
    const out = inferRoundNumbers([L('R4: sc around (24)'), L('R?: (sc 3, inc) x6 (30)'), L('R : sc around (30)')]);
    expect(out.map((l) => l.text)).toEqual(['R4: sc around (24)', 'R5: (sc 3, inc) x6 (30)', 'R6: sc around (30)']);
  });
  it('junk lines', () => {
    expect(isJunkOcrLine({ ...L('~~ //\\ ##'), conf: 90 })).toBe(true);
    expect(isJunkOcrLine({ ...L('R1: 6 sc in MR'), conf: 30 })).toBe(true);
    expect(isJunkOcrLine({ ...L('R1: 6 sc in MR'), conf: 88 })).toBe(false);
    expect(isJunkOcrLine({ ...L('R3 : (1 ms, 1 aug) x 6 (18)'), conf: 93 })).toBe(false);
  });
  it('garbled text', () => {
    expect(looksGarbled('!"#$ %&\'( )*+, -./0 !"#$ %&\'( )*+, -./0 123 !"#')).toBe(true);
    expect(looksGarbled('Round 1: 6 single crochet in a magic ring. Round 2: increase in every stitch around.')).toBe(false);
  });
});
