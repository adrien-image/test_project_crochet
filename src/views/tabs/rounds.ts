// Rounds view: realistic fabric or symbol chart, with count checks.

import { h, clear, download } from '../../core/dom';
import { t } from '../../core/i18n';
import type { Pattern, Piece } from '../../core/types';
import { parsed, currentRound } from '../../core/progress';
import * as store from '../../store/store';
import { drawFabric } from '../../render/fabric';
import { chartSvg, svgToString } from '../../render/chart';
import { fileName } from '../../features/share';

let mode: 'fabric' | 'chart' = 'fabric';

export function pieceColor(p: Pattern) {
  return (piece: Piece, roundColor?: string) => p.colors[piece.name.toLowerCase()] ?? roundColor ?? piece.color ?? '#d9c3a0';
}

export function roundsTab(root: HTMLElement, p0: Pattern) {
  const id = p0.id;
  let pieceIdx = 0;
  const wrap = h('div');
  root.append(wrap);
  const render = () => {
    const p = store.getPattern(id);
    if (!p) return;
    const res = parsed(p);
    clear(wrap);
    if (!res.pieces.length) {
      wrap.append(h('p', { class: 'empty' }, t('no_rounds')));
      return;
    }
    pieceIdx = Math.min(pieceIdx, res.pieces.length - 1);
    const piece = res.pieces[pieceIdx];
    const flagged = res.pieces.flatMap((pc) => pc.rounds.filter((r) => r.mismatch || r.consumeMismatch).map((r) => ({ pc, r })));
    const seg = h(
      'div',
      { class: 'seg', role: 'group' },
      ...(['fabric', 'chart'] as const).map((m) =>
        h('button', { 'aria-pressed': String(mode === m), onclick: () => ((mode = m), render()) }, t(m === 'fabric' ? 'view_fabric' : 'view_chart')),
      ),
    );
    const pieceSel = h(
      'select',
      { 'aria-label': t('pieces'), onchange: (e: Event) => ((pieceIdx = Number((e.target as HTMLSelectElement).value)), render()) },
      ...res.pieces.map((pc, i) => h('option', { value: String(i), selected: i === pieceIdx }, `${pc.name}${pc.copies > 1 ? ` ${t('copies', { n: pc.copies })}` : ''}`)),
    );
    const area = h('div', { class: 'view-area' });
    const colorFor = pieceColor(p);
    const cur = currentRound(p);
    if (mode === 'fabric') {
      const c = h('canvas', { role: 'img', 'aria-label': `${piece.name} — ${t('view_fabric')}` });
      area.append(c);
      requestAnimationFrame(() =>
        drawFabric(c, piece, { done: (k) => p.done[k] !== undefined, colorFor, size: Math.min(720, area.clientWidth - 32 || 600), highlightKey: cur?.key }),
      );
    } else {
      area.append(chartSvg(piece, { colorFor, done: (k) => p.done[k] !== undefined, fade: false }));
    }
    const exportSvg = () => {
      const svg = chartSvg(piece, { colorFor });
      download(new Blob([svgToString(svg)], { type: 'image/svg+xml' }), fileName(p, `-${piece.name}.svg`));
    };
    const printChart = () => {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.title = `${p.name} — ${piece.name}`;
      const svg = chartSvg(piece, { colorFor });
      svg.setAttribute('style', 'width:100%;height:auto');
      w.document.body.append(w.document.importNode(svg, true));
      w.setTimeout(() => w.print(), 200);
    };
    wrap.append(
      h('div', { class: 'row', style: 'margin-bottom:.75rem' }, pieceSel, seg, h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-small', onclick: exportSvg }, '⬇ ', t('export_svg')),
        h('button', { class: 'btn btn-small', onclick: printChart }, '🖨 ', t('print_chart'))),
      area,
    );
    if (flagged.length) {
      wrap.append(
        h(
          'div',
          { class: 'panel', style: 'margin-top:1rem' },
          h('h3', null, '⚠ ', t('mismatch_count', { n: flagged.length })),
          h(
            'ul',
            { class: 'flag-list' },
            ...flagged.map(({ pc, r }) =>
              h(
                'li',
                null,
                h('strong', null, `${pc.name} · ${r.label}`),
                ' — ',
                r.mismatch ? t('count_mismatch', { got: r.count ?? '?', stated: r.stated ?? '?' }) : t('consume_mismatch', { used: r.consumed, prev: pc.rounds[r.index - 1]?.count ?? '?' }),
                h('div', { class: 'small muted' }, r.instructions),
              ),
            ),
          ),
        ),
      );
    }
  };
  render();
  const onResize = () => mode === 'fabric' && render();
  window.addEventListener('resize', onResize);
  const off = store.subscribe((ids) => ids.includes(id) && render());
  return () => {
    off();
    window.removeEventListener('resize', onResize);
  };
}
