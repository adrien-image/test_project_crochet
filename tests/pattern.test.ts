import { describe, expect, it } from 'vitest';
import { matchLabel, parsePattern, selectSize, cleanTitle, findHook, findStatedSize } from '../src/parser/pattern';
import { EXAMPLES } from '../src/core/examples';

describe('round labels', () => {
  it.each([
    ['R1: 6 sc in MR', [1]],
    ['Rang 1 : 6 ms', [1]],
    ['Tour 3 : 6 aug', [3]],
    ['Rnd 4: sc around', [4]],
    ['Round 12 - sc around', [12]],
    ['Row 1: ch 11', [1]],
    ['R4-R6: sc around', [4, 5, 6]],
    ['Rounds 4 to 6: sc around', [4, 5, 6]],
    ['R14 & 15: sc around', [14, 15]],
    ['1st rnd: 6 sc in mr', [1]],
    ['6th to 13th rnds: sc around', [6, 7, 8, 9, 10, 11, 12, 13]],
    ['2e rang : 6 aug', [2]],
    ['1 – 6 sc in MR', [1]],
    ['1. 6 sc in MR', [1]],
    ['4-6: sc around', [4, 5, 6]],
    ['Vuelta 2: 6 aum', [2]],
    ['Runde 3: (1 fM, 1 zun) 6x', [3]],
    ['Giro 2: 6 aum', [2]],
    ['Toer 2: 6 meerd', [2]],
    ['Carreira 2: 6 aum', [2]],
    ['T1 : 6 ms', [1]],
  ])('%s', (line, nums) => {
    expect(matchLabel(line)?.numbers).toEqual(nums);
  });
  it('ignores prose', () => {
    expect(matchLabel('a 5 mm hook')).toBeNull();
    expect(matchLabel('Stuff the body firmly.')).toBeNull();
  });
});

describe('titles', () => {
  it('reads copies', () => {
    expect(cleanTitle('EARS (make 2)')).toMatchObject({ name: 'Ears', copies: 2 });
    expect(cleanTitle('Bras (x2)')).toMatchObject({ name: 'Bras', copies: 2 });
    expect(cleanTitle('OREILLES')).toMatchObject({ name: 'Oreilles', copies: 2 });
    expect(cleanTitle('HEAD (continued)')).toMatchObject({ name: 'Head', continued: true });
  });
});

describe('multi-size', () => {
  it('picks a size', () => {
    expect(selectSize('6 (8, 10) sc', 1).text).toBe('8 sc');
    expect(selectSize('sc around (18, 24, 30)', 2).text).toBe('sc around (30)');
    expect(selectSize('6 (8, 10) sc', 0).sizes).toBe(3);
  });
});

describe('misc extraction', () => {
  it('hook and size', () => {
    expect(findHook('Hook: 3.5 mm')).toBe(3.5);
    expect(findHook('Crochet 2,5 mm')).toBe(2.5);
    expect(findStatedSize('Finished size: about 12 cm')).toBe(12);
    expect(findStatedSize('Measures 4 inches tall')).toBeCloseTo(10.16);
  });
});

describe('patterns', () => {
  it('parses pieces, copies and counts', () => {
    const res = parsePattern(`HEAD
R1: 6 sc in MR (6)
R2: inc x6 (12)
R3: (sc, inc) x6 (18)
R4-R6: sc around (18)

EARS (make 2)
R1: 6 sc in MR (6)
R2: sc around (6)`);
    expect(res.pieces.map((p) => [p.name, p.copies, p.rounds.length])).toEqual([
      ['Head', 1, 6],
      ['Ears', 2, 2],
    ]);
    expect(res.pieces[0].rounds.map((r) => r.count)).toEqual([6, 12, 18, 18, 18, 18]);
    expect(res.pieces[0].rounds.every((r) => !r.mismatch)).toBe(true);
  });

  it('flags mismatches', () => {
    const res = parsePattern(`R1: 6 sc in MR (6)
R2: inc x6 (13)`);
    expect(res.pieces[0].rounds[1].mismatch).toBe(true);
  });

  it('mixed-case titles before round 1 and restarts', () => {
    const res = parsePattern(`Some intro text about this pattern.

Head
Rnd 1: 6 sc in MR (6)
Rnd 2: inc around (12)
Arm
Rnd 1: 5 sc in MR (5)
Rnd 2: sc around (5)
Rnd 1: 4 sc in MR (4)`);
    expect(res.pieces.map((p) => p.name)).toEqual(['Head', 'Arm', 'Part 3']);
  });

  it('continued pieces', () => {
    const res = parsePattern(`BODY
Rnd 1: 6 sc in MR (6)
Rnd 2: inc around (12)
LEGS (make 2)
Rnd 1: 6 sc in MR (6)
BODY (continued)
Rnd 3: (sc, inc) x6 (18)`);
    expect(res.pieces[0].rounds.map((r) => r.number)).toEqual([1, 2, 3]);
    expect(res.pieces[0].rounds[2].count).toBe(18);
  });

  it('as Nth round', () => {
    const res = parsePattern(`Rnd 1: 6 sc in MR (6)
Rnd 2: inc around (12)
Rnd 3: (sc, inc) x6 (18)
Rnd 4: (sc 2, inc) x6 (24)
Rnd 5: sc around (24)
6th rnd: As 5th rnd`);
    expect(res.pieces[0].rounds[5].count).toBe(24);
    expect(res.pieces[0].rounds[5].inferred).toBe(false);
  });

  it('colours: legend, named, change lines and codes', () => {
    const res = parsePattern(`Colour A: pink
MC: grey
BODY
Rnd 1: with colour A, 6 sc in MR (6)
Rnd 2: inc around (12)
Switch to the white yarn.
Rnd 3: (sc, inc) x6 (18)
Rnd 4: with MC, sc around (18)
TAIL
Use color #8008
Rnd 1: 4 sc in MR (4)
Yarn #8008 is a soft yellow.`);
    const body = res.pieces[0];
    expect(body.rounds[0].colorName).toBe('pink');
    expect(body.rounds[2].colorName).toBe('white');
    expect(body.rounds[3].colorName).toBe('grey');
    expect(res.pieces[1].colorName).toBe('yellow');
    expect(body.colors.length).toBe(3);
  });

  it('flat pieces in rows', () => {
    const res = parsePattern(`SCARF
Ch 11.
Row 1: sc in 2nd ch from hook and in each ch across, ch 1, turn (10)
Row 2-4: sc across, ch 1, turn (10)`);
    expect(res.pieces[0].flat).toBe(true);
    expect(res.pieces[0].rounds.map((r) => r.count)).toEqual([10, 10, 10, 10]);
  });

  it('positions and eyes', () => {
    const res = parsePattern(`8 mm safety eyes.
HEAD
R1: 6 sc in MR (6)
Insert the eyes between rounds 9 and 10, 7 sts apart.`);
    expect(res.safetyEyesMm).toBe(8);
    expect(res.positions[0]).toMatchObject({ rounds: [9, 10], apart: 7 });
  });

  it('example patterns parse cleanly', () => {
    for (const ex of EXAMPLES) {
      const res = parsePattern(ex.text);
      expect(res.pieces.length).toBeGreaterThan(1);
      for (const p of res.pieces)
        for (const r of p.rounds) {
          expect(r.mismatch, `${ex.id} ${p.name} ${r.label}`).toBe(false);
          expect(r.count, `${ex.id} ${p.name} ${r.label}`).toBeDefined();
        }
    }
  });

  it('example details', () => {
    const mouse = parsePattern(EXAMPLES[0].text);
    expect(mouse.lang).toBe('fr');
    expect(mouse.pieces.map((p) => p.name)).toEqual(['Corps', 'Oreilles', 'Museau', 'Queue']);
    expect(mouse.pieces[1].copies).toBe(2);
    expect(mouse.pieces[1].colorName).toBe('rose');
    const bee = parsePattern(EXAMPLES[2].text);
    expect(bee.pieces[0].colors.length).toBe(2);
    expect(bee.pieces[0].rounds[11].colorName).toBe('black');
  });
});

describe('colours in titles and inline legends', () => {
  it('reads "LOBES — with A" and "colour A: red" mid-line', () => {
    const res = parsePattern(`Hook: 5 mm. Yarn: chenille, colour A: red.
LOBES (make 2) — with A
Rnd 1: 6 sc in MR (6)`);
    expect(res.pieces[0]).toMatchObject({ name: 'Lobes', copies: 2, colorName: 'red', colorGuessed: false });
  });
  it('reads "With C." with a capital', () => {
    const res = parsePattern(`Colour C: white
WINGS (make 2)
With C.
Rnd 1: 6 sc in MR (6)`);
    expect(res.pieces[0].colorName).toBe('white');
  });
});
