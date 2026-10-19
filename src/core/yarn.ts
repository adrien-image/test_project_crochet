// Yarn length, weight and finished-size estimates. Orders of magnitude (± 20 %).
// Stitch dimensions scale with the hook: a sc made with a 3 mm hook is about
// 0.39 cm wide and 0.36 cm tall.

import type { ParseResult, Piece, Round, StitchOp } from './types';

/** Yarn per stitch, in cm per mm of hook. */
const LENGTH: Record<string, number> = {
  sc: 0.75, hdc: 1.0, dc: 1.25, tr: 1.6, dtr: 2.0, ch: 0.35, sl: 0.35, picot: 1.2, bobble: 3.5, puff: 3, popcorn: 4, mr: 2, skip: 0,
};

export function opLengthCm(op: StitchOp, hookMm: number): number {
  const base = LENGTH[op.base ?? 'sc'];
  switch (op.kind) {
    case 'inc':
      return 2 * base * hookMm;
    case 'inc3':
      return 3 * base * hookMm;
    case 'dec':
      return 1.35 * base * hookMm;
    case 'dec3':
      return 1.6 * base * hookMm;
    default: {
      const per = LENGTH[op.kind] ?? 0.75;
      // "5 dc in next": several stitches in one.
      return per * hookMm * Math.max(1, op.kind === 'ch' || op.kind === 'sl' || op.kind === 'skip' ? 1 : op.produces);
    }
  }
}

export function roundLengthCm(r: Round, hookMm: number, prev?: number): number {
  if (r.ops.length) return r.ops.reduce((a, o) => a + opLengthCm(o, hookMm), 0);
  // Count-only rounds (charts): assume single crochet.
  return (r.count ?? r.stated ?? prev ?? 6) * LENGTH.sc * hookMm;
}

export const WEIGHT_NAMES = ['', 'Super fine', 'Fine', 'Light', 'Medium', 'Bulky', 'Super bulky'];
export const WEIGHT_NAMES_FR = ['', 'Très fin', 'Fin', 'Léger', 'Moyen', 'Épais', 'Très épais'];
/** Metres per 100 g for each weight category. */
const M_PER_100G = [0, 400, 300, 240, 180, 120, 70];

export function isAmigurumi(text: string): boolean {
  return /\b(?:mr|magic ring|cercle magique|anneau magique|anillo m[aá]gico|anel m[aá]gico|fadenring|magischer ring|anello magico|magische ring|amigurumi|stuff|rembourr|relleno|enchimento|f[üu]llwatte|imbottit|vulling)\b/iu.test(text);
}

export function weightCategory(hookMm: number, amigurumi: boolean): number {
  // Amigurumi is worked tight: a smaller hook than the yarn label says.
  const limits = amigurumi ? [2.25, 3.0, 3.75, 4.5, 6.5] : [3.5, 4.5, 5.5, 6.5, 9];
  for (let i = 0; i < limits.length; i++) if (hookMm <= limits[i]) return i + 1;
  return 6;
}

export function gramsFor(meters: number, category: number, material?: string): number {
  let mPer100 = M_PER_100G[category];
  if (material === 'chenille') mPer100 *= 0.8;
  if (material === 'cotton') mPer100 *= 0.9;
  return (meters / mPer100) * 100;
}

export interface YarnLine {
  key: string;
  name: string;
  hex: string;
  guessed: boolean;
  pieces: string[];
  meters: number;
  metersWithMargin: number;
  grams: number;
}

export interface YarnEstimate {
  lines: YarnLine[];
  totalMeters: number;
  totalGrams: number;
  category: number;
  amigurumi: boolean;
  material?: string;
}

const MARGIN = 0.15;
const TAIL_CM = 30;

export function estimateYarn(res: ParseResult, hookMm: number, text: string, colors: Record<string, string> = {}): YarnEstimate {
  const ami = isAmigurumi(text);
  const category = weightCategory(hookMm, ami);
  const material = res.materials[0];
  const map = new Map<string, YarnLine>();
  for (const p of res.pieces) {
    const override = colors[p.name.toLowerCase()];
    let prev: number | undefined;
    for (const r of p.rounds) {
      const len = (roundLengthCm(r, hookMm, prev) * p.copies) / 100;
      prev = r.count ?? r.stated ?? prev;
      const hex = override ?? r.color ?? p.color ?? '#d9c3a0';
      const name = override ? override : (r.colorName ?? p.colorName ?? '?');
      const guessed = !override && !r.color && p.colorGuessed;
      const key = hex;
      let line = map.get(key);
      if (!line) {
        line = { key, name, hex, guessed, pieces: [], meters: 0, metersWithMargin: 0, grams: 0 };
        map.set(key, line);
      }
      if (!guessed) line.guessed = false;
      if (!line.pieces.includes(p.name)) line.pieces.push(p.name);
      line.meters += len;
    }
    const first = map.get(override ?? p.rounds[0]?.color ?? p.color ?? '#d9c3a0');
    if (first) first.meters += (TAIL_CM * p.copies) / 100;
  }
  const lines = [...map.values()];
  for (const l of lines) {
    l.metersWithMargin = l.meters * (1 + MARGIN);
    l.grams = gramsFor(l.metersWithMargin, category, material);
  }
  return {
    lines,
    totalMeters: lines.reduce((a, l) => a + l.metersWithMargin, 0),
    totalGrams: lines.reduce((a, l) => a + l.grams, 0),
    category,
    amigurumi: ami,
    material,
  };
}

// ---------- Geometry ----------

export interface Ring {
  r: number;
  z: number;
  count: number;
}

/** About 21 sc and 23 rounds per 10 cm with a 3 mm hook. */
export function stitchSize(hookMm: number) {
  return { w: hookMm * 0.155, h: hookMm * 0.14 };
}

/**
 * Shape of a stuffed piece. Increases lie flat on paper but dome out once
 * stuffed: each run of increases or decreases becomes a quarter ellipse whose
 * outline is about as long as the rounds that make it.
 */
export function stuffedProfile(rings: Ring[], h: number, w: number): Ring[] {
  if (rings.length < 2) return rings;
  const len = h * 1.1;
  const out = rings.map((r) => ({ ...r }));
  const trend = (i: number) => {
    const d = rings[i + 1].r - rings[i].r;
    return Math.abs(d) < w * 0.15 ? 0 : Math.sign(d);
  };
  let z = 0;
  out[0].z = 0;
  let i = 0;
  while (i < rings.length - 1) {
    const dir = trend(i);
    let j = i + 1;
    while (j < rings.length - 1 && trend(j) === dir) j++;
    const n = j - i;
    if (dir === 0) {
      for (let k = i + 1; k <= j; k++) out[k].z = (z += len);
    } else {
      const R = Math.max(rings[i].r, rings[j].r);
      const u = (r: number) => Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
      // Height of that slice of a sphere, within what the rounds can stretch to.
      const sphere = 0.9 * R * Math.abs(u(rings[i].r) - u(rings[j].r));
      const V = Math.min(n * len * 1.6, Math.max(n * len * 0.3, sphere));
      // Increasing: z follows R - sqrt(R² - r²); decreasing: the mirror image.
      const f = (k: number) => (dir > 0 ? u(rings[i].r) - u(rings[k].r) : u(rings[k].r) - u(rings[i].r));
      const total = f(j) || 1;
      const z0 = z;
      for (let k = i + 1; k <= j; k++) out[k].z = z0 + (V * f(k)) / total;
      z = z0 + V;
    }
    i = j;
  }
  return out;
}

/** Rings (radius, height) of a piece worked in the round, in cm. Up to `upTo` rounds. */
export function pieceProfile(piece: Piece, hookMm: number, upTo = Infinity): Ring[] {
  const { w, h } = stitchSize(hookMm);
  const rings: Ring[] = [];
  const first = piece.rounds[0];
  const startsInRing = first?.ops.some((o) => o.kind === 'mr' || o.consumes === 0) ?? true;
  if (startsInRing) rings.push({ r: 0, z: 0, count: 0 });
  let prev: number | undefined;
  let z = 0;
  let lastR = 0;
  piece.rounds.forEach((rd, i) => {
    if (i >= upTo) return;
    const count = rd.count ?? rd.stated ?? prev ?? 6;
    prev = count;
    const r = (count * w) / (2 * Math.PI);
    const dh = h * rd.height;
    const dr = r - lastR;
    const dz = rings.length ? Math.sqrt(Math.max(0, dh * dh - dr * dr)) : 0;
    z += dz;
    rings.push({ r, z, count });
    lastR = r;
  });
  return rings;
}

export interface Size {
  heightCm: number;
  widthCm: number;
}

export function pieceSize(piece: Piece, hookMm: number): Size {
  const { w, h } = stitchSize(hookMm);
  if (piece.flat) {
    const maxCount = Math.max(...piece.rounds.map((r) => r.count ?? r.stated ?? 0), 1);
    return { widthCm: maxCount * w, heightCm: piece.rounds.reduce((a, r) => a + r.height * h, 0) };
  }
  const rings = stuffedProfile(pieceProfile(piece, hookMm), h, w);
  const maxR = Math.max(...rings.map((r) => r.r), 0);
  const height = rings.length ? rings[rings.length - 1].z - rings[0].z : 0;
  return { widthCm: 2 * maxR, heightCm: Math.max(height, h) };
}

/** Size of the whole piece: the largest piece, or body + head stacked. */
export function estimateSize(res: ParseResult, hookMm: number): Size | undefined {
  if (!res.pieces.length) return undefined;
  const sizes = res.pieces.map((p) => ({ p, s: pieceSize(p, hookMm) }));
  sizes.sort((a, b) => b.s.heightCm * b.s.widthCm - a.s.heightCm * a.s.widthCm);
  const main = sizes[0];
  const isHead = (p: Piece) => /\b(?:head|t[eê]te|cabeza|cabe[cç]a|kopf|testa|hoofd)\b/iu.test(p.name);
  const isBody = (p: Piece) => /\b(?:body|corps|cuerpo|corpo|k[öo]rper|lijf|romp)\b/iu.test(p.name);
  const head = sizes.find((x) => isHead(x.p));
  const body = sizes.find((x) => isBody(x.p));
  if (head && body) {
    return { heightCm: head.s.heightCm + body.s.heightCm * 0.9, widthCm: Math.max(head.s.widthCm, body.s.widthCm) };
  }
  return main.s;
}

export interface HookRow {
  hookMm: number;
  size?: Size;
  meters: number;
  grams: number;
  category: number;
}

export const HOOKS = [2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10];

export function hookComparison(res: ParseResult, hookMm: number, text: string, colors: Record<string, string> = {}): HookRow[] {
  const near = HOOKS.filter((h) => Math.abs(h - hookMm) <= 2.01);
  if (!near.includes(hookMm)) near.push(hookMm);
  near.sort((a, b) => a - b);
  return near.map((h) => {
    const y = estimateYarn(res, h, text, colors);
    return { hookMm: h, size: estimateSize(res, h), meters: y.totalMeters, grams: y.totalGrams, category: y.category };
  });
}
