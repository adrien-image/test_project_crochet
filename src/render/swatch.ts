// Generated cover: a swatch of single crochet in the pattern's yarn colours.

import { shade } from '../parser/colors';

const cache = new Map<string, string>();

export function swatchUrl(colors: string[], w = 320, hgt = 240): string {
  const key = colors.join(',') + w + 'x' + hgt;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  const ctx = c.getContext('2d')!;
  const cols = colors.length ? colors : ['#d9c3a0'];
  const sw = 22;
  const sh = 20;
  ctx.lineCap = 'round';
  for (let row = 0, y = -sh / 2; y < hgt + sh; row++, y += sh) {
    const col = cols[Math.floor(row / 3) % cols.length];
    ctx.fillStyle = shade(col, -0.45);
    ctx.fillRect(0, y - sh / 2, w, sh);
    for (let x = (row % 2) * (sw / 2) - sw; x < w + sw; x += sw) {
      for (const [dx, lw, tone] of [
        [0, 7, -0.35],
        [0, 5, 0],
        [-1.2, 1.6, 0.4],
      ] as const) {
        ctx.strokeStyle = tone ? shade(col, tone) : col;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x - sw * 0.38 + dx, y - sh * 0.42 + dx);
        ctx.quadraticCurveTo(x - sw * 0.12 + dx, y + dx, x + dx, y + sh * 0.45 + dx);
        ctx.moveTo(x + sw * 0.38 + dx, y - sh * 0.42 + dx);
        ctx.quadraticCurveTo(x + sw * 0.12 + dx, y + dx, x + dx, y + sh * 0.45 + dx);
        ctx.stroke();
      }
    }
  }
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
