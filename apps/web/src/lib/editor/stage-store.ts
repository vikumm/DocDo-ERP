// IndexedDB staging layer — raw uploads and converted NIfTI blobs live here,
// never only in memory. Keyed by session + name.

const DB_NAME = "docdo-editor";
const DB_VERSION = 1;
const STORE = "files";

export type StagedKey = { session: string; name: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: ["session", "name"] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        // Resolve only after the transaction commits: callers (e.g. the convert
        // worker) act on resolution, and terminating the worker before commit
        // would abort the write.
        let result: T | undefined;
        req.onsuccess = () => (result = req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => {
          db.close();
          resolve(result as T);
        };
        t.onabort = () => reject(t.error);
      })
  );
}

export type StagedRecord = StagedKey & { blob: Blob; kind: string; createdAt: number };

export function putFile(session: string, name: string, blob: Blob, kind = "raw") {
  const record: StagedRecord = { session, name, blob, kind, createdAt: Date.now() };
  return tx("readwrite", (s) => s.put(record));
}

export function getFile(session: string, name: string): Promise<StagedRecord | undefined> {
  return tx("readonly", (s) => s.get([session, name]) as IDBRequest<StagedRecord | undefined>);
}

export function listFiles(session: string): Promise<StagedRecord[]> {
  return tx("readonly", (s) => s.getAll(IDBKeyRange.bound([session], [session, []])) as IDBRequest<StagedRecord[]>);
}

export function deleteSession(session: string) {
  return tx("readwrite", (s) => s.delete(IDBKeyRange.bound([session], [session, []])));
}

export async function estimateUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}
