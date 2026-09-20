import type { WorkbookSnapshot } from "../model/types.js";

const IDB_NAME = "budgettool-workbook";
const IDB_VERSION = 2;
const IDB_STORE = "snapshots";

export interface PersistencePort {
  load(): Promise<WorkbookSnapshot | null>;
  save(snapshot: WorkbookSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryPersistence implements PersistencePort {
  constructor(private data: WorkbookSnapshot | null = null) {}

  async load(): Promise<WorkbookSnapshot | null> {
    return this.data ? structuredClone(this.data) : null;
  }

  async save(snapshot: WorkbookSnapshot): Promise<void> {
    this.data = structuredClone(snapshot);
  }

  async clear(): Promise<void> {
    this.data = null;
  }
}

export class IndexedDbPersistence implements PersistencePort {
  constructor(private readonly key = "playground") {}

  async load(): Promise<WorkbookSnapshot | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(this.key);
      req.onsuccess = () => resolve((req.result as WorkbookSnapshot | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(snapshot: WorkbookSnapshot): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const req = tx.objectStore(IDB_STORE).put(snapshot, this.key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const req = tx.objectStore(IDB_STORE).delete(this.key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
