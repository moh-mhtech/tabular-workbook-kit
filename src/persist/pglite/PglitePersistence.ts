import { PGlite } from "@electric-sql/pglite";
import type { WorkbookSnapshot } from "../../model/types.js";
import type { PersistencePort } from "../index.js";
import { PostgresWorkbookStore } from "../postgres/store.js";
import { pgliteClient } from "./pgliteClient.js";

export type PglitePersistenceOptions = {
  db?: PGlite;
  dataDir?: string;
  fsBundle?: Blob | File;
  pgliteWasmModule?: WebAssembly.Module;
  initdbWasmModule?: WebAssembly.Module;
};

export class PglitePersistence implements PersistencePort {
  private constructor(private readonly store: PostgresWorkbookStore) {}

  static async create(
    workbookId = "workbook",
    options: PglitePersistenceOptions = {},
  ): Promise<PglitePersistence> {
    const db =
      options.db ??
      (await PGlite.create({
        dataDir: options.dataDir,
        fsBundle: options.fsBundle,
        pgliteWasmModule: options.pgliteWasmModule,
        initdbWasmModule: options.initdbWasmModule,
      }));
    const store = new PostgresWorkbookStore(pgliteClient(db), workbookId);
    await store.ensure();
    return new PglitePersistence(store);
  }

  load(): Promise<WorkbookSnapshot | null> {
    return this.store.load();
  }

  save(snapshot: WorkbookSnapshot): Promise<void> {
    return this.store.save(snapshot);
  }

  clear(): Promise<void> {
    return this.store.clear();
  }

  sql<T extends Record<string, unknown>>(query: string): Promise<{ rows: T[] }> {
    return this.store.sql<T>(query);
  }
}

export async function createPglitePersistence(
  workbookId = "workbook",
  options: PglitePersistenceOptions = {},
): Promise<PglitePersistence> {
  return PglitePersistence.create(workbookId, options);
}
