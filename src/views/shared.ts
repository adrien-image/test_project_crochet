// Opening a share link: preview the pattern, then add a copy to the library.

import { h, toast } from '../core/dom';
import { t } from '../core/i18n';
import { parsed } from '../core/progress';
import * as store from '../store/store';
import { decodeShare, fromShared } from '../features/share';
import { chartSvg } from '../render/chart';

export async function sharedView(root: HTMLElement, [data]: string[]) {
  let sp;
  try {
    sp = await decodeShare(data);
  } catch {
    root.append(h('p', { class: 'empty' }, t('share_invalid')), h('p', { style: 'text-align:center' }, h('a', { class: 'btn', href: '#/' }, t('back'))));
    return;
  }
  const p = fromShared(sp);
  const res = parsed(p);
  root.append(
    h('p', { class: 'muted' }, t('share_import_title')),
    h('h1', null, p.name),
    h(
      'div',
      { class: 'row', style: 'margin-bottom:1rem' },
      h('button', {
        class: 'btn btn-primary',
        onclick: async () => {
          await store.save(p);
          toast(t('share_added'));
          location.hash = `#/patron/${p.id}`;
        },
      }, '＋ ', t('share_import_add')),
      h('a', { class: 'btn', href: `#/imprimer/${data}` }, '🖨 ', t('print')),
    ),
    h('div', { class: 'cols' },
      h('pre', { class: 'ptext', style: 'padding:1rem;white-space:pre-wrap;font-family:inherit' }, p.text),
      h('div', { class: 'stack' }, ...res.pieces.slice(0, 3).map((pc) => h('div', { class: 'panel' }, h('h3', null, pc.name), chartSvg(pc))))),
  );
}
