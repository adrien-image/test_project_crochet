// Full JSON backup (photos included) and the snapshot used by file sync.

import type { Pattern, StoredBlob } from '../core/types';
import * as store from '../store/store';
import * as db from '../store/db';

export interface BlobRecord {
  id: string;
  name?: string;
  type: string;
  data: string;
  thumb?: string;
  thumbType?: string;
}

export interface Backup {
  format: 'mon-crochet-backup';
  version: 1;
  exportedAt: number;
  patterns: Pattern[];
  blobs: BlobRecord[];
}

export async function blobToB64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function b64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type });
}

/** "full" keeps every file at full size; "sync" keeps cover and attachment full size and other photos as thumbnails. */
export async function makeBackup(mode: 'full' | 'sync' = 'full'): Promise<Backup> {
  const patterns = store.list();
  const blobs: BlobRecord[] = [];
  const seen = new Set<string>();
  for (const p of patterns) {
    const fullIds = new Set<string>([p.coverId, p.attachment?.blobId].filter((x): x is string => !!x));
    for (const id of store.patternBlobIds(p)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const b = await store.getBlob(id);
      if (!b) continue;
      const useThumb = mode === 'sync' && !fullIds.has(id) && b.thumb;
      const main = useThumb ? b.thumb! : b.blob;
      const rec: BlobRecord = { id, name: b.name, type: main.type || 'application/octet-stream', data: await blobToB64(main) };
      if (b.thumb && !useThumb) {
        rec.thumb = await blobToB64(b.thumb);
        rec.thumbType = b.thumb.type;
      }
      blobs.push(rec);
    }
  }
  return { format: 'mon-crochet-backup', version: 1, exportedAt: Date.now(), patterns, blobs };
}

export function isBackup(o: unknown): o is Backup {
  const b = o as Backup;
  return !!b && b.format === 'mon-crochet-backup' && Array.isArray(b.patterns) && Array.isArray(b.blobs);
}

function validPattern(p: unknown): p is Pattern {
  const x = p as Pattern;
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.text === 'string' && typeof x.updatedAt === 'number';
}

/** Imports patterns; the newer version of a pattern wins. Returns how many changed. */
export async function importBackup(b: Backup): Promise<number> {
  let n = 0;
  for (const rec of b.blobs) {
    if (typeof rec.id !== 'string' || typeof rec.data !== 'string') continue;
    const existing = await store.getBlob(rec.id);
    if (existing && existing.blob.size >= (rec.data.length * 3) / 4 - 4) continue;
    const blob: StoredBlob = {
      id: rec.id,
      name: rec.name,
      blob: b64ToBlob(rec.data, rec.type),
      thumb: rec.thumb ? b64ToBlob(rec.thumb, rec.thumbType || 'image/jpeg') : existing?.thumb,
      createdAt: Date.now(),
    };
    await db.put('blobs', blob);
  }
  const ids: string[] = [];
  for (const p of b.patterns) {
    if (!validPattern(p)) continue;
    const local = store.getPattern(p.id);
    if (local && local.updatedAt >= p.updatedAt) continue;
    await store.putRaw(p);
    ids.push(p.id);
    n++;
  }
  if (ids.length) store.notifyAll(ids);
  return n;
}
