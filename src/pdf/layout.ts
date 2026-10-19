// Reading order for positioned text items: lines, multi-column pages,
// sidebars, superscripts and table rows. Pure: items in, lines out.

import type { SrcLine } from './cleanup';

export interface Item {
  str: string;
  /** Left, top (page units, top-left origin), width, height (font size). */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Frag {
  items: Item[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  h: number;
  text: string;
  table?: boolean;
}

const ROUND_CELL = /^(?:(?:r|rnd|round|row|rang|tour|rg|v|t)\.?\s*)?\d+(?:\s*[-–]\s*\d+)?\.?$/i;
const COUNT_CELL = /^\(?\d+\)?(?:\s*(?:sts?|m|mailles|sc|ms))?\.?$/i;
const HEADER_WORD = /^(?:round|rnd|row|rang|tour|instructions?|count|stitch\s+count|sts|total|mailles|nombre|stitches|r|#|round\s*#)$/i;

function joinItems(items: Item[]): string {
  let s = '';
  let prev: Item | null = null;
  for (const it of items) {
    const txt = it.str;
    if (prev) {
      const gap = it.x - (prev.x + prev.w);
      // Into a superscript ("5" → "th"): glued unless far apart. Out of one ("th" → "rnd"): a normal space.
      const intoSup = it.h < prev.h * 0.8;
      const need = intoSup ? prev.h * 0.6 : Math.max(it.h, prev.h) * 0.15;
      if (gap > need && !s.endsWith(' ') && !txt.startsWith(' ')) s += ' ';
    }
    s += txt;
    prev = it;
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** Groups items into visual lines; superscripts (smaller, raised) stay on their line. */
function toRows(items: Item[]): Item[][] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const rows: { items: Item[]; y0: number; y1: number; h: number }[] = [];
  for (const it of sorted) {
    const iy0 = it.y;
    const iy1 = it.y + it.h;
    // Prefer the row this item overlaps most.
    let best: (typeof rows)[number] | null = null;
    let bestOv = 0;
    for (let k = rows.length - 1; k >= Math.max(0, rows.length - 4); k--) {
      const r = rows[k];
      const ov = Math.min(r.y1, iy1) - Math.max(r.y0, iy0);
      const need = Math.min(it.h, r.h) * 0.4;
      if (ov > need && ov > bestOv) {
        best = r;
        bestOv = ov;
      }
    }
    if (best) {
      best.items.push(it);
      // A superscript doesn't stretch the row.
      if (it.h >= best.h * 0.8) {
        best.y0 = Math.min(best.y0, iy0);
        best.y1 = Math.max(best.y1, iy1);
        best.h = Math.max(best.h, it.h);
      }
    } else rows.push({ items: [it], y0: iy0, y1: iy1, h: it.h });
  }
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x));
}

/** Splits a row into fragments at large horizontal gaps (columns, table cells). */
function toFrags(row: Item[]): Frag[] {
  const frags: Frag[] = [];
  let cur: Item[] = [];
  const flush = () => {
    if (!cur.length) return;
    const h = Math.max(...cur.map((i) => i.h));
    frags.push({
      items: cur,
      x0: Math.min(...cur.map((i) => i.x)),
      x1: Math.max(...cur.map((i) => i.x + i.w)),
      y0: Math.min(...cur.map((i) => i.y)),
      y1: Math.max(...cur.map((i) => i.y + i.h)),
      h,
      text: joinItems(cur),
    });
    cur = [];
  };
  for (const it of row) {
    const last = cur[cur.length - 1];
    if (last && it.x - (last.x + last.w) > Math.max(12, 2.2 * Math.max(it.h, last.h))) flush();
    cur.push(it);
  }
  flush();
  // Table rows: "1 | 6 sc in MR | 6" — keep the cells together on one line.
  if (frags.length >= 2) {
    const first = frags[0].text.trim();
    const last = frags[frags.length - 1].text.trim();
    const header = frags.every((f) => HEADER_WORD.test(f.text.trim()));
    if (header || (ROUND_CELL.test(first) && (COUNT_CELL.test(last) || frags.length >= 3))) {
      return [
        {
          items: frags.flatMap((f) => f.items),
          x0: frags[0].x0,
          x1: frags[frags.length - 1].x1,
          y0: Math.min(...frags.map((f) => f.y0)),
          y1: Math.max(...frags.map((f) => f.y1)),
          h: Math.max(...frags.map((f) => f.h)),
          text: frags.map((f) => f.text).join(' | '),
          table: true,
        },
      ];
    }
  }
  return frags;
}

/** Reading order inside a region: columns left to right, the narrow side (sidebar) after the main text. */
function order(frags: Frag[], depth = 0): Frag[] {
  if (frags.length < 4 || depth > 6) return frags.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const minX = Math.min(...frags.map((f) => f.x0));
  const maxX = Math.max(...frags.map((f) => f.x1));
  const width = maxX - minX;
  // Candidate gutters: x positions crossed by few fragments, with content on both sides.
  let best: { x: number; crossing: number; score: number } | null = null;
  const xs = new Set<number>();
  for (const f of frags) {
    xs.add(f.x0 - 4);
    xs.add(f.x1 + 4);
  }
  for (const x of xs) {
    if (x < minX + width * 0.15 || x > maxX - width * 0.15) continue;
    const left = frags.filter((f) => f.x1 <= x);
    const right = frags.filter((f) => f.x0 >= x);
    const crossing = frags.length - left.length - right.length;
    if (left.length < 3 || right.length < 3 || crossing > frags.length * 0.2) continue;
    const span = (fs: Frag[]) => Math.max(...fs.map((f) => f.y1)) - Math.min(...fs.map((f) => f.y0));
    const overlap = Math.min(span(left), span(right));
    const score = overlap - crossing * 50;
    if (overlap > 0 && (!best || score > best.score)) best = { x, crossing, score };
  }
  if (!best) return frags.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const gx = best.x;
  // Bands separated by fragments crossing the gutter (full-width titles).
  const sorted = [...frags].sort((a, b) => a.y0 - b.y0);
  const out: Frag[] = [];
  let band: Frag[] = [];
  const flushBand = () => {
    if (!band.length) return;
    const left = band.filter((f) => f.x1 <= gx);
    const right = band.filter((f) => f.x1 > gx);
    const w = (fs: Frag[]) => (fs.length ? Math.max(...fs.map((f) => f.x1)) - Math.min(...fs.map((f) => f.x0)) : 0);
    const leftFirst = !(w(left) < w(right) * 0.55);
    const [a, b] = leftFirst ? [left, right] : [right, left];
    out.push(...order(a, depth + 1), ...order(b, depth + 1));
    band = [];
  };
  for (const f of sorted) {
    const crosses = f.x0 < gx && f.x1 > gx;
    if (crosses) {
      flushBand();
      out.push(f);
    } else band.push(f);
  }
  flushBand();
  return out;
}

export function layoutPage(items: Item[], pageW: number, pageH: number, page: number): SrcLine[] {
  const frags = toRows(items).flatMap(toFrags);
  return order(frags).map((f) => ({
    text: f.text,
    page,
    box: [f.x0 / pageW, f.y0 / pageH, f.x1 / pageW, f.y1 / pageH] as [number, number, number, number],
    size: f.h,
  }));
}
