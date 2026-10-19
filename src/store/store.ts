// Pattern and photo storage, with cross-tab sync over BroadcastChannel.

import type { Pattern, StoredBlob } from '../core/types';
import { EXAMPLES } from '../core/examples';
import * as db from './db';

type Listener = (ids: string[]) => void;

const listeners = new Set<Listener>();
let patterns = new Map<string, Pattern>();
let loaded = false;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mon-crochet') : null;

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function newPattern(partial: Partial<Pattern> = {}): Pattern {
  const now = Date.now();
  return {
    id: uid(),
    name: '',
    createdAt: now,
    updatedAt: now,
    text: '',
    lang: 'auto',
    tags: [],
    sizeIndex: 0,
    done: {},
    stitchCount: 0,
    roundNotes: {},
    roundPhotos: {},
    checklist: [],
    photos: [],
    timeLog: {},
    colors: {},
    placements: {},
    ...partial,
  };
}

/** Fills fields added in later versions. */
export function normalize(p: Partial<Pattern> & { id: string }): Pattern {
  return { ...newPattern(), ...p } as Pattern;
}

export async function load(): Promise<void> {
  const all = await db.getAll<Pattern>('patterns');
  patterns = new Map(all.map((p) => [p.id, normalize(p)]));
  if (!loaded && !(await db.get('meta', 'seeded'))) {
    await seedExamples();
    await db.put('meta', true, 'seeded');
  }
  loaded = true;
}

export async function seedExamples(): Promise<void> {
  const base = Date.now();
  for (const [i, ex] of EXAMPLES.entries()) {
    const p = newPattern({
      name: ex.name,
      text: ex.text,
      hookMm: ex.hookMm,
      yarn: ex.yarn,
      tags: ex.tags,
      checklist: ex.checklist.map((text) => ({ id: uid(), text, done: false })),
      source: 'example',
      exampleId: ex.id,
      createdAt: base - (i + 1) * 1000,
      updatedAt: base - (i + 1) * 1000,
    });
    patterns.set(p.id, p);
    await db.put('patterns', p);
  }
}

export function list(): Pattern[] {
  return [...patterns.values()];
}

export function getPattern(id: string): Pattern | undefined {
  return patterns.get(id);
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(ids: string[], broadcast = true) {
  for (const l of listeners) l(ids);
  if (broadcast) channel?.postMessage({ type: 'changed', ids });
}

channel?.addEventListener('message', async (e) => {
  if (e.data?.type !== 'changed') return;
  const ids: string[] = e.data.ids;
  for (const id of ids) {
    const p = await db.get<Pattern>('patterns', id);
    if (p) patterns.set(id, normalize(p));
    else patterns.delete(id);
  }
  emit(ids, false);
});

export async function save(p: Pattern, opts: { touch?: boolean; silent?: boolean } = {}): Promise<void> {
  if (opts.touch !== false) p.updatedAt = Date.now();
  patterns.set(p.id, p);
  await db.put('patterns', p);
  if (!opts.silent) emit([p.id]);
  else channel?.postMessage({ type: 'changed', ids: [p.id] });
  afterChange();
}

/** Applies a change to a pattern and saves it. */
export async function update(id: string, fn: (p: Pattern) => void, opts?: { touch?: boolean; silent?: boolean }): Promise<Pattern | undefined> {
  const p = patterns.get(id);
  if (!p) return undefined;
  fn(p);
  await save(p, opts);
  return p;
}

// ---- Undoable deletion ----

interface Trash {
  pattern: Pattern;
  blobs: StoredBlob[];
}
let trash: Trash[] = [];
let trashTimer: number | undefined;

export function patternBlobIds(p: Pattern): string[] {
  const ids = new Set<string>(p.photos);
  if (p.coverId) ids.add(p.coverId);
  if (p.attachment) ids.add(p.attachment.blobId);
  for (const v of Object.values(p.roundPhotos)) ids.add(v);
  return [...ids];
}

export async function remove(id: string): Promise<number> {
  const p = patterns.get(id);
  if (!p) return trash.length;
  const blobs: StoredBlob[] = [];
  for (const bid of patternBlobIds(p)) {
    const b = await db.get<StoredBlob>('blobs', bid);
    if (b) blobs.push(b);
  }
  trash.push({ pattern: p, blobs });
  patterns.delete(id);
  await db.del('patterns', id);
  emit([id]);
  window.clearTimeout(trashTimer);
  // Photos stay a while so the deletion can be undone, then go.
  trashTimer = window.setTimeout(() => void emptyTrash(), 15000);
  afterChange();
  return trash.length;
}

export async function undoRemove(): Promise<number> {
  window.clearTimeout(trashTimer);
  const items = trash;
  trash = [];
  for (const t of items) {
    patterns.set(t.pattern.id, t.pattern);
    await db.put('patterns', t.pattern);
  }
  emit(items.map((t) => t.pattern.id));
  afterChange();
  return items.length;
}

export function trashSize(): number {
  return trash.length;
}

async function emptyTrash() {
  const items = trash;
  trash = [];
  const used = new Set(list().flatMap(patternBlobIds));
  for (const t of items) for (const b of t.blobs) if (!used.has(b.id)) await db.del('blobs', b.id);
}

export async function duplicate(id: string, keepProgress: boolean, suffix: string): Promise<Pattern | undefined> {
  const src = patterns.get(id);
  if (!src) return undefined;
  const copy: Pattern = structuredClone(src);
  copy.id = uid();
  copy.name = `${src.name} ${suffix}`.trim();
  copy.createdAt = copy.updatedAt = Date.now();
  copy.source = src.source === 'example' ? 'typed' : src.source;
  delete copy.timerStartedAt;
  if (!keepProgress) {
    copy.done = {};
    copy.stitchCount = 0;
    copy.roundNotes = {};
    copy.roundPhotos = {};
    copy.timeLog = {};
    copy.checklist = copy.checklist.map((c) => ({ ...c, id: uid(), done: false }));
  }
  await save(copy);
  return copy;
}

// ---- Blobs ----

export async function putBlob(blob: Blob, name?: string, thumb?: Blob): Promise<string> {
  const id = uid();
  await db.put('blobs', { id, blob, thumb, name, createdAt: Date.now() } satisfies StoredBlob);
  return id;
}

export async function getBlob(id: string): Promise<StoredBlob | undefined> {
  return db.get<StoredBlob>('blobs', id);
}

export async function deleteBlob(id: string): Promise<void> {
  await db.del('blobs', id);
}

const urlCache = new Map<string, string>();
export async function blobUrl(id: string, thumb = false): Promise<string | undefined> {
  const key = id + (thumb ? ':t' : '');
  if (urlCache.has(key)) return urlCache.get(key);
  const b = await getBlob(id);
  if (!b) return undefined;
  const url = URL.createObjectURL(thumb && b.thumb ? b.thumb : b.blob);
  urlCache.set(key, url);
  return url;
}

// ---- Meta ----

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return db.get<T>('meta', key);
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.put('meta', value, key);
}

// ---- Change hooks (file sync) ----

const changeHooks = new Set<() => void>();
export function onAnyChange(fn: () => void) {
  changeHooks.add(fn);
}
function afterChange() {
  for (const f of changeHooks) f();
}

/** Replace a pattern wholesale (backup import / sync). */
export async function putRaw(p: Pattern): Promise<void> {
  const n = normalize(p);
  patterns.set(n.id, n);
  await db.put('patterns', n);
}

export function notifyAll(ids: string[]) {
  emit(ids);
}
