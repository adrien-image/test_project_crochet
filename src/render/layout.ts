// Places every stitch of a piece in 2D, shared by the fabric and chart views.
// Pieces in rounds are concentric rings; pieces in rows are a grid worked
// back and forth. Units: one sc is 1 wide and 1 tall.

import type { Piece, Round, StitchOp } from '../core/types';
import { stitchHeight } from '../parser/instructions';

export interface Placed {
  op: StitchOp;
  round: Round;
  roundIdx: number;
  x: number;
  y: number;
  /** Direction the stitch grows, radians (0 = up the page). */
  angle: number;
  w: number;
  h: number;
  /** Radius of the base of the stitch (rounds) — for drawing. */
  r0: number;
}

export interface Layout {
  stitches: Placed[];
  rings: { round: Round; r0: number; r1: number; y0: number; y1: number; startAngle: number; x0: number; x1: number }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  circular: boolean;
}

const MIN_W = 0.2;

/**
 * Chart: rounds as concentric rings (the usual symbol chart). Fabric: rings
 * only for pieces that lie flat (coasters, granny circles); a stuffed piece
 * is shown unrolled, one round per row, so its shaping shows.
 */
export function layoutPiece(piece: Piece, mode: 'chart' | 'fabric' = 'chart'): Layout {
  if (piece.flat) return layoutRows(piece, true);
  if (mode === 'fabric' && !lieFlat(piece)) return layoutRows(piece, false);
  return layoutRounds(piece);
}

/** Every round about as long as its circle on a flat disc: 6 more stitches per round. */
function lieFlat(piece: Piece): boolean {
  let prev = 0;
  return piece.rounds.every((r, i) => {
    const c = r.count ?? r.stated ?? prev;
    const ok = c >= 2 * Math.PI * (i + 0.5) * 0.75 && c >= prev;
    prev = c;
    return ok;
  });
}

function roundOps(r: Round, prev?: number): StitchOp[] {
  if (r.ops.length) return r.ops;
  const n = r.count ?? r.stated ?? prev ?? 6;
  return Array.from({ length: n }, () => ({ kind: 'sc' as const, consumes: 1, produces: 1 }));
}

function layoutRounds(piece: Piece): Layout {
  const stitches: Placed[] = [];
  const rings: Layout['rings'] = [];
  let r = 0.9;
  let prev: number | undefined;
  piece.rounds.forEach((round, ri) => {
    const ops = roundOps(round, prev);
    prev = round.count ?? round.stated ?? prev;
    const hgt = Math.max(0.6, round.height);
    const slots = Math.max(1, ops.reduce((a, o) => a + Math.max(o.produces, o.kind === 'sl' || o.kind === 'picot' ? 0.4 : o.kind === 'ch' ? 0.5 : 0), 0));
    const r0 = r;
    const r1 = r + hgt;
    const start = -Math.PI / 2 + ri * 0.12;
    let a = start;
    const circ = 2 * Math.PI;
    for (const op of ops) {
      if (op.kind === 'skip' || op.kind === 'mr') continue;
      const share = Math.max(op.produces, op.kind === 'sl' || op.kind === 'picot' ? 0.4 : op.kind === 'ch' ? 0.5 : 0) / slots;
      const span = share * circ;
      const mid = a + span / 2;
      const h = op.produces === 0 && op.kind !== 'ch' ? hgt * 0.4 : stitchHeight(op) / Math.max(1, round.height) * hgt;
      const rr = r0 + h / 2;
      stitches.push({
        op,
        round,
        roundIdx: ri,
        x: Math.cos(mid) * rr,
        y: Math.sin(mid) * rr,
        angle: mid + Math.PI / 2,
        // Few stitches on a wide ring (decreases) keep their own width.
        w: Math.max(MIN_W, Math.min(span * (r0 + hgt / 2), 1.5 * Math.max(1, op.produces))),
        h,
        r0,
      });
      a += span;
    }
    rings.push({ round, r0, r1, y0: 0, y1: 0, startAngle: start, x0: 0, x1: 0 });
    r = r1;
  });
  return { stitches, rings, bounds: { minX: -r, minY: -r, maxX: r, maxY: r }, circular: true };
}

function layoutRows(piece: Piece, alternate: boolean): Layout {
  const stitches: Placed[] = [];
  const rings: Layout['rings'] = [];
  let y = 0;
  let maxW = 1;
  let prev: number | undefined;
  piece.rounds.forEach((round, ri) => {
    const ops = roundOps(round, prev).filter((o) => o.kind !== 'skip' && !(o.kind === 'ch' && o.produces === 0));
    prev = round.count ?? round.stated ?? prev;
    const hgt = Math.max(0.6, round.height);
    const widths = ops.map((o) => Math.max(o.produces, o.kind === 'sl' || o.kind === 'picot' ? 0.4 : 0));
    const total = widths.reduce((a, b) => a + b, 0);
    maxW = Math.max(maxW, total);
    const rtl = alternate && ri % 2 === 1;
    let x = 0;
    ops.forEach((op, i) => {
      const w = Math.max(MIN_W, widths[i]);
      const h = op.produces === 0 ? hgt * 0.4 : (stitchHeight(op) / Math.max(1, round.height)) * hgt;
      const cx = rtl ? total - x - w / 2 : x + w / 2;
      stitches.push({ op, round, roundIdx: ri, x: cx, y: -(y + h / 2), angle: 0, w, h, r0: 0 });
      x += widths[i];
    });
    rings.push({ round, r0: 0, r1: 0, y0: -y, y1: -(y + hgt), startAngle: 0, x0: 0, x1: total });
    y += hgt;
  });
  // Centre rows horizontally.
  for (const s of stitches) {
    const ring = rings[s.roundIdx];
    s.x += (maxW - ring.x1) / 2;
  }
  for (const ring of rings) {
    const shift = (maxW - ring.x1) / 2;
    ring.x0 += shift;
    ring.x1 += shift;
  }
  return { stitches, rings, bounds: { minX: -0.5, minY: -y - 0.5, maxX: maxW + 0.5, maxY: 0.5 }, circular: false };
}
