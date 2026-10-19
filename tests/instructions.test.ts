import { describe, expect, it } from 'vitest';
import { extractStated, parseInstructions } from '../src/parser/instructions';
import type { Lang } from '../src/core/types';

function count(text: string, lang: Lang, prev?: number, firstOfPiece = false) {
  const st = extractStated(text);
  const r = parseInstructions(st.rest, lang, { prev, stated: st.stated, firstOfPiece, last: false });
  return { count: r.count, stated: st.stated, consumed: r.consumed, r };
}

describe('stated counts', () => {
  it.each([
    ['6 sc in MR (6)', 6],
    ['inc around = 12 sc', 12],
    ['inc in each st around (12 sts)', 12],
    ['(sc, inc) x6 [18]', 18],
    ['sc around. Join. 20 sc.', 20],
    ['dc in each st around [10 Dc, 2 Picots]', 12],
    ['6 ms dans un cercle magique (6 m)', 6],
    ['sc around (18) Fasten off.', 18],
    ['sc around – 18', 18],
  ])('%s → %i', (t, n) => expect(extractStated(t).stated).toBe(n));
  it('does not take an instruction for a count', () => {
    expect(extractStated('6 sc').stated).toBeUndefined();
    expect(extractStated('(sc, inc) x6').stated).toBeUndefined();
  });
});

describe('counts', () => {
  it.each<[string, Lang, number | undefined, number]>([
    ['6 sc in MR', 'en', undefined, 6],
    ['inc x6', 'en', 6, 12],
    ['inc in each st around', 'en', 6, 12],
    ['*sc, inc* x6', 'en', 12, 18],
    ['(sc 2, inc) x6', 'en', 18, 24],
    ['[sc 3, inc] 6 times', 'en', 24, 30],
    ['*sc 4, inc; rep from * around', 'en', 30, 36],
    ['sc in each st around', 'en', 36, 36],
    ['sc around', 'en', 36, 36],
    ['(sc 4, dec) x6', 'en', 36, 30],
    ['dec around', 'en', 12, 6],
    ['2 sc in next sc', 'en', 1, 2],
    ['1 sc in each of next 2 sc, 2 sc in next sc; rep from * around', 'en', 18, 24],
    ['*1 sc in each of next 2 sc, 2 sc in next sc; rep from * around', 'en', 18, 24],
    ['sc 2 around', 'en', 6, 12],
    ['sc in next 2 sts, inc, rep 5 more times', 'en', 18, 24],
    ['6 ms dans un cercle magique', 'fr', undefined, 6],
    ['6 aug', 'fr', 6, 12],
    ['(1 ms, 1 aug) x 6', 'fr', 12, 18],
    ['(2ms, 1aug)*6', 'fr', 18, 24],
    ['1 ms dans chaque m', 'fr', 24, 24],
    ['*3 ms, 1 aug* 6 fois', 'fr', 24, 30],
    ['6 dim', 'fr', 12, 6],
    ['6 pb en el anillo mágico', 'es', undefined, 6],
    ['(1 pb, 1 aum) x6', 'es', 12, 18],
    ['6 aum', 'es', 6, 12],
    ['(1 pb, 1 aum) 6 vezes', 'pt', 12, 18],
    ['6 fM in den Fadenring', 'de', undefined, 6],
    ['(1 fM, 1 zun) 6x', 'de', 12, 18],
    ['6 pb nell\'anello magico', 'it', undefined, 6],
    ['(1 pb, 1 aum) x6', 'it', 12, 18],
    ['6 v in een magische ring', 'nl', undefined, 6],
    ['(1 v, 1 meerd) x6', 'nl', 12, 18],
    ['6X', 'xva', undefined, 6],
    ['6V', 'xva', 6, 12],
    ['(X, V) x6', 'xva', 12, 18],
    ['6x (2 sc, inc)', 'en', 18, 24],
    ['BLO: sc around', 'en', 18, 18],
    ['6 dc in MR', 'en-uk', undefined, 6],
    ['dc around', 'en-uk', 18, 18],
    ['ch 3 (counts as a dc), dc in each st around', 'en', 12, 12],
    ['inc in each st around', 'en', undefined, 0],
  ])('%s [%s] prev=%s → %i', (t, lang, prev, n) => {
    const c = count(t, lang, prev);
    if (n === 0) expect(c.count).toBeUndefined();
    else expect(c.count).toBe(n);
  });

  it('rows along a foundation chain', () => {
    const c = count('ch 11, sc in 2nd ch from hook and in each ch across', 'en', undefined, true);
    expect(c.count).toBe(10);
  });

  it('oval around a foundation chain', () => {
    const r = parseInstructions(
      '2 sc in 2nd ch from hook, sc in next 4 ch, 4 sc in last ch, working on the other side of the chain, sc in next 4 ch, 2 sc in last ch',
      'en',
      { prev: 7, firstOfPiece: true, last: false },
    );
    expect(r.count).toBe(16);
    expect(r.otherside).toBe(true);
  });

  it('slip stitch join counts nothing', () => {
    expect(count('sc around, sl st in first sc to join', 'en', 12).count).toBe(12);
  });
});
