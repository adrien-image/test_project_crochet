import { h, clear, toast, dialog } from '../core/dom';
import { t } from '../core/i18n';
import type { Pattern } from '../core/types';
import { parsed, progress, type Status } from '../core/progress';
import { colorHex } from '../parser/colors';
import { swatchUrl } from '../render/swatch';
import * as store from '../store/store';

type Sort = 'modified' | 'added' | 'name' | 'progress';
const state: { q: string; status: Status | 'all'; tag: string; sort: Sort } = { q: '', status: 'all', tag: '', sort: 'modified' };

try {
  Object.assign(state, JSON.parse(sessionStorage.getItem('mc.lib') || '{}'));
} catch {
  /* ignore */
}

function remember() {
  try {
    sessionStorage.setItem('mc.lib', JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function patternColors(p: Pattern): string[] {
  const res = parsed(p);
  const cols: string[] = [];
  for (const pc of res.pieces) {
    const own = p.colors[pc.name.toLowerCase()];
    for (const c of own ? [own] : pc.colors.length ? pc.colors : pc.color ? [pc.color] : []) if (!cols.includes(c)) cols.push(c);
  }
  if (!cols.length && p.yarn) {
    const c = colorHex(p.yarn);
    if (c) cols.push(c);
  }
  return cols.slice(0, 4);
}

function matches(p: Pattern, q: string): boolean {
  if (!q) return true;
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const needle = n(q);
  return [p.name, p.yarn ?? '', ...p.tags].some((x) => n(x).includes(needle));
}

export function libraryView(root: HTMLElement) {
  const search = h('input', {
    type: 'search',
    placeholder: t('search'),
    'aria-label': t('search'),
    value: state.q,
    oninput: () => {
      state.q = search.value;
      remember();
      renderGrid();
    },
  });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': t('filter_all') });
  const tagSel = h('select', {
    'aria-label': t('filter_tag'),
    onchange: () => {
      state.tag = tagSel.value;
      remember();
      renderGrid();
    },
  });
  const sortSel = h(
    'select',
    {
      'aria-label': t('sort'),
      onchange: () => {
        state.sort = sortSel.value as Sort;
        remember();
        renderGrid();
      },
    },
    ...(['modified', 'added', 'name', 'progress'] as Sort[]).map((s) => h('option', { value: s, selected: state.sort === s }, t(`sort_${s}`))),
  );
  const grid = h('div', { class: 'grid' });
  const banner = h('div');

  root.append(
    h('div', { class: 'lib-head' }, h('h1', null, t('nav_library')), h('span', { class: 'spacer' }), h('a', { class: 'btn', href: '#/importer' }, '📄 ', t('nav_import')), h('a', { class: 'btn btn-primary', href: '#/nouveau' }, '＋ ', t('nav_new'))),
    banner,
    h('div', { class: 'lib-tools' }, search, tagSel, sortSel),
    chips,
    h('div', { style: 'height:1rem' }),
    grid,
  );

  function renderChips() {
    clear(chips);
    for (const s of ['all', 'new', 'progress', 'done'] as const) {
      chips.append(
        h('button', {
          class: 'chip',
          'aria-pressed': String(state.status === s),
          onclick: () => {
            state.status = s;
            remember();
            renderChips();
            renderGrid();
          },
        }, t(s === 'all' ? 'filter_all' : `filter_${s}`)),
      );
    }
  }

  function renderTags() {
    const tags = [...new Set(store.list().flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b));
    clear(tagSel);
    tagSel.append(h('option', { value: '' }, t('all_tags')), ...tags.map((tg) => h('option', { value: tg, selected: state.tag === tg }, tg)));
    if (state.tag && !tags.includes(state.tag)) state.tag = '';
  }

  function renderGrid() {
    clear(grid);
    const all = store.list();
    let items = all.filter((p) => matches(p, state.q) && (!state.tag || p.tags.includes(state.tag)));
    if (state.status !== 'all') items = items.filter((p) => progress(p).status === state.status);
    const cmp: Record<Sort, (a: Pattern, b: Pattern) => number> = {
      modified: (a, b) => b.updatedAt - a.updatedAt,
      added: (a, b) => b.createdAt - a.createdAt,
      name: (a, b) => a.name.localeCompare(b.name),
      progress: (a, b) => progress(b).ratio - progress(a).ratio,
    };
    items.sort(cmp[state.sort]);
    if (!all.length) {
      grid.append(
        h(
          'div',
          { class: 'empty', style: 'grid-column:1/-1' },
          h('p', null, t('empty_library')),
          h('div', { class: 'row', style: 'justify-content:center' },
            h('a', { class: 'btn btn-primary', href: '#/nouveau' }, t('nav_new')),
            h('button', {
              class: 'btn',
              onclick: async () => {
                await store.seedExamples();
                store.notifyAll([]);
              },
            }, t('add_examples')),
          ),
        ),
      );
      return;
    }
    if (!items.length) {
      grid.append(h('p', { class: 'empty', style: 'grid-column:1/-1' }, t('empty_search')));
      return;
    }
    for (const p of items) grid.append(card(p));
  }

  renderChips();
  renderTags();
  renderGrid();
  const off = store.subscribe(() => {
    renderTags();
    renderGrid();
  });
  return off;
}

function card(p: Pattern): HTMLElement {
  const pr = progress(p);
  const cover = h('a', { class: 'cover', href: `#/patron/${p.id}`, tabindex: '-1', 'aria-hidden': 'true' });
  const img = h('img', { alt: '', loading: 'lazy', src: swatchUrl(patternColors(p)) });
  cover.append(img);
  if (p.coverId) void store.blobUrl(p.coverId, true).then((u) => u && (img.src = u));
  const statusBadge =
    pr.status === 'done'
      ? h('span', { class: 'badge ok' }, '✓ ', t('status_done'))
      : pr.status === 'progress'
        ? h('span', { class: 'badge accent' }, t('status_progress'))
        : h('span', { class: 'badge' }, t('status_new'));
  const menuWrap = h('div', { class: 'pcard-menu' });
  const menuBtn = h('button', { class: 'icon-btn', 'aria-label': t('card_menu'), title: t('card_menu'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, '⋯');
  menuWrap.append(menuBtn);
  let menu: HTMLElement | null = null;
  const closeMenu = () => {
    menu?.remove();
    menu = null;
    menuBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside, true);
  };
  const outside = (e: Event) => {
    if (!menuWrap.contains(e.target as Node)) closeMenu();
  };
  menuBtn.addEventListener('click', () => {
    if (menu) return closeMenu();
    menu = h(
      'div',
      { class: 'menu', role: 'menu' },
      h('button', { role: 'menuitem', onclick: () => (closeMenu(), duplicateDialog(p)) }, '⧉ ', t('duplicate')),
      h('button', { role: 'menuitem', onclick: () => (closeMenu(), (location.hash = `#/patron/${p.id}/modifier`)) }, '✎ ', t('edit')),
      h('button', { role: 'menuitem', class: 'btn-danger', onclick: () => (closeMenu(), void deletePattern(p)) }, '🗑 ', t('delete')),
    );
    menuWrap.append(menu);
    menuBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', outside, true);
  });
  return h(
    'article',
    { class: 'card pcard', dataset: { id: p.id } },
    cover,
    menuWrap,
    h(
      'div',
      { class: 'pcard-body' },
      h('a', { class: 'pcard-title', href: `#/patron/${p.id}` }, p.name || t('untitled')),
      h('div', { class: 'row small muted' }, statusBadge, pr.total ? t('rounds_progress', { done: pr.done, total: pr.total }) : null),
      h('div', { class: 'pbar', role: 'progressbar', 'aria-valuenow': String(Math.round(pr.ratio * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { style: `width:${Math.round(pr.ratio * 100)}%` })),
      p.tags.length ? h('div', { class: 'row' }, ...p.tags.slice(0, 4).map((tg) => h('span', { class: 'badge' }, tg))) : null,
    ),
  );
}

export function duplicateDialog(p: Pattern) {
  const go = async (keep: boolean) => {
    d.close();
    const copy = await store.duplicate(p.id, keep, t('copy_suffix'));
    if (copy) location.hash = `#/patron/${copy.id}`;
  };
  const d = dialog(
    t('duplicate_title', { name: p.name }),
    h(
      'div',
      { class: 'stack' },
      h('button', { class: 'btn', style: 'width:100%', onclick: () => void go(false) }, '↺ ', t('duplicate_fresh')),
      h('button', { class: 'btn', style: 'width:100%', onclick: () => void go(true) }, '⧉ ', t('duplicate_keep')),
    ),
  );
}

export async function deletePattern(p: Pattern) {
  const n = await store.remove(p.id);
  const msg = n > 1 ? t('deleted_many', { n }) : t('deleted_one', { name: p.name });
  toast(msg, {
    label: n > 1 ? `${t('undo')} (${n})` : t('undo'),
    run: async () => {
      const k = await store.undoRemove();
      toast(t('restored', { n: k }));
    },
  }, 12000);
}
