// Yarn needed, suggested weight, finished size and other hooks.

import { h, clear } from '../../core/dom';
import { t, fmtCm, fmtMeters, fmtNumber, getLang, type Key } from '../../core/i18n';
import type { Pattern } from '../../core/types';
import { parsed } from '../../core/progress';
import { estimateSize, estimateYarn, hookComparison, WEIGHT_NAMES, WEIGHT_NAMES_FR, type Size } from '../../core/yarn';
import * as store from '../../store/store';

export function hookOf(p: Pattern): number {
  return p.hookMm ?? parsed(p).hookMm ?? 3;
}

export function fmtSize(s?: Size): string {
  return s ? `${fmtCm(s.heightCm)} × ${fmtCm(s.widthCm)}` : '—';
}

export function weightName(n: number): string {
  return (getLang() === 'fr' ? WEIGHT_NAMES_FR : WEIGHT_NAMES)[n];
}

export function yarnTab(root: HTMLElement, p0: Pattern) {
  const id = p0.id;
  const wrap = h('div', { class: 'stack' });
  root.append(wrap);
  const render = () => {
    const p = store.getPattern(id);
    if (!p) return;
    clear(wrap);
    const res = parsed(p);
    if (!res.pieces.length) {
      wrap.append(h('p', { class: 'empty' }, t('no_rounds')));
      return;
    }
    const hook = hookOf(p);
    const y = estimateYarn(res, hook, p.text, p.colors);
    const materialKey = y.material ? (`material_${y.material}` as Key) : undefined;
    wrap.append(
      h(
        'section',
        { class: 'panel' },
        h('h2', null, '🧶 ', t('yarn_needed')),
        h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'data' },
            h('thead', null, h('tr', null, h('th', null, t('yarn_color')), h('th', null, t('yarn_pieces')), h('th', { class: 'num' }, t('yarn_length')), h('th', { class: 'num' }, t('yarn_weight')))),
            h(
              'tbody',
              null,
              ...y.lines.map((l) =>
                h(
                  'tr',
                  null,
                  h('td', null, h('span', { class: 'color-dot', style: `background:${l.hex}` }), ' ', l.name, l.guessed ? h('span', { class: 'badge warn', style: 'margin-left:.4rem', title: t('guessed_help') }, t('guessed')) : null),
                  h('td', null, l.pieces.join(', ')),
                  h('td', { class: 'num' }, fmtMeters(l.metersWithMargin)),
                  h('td', { class: 'num' }, `${fmtNumber(l.grams)} g`),
                ),
              ),
            ),
          ),
        ),
        h('p', { style: 'margin-top:.75rem' }, t('yarn_category', { n: y.category, name: weightName(y.category) })),
        materialKey ? h('p', null, t('yarn_material', { m: t(materialKey) })) : null,
        h('p', { class: 'small muted' }, t('yarn_estimate_note')),
      ),
    );

    // Colour of each piece (guessed ones first get a picker).
    const pickers = res.pieces.map((pc) => {
      const key = pc.name.toLowerCase();
      const val = p.colors[key] ?? pc.color ?? '#d9c3a0';
      const input = h('input', {
        type: 'color',
        value: val,
        'aria-label': `${t('yarn_color')} — ${pc.name}`,
        onchange: (e: Event) => void store.update(id, (q) => (q.colors[key] = (e.target as HTMLInputElement).value)),
      });
      return h(
        'div',
        { class: 'piece-row' },
        input,
        h('span', { class: 'name' }, pc.name, pc.copies > 1 ? ` ${t('copies', { n: pc.copies })}` : ''),
        pc.colorGuessed && !p.colors[key] ? h('span', { class: 'badge warn', title: t('guessed_help') }, t('guessed')) : h('span', { class: 'small muted' }, pc.colorName ?? ''),
        p.colors[key] ? h('button', { class: 'btn btn-ghost btn-small', onclick: () => void store.update(id, (q) => delete q.colors[key]) }, '↺') : null,
      );
    });
    wrap.append(h('section', { class: 'panel' }, h('h2', null, '🎨 ', t('piece_colors')), h('div', { class: 'piece-list' }, ...pickers)));

    const est = estimateSize(res, hook);
    const rows = hookComparison(res, hook, p.text, p.colors);
    wrap.append(
      h(
        'section',
        { class: 'panel' },
        h('h2', null, '📏 ', t('size_title')),
        res.statedSizeCm ? h('p', null, t('size_stated', { s: fmtCm(res.statedSizeCm) })) : null,
        h('p', null, est ? t('size_estimated', { s: fmtSize(est) }) : t('size_unknown')),
        h('h3', null, t('other_hook')),
        h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'data' },
            h('thead', null, h('tr', null, h('th', null, t('col_hook')), h('th', null, t('col_size')), h('th', { class: 'num' }, t('col_length')), h('th', { class: 'num' }, t('col_weight')), h('th', null, t('col_category')))),
            h(
              'tbody',
              null,
              ...rows.map((r) => {
                // A stated size scales with the hook too.
                const scaled = res.statedSizeCm ? ` (≈ ${fmtCm((res.statedSizeCm * r.hookMm) / hook)})` : '';
                return h(
                  'tr',
                  { style: r.hookMm === hook ? 'font-weight:700' : undefined },
                  h('td', null, `${fmtNumber(r.hookMm, 2)} mm`),
                  h('td', null, fmtSize(r.size) + scaled),
                  h('td', { class: 'num' }, fmtMeters(r.meters)),
                  h('td', { class: 'num' }, `${fmtNumber(r.grams)} g`),
                  h('td', null, `${r.category} · ${weightName(r.category)}`),
                );
              }),
            ),
          ),
        ),
      ),
    );
  };
  render();
  return store.subscribe((ids) => ids.includes(id) && render());
}
