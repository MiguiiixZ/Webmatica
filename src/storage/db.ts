/**
 * Tiny IndexedDB wrapper. Every operation degrades gracefully: if IndexedDB is
 * unavailable (some private browsing modes) the app keeps working without
 * persistence.
 */

const DB_NAME = 'webmatica';
const DB_VERSION = 1;
export type StoreName = 'files' | 'projects' | 'settings' | 'packs';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['files', 'projects', 'settings', 'packs']) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const db = {
  available: async () => (await open()) !== null,
  get: <T>(store: StoreName, key: string) => run<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>),
  put: (store: StoreName, key: string, value: unknown) => run(store, 'readwrite', (s) => s.put(value, key)),
  delete: (store: StoreName, key: string) => run(store, 'readwrite', (s) => s.delete(key)),
  all: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>).then((v) => v ?? []),
};

/** Content hash used as the id of a schematic. */
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
      return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fall through
  }
  // FNV-1a fallback (non-secure contexts).
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
    h2 = Math.imul(h2 ^ bytes[i], 0x5bd1e995);
  }
  return `f${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
