// Pattern page: header, tabs and the tab bodies (each in views/tabs/).

import { h, clear, dialog, toast, download, fmtDuration } from '../core/dom';
import { t, type Key } from '../core/i18n';
import type { Pattern } from '../core/types';
import { parsed, progress, totalSeconds, lastDaysSeconds } from '../core/progress';
import * as store from '../store/store';
import { deletePattern, duplicateDialog } from './library';
import { fileName, patternFile, shareUrl, toMarkdown } from '../features/share';
import { startTimer, stopTimer } from '../features/actions';
import type { Cleanup } from '../main';

export type Tab = (root: HTMLElement, p: Pattern) => Cleanup | Promise<Cleanup>;

const TABS: { id: string; key: Key; load: () => Promise<Tab> }[] = [
  { id: 'instructions', key: 'tab_instructions', load: async () => (await import('./tabs/instructions')).instructionsTab },
  { id: 'compteur', key: 'tab_counter', load: async () => (await import('./tabs/counter')).counterTab },
  { id: 'rangs', key: 'tab_rounds', load: async () => (await import('./tabs/rounds')).roundsTab },
  { id: '3d', key: 'tab_3d', load: async () => (await import('./tabs/preview3d')).preview3dTab },
  { id: 'fil', key: 'tab_yarn', load: async () => (await import('./tabs/yarn')).yarnTab },
  { id: 'photos', key: 'tab_photos', load: async () => (await import('./tabs/photos')).photosTab },
  { id: 'notes', key: 'tab_notes', load: async () => (await import('./tabs/notes')).notesTab },
  { id: 'modifier', key: 'tab_edit', load: async () => (await import('./editor')).editTab },
];

export async function patternView(root: HTMLElement, [id, tabId]: string[]) {
  const p0 = store.getPattern(id);
  if (!p0) {
    root.append(h('p', { class: 'empty' }, t('not_found')), h('p', { style: 'text-align:center' }, h('a', { class: 'btn', href: '#/' }, t('back'))));
    return;
  }
  const tab = TABS.find((x) => x.id === tabId) ?? TABS[0];
  const head = h('div');
  const body = h('div');
  root.append(head, body);

  const renderHead = () => {
    const p = store.getPattern(id);
    if (!p) return;
    clear(head);
    const res = parsed(p);
    const pr = progress(p);
    const sizeSel =
      res.sizes > 1
        ? h(
            'select',
            {
              'aria-label': t('size'),
              onchange: (e: Event) => void store.update(id, (q) => (q.sizeIndex = Number((e.target as HTMLSelectElement).value))),
            },
            ...Array.from({ length: res.sizes }, (_, i) => h('option', { value: String(i), selected: p.sizeIndex === i }, t('size_n', { n: i + 1 }))),
          )
        : null;
    head.append(
      h(
        'div',
        { class: 'p-head' },
        h(
          'div',
          { style: 'flex:1;min-width:0' },
          h('h1', null, p.name || t('untitled')),
          h(
            'div',
            { class: 'p-meta' },
            p.hookMm || res.hookMm ? h('span', { class: 'badge' }, `🪝 ${p.hookMm ?? res.hookMm} mm`) : null,
            p.yarn ? h('span', { class: 'badge' }, `🧶 ${p.yarn}`) : null,
            pr.total ? h('span', { class: `badge ${pr.status === 'done' ? 'ok' : 'accent'}` }, t('rounds_progress', { done: pr.done, total: pr.total })) : null,
            ...p.tags.map((tg) => h('span', { class: 'badge' }, tg)),
          ),
        ),
        h(
          'div',
          { class: 'row no-print' },
          sizeSel,
          h('button', { class: 'btn', onclick: () => void shareDialog(p) }, '🔗 ', t('share')),
          h('a', { class: 'btn', href: `#/patron/${id}/imprimer` }, '🖨 ', t('tab_print')),
          h('button', { class: 'icon-btn', title: t('duplicate'), 'aria-label': t('duplicate'), onclick: () => duplicateDialog(p) }, '⧉'),
          h('button', {
            class: 'icon-btn',
            title: t('delete'),
            'aria-label': t('delete'),
            onclick: () => {
              location.hash = '#/';
              void deletePattern(p);
            },
          }, '🗑'),
        ),
      ),
      h(
        'nav',
        { class: 'ptabs no-print', 'aria-label': p.name },
        ...TABS.map((x) => h('a', { href: `#/patron/${id}/${x.id}`, 'aria-current': x.id === tab.id ? 'page' : undefined }, t(x.key))),
      ),
    );
  };
  renderHead();
  const offHead = store.subscribe((ids) => {
    if (ids.includes(id)) {
      if (!store.getPattern(id)) location.hash = '#/';
      else renderHead();
    }
  });
  const view = await tab.load();
  const inner = await view(body, store.getPattern(id)!);
  return () => {
    offHead();
    if (typeof inner === 'function') inner();
  };
}

async function shareDialog(p: Pattern) {
  const link = await shareUrl(p, 'partage');
  const printLink = await shareUrl(p, 'imprimer');
  const linkBox = (url: string, help: string) => {
    const input = h('input', { type: 'text', value: url, readonly: true, style: 'flex:1;min-width:0', onfocus: (e: Event) => (e.target as HTMLInputElement).select() });
    return h(
      'div',
      { class: 'stack', style: 'margin-bottom:1rem' },
      h('p', { class: 'small muted', style: 'margin:0' }, help),
      h(
        'div',
        { class: 'row', style: 'flex-wrap:nowrap' },
        input,
        h('button', {
          class: 'btn',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(url);
            } catch {
              input.select();
              document.execCommand('copy');
            }
            toast(t('copied'));
          },
        }, t('copy')),
      ),
      url.length > 8000 ? h('p', { class: 'small', style: 'color:var(--warn);margin:0' }, t('link_too_long', { n: url.length })) : null,
    );
  };
  const canShare = typeof navigator.share === 'function';
  dialog(
    t('share'),
    h(
      'div',
      null,
      h('h3', null, t('share_link')),
      linkBox(link, t('share_help')),
      canShare ? h('button', { class: 'btn btn-small', style: 'margin:-0.5rem 0 1rem', onclick: () => void navigator.share({ title: p.name, url: link }).catch(() => {}) }, '📤 ', t('share')) : null,
      h('h3', null, t('share_print_link')),
      linkBox(printLink, t('share_print_help')),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => download(patternFile(p), fileName(p, '.crochet.json')) }, '⬇ ', t('share_file')),
        h('button', {
          class: 'btn',
          onclick: () =>
            download(
              new Blob([toMarkdown(p, { hook: t('hook'), yarn: t('yarn'), tags: t('tags'), steps: t('checklist'), notes: t('round_notes') })], { type: 'text/markdown' }),
              fileName(p, '.md'),
            ),
        }, '⬇ ', t('share_markdown')),
      ),
    ),
  );
}

/** Timer widget: start/stop, total and last 7 days. */
export function timerBox(id: string): { el: HTMLElement; stop: () => void } {
  const el = h('div', { class: 'panel' });
  let iv: number | undefined;
  const render = () => {
    const p = store.getPattern(id);
    if (!p) return;
    clear(el);
    const running = !!p.timerStartedAt;
    el.append(
      h('div', { class: 'row' }, h('h3', { style: 'margin:0' }, '⏱ ', t('timer')), h('span', { class: 'spacer' }),
        h('button', { class: `btn btn-small ${running ? '' : 'btn-primary'}`, onclick: () => void (running ? stopTimer(id) : startTimer(id)) }, running ? `⏸ ${t('timer_stop')}` : `▶ ${t('timer_start')}`)),
      h('div', { class: 'row', style: 'margin-top:.5rem;gap:1.5rem' },
        h('div', null, h('div', { class: 'timer-v', dataset: { timer: 'total' } }, fmtDuration(totalSeconds(p))), h('div', { class: 'small muted' }, t('timer_total'))),
        h('div', null, h('div', { class: 'timer-v' }, fmtDuration(lastDaysSeconds(p, 7))), h('div', { class: 'small muted' }, t('timer_week'))),
      ),
    );
  };
  render();
  iv = window.setInterval(() => {
    if (store.getPattern(id)?.timerStartedAt) render();
  }, 1000);
  const off = store.subscribe((ids) => ids.includes(id) && render());
  return {
    el,
    stop: () => {
      window.clearInterval(iv);
      off();
    },
  };
}
