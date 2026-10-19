// Interactive instructions: tick rounds directly in the pattern text.

import { h, append, clear, confirmDialog } from '../../core/dom';
import { t } from '../../core/i18n';
import type { Pattern, Round } from '../../core/types';
import { currentRound, parsed } from '../../core/progress';
import { matchLabel } from '../../parser/pattern';
import * as store from '../../store/store';
import { completeCurrent, setRoundDone } from '../../features/actions';
import { timerBox } from '../pattern';

export function countBadge(r: Round): HTMLElement | null {
  if (r.mismatch) return h('span', { class: 'badge bad cnt', title: t('count_mismatch', { got: r.count ?? '?', stated: r.stated ?? '?' }) }, `⚠ ${r.count}≠${r.stated}`);
  if (r.consumeMismatch) return h('span', { class: 'badge warn cnt', title: t('consume_mismatch', { used: r.consumed, prev: '' }) }, `${r.count ?? '?'} ⚠`);
  if (r.count !== undefined) return h('span', { class: 'badge cnt' }, t('count_ok', { n: r.count }));
  return null;
}

export function instructionsTab(root: HTMLElement, p0: Pattern) {
  const id = p0.id;
  const text = h('div', { class: 'ptext', role: 'list' });
  const side = h('div', { class: 'stack sidebox' });
  const timer = timerBox(id);
  root.append(h('div', { class: 'cols' }, text, side));

  const render = () => {
    const p = store.getPattern(id);
    if (!p) return;
    const res = parsed(p);
    const cur = currentRound(p);
    clear(text);
    if (!res.pieces.length) text.append(h('p', { class: 'muted', style: 'padding:0 1rem' }, t('no_rounds')));
    const titleLines = new Set(res.pieces.map((pc) => pc.line));
    p.text.split('\n').forEach((line, i) => {
      const rs = res.byLine.get(i);
      if (!line.trim()) {
        text.append(h('div', { class: 'pline blank' }));
        return;
      }
      if (!rs?.length) {
        text.append(h('div', { class: 'pline' + (titleLines.has(i) && !matchLabel(line) ? ' title' : '') }, h('span', { class: 'txt' }, line)));
        return;
      }
      const allDone = rs.every((r) => p.done[r.key] !== undefined);
      const isCur = !!cur && rs.some((r) => r.key === cur.key);
      const row = h('div', {
        class: `pline round${allDone ? ' done' : ''}${isCur ? ' current' : ''}`,
        role: 'listitem',
        dataset: { line: String(i) },
      });
      const boxes = rs.map((r) =>
        h('input', {
          type: 'checkbox',
          checked: p.done[r.key] !== undefined,
          'aria-label': `${t('mark_done')} — ${r.label}${rs.length > 1 ? ` (${r.number})` : ''}`,
          title: rs.length > 1 ? String(r.number) : r.label,
          onclick: (e: Event) => {
            e.stopPropagation();
            void setRoundDone(id, r.key, (e.target as HTMLInputElement).checked);
          },
        }),
      );
      row.addEventListener('click', () => {
        // A click on the line ticks its next round, or unticks them all.
        const next = rs.find((r) => p.done[r.key] === undefined);
        if (next) void setRoundDone(id, next.key, true);
        else void store.update(id, (q) => rs.forEach((r) => delete q.done[r.key]));
      });
      const first = rs[0];
      append(row, [h('span', { class: 'row', style: 'gap:2px;flex:none' }, ...boxes), h('span', { class: 'txt' }, line), countBadge(first)]);
      if (rs.some((r) => p.roundNotes[r.key])) row.append(h('span', { title: rs.map((r) => p.roundNotes[r.key]).filter(Boolean).join('\n') }, '📝'));
      text.append(row);
      if (isCur && first === rs[0] && !scrolled) {
        scrolled = true;
        requestAnimationFrame(() => row.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      }
    });

    clear(side);
    const curBox = h('div', { class: 'panel' }, h('h3', null, t('current_round')));
    if (cur) {
      const piece = res.pieces.find((pc) => pc.rounds.includes(cur));
      curBox.append(
        h('p', { style: 'margin:0 0 .25rem' }, h('strong', null, cur.label), piece && res.pieces.length > 1 ? h('span', { class: 'muted' }, ` · ${piece.name}${piece.copies > 1 ? ` ${t('copies', { n: piece.copies })}` : ''}`) : null),
        h('p', { class: 'small' }, cur.instructions),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-primary', onclick: () => void completeCurrent(id) }, '✓ ', t('mark_done')),
          h('a', { class: 'btn', href: `#/patron/${id}/compteur` }, t('tab_counter'))),
      );
    } else if (res.pieces.length) curBox.append(h('p', null, '🎉 ', t('all_done')));
    side.append(curBox, timer.el);
    if (Object.keys(p.done).length)
      side.append(
        h('button', {
          class: 'btn btn-ghost btn-small',
          onclick: async () => {
            if (await confirmDialog(t('reset_progress'), t('confirm_reset'), t('ok'), t('cancel'))) void store.update(id, (q) => ((q.done = {}), (q.stitchCount = 0)));
          },
        }, '↺ ', t('reset_progress')),
      );
  };
  let scrolled = false;
  render();
  const off = store.subscribe((ids) => ids.includes(id) && render());
  return () => {
    off();
    timer.stop();
  };
}
