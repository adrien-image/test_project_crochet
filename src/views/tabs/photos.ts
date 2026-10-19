// Photos: gallery, full-screen viewer, cover choice.

import { h, clear, pickFile } from '../../core/dom';
import { t } from '../../core/i18n';
import type { Pattern } from '../../core/types';
import * as store from '../../store/store';
import { storePhoto } from '../../features/images';

export function openViewer(ids: string[], start: number) {
  let i = start;
  const img = h('img', { alt: '' });
  const show = async () => {
    const u = await store.blobUrl(ids[i]);
    if (u) img.src = u;
  };
  const close = () => {
    el.remove();
    document.removeEventListener('keydown', onKey);
  };
  const go = (d: number) => {
    i = (i + d + ids.length) % ids.length;
    void show();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  const el = h(
    'div',
    { class: 'viewer', role: 'dialog', 'aria-modal': 'true', onclick: (e: Event) => e.target === el && close() },
    img,
    h('button', { class: 'icon-btn v-close', 'aria-label': t('close'), onclick: close }, '×'),
    ids.length > 1 ? h('button', { class: 'icon-btn v-prev', 'aria-label': '←', onclick: () => go(-1) }, '‹') : null,
    ids.length > 1 ? h('button', { class: 'icon-btn v-next', 'aria-label': '→', onclick: () => go(1) }, '›') : null,
  );
  document.body.append(el);
  document.addEventListener('keydown', onKey);
  void show();
  (el.querySelector('.v-close') as HTMLElement).focus();
}

export function photosTab(root: HTMLElement, p0: Pattern) {
  const id = p0.id;
  const wrap = h('div', { class: 'stack' });
  root.append(wrap);
  const add = async () => {
    const files = await pickFile('image/*', true);
    const ids: string[] = [];
    for (const f of files) ids.push(await storePhoto(f, f.name));
    if (ids.length)
      void store.update(id, (q) => {
        q.photos.push(...ids);
        if (!q.coverId) q.coverId = ids[0];
      });
  };
  const render = () => {
    const p = store.getPattern(id);
    if (!p) return;
    clear(wrap);
    wrap.append(h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, t('tab_photos')), h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary', onclick: () => void add() }, '📷 ', t('photos_add'))));
    const all = [...p.photos, ...Object.values(p.roundPhotos).filter((x) => !p.photos.includes(x))];
    if (!all.length) {
      wrap.append(h('p', { class: 'empty' }, t('photos_empty')));
      return;
    }
    const grid = h('div', { class: 'gallery' });
    all.forEach((bid, i) => {
      const img = h('img', { alt: '', loading: 'lazy', onclick: () => openViewer(all, i) });
      void store.blobUrl(bid, true).then((u) => u && (img.src = u));
      const isCover = p.coverId === bid;
      const own = p.photos.includes(bid);
      grid.append(
        h(
          'figure',
          null,
          img,
          h(
            'figcaption',
            null,
            isCover ? h('span', { class: 'badge accent', style: 'margin-right:auto' }, '★ ', t('photo_is_cover')) : null,
            !isCover
              ? h('button', { class: 'icon-btn', title: t('photo_cover'), 'aria-label': t('photo_cover'), onclick: () => void store.update(id, (q) => (q.coverId = bid)) }, '☆')
              : null,
            own
              ? h('button', {
                  class: 'icon-btn',
                  title: t('photo_delete'),
                  'aria-label': t('photo_delete'),
                  onclick: async () => {
                    await store.update(id, (q) => {
                      q.photos = q.photos.filter((x) => x !== bid);
                      if (q.coverId === bid) q.coverId = q.photos[0];
                    });
                    await store.deleteBlob(bid);
                  },
                }, '🗑')
              : null,
          ),
        ),
      );
    });
    wrap.append(grid);
  };
  render();
  return store.subscribe((ids) => ids.includes(id) && render());
}
