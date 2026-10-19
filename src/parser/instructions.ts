// Parses the instructions of one round ("*sc 2, inc* x6 (24)") into stitch
// operations. Text is rewritten into canonical tokens by the lexicon, then read
// by a small recursive-descent grammar: sequences of phrases and groups, each
// optionally followed by a repeat ("x6", "6 times", "around", "rep from *…").

import type { Lang, StitchKind, StitchOp } from '../core/types';
import { RULES, xvaToCanonical } from './lexicon';

// ---------- Stated counts ----------

const UNIT =
  '(?:sts?|stitch(?:es)?|sc|hdc|dc|tr|htr|ms|m|mailles?|pb|pa|p|puntos?|pts?|pontos?|fm|maschen|maglie|mb|v|vasten|steken|x|st\\.|m\\.|b|br|db|picots?|ch|ml|total|au total|en total|in total|insgesamt|in totale|in totaal)';
const UNIT_SEQ = `(?:\\s*${UNIT}\\.?){0,2}`;

export interface Stated {
  stated?: number;
  picots: boolean;
  rest: string;
}

/** Pulls the expected stitch count off the end of a round: "(18)", "= 16 sc", "[10 Dc, 2 Picots]", "Join. 20 sc.". */
export function extractStated(text: string): Stated {
  let s = text.trim();
  const tries: [RegExp, (m: RegExpMatchArray) => number][] = [
    // [10 Dc, 2 Picots] — a list of counts
    [
      new RegExp(`[\\[(]\\s*(\\d+\\s*\\p{L}+\\.?(?:\\s*(?:,|\\+|and|et|y|e|und|en)\\s*\\d+\\s*\\p{L}+\\.?)+)\\s*[\\])]\\s*\\.?$`, 'iu'),
      (m) => [...m[1].matchAll(/\d+/g)].reduce((a, x) => a + Number(x[0]), 0),
    ],
    [new RegExp(`[(\\[{<]\\s*(?:total\\s*:?\\s*)?(\\d+)${UNIT_SEQ}\\s*[)\\]}>]\\s*\\.?$`, 'iu'), (m) => Number(m[1])],
    [new RegExp(`(?:=|–|—|-|→|:)\\s*(\\d+)${UNIT_SEQ}\\s*\\.?$`, 'iu'), (m) => Number(m[1])],
    [new RegExp(`(?:^|[.;,])\\s*(\\d+)\\s*${UNIT}\\.?(?:\\s*${UNIT}\\.?)?\\s*\\.?$`, 'iu'), (m) => Number(m[1])],
    [new RegExp(`total\\s*:?\\s*(\\d+)${UNIT_SEQ}\\s*\\.?$`, 'iu'), (m) => Number(m[1])],
  ];
  for (const [re, val] of tries) {
    const m = s.match(re);
    if (m && m.index !== undefined) {
      const picots = /picot/i.test(m[0]);
      const before = s.slice(0, m.index).trim();
      // "6 sc." alone is an instruction, not a count.
      if (!before && re !== tries[0][0] && re !== tries[1][0]) continue;
      s = before.replace(/[,;:=\-–—]\s*$/, '').trim();
      return { stated: val(m), picots, rest: s };
    }
  }
  // A count in brackets followed by trailing prose: "(18) Fasten off."
  const mid = s.match(new RegExp(`[(\\[]\\s*(\\d+)${UNIT_SEQ}\\s*[)\\]]`, 'iu'));
  if (mid && mid.index !== undefined && mid.index > 0) {
    const after = s.slice(mid.index + mid[0].length);
    if (!/\d/.test(after) && !/^\s*(?:x|×|\*|times|fois)/i.test(after)) {
      return { stated: Number(mid[1]), picots: false, rest: (s.slice(0, mid.index) + ' ' + after).trim() };
    }
  }
  return { picots: false, rest: s };
}

// ---------- Canonicalisation & tokens ----------

type Tok = { t: 'num'; v: number; ord?: boolean } | { t: 'k'; v: string } | { t: 'p'; v: string } | { t: 'w'; v: string };

export function canonicalize(text: string, lang: Lang): string {
  let s = text.normalize('NFC');
  if (lang === 'xva') s = xvaToCanonical(s);
  s = s.toLowerCase();
  s = s.replace(/[×]/g, 'x').replace(/[–—]/g, '-').replace(/[’`]/g, "'");
  // Ordinals: 2nd, 3rd, 2e, 3ème, 1er, 2º.
  s = s.replace(/(\d+)\s*(?:st|nd|rd|th|e|ème|eme|er|re|ère|º|°|ª|o|a|\.)(?![\p{L}\d])(?=\s*\p{L})/gu, ' $1 §ord ');
  // Repeat marks: "x6", "6x", ")*6".
  s = s.replace(/([)\]*])\s*\*\s*(\d+)/g, '$1 §timesmark $2 ');
  s = s.replace(/(^|[^\p{L}§])x\s*(\d+)/gu, '$1 §timesmark $2 ');
  s = s.replace(/(\d+)\s*x(?![\p{L}\d])/gu, ' $1 §timesmark ');
  for (const [re, to] of RULES[lang]) s = s.replace(re, to);
  return s;
}

const KINDS = new Set([
  'sc', 'hdc', 'dc', 'tr', 'dtr', 'ch', 'sl', 'mr', 'inc', 'dec', 'inc3', 'dec3', 'picot', 'bobble', 'puff', 'popcorn', 'skip', 'st',
]);

export function tokenize(canon: string): Tok[] {
  const out: Tok[] = [];
  for (const m of canon.matchAll(/§[a-z0-9]+|\d+(?:[.,]\d+)?|[()[\]{}*,;.:+]|[\p{L}'-]+/gu)) {
    const x = m[0];
    if (x.startsWith('§')) {
      const v = x.slice(1);
      if (v === 'ord') {
        const last = out[out.length - 1];
        if (last && last.t === 'num') last.ord = true;
        continue;
      }
      out.push({ t: 'k', v });
    } else if (/^\d/.test(x)) out.push({ t: 'num', v: Number(x.replace(',', '.')) });
    else if (/^[()[\]{}*,;.:+]$/.test(x)) out.push({ t: 'p', v: x });
    else if (x !== '-') out.push({ t: 'w', v: x });
  }
  return out;
}

// ---------- Grammar ----------

interface Spec {
  kind: string;
  nBefore?: number;
  nAfter?: number;
  target?: number | 'fill' | 'mr' | 'same';
  each?: boolean;
  next?: boolean;
  loop?: 'blo' | 'flo';
  join?: boolean;
  first?: boolean;
  countsAs?: string;
  fromHook?: number;
  intoCh?: boolean;
}

type Rep = { n: number } | { fill: true } | null;
type Node =
  | { type: 'op'; spec: Spec; rep: Rep }
  | { type: 'group'; items: Node[]; rep: Rep }
  | { type: 'otherside' }
  | { type: 'loop'; loop: 'blo' | 'flo' };

const CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

class Reader {
  i = 0;
  unknown: string[] = [];
  space = false;
  otherside = false;
  constructor(public toks: Tok[]) {}
  peek(o = 0): Tok | undefined {
    return this.toks[this.i + o];
  }
  isK(v: string, o = 0) {
    const t = this.peek(o);
    return !!t && t.t === 'k' && t.v === v;
  }
  isP(v: string, o = 0) {
    const t = this.peek(o);
    return !!t && t.t === 'p' && t.v === v;
  }
}

function parseRepeat(r: Reader): Rep {
  const t = r.peek();
  if (!t) return null;
  if (r.isK('timesmark') && r.peek(1)?.t === 'num') {
    const n = (r.peek(1) as { v: number }).v;
    r.i += 2;
    return { n };
  }
  if (t.t === 'num' && (r.isK('timesmark', 1) || r.isK('times', 1))) {
    r.i += 2;
    return { n: t.v };
  }
  if (t.t === 'num' && r.isK('moretimes', 1)) {
    r.i += 2;
    return { n: t.v + 1 };
  }
  if (r.isK('around') || r.isK('across')) {
    r.i++;
    return { fill: true };
  }
  if (r.isK('rep')) {
    const save = r.i;
    r.i++;
    if (r.isP('*')) r.i++;
    while (r.peek()?.t === 'w') r.i++; // "from", "de"…
    if (r.isP('*')) r.i++;
    const n = r.peek();
    if (n?.t === 'num' && r.isK('moretimes', 1)) {
      r.i += 2;
      return { n: n.v + 1 };
    }
    if (n?.t === 'num' && (r.isK('times', 1) || r.isK('timesmark', 1))) {
      r.i += 2;
      return { n: n.v };
    }
    if (r.isK('timesmark') && r.peek(1)?.t === 'num') {
      const v = (r.peek(1) as { v: number }).v;
      r.i += 2;
      return { n: v };
    }
    if (r.isK('around') || r.isK('across') || r.isK('each')) {
      while (r.peek() && !(r.peek()!.t === 'p' && ',;.'.includes((r.peek() as { v: string }).v))) r.i++;
      return { fill: true };
    }
    if (!n || n.t === 'p') return { fill: true };
    r.i = save;
    return null;
  }
  return null;
}

function parseSeq(r: Reader, stop: (r: Reader) => boolean): Node[] {
  const nodes: Node[] = [];
  let prefix: number | null = null;
  while (r.peek() && !stop(r)) {
    const t = r.peek()!;
    if (t.t === 'p' && ',;.:+'.includes(t.v)) {
      r.i++;
      continue;
    }
    // Prefix repeat: "6x (sc, inc)"
    if (t.t === 'num' && (r.isK('timesmark', 1) || r.isK('times', 1)) && r.peek(2)?.t === 'p' && '([{*'.includes((r.peek(2) as { v: string }).v)) {
      prefix = t.v;
      r.i += 2;
      continue;
    }
    if (t.t === 'p' && CLOSE[t.v]) {
      const close = CLOSE[t.v];
      r.i++;
      const items = parseSeq(r, (rr) => rr.isP(close));
      if (r.isP(close)) r.i++;
      if (!items.length) continue;
      let rep = parseRepeat(r);
      if (prefix !== null) {
        rep = { n: prefix };
        prefix = null;
      }
      nodes.push({ type: 'group', items, rep });
      continue;
    }
    if (t.t === 'p' && t.v === '*') {
      r.i++;
      const items = parseSeq(r, (rr) => rr.isP('*') || rr.isK('rep'));
      if (r.isP('*')) r.i++;
      let rep = parseRepeat(r);
      if (prefix !== null) {
        rep = { n: prefix };
        prefix = null;
      }
      nodes.push({ type: 'group', items, rep: rep ?? { n: 1 } });
      continue;
    }
    if (t.t === 'p' && ')]}'.includes(t.v)) {
      r.i++;
      continue;
    }
    if (r.isK('rep')) {
      const rep = parseRepeat(r);
      if (rep && nodes.length) {
        const items = nodes.splice(0, nodes.length);
        nodes.push({ type: 'group', items, rep });
      } else if (!rep) r.i++;
      continue;
    }
    if (r.isK('otherside')) {
      r.i++;
      r.otherside = true;
      nodes.push({ type: 'otherside' });
      continue;
    }
    if (r.isK('countsas')) {
      r.i++;
      let counted = 'dc';
      while (r.peek() && !(r.peek()!.t === 'p')) {
        const x = r.peek()!;
        if (x.t === 'k' && KINDS.has(x.v) && x.v !== 'st') counted = x.v;
        r.i++;
      }
      const last = lastOp(nodes);
      if (last) last.spec.countsAs = counted;
      continue;
    }
    if ((r.isK('blo') || r.isK('flo')) && !phraseAhead(r)) {
      nodes.push({ type: 'loop', loop: (r.peek() as { v: 'blo' | 'flo' }).v });
      r.i++;
      continue;
    }
    const before = r.i;
    const spec = parsePhrase(r);
    if (spec) {
      let rep = parseRepeat(r);
      if (prefix !== null) {
        rep = { n: prefix };
        prefix = null;
      }
      nodes.push({ type: 'op', spec, rep });
    } else if (r.i === before) {
      const x = r.peek()!;
      if (x.t === 'w') r.unknown.push(x.v);
      r.i++;
    }
  }
  return nodes;
}

function phraseAhead(r: Reader): boolean {
  // "BLO sc around": the loop marker belongs to the phrase that follows.
  const n = r.peek(1);
  return !!n && ((n.t === 'k' && KINDS.has(n.v)) || n.t === 'num');
}

function lastOp(nodes: Node[]): { spec: Spec } | undefined {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.type === 'op') return n;
    if (n.type === 'group') return lastOp(n.items);
  }
  return undefined;
}

function isStop(t: Tok): boolean {
  return (t.t === 'p' && t.v !== '+') || (t.t === 'k' && ['rep', 'timesmark', 'otherside', 'countsas', 'moretimes'].includes(t.v));
}

const CONJ = new Set(['and', 'et', 'y', 'e', 'und', 'en', 'then', 'puis', 'dann', 'luego', 'depois', 'poi', 'dan']);

function parsePhrase(r: Reader): Spec | null {
  const sp: Partial<Spec> = {};
  let inTarget = false;
  let consumed = false;
  while (r.peek()) {
    const t = r.peek()!;
    if (isStop(t)) break;
    if (t.t === 'num') {
      const nx = r.peek(1);
      if (nx && nx.t === 'k' && (nx.v === 'times' || nx.v === 'timesmark' || nx.v === 'moretimes')) break;
      if (inTarget) {
        if (t.ord) sp.fromHook = t.v;
        else if (sp.target === 'fill' && sp.each) sp.target = t.v; // each of next N
        else if (typeof sp.target !== 'number') sp.target = t.v;
        r.i++;
        consumed = true;
        continue;
      }
      if (!sp.kind) {
        sp.nBefore = t.v;
        r.i++;
        consumed = true;
        continue;
      }
      // "sc 2" vs "sc 2 inc": a number right before another stitch starts a new phrase.
      if (nx && nx.t === 'k' && KINDS.has(nx.v) && nx.v !== 'st') break;
      if (sp.nAfter === undefined) sp.nAfter = t.v;
      r.i++;
      continue;
    }
    if (t.t === 'k') {
      const v = t.v;
      if (KINDS.has(v)) {
        if (inTarget) {
          if (v === 'mr') sp.target = 'mr';
          if (v === 'ch') sp.intoCh = true;
          r.i++;
          continue;
        }
        if (!sp.kind) {
          sp.kind = v;
          r.i++;
          consumed = true;
          continue;
        }
        // "dc inc", "hdc dec": a stitch name qualifying an increase/decrease.
        if ((v === 'inc' || v === 'dec') && ['sc', 'hdc', 'dc', 'tr'].includes(sp.kind) && sp.nBefore === undefined) {
          sp.kind = `${v}:${sp.kind}`;
          r.i++;
          continue;
        }
        if (sp.kind === 'st' && v !== 'st') {
          sp.kind = v;
          r.i++;
          continue;
        }
        if (v === 'st') {
          r.i++;
          continue;
        }
        break; // a new stitch starts a new phrase
      }
      r.i++;
      switch (v) {
        case 'in':
          inTarget = true;
          break;
        case 'each':
          inTarget = true;
          sp.each = true;
          if (typeof sp.target !== 'number') sp.target = 'fill';
          break;
        case 'next':
          inTarget = true;
          sp.next = true;
          break;
        case 'same':
          inTarget = true;
          sp.target = 'same';
          break;
        case 'around':
        case 'across':
          sp.target = 'fill';
          break;
        case 'blo':
        case 'flo':
          sp.loop = v;
          break;
        case 'join':
          sp.join = true;
          break;
        case 'first':
          sp.first = true;
          break;
        case 'last':
          inTarget = true;
          sp.next = true;
          break;
        case 'space':
          r.space = true;
          break;
        case 'fromhook':
          if (sp.fromHook === undefined) sp.fromHook = 2;
          break;
        default:
          break;
      }
      continue;
    }
    if (t.t === 'w') {
      // "sc in 2nd ch from hook and in each ch across": "and" starts a new phrase.
      if (CONJ.has(t.v) && sp.kind && (sp.target !== undefined || sp.fromHook !== undefined || sp.next)) {
        r.i++;
        break;
      }
      if (CONJ.has(t.v)) {
        r.i++;
        continue;
      }
      r.unknown.push(t.v);
      r.i++;
      continue;
    }
    break;
  }
  if (sp.next && sp.target === undefined) sp.target = 1;
  if (!sp.kind) {
    // "…and in each ch across": same stitch as the phrase before.
    return sp.target !== undefined || (consumed && sp.nBefore !== undefined) ? { ...sp, kind: 'prev' } : null;
  }
  return sp as Spec;
}

// ---------- Evaluation ----------

const HEIGHT: Record<string, number> = {
  sc: 1, hdc: 1.5, dc: 2, tr: 3, dtr: 4, ch: 0.5, sl: 0.4, bobble: 2, puff: 1.6, popcorn: 2, picot: 0, skip: 0, mr: 0,
};

export function stitchHeight(op: StitchOp): number {
  return HEIGHT[op.base ?? op.kind] ?? 1;
}

interface EvalCtx {
  /** Stitches available in the previous round (undefined for a first round). */
  prev?: number;
  stated?: number;
  firstOfPiece: boolean;
  last: boolean;
}

function specOps(sp: Spec, ctx: EvalCtx, isFirstOp: boolean, isLastOp: boolean): StitchOp[] {
  let kind = sp.kind;
  let base: StitchOp['base'];
  if (kind.includes(':')) {
    const [k, b] = kind.split(':');
    kind = k;
    base = b as StitchOp['base'];
  }
  if (kind === 'st') kind = 'sc';
  const loop = sp.loop;
  const mk = (k: StitchKind, consumes: number, produces: number, b = base): StitchOp => {
    const op: StitchOp = { kind: k, consumes, produces };
    if (b && b !== 'sc') op.base = b;
    if (loop) op.loop = loop;
    return op;
  };
  const rep = (op: StitchOp, n: number) => Array.from({ length: Math.max(0, Math.round(n)) }, () => ({ ...op }));
  const n = sp.nAfter ?? sp.nBefore ?? 1;
  switch (kind) {
    case 'mr':
      return [mk('mr', 0, 0)];
    case 'skip':
      return rep(mk('skip', 1, 0), typeof sp.target === 'number' ? sp.target : n);
    case 'picot':
      return rep(mk('picot', 0, 0), n);
    case 'ch': {
      if (sp.countsAs) {
        const k = (['sc', 'hdc', 'dc', 'tr', 'dtr'].includes(sp.countsAs) ? sp.countsAs : 'dc') as StitchKind;
        return [mk(k, 1, 1)];
      }
      // A chain opening the first row of a piece is the foundation chain.
      if (ctx.firstOfPiece && ctx.prev === undefined && isFirstOp) return rep(mk('ch', 0, 1), n);
      return [mk('ch', 0, 0)];
    }
    case 'sl': {
      if (sp.join || sp.first || (isLastOp && sp.target === undefined) || (isFirstOp && sp.target === undefined && !sp.nBefore && !sp.nAfter)) {
        return [mk('sl', 0, 0)];
      }
      const t = typeof sp.target === 'number' ? sp.target : n;
      return rep(mk('sl', 1, 1), t);
    }
    case 'inc':
    case 'dec':
    case 'inc3':
    case 'dec3': {
      const c = kind === 'inc' ? [1, 2] : kind === 'inc3' ? [1, 3] : kind === 'dec' ? [2, 1] : [3, 1];
      const count = typeof sp.target === 'number' && sp.nBefore === undefined && sp.nAfter === undefined ? sp.target : n;
      return rep(mk(kind as StitchKind, c[0], c[1]), count);
    }
    default: {
      const k = kind as StitchKind;
      if (sp.target === 'mr') return rep(mk(k, 0, 1), n);
      if (sp.fromHook !== undefined) {
        // "sc in 2nd ch from hook": skip the chains before it.
        const skip = Math.max(0, sp.fromHook - 1);
        const per = sp.nBefore ?? 1;
        const op = per === 1 ? mk(k, 1, 1) : k === 'sc' && per === 2 ? mk('inc', 1, 2) : mk(k, 1, per);
        return [...rep(mk('skip', 1, 0), skip), op];
      }
      const per = sp.nBefore ?? 1;
      const one = (p: number) => (p === 1 ? mk(k, 1, 1) : k === 'sc' && p === 2 ? mk('inc', 1, 2) : k === 'sc' && p === 3 ? mk('inc3', 1, 3) : mk(k, 1, p));
      if (typeof sp.target === 'number') {
        if (sp.each || per === 1 || sp.target === 1) {
          if (per === 1 && sp.nAfter && sp.target === 1) return rep(one(1), sp.nAfter);
          return rep(one(per), sp.target);
        }
        return rep(one(per), sp.target);
      }
      if (sp.target === 'same') {
        return per > 1 ? [one(per)] : [mk(k, 0, 1)];
      }
      if (sp.target === undefined) return rep(mk(k, 1, 1), sp.nAfter ?? sp.nBefore ?? 1);
      return [one(per)];
    }
  }
}

interface Flat {
  /** Ops of the fixed part, or the repeating unit of a fill. */
  ops: StitchOp[];
  fill: boolean;
}

interface FlatState {
  first: boolean;
  loop?: 'blo' | 'flo';
  lastKind?: string;
}

function flatten(nodes: Node[], ctx: EvalCtx, out: Flat[], state: FlatState, isLastSeq: boolean) {
  nodes.forEach((node, idx) => {
    const lastHere = isLastSeq && idx === nodes.length - 1;
    if (node.type === 'otherside') return;
    if (node.type === 'loop') {
      state.loop = node.loop;
      return;
    }
    if (node.type === 'op') {
      const sp = { ...node.spec };
      if (sp.kind === 'prev') sp.kind = state.lastKind && !['ch', 'skip', 'mr'].includes(state.lastKind) ? state.lastKind : 'sc';
      else state.lastKind = sp.kind;
      if (!sp.loop && state.loop) sp.loop = state.loop;
      // "sc 2 around": 2 sc in each stitch, unless the stated count says otherwise.
      if (sp.target === 'fill' && sp.nAfter && sp.nBefore === undefined && !sp.each) {
        sp.nBefore = ctx.stated !== undefined && ctx.prev !== undefined && ctx.stated === ctx.prev ? 1 : sp.nAfter;
        sp.nAfter = undefined;
      }
      const ops = specOps(sp, ctx, state.first, lastHere);
      state.first = false;
      const fill = sp.target === 'fill' || (node.rep !== null && 'fill' in node.rep);
      if (fill) out.push({ ops, fill: true });
      else out.push({ ops: repeat(ops, node.rep && 'n' in node.rep ? node.rep.n : 1), fill: false });
      return;
    }
    const inner: Flat[] = [];
    flatten(node.items, ctx, inner, state, lastHere);
    const unit = inner.flatMap((f) => f.ops);
    if (node.rep && 'fill' in node.rep) out.push({ ops: unit, fill: true });
    else out.push({ ops: repeat(unit, node.rep && 'n' in node.rep ? node.rep.n : 1), fill: false });
  });
}

function repeat(ops: StitchOp[], n: number): StitchOp[] {
  const out: StitchOp[] = [];
  for (let i = 0; i < n; i++) for (const o of ops) out.push({ ...o });
  return out;
}

export interface InstructionResult {
  ops: StitchOp[];
  count?: number;
  consumed: number;
  resolved: boolean;
  unknown: string[];
  space: boolean;
  otherside: boolean;
  loop?: 'blo' | 'flo';
  picots: number;
  hasStitches: boolean;
}

export function parseInstructions(text: string, lang: Lang, ctx: EvalCtx): InstructionResult {
  ctx = { ...ctx };
  const toks = tokenize(canonicalize(text, lang));
  const r = new Reader(toks);
  const nodes = parseSeq(r, () => false);
  const flats: Flat[] = [];
  const state: FlatState = { first: true };
  flatten(nodes, ctx, flats, state, true);

  // A chain opening the first row is a foundation: the row is worked into it.
  if (ctx.prev === undefined && ctx.firstOfPiece && flats.length > 1) {
    const head = flats[0];
    const rest = flats.slice(1).flatMap((f) => f.ops);
    if (!head.fill && head.ops.length && head.ops.every((o) => o.kind === 'ch' && o.produces === 1) && rest.some((o) => o.consumes > 0)) {
      ctx = { ...ctx, prev: head.ops.length };
      flats.shift();
    }
  }

  const sum = (ops: StitchOp[], k: 'consumes' | 'produces') => ops.reduce((a, o) => a + o[k], 0);
  const fixed = flats.filter((f) => !f.fill);
  const fills = flats.filter((f) => f.fill);
  const fixedConsumed = fixed.reduce((a, f) => a + sum(f.ops, 'consumes'), 0);
  const fixedProduced = fixed.reduce((a, f) => a + sum(f.ops, 'produces'), 0);
  let resolved = true;
  const reps = new Map<Flat, number>();
  if (fills.length) {
    const f = fills[0];
    const c = sum(f.ops, 'consumes');
    const p = sum(f.ops, 'produces');
    let n: number | undefined;
    if (ctx.prev !== undefined && c > 0) n = Math.max(0, Math.floor((ctx.prev - fixedConsumed) / c));
    else if (ctx.stated !== undefined && p > 0) n = Math.max(0, Math.round((ctx.stated - fixedProduced) / p));
    if (n === undefined) resolved = false;
    reps.set(f, n ?? 0);
    for (const g of fills.slice(1)) reps.set(g, 0);
  }
  const ops: StitchOp[] = [];
  for (const f of flats) ops.push(...(f.fill ? repeat(f.ops, reps.get(f) ?? 0) : f.ops));
  const picots = ops.filter((o) => o.kind === 'picot').length;
  const hasStitches = ops.some((o) => o.kind !== 'mr');
  return {
    ops,
    count: resolved && hasStitches ? sum(ops, 'produces') : undefined,
    consumed: sum(ops, 'consumes'),
    resolved,
    unknown: r.unknown,
    space: r.space,
    otherside: r.otherside,
    loop: state.loop,
    picots,
    hasStitches,
  };
}
