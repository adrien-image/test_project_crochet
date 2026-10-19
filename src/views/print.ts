// Printable sheet (or PDF through the browser's print dialog).

import { h } from '../core/dom';
import { t, fmtMeters, fmtNumber, fmtCm, type Key } from '../core/i18n';
import type { Pattern } from '../core/types';
import { parsed } from '../core/progress';
import { estimateSize, estimateYarn } from '../core/yarn';
import { chartSvg } from '../render/chart';
import * as store from '../store/store';
import { decodeShare, fromShared } from '../features/share';
import { pieceColor } from './tabs/rounds';
import { fmtSize, hookOf, weightName } from './tabs/yarn';

export async function printPatternView(root: HTMLElement, [id]: string[]) {
  const p = store.getPattern(id);
  if (!p) {
    root.append(h('p', { class: 'empty' }, t('not_found')));
    return;
  }
  await renderSheet(root, p, `#/patron/${id}`);
}

export async function printSharedView(root: HTMLElement, [data]: string[]) {
  try {
    const p = fromShared(await decodeShare(data));
    await renderSheet(root, p, '#/');
  } catch {
    root.append(h('p', { class: 'empty' }, t('share_invalid')));
  }
}

async function renderSheet(root: HTMLElement, p: Pattern, back: string) {
  const res = parsed(p);
  const hook = hookOf(p);
  const y = res.pieces.length ? estimateYarn(res, hook, p.text, p.colors) : undefined;
  const size = estimateSize(res, hook);
  const sheet = h('article', { class: 'print-sheet' });
  root.append(
    h('div', { class: 'print-toolbar' }, h('a', { class: 'btn', href: back }, '← ', t('back')), h('button', { class: 'btn btn-primary', onclick: () => window.print() }, '🖨 ', t('print_open'))),
    sheet,
  );
  sheet.append(h('h1', null, p.name));

  const photoIds = [p.coverId, ...p.photos.filter((x) => x !== p.coverId)].filter((x): x is string => !!x).slice(0, 4);
  if (photoIds.length) {
    const box = h('div', { class: 'photos' });
    for (const bid of photoIds) {
      const u = await store.blobUrl(bid);
      if (u) box.append(h('img', { src: u, alt: '' }));
    }
    sheet.append(box);
  }

  const mat = h('ul');
  mat.append(h('li', null, `${t('hook')} : ${fmtNumber(hook, 2)} mm`));
  if (p.yarn) mat.append(h('li', null, `${t('yarn')} : ${p.yarn}`));
  if (y) {
    mat.append(h('li', null, t('yarn_category', { n: y.category, name: weightName(y.category) })));
    if (y.material) mat.append(h('li', null, t('yarn_material', { m: t(`material_${y.material}` as Key) })));
    for (const l of y.lines)
      mat.append(h('li', null, `${l.name}${l.guessed ? ` (${t('guessed')})` : ''} — ${l.pieces.join(', ')} — ${fmtMeters(l.metersWithMargin)} · ${fmtNumber(l.grams)} g`));
  }
  if (res.statedSizeCm) mat.append(h('li', null, t('size_stated', { s: fmtCm(res.statedSizeCm) })));
  else if (size) mat.append(h('li', null, t('size_estimated', { s: fmtSize(size) })));
  sheet.append(h('h2', null, t('print_materials')), mat);

  if (p.checklist.length) {
    sheet.append(
      h('h2', null, t('checklist')),
      ...p.checklist.map((c) => h('div', { class: 'prow' }, h('span', { class: 'box' }, c.done ? '✓' : ''), h('span', null, c.text))),
    );
  }

  sheet.append(h('h2', null, t('print_rounds')));
  const titleLines = new Set(res.pieces.map((pc) => pc.line));
  p.text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const rs = res.byLine.get(i);
    if (rs?.length) {
      const done = rs.every((r) => p.done[r.key] !== undefined);
      sheet.append(h('div', { class: 'prow' }, h('span', { class: 'box' }, done ? '✓' : ''), h('span', null, line.trim())));
      for (const r of rs) if (p.roundNotes[r.key]) sheet.append(h('div', { class: 'pnote' }, `${r.label} — ${p.roundNotes[r.key]}`));
    } else sheet.append(h('div', { class: titleLines.has(i) ? 'ptitle' : '' }, line.trim()));
  });

  if (res.pieces.length) {
    const colorFor = pieceColor(p);
    sheet.append(
      h('h2', null, t('print_charts')),
      h('div', { class: 'charts' }, ...res.pieces.map((pc) => h('figure', null, chartSvg(pc, { colorFor }), h('figcaption', { class: 'small' }, pc.name, pc.copies > 1 ? ` ${t('copies', { n: pc.copies })}` : '')))),
    );
  }
  sheet.append(h('p', { class: 'small muted', style: 'margin-top:1.5rem' }, t('printed_from')));
}
