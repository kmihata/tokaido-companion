/**
 * Minimal IndexedDB wrapper.
 *
 * Hand-written rather than pulled from a package, for two reasons: the surface
 * needed here is four functions, and anything holding Kevin's private field
 * data should be code that a person can read end to end in two minutes.
 *
 * Stores:
 *   captures  — field notes, keyed by id, indexed by createdAt
 *   kv        — settings, imported private-data document, sync metadata
 */

const DB_NAME = 'tokaido-field-companion';
const DB_VERSION = 1;

export const STORE_CAPTURES = 'captures';
export const STORE_KV = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser context.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CAPTURES)) {
        const store = db.createObjectStore(STORE_CAPTURES, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('dayId', 'dayId');
      }
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB.'));
    req.onblocked = () => reject(new Error('IndexedDB open was blocked by another tab.'));
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const req = fn(transaction.objectStore(storeName));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
      }),
  );
}

export function kvGet<T>(key: string): Promise<T | undefined> {
  return tx<T | undefined>(STORE_KV, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

export function kvSet<T>(key: string, value: T): Promise<IDBValidKey> {
  return tx<IDBValidKey>(STORE_KV, 'readwrite', (s) => s.put(value, key));
}

export function kvDelete(key: string): Promise<undefined> {
  return tx<undefined>(STORE_KV, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>);
}

export function putRecord<T>(storeName: string, value: T): Promise<IDBValidKey> {
  return tx<IDBValidKey>(storeName, 'readwrite', (s) => s.put(value));
}

export function getAll<T>(storeName: string): Promise<T[]> {
  return tx<T[]>(storeName, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

export function deleteRecord(storeName: string, key: IDBValidKey): Promise<undefined> {
  return tx<undefined>(storeName, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>);
}

export function clearStore(storeName: string): Promise<undefined> {
  return tx<undefined>(storeName, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
}

/** Storage quota, where the browser reports it. Safari's numbers are indicative at best. */
export async function storageEstimate(): Promise<{ usage: number | null; quota: number | null; persisted: boolean | null }> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { usage: null, quota: null, persisted: null };
  }
  let usage: number | null = null;
  let quota: number | null = null;
  let persisted: boolean | null = null;
  try {
    if (navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      usage = est.usage ?? null;
      quota = est.quota ?? null;
    }
  } catch {
    /* estimate is best-effort */
  }
  try {
    if (navigator.storage.persisted) persisted = await navigator.storage.persisted();
  } catch {
    /* persisted() is not implemented everywhere */
  }
  return { usage, quota, persisted };
}

/**
 * Ask the browser to mark this origin's storage as persistent.
 *
 * Safari on iOS may ignore this, and even a "granted" answer is not a promise
 * that data survives. Treat a true result as "slightly less likely to be
 * evicted", never as a backup. See OFFLINE-AND-RECOVERY.md.
 */
export async function requestPersistence(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  try {
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
