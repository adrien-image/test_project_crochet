import './styles/app.css';
import { h, clear, toast } from './core/dom';
import { setLang, t, type Key } from './core/i18n';
import type { UiLang } from './core/types';
import * as store from './store/store';
import * as filesync from './features/filesync';
import { openStorageDialog, maybeRemindBackup, requestPersistence } from './views/storage';

export type Cleanup = void | (() => void);
export type View = (root: HTMLElement, params: string[]) => Cleanup | Promise<Cleanup>;

const routes: [RegExp, () => Promise<View>][] = [
  [/^\/?$/, async () => (await import('./views/library')).libraryView],
  [/^\/stats$/, async () => (await import('./views/stats')).statsView],
  [/^\/nouveau$/, async () => (await import('./views/editor')).newPatternView],
  [/^\/importer$/, async () => (await import('./views/import')).importView],
  [/^\/patron\/([^/]+)\/imprimer$/, async () => (await import('./views/print')).printPatternView],
  [/^\/patron\/([^/]+)(?:\/([^/]+))?$/, async () => (await import('./views/pattern')).patternView],
  [/^\/partage\/([A-Za-z0-9_-]+)$/, async () => (await import('./views/shared')).sharedView],
  [/^\/imprimer\/([A-Za-z0-9_-]+)$/, async () => (await import('./views/print')).printSharedView],
];

let cleanup: Cleanup;
let renderSeq = 0;
const main = h('main', { id: 'main', tabindex: '-1' });

function navLink(href: string, key: Key, icon: string, match: (p: string) => boolean, path: string) {
  return h('a', { href, 'aria-current': match(path) ? 'page' : undefined }, h('span', { class: 'ti', 'aria-hidden': 'true' }, icon), h('span', null, t(key)));
}

function currentPath(): string {
  return decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
}

function renderShell() {
  const path = currentPath();
  const isLib = (p: string) => p === '/' || p.startsWith('/patron');
  const top = h(
    'header',
    { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-logo', 'aria-hidden': 'true' }, '🧶'), t('app_name')),
    h(
      'nav',
      { class: 'topnav', 'aria-label': 'Navigation' },
      h('a', { href: '#/', 'aria-current': isLib(path) ? 'page' : undefined }, t('nav_library')),
      h('a', { href: '#/stats', 'aria-current': path === '/stats' ? 'page' : undefined }, t('nav_stats')),
      h('a', { href: '#/nouveau', 'aria-current': path === '/nouveau' ? 'page' : undefined }, t('nav_new')),
      h('a', { href: '#/importer', 'aria-current': path === '/importer' ? 'page' : undefined }, t('nav_import')),
    ),
    h('span', { class: 'spacer' }),
    h('button', { class: 'icon-btn', title: t('nav_storage'), 'aria-label': t('nav_storage'), onclick: () => openStorageDialog() }, '💾'),
    h('button', { class: 'icon-btn', id: 'theme-btn', title: themeLabel(), 'aria-label': themeLabel(), onclick: cycleTheme }, themeIcon()),
    h('button', { class: 'btn btn-small btn-ghost', id: 'lang-btn', onclick: toggleLang, title: t('lang_toggle') }, t('lang_toggle')),
  );
  const bar = h(
    'nav',
    { class: 'tabbar', 'aria-label': 'Navigation' },
    navLink('#/', 'nav_library', '📚', isLib, path),
    navLink('#/stats', 'nav_stats', '📊', (p) => p === '/stats', path),
    navLink('#/nouveau', 'nav_new', '➕', (p) => p === '/nouveau', path),
    navLink('#/importer', 'nav_import_short', '📄', (p) => p === '/importer', path),
    h('button', { onclick: () => openStorageDialog() }, h('span', { class: 'ti', 'aria-hidden': 'true' }, '💾'), h('span', null, t('nav_storage'))),
  );
  const app = document.getElementById('app')!;
  clear(app);
  app.append(top, main, bar);
}

async function route() {
  const seq = ++renderSeq;
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  renderShell();
  const path = currentPath();
  for (const [re, load] of routes) {
    const m = path.match(re);
    if (!m) continue;
    const view = await load();
    if (seq !== renderSeq) return;
    clear(main);
    cleanup = await view(main, m.slice(1).map((x) => x ?? ''));
    return;
  }
  location.hash = '#/';
}

/** Re-renders the current view (after a language change). */
export function rerender() {
  void route();
}

// ---- Theme & language ----

type Theme = 'auto' | 'light' | 'dark';
let theme: Theme = 'auto';

function applyTheme() {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.textContent = themeIcon();
    btn.title = themeLabel();
    btn.setAttribute('aria-label', themeLabel());
  }
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#19171d' : '#fbf7f2');
}
function themeIcon() {
  return theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🌓';
}
function themeLabel() {
  return t(theme === 'light' ? 'theme_light' : theme === 'dark' ? 'theme_dark' : 'theme_auto');
}
function cycleTheme() {
  theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
  safeSet('theme', theme);
  applyTheme();
}
function toggleLang() {
  const next: UiLang = document.documentElement.lang === 'fr' ? 'en' : 'fr';
  setLang(next);
  safeSet('lang', next);
  rerender();
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem('mc.' + k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem('mc.' + k, v);
  } catch {
    /* private mode */
  }
}

async function boot() {
  const savedLang = safeGet('lang');
  setLang(savedLang === 'en' ? 'en' : 'fr');
  const savedTheme = safeGet('theme');
  theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'auto';
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  await store.load();
  window.addEventListener('hashchange', route);
  await route();
  void requestPersistence(false);
  void filesync.init();
  filesync.onState((s) => {
    if (s.status === 'needs-permission') toast(t('sync_reconnect'), { label: t('ok'), run: () => void filesync.reconnect() }, 15000);
  });
  setTimeout(() => void maybeRemindBackup(), 4000);
  registerSw();
}

function registerSw() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh() {
        toast(t('update_ready'), { label: t('update_now'), run: () => void update(true) }, 30000);
      },
      onOfflineReady() {
        toast(t('offline_ready'));
      },
    });
  });
}

void boot();
