// Minimal promise wrapper around IndexedDB.

const DB_NAME = 'mon-crochet';
const VERSION = 1;
export type StoreName = 'patterns' | 'blobs' | 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

/** In-memory stand-in when IndexedDB is unavailable (private windows, blocked storage). */
let memory: Map<StoreName, Map<IDBValidKey, unknown>> | null = null;
const mem = (store: StoreName) => {
  if (!memory) memory = new Map();
  if (!memory.has(store)) memory.set(store, new Map());
  return memory.get(store)!;
};
const keyOf = (store: StoreName, value: unknown, key?: IDBValidKey): IDBValidKey =>
  key ?? (store === 'meta' ? '' : (value as { id: string }).id);

export function isMemoryOnly(): boolean {
  return memory !== null;
}

async function db(): Promise<IDBDatabase | null> {
  if (memory) return null;
  try {
    return await openDb();
  } catch {
    mem('patterns');
    return null;
  }
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    // Some browsers never answer in private mode.
    const timer = setTimeout(() => reject(new Error('IndexedDB timeout')), 4000);
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('patterns')) db.createObjectStore('patterns', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
  });
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const d = await db();
  if (!d) return [...mem(store).values()] as T[];
  return done(d.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const d = await db();
  if (!d) return mem(store).get(key) as T | undefined;
  return done(d.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const d = await db();
  if (!d) {
    mem(store).set(keyOf(store, value, key), value);
    return;
  }
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  await txDone(tx);
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  const d = await db();
  if (!d) {
    mem(store).delete(key);
    return;
  }
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function clearStore(store: StoreName): Promise<void> {
  const d = await db();
  if (!d) {
    mem(store).clear();
    return;
  }
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await txDone(tx);
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
