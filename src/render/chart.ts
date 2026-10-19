// Chart view with international crochet symbols, as an exportable SVG.

import type { Piece } from '../core/types';
import { s } from '../core/dom';
import { shade, luminance } from '../parser/colors';
import { layoutPiece, type Placed } from './layout';

export interface ChartOptions {
  done?: (key: string) => boolean;
  colorFor?: (piece: Piece, roundColor?: string) => string;
  ink?: string;
  /** Mark rounds whose count doesn't match. */
  flags?: boolean;
  numbers?: boolean;
  fade?: boolean;
}

const UNIT = 24;

export function chartSvg(piece: Piece, opts: ChartOptions = {}): SVGSVGElement {
  const lay = layoutPiece(piece);
  const pad = 1.6;
  const { minX, minY, maxX, maxY } = lay.bounds;
  const vb = [(minX - pad) * UNIT, (minY - pad) * UNIT, (maxX - minX + 2 * pad) * UNIT, (maxY - minY + 2 * pad) * UNIT];
  const svg = s('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: vb.join(' '),
    class: 'chart-svg',
    role: 'img',
    'aria-label': piece.name,
  });
  const ink = opts.ink ?? '#2b2730';
  svg.append(s('rect', { x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: 'white' }));

  // Guide circles / row lines.
  for (const ring of lay.rings) {
    const flagged = opts.flags !== false && (ring.round.mismatch || ring.round.consumeMismatch);
    const tint = opts.colorFor ? opts.colorFor(piece, ring.round.color) : undefined;
    const guide = flagged ? '#d62f2f' : tint && luminance(tint) < 0.9 ? shade(tint, 0.45) : '#d8d1dc';
    if (lay.circular) {
      svg.append(s('circle', { cx: 0, cy: 0, r: ring.r1 * UNIT, fill: 'none', stroke: guide, 'stroke-width': flagged ? 2 : 1, 'stroke-dasharray': flagged ? '6 4' : undefined }));
    } else {
      svg.append(s('line', { x1: ring.x0 * UNIT, x2: ring.x1 * UNIT, y1: ring.y1 * UNIT, y2: ring.y1 * UNIT, stroke: guide, 'stroke-width': flagged ? 2 : 1, 'stroke-dasharray': flagged ? '6 4' : undefined }));
    }
    if (opts.numbers !== false) {
      const label = String(ring.round.number);
      const lx = lay.circular ? Math.cos(ring.startAngle) * ((ring.r0 + ring.r1) / 2) * UNIT : (ring.x0 - 0.9) * UNIT;
      const ly = lay.circular ? Math.sin(ring.startAngle) * ((ring.r0 + ring.r1) / 2) * UNIT : ((ring.y0 + ring.y1) / 2) * UNIT;
      if (!lay.circular || ring.round.index % 1 === 0) {
        const tx = lay.circular ? lx - 14 : lx;
        svg.append(
          s('text', { x: tx, y: ly + 4, 'font-size': 10, 'font-family': 'system-ui, sans-serif', fill: flagged ? '#d62f2f' : '#7a7280', 'text-anchor': 'middle' }, label),
        );
      }
    }
  }
  if (lay.circular && piece.rounds[0]?.ops.some((o) => o.kind === 'mr')) {
    svg.append(s('circle', { cx: 0, cy: 0, r: 0.55 * UNIT, fill: 'none', stroke: ink, 'stroke-width': 1.5 }));
  }

  for (const st of lay.stitches) {
    const g = s('g', {
      transform: `translate(${(st.x * UNIT).toFixed(2)} ${(st.y * UNIT).toFixed(2)}) rotate(${((st.angle * 180) / Math.PI).toFixed(1)})`,
      opacity: opts.fade && opts.done && !opts.done(st.round.key) ? 0.35 : undefined,
    });
    const col = opts.colorFor ? deepen(opts.colorFor(piece, st.round.color)) : ink;
    symbol(g, st, col);
    svg.append(g);
  }
  return svg;
}

function deepen(hex: string): string {
  // Light yarn colours would vanish on white paper.
  const l = luminance(hex);
  return l > 0.55 ? shade(hex, -(l - 0.35)) : hex;
}

function symbol(g: SVGGElement, st: Placed, ink: string) {
  const u = UNIT;
  const h = Math.max(0.5, st.h) * u;
  const w = st.w * u;
  const top = -h / 2 + 2;
  const bot = h / 2 - 2;
  const line = (x1: number, y1: number, x2: number, y2: number, sw = 2) =>
    g.append(s('line', { x1, y1, x2, y2, stroke: ink, 'stroke-width': sw, 'stroke-linecap': 'round' }));
  const cross = (cx: number, size: number) => {
    const k = size / 2;
    line(cx - k, -k, cx + k, k);
    line(cx - k, k, cx + k, -k);
  };
  const tee = (x: number, y1: number, y2: number, slashes: number) => {
    line(x, y1, x, y2);
    line(x - 5, y1, x + 5, y1);
    for (let i = 0; i < slashes; i++) {
      const y = y1 + ((y2 - y1) * (i + 1)) / (slashes + 1.5);
      line(x - 3.5, y + 2.5, x + 3.5, y - 2.5, 1.3);
    }
  };
  const base = st.op.base ?? 'sc';
  const sz = Math.min(14, Math.max(6, Math.min(w, h) * 0.6));
  switch (st.op.kind) {
    case 'sc':
      cross(0, sz);
      return;
    case 'hdc':
      tee(0, top, bot, 0);
      return;
    case 'dc':
      tee(0, top, bot, 1);
      return;
    case 'tr':
      tee(0, top, bot, 2);
      return;
    case 'dtr':
      tee(0, top, bot, 3);
      return;
    case 'ch':
      g.append(s('ellipse', { cx: 0, cy: 0, rx: Math.max(3, Math.min(6, w * 0.3)), ry: 2.6, fill: 'none', stroke: ink, 'stroke-width': 1.4 }));
      return;
    case 'sl':
      g.append(s('circle', { cx: 0, cy: bot - 2, r: 2.4, fill: ink }));
      return;
    case 'picot':
      g.append(s('circle', { cx: 0, cy: top, r: 3.2, fill: 'none', stroke: ink, 'stroke-width': 1.3 }));
      g.append(s('circle', { cx: 0, cy: top, r: 1, fill: ink }));
      return;
    case 'bobble':
    case 'puff':
    case 'popcorn':
      g.append(s('ellipse', { cx: 0, cy: 0, rx: Math.max(3, w * 0.25), ry: h * 0.38, fill: 'none', stroke: ink, 'stroke-width': 1.5 }));
      if (st.op.kind === 'popcorn') line(-4, top, 4, top);
      return;
    case 'inc':
    case 'inc3': {
      // V: two (three) stitches from one point.
      const n = st.op.kind === 'inc' ? 2 : 3;
      const spread = Math.min(w * 0.4, 11);
      for (let i = 0; i < n; i++) {
        const dx = n === 2 ? (i ? spread : -spread) : (i - 1) * spread;
        line(0, bot, dx, top + 3);
        if (base === 'sc') cross(dx, 6);
      }
      if (base !== 'sc') line(-spread - 3, top + 3, spread + 3, top + 3);
      return;
    }
    case 'dec':
    case 'dec3': {
      // Λ: two (three) stitches joined at the top.
      const n = st.op.kind === 'dec' ? 2 : 3;
      const spread = Math.min(Math.max(w, u) * 0.4, 10);
      for (let i = 0; i < n; i++) {
        const dx = n === 2 ? (i ? spread : -spread) : (i - 1) * spread;
        line(dx, bot, 0, top + 2);
      }
      if (base === 'sc') cross(0, 6);
      return;
    }
    default:
      cross(0, sz);
  }
}

export function svgToString(svg: SVGSVGElement): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
}
