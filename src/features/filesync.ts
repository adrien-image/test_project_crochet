// Optional sync with a file the user picks (File System Access API, Chrome /
// Edge). A file in a Google Drive, Dropbox or iCloud folder carries the
// library to another computer. Merging is three-way: the ids and dates seen
// at the last sync tell a deletion apart from a new pattern.

import * as store from '../store/store';
import { importBackup, isBackup, makeBackup, type Backup } from './backup';
import { debounce } from '../core/dom';

interface Handle extends FileSystemFileHandle {
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
}

type W = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<Handle>;
  showOpenFilePicker?: (o: unknown) => Promise<Handle[]>;
};

export type SyncState = { status: 'off' } | { status: 'needs-permission'; name: string } | { status: 'on'; name: string; last?: number } | { status: 'error'; name: string; error: string };

let handle: Handle | null = null;
let state: SyncState = { status: 'off' };
const listeners = new Set<(s: SyncState) => void>();
let writing = false;
let suppress = false;

export function supported(): boolean {
  return typeof (window as W).showSaveFilePicker === 'function';
}

export function getState(): SyncState {
  return state;
}

export function onState(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(s: SyncState) {
  state = s;
  for (const l of listeners) l(s);
}

const PICKER = { types: [{ description: 'Mon Crochet', accept: { 'application/json': ['.json'] } }] };

export async function init(): Promise<void> {
  if (!supported()) return;
  const h = await store.getMeta<Handle>('syncHandle');
  if (!h) return;
  handle = h;
  const perm = await h.queryPermission?.({ mode: 'readwrite' });
  if (perm === 'granted') await syncNow();
  else setState({ status: 'needs-permission', name: h.name });
  store.onAnyChange(() => {
    if (!suppress) scheduleWrite();
  });
  window.addEventListener('focus', () => {
    if (state.status === 'on') void syncNow();
  });
}

export async function reconnect(): Promise<void> {
  if (!handle) return;
  const perm = await handle.requestPermission?.({ mode: 'readwrite' });
  if (perm === 'granted') await syncNow();
}

export async function createFile(): Promise<void> {
  const h = await (window as W).showSaveFilePicker!({ ...PICKER, suggestedName: 'mon-crochet-sync.json' });
  await attach(h);
}

export async function openFile(): Promise<void> {
  const [h] = await (window as W).showOpenFilePicker!(PICKER);
  await attach(h);
}

async function attach(h: Handle) {
  const first = !handle;
  handle = h;
  await store.setMeta('syncHandle', h);
  await store.setMeta('syncBase', {});
  if (first)
    store.onAnyChange(() => {
      if (!suppress) scheduleWrite();
    });
  await syncNow();
}

export async function stop(): Promise<void> {
  handle = null;
  await store.setMeta('syncHandle', undefined);
  setState({ status: 'off' });
}

const scheduleWrite = debounce(() => void syncNow(), 2500);

export async function syncNow(): Promise<number> {
  if (!handle || writing) return 0;
  writing = true;
  try {
    const file = await handle.getFile();
    const text = await file.text();
    let remote: Backup | null = null;
    if (text.trim()) {
      const o = JSON.parse(text);
      if (isBackup(o)) remote = o;
    }
    const base = (await store.getMeta<Record<string, number>>('syncBase')) ?? {};
    let changed = 0;
    if (remote) {
      suppress = true;
      try {
        changed = await merge(remote, base);
      } finally {
        suppress = false;
      }
    }
    const snapshot = await makeBackup('sync');
    const w = await handle.createWritable();
    await w.write(JSON.stringify(snapshot));
    await w.close();
    await store.setMeta('syncBase', Object.fromEntries(snapshot.patterns.map((p) => [p.id, p.updatedAt])));
    setState({ status: 'on', name: handle.name, last: Date.now() });
    return changed;
  } catch (e) {
    setState({ status: 'error', name: handle.name, error: (e as Error).message });
    return 0;
  } finally {
    writing = false;
  }
}

/** Three-way merge of the file into the local library. */
export async function merge(remote: Backup, base: Record<string, number>): Promise<number> {
  const remoteIds = new Set(remote.patterns.map((p) => p.id));
  let changed = 0;
  // Deleted on the other computer: present at last sync, gone from the file, unchanged here.
  for (const local of store.list()) {
    if (!remoteIds.has(local.id) && base[local.id] !== undefined && local.updatedAt <= base[local.id]) {
      await store.remove(local.id);
      changed++;
    }
  }
  // Deleted here: present at last sync, gone locally, unchanged in the file.
  const keep = remote.patterns.filter((p) => !(store.getPattern(p.id) === undefined && base[p.id] !== undefined && p.updatedAt <= base[p.id]));
  changed += await importBackup({ ...remote, patterns: keep });
  return changed;
}
