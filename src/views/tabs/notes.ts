// Checklist of free steps, attached file and round notes.

import { h, clear, pickFile, debounce } from '../../core/dom';
import { t } from '../../core/i18n';
import type { Pattern } from '../../core/types';
import { rounds } from '../../core/progress';
import * as store from '../../store/store';
import { openPdf, renderPage } from '../../pdf/pdfjs';

export function notesTab(root: HTMLElement, p0: Pattern) {
  const id = p0.id;
  const checklist = h('section', { class: 'panel' });
  const attach = h('section', { class: 'panel' });
  const notes = h('section', { class: 'panel' });
  root.append(h('div', { class: 'stack' }, checklist, attach, notes));

  const saveText = debounce((itemId: string, text: string) => {
    void store.update(id, (q) => {
      const it = q.checklist.find((c) => c.id === itemId);
      if (it) it.text = text;
    }, { silent: true });
  }, 400);

  const renderChecklist = () => {
    const p = store.getPattern(id)!;
    clear(checklist);
    const list = h('ul', { class: 'check-list' });
    p.checklist.forEach((c, i) => {
      const input = h('input', { type: 'text', value: c.text, 'aria-label': t('checklist'), oninput: () => saveText(c.id, input.value) });
      const move = (d: number) =>
        void store.update(id, (q) => {
          const j = i + d;
          if (j < 0 || j >= q.checklist.length) return;
          [q.checklist[i], q.checklist[j]] = [q.checklist[j], q.checklist[i]];
        });
      list.append(
        h(
          'li',
          { class: c.done ? 'done' : '' },
          h('input', {
            type: 'checkbox',
            checked: c.done,
            'aria-label': c.text,
            onchange: (e: Event) => void store.update(id, (q) => (q.checklist[i].done = (e.target as HTMLInputElement).checked)),
          }),
          input,
          h('button', { class: 'icon-btn', title: t('move_up'), 'aria-label': t('move_up'), disabled: i === 0, onclick: () => move(-1) }, '↑'),
          h('button', { class: 'icon-btn', title: t('move_down'), 'aria-label': t('move_down'), disabled: i === p.checklist.length - 1, onclick: () => move(1) }, '↓'),
          h('button', { class: 'icon-btn', title: t('delete'), 'aria-label': t('delete'), onclick: () => void store.update(id, (q) => q.checklist.splice(i, 1)) }, '×'),
        ),
      );
    });
    const add = h('input', { type: 'text', placeholder: t('checklist_placeholder'), 'aria-label': t('checklist_add'), style: 'flex:1' });
    const doAdd = () => {
      const v = add.value.trim();
      if (!v) return;
      void store.update(id, (q) => q.checklist.push({ id: store.uid(), text: v, done: false })).then(() => {
        (checklist.querySelector('input[placeholder]') as HTMLInputElement | null)?.focus();
      });
    };
    add.addEventListener('keydown', (e) => e.key === 'Enter' && doAdd());
    checklist.append(h('h2', null, '☑ ', t('checklist')), list, h('div', { class: 'row' }, add, h('button', { class: 'btn', onclick: doAdd }, t('add'))));
  };

  let attachRendered = '';
  const renderAttach = async () => {
    const p = store.getPattern(id)!;
    const sig = p.attachment?.blobId ?? '';
    if (sig === attachRendered && attach.childElementCount) return;
    attachRendered = sig;
    clear(attach);
    const choose = async () => {
      const [f] = await pickFile('application/pdf,image/*,text/plain,.txt,.md');
      if (!f) return;
      const bid = await store.putBlob(f, f.name);
      const old = p.attachment?.blobId;
      await store.update(id, (q) => (q.attachment = { blobId: bid, name: f.name, type: f.type || 'application/octet-stream' }));
      if (old) await store.deleteBlob(old);
    };
    attach.append(h('h2', null, '📎 ', t('attachment')));
    if (!p.attachment) {
      attach.append(h('button', { class: 'btn', onclick: () => void choose() }, t('attachment_add')));
      return;
    }
    const a = p.attachment;
    const url = await store.blobUrl(a.blobId);
    attach.append(
      h(
        'div',
        { class: 'row', style: 'margin-bottom:.75rem' },
        h('strong', null, a.name),
        h('span', { class: 'spacer' }),
        url ? h('a', { class: 'btn btn-small', href: url, target: '_blank', rel: 'noopener', download: a.name }, t('attachment_open')) : null,
        h('button', { class: 'btn btn-small', onclick: () => void choose() }, t('attachment_replace')),
        h('button', {
          class: 'btn btn-small btn-danger',
          onclick: async () => {
            await store.update(id, (q) => delete q.attachment);
            await store.deleteBlob(a.blobId);
          },
        }, t('attachment_remove')),
      ),
    );
    const preview = h('div', { class: 'attach-preview' });
    attach.append(preview);
    const b = await store.getBlob(a.blobId);
    if (!b) return;
    if (a.type === 'application/pdf' || a.name.toLowerCase().endsWith('.pdf')) {
      const doc = await openPdf(await b.blob.arrayBuffer());
      for (let i = 1; i <= Math.min(doc.numPages, 20); i++) preview.append(await renderPage(await doc.getPage(i), 900));
    } else if (a.type.startsWith('image/')) {
      preview.append(h('img', { src: url, alt: a.name, style: 'display:block;margin:auto' }));
    } else {
      preview.append(h('pre', null, (await b.blob.text()).slice(0, 200_000)));
    }
  };

  const renderNotes = () => {
    const p = store.getPattern(id)!;
    clear(notes);
    notes.append(h('h2', null, '📝 ', t('round_notes')));
    const withNotes = rounds(p).filter((r) => p.roundNotes[r.key]);
    if (!withNotes.length) notes.append(h('p', { class: 'muted small' }, '—'));
    for (const r of withNotes) notes.append(h('p', null, h('strong', null, r.label), ' — ', p.roundNotes[r.key]));
  };

  const render = () => {
    if (!store.getPattern(id)) return;
    const ae = document.activeElement;
    // Don't rebuild the list under the cursor of a step being typed.
    if (!(ae instanceof HTMLInputElement && ae.type === 'text' && ae.closest('.check-list'))) renderChecklist();
    void renderAttach();
    renderNotes();
  };
  render();
  return store.subscribe((ids) => ids.includes(id) && render());
}
