// Realistic fabric view: every stitch drawn strand by strand on a canvas.
// Rounds not yet done are faded.

import type { Piece } from '../core/types';
import { shade } from '../parser/colors';
import { layoutPiece, type Placed } from './layout';

export interface FabricOptions {
  done: (key: string) => boolean;
  colorFor: (piece: Piece, roundColor?: string) => string;
  size: number;
  fadeUndone?: boolean;
  highlightKey?: string;
}

export function drawFabric(canvas: HTMLCanvasElement, piece: Piece, opts: FabricOptions) {
  const lay = layoutPiece(piece, 'fabric');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { minX, minY, maxX, maxY } = lay.bounds;
  const bw = maxX - minX;
  const bh = maxY - minY;
  const scale = opts.size / Math.max(bw, bh);
  const cw = Math.ceil(bw * scale);
  const ch = Math.ceil(bh * scale);
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width = `${cw}px`;
  canvas.style.aspectRatio = `${cw} / ${ch}`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.translate(-minX * scale, -minY * scale);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Fabric behind the stitches, round by round.
  for (const ring of lay.rings) {
    const col = opts.colorFor(piece, ring.round.color);
    const isDone = opts.done(ring.round.key);
    ctx.globalAlpha = opts.fadeUndone !== false && !isDone ? 0.4 : 1;
    ctx.fillStyle = shade(col, -0.45);
    ctx.beginPath();
    if (lay.circular) {
      ctx.arc(0, 0, ring.r1, 0, Math.PI * 2);
      ctx.arc(0, 0, ring.r0, 0, Math.PI * 2, true);
    } else {
      ctx.rect(ring.x0, ring.y1, ring.x1 - ring.x0, ring.y0 - ring.y1);
    }
    ctx.fill();
    if (ring.round.loop) {
      // Unused loops make a ridge at the base of the round.
      ctx.strokeStyle = shade(col, ring.round.loop === 'blo' ? 0.15 : -0.2);
      ctx.lineWidth = 0.18;
      ctx.beginPath();
      if (lay.circular) ctx.arc(0, 0, ring.r0 + 0.05, 0, Math.PI * 2);
      else {
        ctx.moveTo(ring.x0, ring.y0 - 0.05);
        ctx.lineTo(ring.x1, ring.y0 - 0.05);
      }
      ctx.stroke();
    }
  }

  for (const st of lay.stitches) {
    const col = opts.colorFor(piece, st.round.color);
    const isDone = opts.done(st.round.key);
    ctx.globalAlpha = opts.fadeUndone !== false && !isDone ? 0.42 : 1;
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.rotate(st.angle);
    drawStitch(ctx, st, col);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  if (opts.highlightKey) {
    const ring = lay.rings.find((r) => r.round.key === opts.highlightKey);
    if (ring) {
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--accent') || '#e0457b';
      ctx.lineWidth = 0.12;
      ctx.setLineDash([0.3, 0.2]);
      ctx.beginPath();
      if (lay.circular) ctx.arc(0, 0, ring.r1, 0, Math.PI * 2);
      else ctx.rect(ring.x0, ring.y1, ring.x1 - ring.x0, ring.y0 - ring.y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/** One strand: dark edge, body, highlight — reads as a twisted yarn. */
function strand(ctx: CanvasRenderingContext2D, col: string, w: number, path: (c: CanvasRenderingContext2D) => void) {
  ctx.strokeStyle = shade(col, -0.35);
  ctx.lineWidth = w;
  ctx.beginPath();
  path(ctx);
  ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = w * 0.7;
  ctx.beginPath();
  path(ctx);
  ctx.stroke();
  ctx.strokeStyle = shade(col, 0.35);
  ctx.lineWidth = w * 0.22;
  ctx.save();
  ctx.translate(-w * 0.12, -w * 0.12);
  ctx.beginPath();
  path(ctx);
  ctx.stroke();
  ctx.restore();
}

function vee(ctx: CanvasRenderingContext2D, col: string, cx: number, w: number, top: number, bottom: number, sw: number) {
  const half = w * 0.42;
  strand(ctx, col, sw, (c) => {
    c.moveTo(cx - half, top);
    c.quadraticCurveTo(cx - half * 0.35, (top + bottom) / 2, cx, bottom);
  });
  strand(ctx, col, sw, (c) => {
    c.moveTo(cx + half, top);
    c.quadraticCurveTo(cx + half * 0.35, (top + bottom) / 2, cx, bottom);
  });
}

function drawStitch(ctx: CanvasRenderingContext2D, st: Placed, col: string) {
  const { w, h, op } = st;
  const top = -h / 2;
  const bottom = h / 2;
  const sw = Math.min(0.42, Math.max(0.12, Math.min(w, 1) * 0.36));
  const base = op.base ?? op.kind;
  switch (op.kind) {
    case 'ch':
      strand(ctx, col, sw * 0.8, (c) => c.ellipse(0, 0, Math.max(0.15, w * 0.35), h * 0.22, 0, 0, Math.PI * 2));
      return;
    case 'sl':
      strand(ctx, col, sw * 0.7, (c) => c.ellipse(0, bottom - h * 0.3, Math.max(0.12, w * 0.3), h * 0.15, 0, 0, Math.PI * 2));
      return;
    case 'picot':
      strand(ctx, col, sw * 0.6, (c) => c.arc(0, top, Math.max(0.15, h * 0.35), 0, Math.PI * 2));
      return;
    case 'bobble':
    case 'puff':
    case 'popcorn': {
      ctx.fillStyle = shade(col, -0.1);
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(0.25, w * 0.45), h * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = -1; i <= 1; i++) {
        strand(ctx, col, sw * 0.6, (c) => {
          c.moveTo(i * w * 0.2, bottom);
          c.quadraticCurveTo(i * w * 0.5, 0, i * w * 0.15, top);
        });
      }
      return;
    }
    case 'inc':
    case 'inc3': {
      const n = op.kind === 'inc' ? 2 : 3;
      const each = w / n;
      for (let i = 0; i < n; i++) {
        const cx = -w / 2 + each * (i + 0.5);
        // All the legs meet in the same stitch below.
        vee(ctx, col, cx, each, top, bottom, sw);
        strand(ctx, col, sw * 0.5, (c) => {
          c.moveTo(cx, bottom);
          c.lineTo(0, bottom + 0.08);
        });
      }
      return;
    }
    case 'dec':
    case 'dec3': {
      vee(ctx, col, 0, w, top, bottom - h * 0.15, sw);
      // Two (or three) legs gathered at the base.
      const legs = op.kind === 'dec' ? [-0.5, 0.5] : [-0.6, 0, 0.6];
      for (const l of legs) {
        strand(ctx, col, sw * 0.7, (c) => {
          c.moveTo(0, bottom - h * 0.15);
          c.lineTo(l * Math.max(w, 1), bottom);
        });
      }
      return;
    }
    default: {
      const tall = base === 'dc' || base === 'tr' || base === 'dtr' || base === 'hdc';
      if (op.produces > 1) {
        // Several stitches in one (shells).
        const each = w / op.produces;
        for (let i = 0; i < op.produces; i++) post(ctx, col, -w / 2 + each * (i + 0.5), each, top, bottom, sw, base);
        return;
      }
      if (!tall) {
        vee(ctx, col, 0, w, top, bottom, sw);
        return;
      }
      post(ctx, col, 0, w, top, bottom, sw, base);
    }
  }
}

function post(ctx: CanvasRenderingContext2D, col: string, cx: number, w: number, top: number, bottom: number, sw: number, base: string) {
  const vBottom = top + Math.min(0.9, (bottom - top) * 0.45);
  vee(ctx, col, cx, w, top, vBottom, sw);
  strand(ctx, col, sw, (c) => {
    c.moveTo(cx, vBottom);
    c.lineTo(cx, bottom);
  });
  const wraps = base === 'hdc' ? 1 : base === 'dc' ? 1 : base === 'tr' ? 2 : base === 'dtr' ? 3 : 0;
  for (let i = 0; i < wraps; i++) {
    const y = vBottom + ((bottom - vBottom) * (i + 1)) / (wraps + 1);
    strand(ctx, col, sw * 0.75, (c) => {
      c.moveTo(cx - w * 0.3, y + (base === 'hdc' ? 0 : 0.15));
      c.lineTo(cx + w * 0.3, y - (base === 'hdc' ? 0 : 0.15));
    });
  }
}
