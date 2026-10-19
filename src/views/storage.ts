// Storage dialog: persistence, space used, backup export/import, file sync.

import { h, dialog, download, pickFile, toast, clear } from '../core/dom';
import { t, fmtDate } from '../core/i18n';
import * as store from '../store/store';
import * as db from '../store/db';
import { importBackup, isBackup, makeBackup } from '../features/backup';
import * as filesync from '../features/filesync';
import { fromShared, readPatternFile } from '../features/share';

export async function requestPersistence(ask: boolean): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  // Browsers that grant silently do it on first call; ask=true comes from a click.
  if (!ask && (await store.getMeta('persistAsked'))) return false;
  await store.setMeta('persistAsked', true);
  return navigator.storage.persist();
}

export async function exportBackup() {
  const b = await makeBackup('full');
  const d = new Date();
  const name = `mon-crochet-sauvegarde-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  download(new Blob([JSON.stringify(b)], { type: 'application/json' }), name);
  await store.setMeta('lastExport', Date.now());
  toast(t('backup_done'));
}

export async function importBackupFile() {
  const [file] = await pickFile('.json,application/json');
  if (!file) return;
  try {
    const o = JSON.parse(await file.text());
    if (isBackup(o)) {
      const n = await importBackup(o);
      toast(t('backup_imported', { n }));
      return;
    }
    const sp = readPatternFile(JSON.stringify(o));
    const p = fromShared(sp, 'file');
    await store.save(p);
    toast(t('backup_imported', { n: 1 }));
    location.hash = `#/patron/${p.id}`;
  } catch {
    toast(t('backup_invalid'));
  }
}

const REMIND_AFTER = 30 * 24 * 3600 * 1000;

export async function maybeRemindBackup() {
  const own = store.list().filter((p) => p.source !== 'example' || Object.keys(p.done).length);
  if (!own.length || filesync.getState().status === 'on') return;
  const last = (await store.getMeta<number>('lastExport')) ?? 0;
  const snoozed = (await store.getMeta<number>('remindSnooze')) ?? 0;
  const firstUse = Math.min(...own.map((p) => p.createdAt));
  if (Date.now() - Math.max(last, snoozed, firstUse) < REMIND_AFTER) return;
  toast(t('backup_reminder'), { label: t('backup_now'), run: () => void exportBackup() }, 20000);
  await store.setMeta('remindSnooze', Date.now());
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} Ko`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} Mo`;
  return `${(n / 1024 ** 3).toFixed(1)} Go`;
}

export function openStorageDialog() {
  const body = h('div', { class: 'stack' });
  const d = dialog(t('storage_title'), body, { wide: false });
  const off = filesync.onState(() => void fill());
  d.el.addEventListener('close', off);

  async function fill() {
    clear(body);
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : undefined;
    const blobs = (await db.getAll('blobs')).length;
    const last = await store.getMeta<number>('lastExport');
    body.append(
      h(
        'section',
        null,
        h('p', null, h('span', { class: `badge ${persisted ? 'ok' : 'warn'}` }, persisted ? t('storage_persisted') : t('storage_not_persisted'))),
        !persisted
          ? h('button', {
              class: 'btn btn-small',
              onclick: async () => {
                await requestPersistence(true);
                void fill();
              },
            }, t('storage_request'))
          : null,
        est ? h('p', { class: 'muted small' }, t('storage_used', { used: fmtBytes(est.usage ?? 0), quota: fmtBytes(est.quota ?? 0) })) : null,
        h('p', { class: 'muted small' }, t('storage_counts', { p: store.list().length, b: blobs })),
      ),
      h(
        'section',
        null,
        h('h3', null, t('backup_export')),
        h('p', { class: 'muted small' }, last ? t('backup_last', { d: fmtDate(last) }) : t('backup_never')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn btn-primary', onclick: () => void exportBackup().then(fill) }, t('backup_export')),
          h('button', { class: 'btn', onclick: () => void importBackupFile() }, t('backup_import')),
        ),
      ),
      syncSection(),
    );
  }
  void fill();
}

function syncSection(): HTMLElement {
  const s = filesync.getState();
  const sec = h('section', null, h('h3', null, t('sync_title')));
  if (!filesync.supported()) {
    sec.append(h('p', { class: 'muted small' }, t('sync_unsupported')));
    return sec;
  }
  sec.append(h('p', { class: 'muted small' }, t('sync_help')));
  if (s.status === 'on') sec.append(h('p', null, h('span', { class: 'badge ok' }, t('sync_status_on', { name: s.name, d: s.last ? new Date(s.last).toLocaleTimeString() : '' }))));
  else if (s.status === 'error') sec.append(h('p', null, h('span', { class: 'badge bad' }, t('sync_error', { e: s.error }))));
  else if (s.status === 'off') sec.append(h('p', { class: 'muted small' }, t('sync_status_off')));
  const row = h('div', { class: 'row' });
  const run = (fn: () => Promise<unknown>) => () =>
    void fn().catch((e: Error) => {
      if (e.name !== 'AbortError') toast(t('sync_error', { e: e.message }));
    });
  if (s.status === 'needs-permission') row.append(h('button', { class: 'btn btn-primary', onclick: run(filesync.reconnect) }, t('sync_reconnect')));
  if (s.status === 'off') {
    row.append(
      h('button', { class: 'btn', onclick: run(filesync.createFile) }, t('sync_choose')),
      h('button', { class: 'btn', onclick: run(filesync.openFile) }, t('sync_open')),
    );
  } else row.append(h('button', { class: 'btn btn-danger', onclick: run(filesync.stop) }, t('sync_stop')));
  sec.append(row, h('p', { class: 'muted small' }, t('sync_note')));
  return sec;
}
