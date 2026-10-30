import type { WorkbookSnapshot } from "../model/types.js";

const IDB_NAME = "tabular-workbook";
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

/** Coalesce rapid saves (e.g. selection moves) into one write after idle; flush before tab close. */
export function debouncePersistence(port: PersistencePort, delayMs = 500): PersistencePort & { flush(): Promise<void> } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  let latest: WorkbookSnapshot | null = null;

  const runFlush = async (): Promise<void> => {
    if (!latest) return;
    const snapshot = latest;
    latest = null;
    if (inflight) {
      await inflight;
      if (latest) return runFlush();
      return;
    }
    inflight = port.save(snapshot).finally(() => {
      inflight = null;
    });
    await inflight;
    if (latest) return runFlush();
  };

  return {
    load: () => port.load(),
    clear: async () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      latest = null;
      if (inflight) await inflight;
      await port.clear();
    },
    save(snapshot: WorkbookSnapshot) {
      latest = structuredClone(snapshot);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void runFlush();
      }, delayMs);
    },
    flush: async () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      await runFlush();
    },
  };
}

export class IndexedDbPersistence implements PersistencePort {
  constructor(private readonly key = "workbook") {}

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
