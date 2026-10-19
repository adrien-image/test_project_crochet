// PDF import: drop a file, follow progress, review the recognised lines next to the pages.

import { h, append, clear, toast, debounce, pickFile } from '../core/dom';
import { t, langName } from '../core/i18n';
import { parsePattern } from '../parser/pattern';
import * as store from '../store/store';
import { storePhoto } from '../features/images';
import type { Imported } from '../pdf/extract';
import type { SrcLine } from '../pdf/cleanup';

export function importView(root: HTMLElement) {
  const box = h('div');
  root.append(h('h1', null, t('import_title')), box);
  const drop = h(
    'div',
    { class: 'dropzone' },
    h('p', { style: 'font-size:2.5rem;margin:0' }, '📄'),
    h('p', null, t('import_drop')),
    h('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        const [f] = await pickFile('application/pdf,.pdf');
        if (f) void start(f);
      },
    }, t('import_choose')),
  );
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type === 'application/pdf' || x.name.toLowerCase().endsWith('.pdf'));
    if (f) void start(f);
  });
  box.append(drop);

  async function start(file: File, forceOcr = false) {
    clear(box);
    const status = h('p', null, t('loading'));
    const bar = h('span', { style: 'width:0%' });
    box.append(status, h('div', { class: 'progress' }, bar));
    try {
      const { importPdf } = await import('../pdf/extract');
      const res = await importPdf(file, (kind, p, n, extra) => {
        status.textContent = kind === 'read' ? t('import_reading', { p, n }) : kind === 'ocr' ? t('import_ocr', { p, n }) : t('import_ocr_lang', { l: extra ?? '' });
        bar.style.width = `${n ? Math.round((p / n) * 100) : 0}%`;
      }, forceOcr);
      clear(box);
      review(box, file, res, () => void start(file, true));
    } catch (e) {
      console.error(e);
      clear(box);
      box.append(h('p', { class: 'banner' }, t('import_failed'), ' ', String((e as Error).message ?? '')), drop);
    }
  }
}

function review(box: HTMLElement, file: File, res: Imported, rerunOcr: () => void) {
  const lines: SrcLine[] = res.lines.map((l) => ({ ...l }));
  const name = h('input', { type: 'text', value: res.name });
  const hook = h('input', { type: 'number', step: '0.25', value: res.hookMm ? String(res.hookMm) : '' });
  const yarn = h('input', { type: 'text', value: res.yarn ?? '' });
  const pagesEl = h('div', { class: 'pages', 'aria-label': 'PDF' });
  const pageBoxes = res.pages.map((pv, i) => {
    const el = h('div', { class: 'page-img', dataset: { page: String(i + 1) } });
    pv.canvas.setAttribute('aria-label', t('import_page', { n: i + 1 }));
    el.append(pv.canvas);
    pagesEl.append(el);
    return el;
  });
  const hl = h('div', { class: 'page-hl', hidden: true });
  const list = h('div', { class: 'rlines' });
  const flagInfo = h('span', { class: 'small muted' });
  let flagged = new Set<number>();
  let cursor = -1;

  const highlight = (i: number) => {
    const l = lines[i];
    if (!l?.box) {
      hl.hidden = true;
      return;
    }
    const pageEl = pageBoxes[l.page - 1];
    if (!pageEl) return;
    pageEl.append(hl);
    hl.hidden = false;
    const [x0, y0, x1, y1] = l.box;
    Object.assign(hl.style, { left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` });
    const top = pageEl.offsetTop + pageEl.offsetHeight * y0 - pagesEl.clientHeight / 3;
    pagesEl.scrollTo({ top, behavior: 'smooth' });
  };

  const recheck = () => {
    const parsedRes = parsePattern(lines.map((l) => l.text).join('\n'));
    flagged = new Set();
    for (const [li, rs] of parsedRes.byLine) if (rs.some((r) => r.mismatch || r.consumeMismatch)) flagged.add(li);
    list.querySelectorAll<HTMLElement>('.rline').forEach((el, i) => {
      el.classList.toggle('flag', flagged.has(i));
      const rs = parsedRes.byLine.get(i);
      const cnt = el.querySelector('.cnt')!;
      cnt.textContent = rs?.length ? (rs[0].count !== undefined ? `${rs[0].count}${rs[0].stated !== undefined && rs[0].mismatch ? `≠${rs[0].stated}` : ''}` : '?') : '';
    });
    flagInfo.textContent = flagged.size ? t('mismatch_count', { n: flagged.size }) : '✓';
  };
  const recheckSoon = debounce(recheck, 300);

  lines.forEach((l, i) => {
    const input = h('input', { type: 'text', value: l.text, 'aria-label': `${t('import_page', { n: l.page })} — ${i + 1}` });
    input.addEventListener('input', () => {
      lines[i].text = input.value;
      recheckSoon();
    });
    input.addEventListener('focus', () => {
      cursor = i;
      highlight(i);
    });
    list.append(h('div', { class: 'rline' }, input, h('span', { class: 'cnt muted' })));
  });

  const nextToCheck = () => {
    const order = [...flagged].sort((a, b) => a - b);
    const next = order.find((i) => i > cursor) ?? order[0];
    if (next === undefined) {
      toast(t('import_none_left'));
      return;
    }
    const input = list.children[next]?.querySelector('input') as HTMLInputElement | undefined;
    input?.focus();
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  // Photos found in the PDF.
  const chosen = new Set(res.images.map((_, i) => i));
  let cover = res.images.length ? 0 : -1;
  const photos = h(
    'div',
    { class: 'photo-pick' },
    ...res.images.map((im, i) =>
      h(
        'label',
        null,
        h('img', { src: im.url, alt: '' }),
        h('input', { type: 'checkbox', checked: true, 'aria-label': t('import_keep_photo'), onchange: (e: Event) => ((e.target as HTMLInputElement).checked ? chosen.add(i) : chosen.delete(i)) }),
        h('span', { class: 'small', style: 'display:flex;gap:.3rem;padding:.2rem .3rem' },
          h('input', { type: 'radio', name: 'cover', checked: i === 0, 'aria-label': t('import_cover'), onchange: () => (cover = i), style: 'position:static' }),
          t('import_cover')),
      ),
    ),
  );

  const finish = async () => {
    if (!name.value.trim()) {
      toast(t('name_required'));
      return;
    }
    const photoIds: string[] = [];
    let coverId: string | undefined;
    for (const [i, im] of res.images.entries()) {
      if (!chosen.has(i)) continue;
      const bid = await storePhoto(im.blob, `${name.value}-${i + 1}.jpg`);
      photoIds.push(bid);
      if (i === cover) coverId = bid;
    }
    const pdfId = await store.putBlob(file, file.name);
    const hk = parseFloat(hook.value.replace(',', '.'));
    const p = store.newPattern({
      name: name.value.trim(),
      text: lines.map((l) => l.text).join('\n').replace(/\n{3,}/g, '\n\n'),
      hookMm: hk > 0 ? hk : undefined,
      yarn: yarn.value.trim() || undefined,
      photos: photoIds,
      coverId: coverId ?? photoIds[0],
      attachment: { blobId: pdfId, name: file.name, type: 'application/pdf' },
      source: 'pdf',
    });
    await store.save(p);
    location.hash = `#/patron/${p.id}`;
  };

  const field = (label: string, el: HTMLElement) => h('label', { class: 'field' }, label, el);
  append(box, [
    res.scanned ? h('p', { class: 'banner' }, '🔎 ', t('import_scanned'), ' ', langName(res.lang)) : null,
    h('div', { class: 'fields' }, field(t('field_name'), name), field(t('field_hook'), hook), field(t('field_yarn'), yarn)),
    res.images.length ? h('details', { open: true, style: 'margin-bottom:1rem' }, h('summary', null, t('import_photos', { n: res.images.length })), photos) : null,
    h('div', { class: 'row', style: 'margin-bottom:.75rem' },
      h('h2', { style: 'margin:0' }, t('import_review')),
      flagInfo,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: nextToCheck }, '⚠ ', t('import_next_check')),
      !res.scanned ? h('button', { class: 'btn', title: t('import_ocr_help'), onclick: rerunOcr }, '🔎 ', t('import_ocr_button')) : null,
      h('button', { class: 'btn btn-primary', onclick: () => void finish() }, t('import_continue'), ' →')),
    h('p', { class: 'small muted' }, t('import_review_help'), res.garbled && !res.scanned ? ` ${t('import_ocr_help')}` : ''),
    h('div', { class: 'review' }, pagesEl, list),
  ]);
  recheck();
}
