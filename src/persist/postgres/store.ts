import type { SheetSnapshot, WorkbookSnapshot } from "../../model/types.js";
import { BASE_SCENARIO_ID, evaluateComputed } from "./compute.js";
import { hydrateWorkbook } from "./hydrate.js";
import { ensureSchema } from "./schema.js";
import type { SqlClient } from "./sqlClient.js";
import { overlaysByTable, sheetIdForTable, storedFromTable, type OverlayCells, type TableStored } from "./split.js";
import { createStoredViews, dropSheetSchemas } from "./views.js";

function jsonParam(value: unknown): string {
  return JSON.stringify(value);
}

function asJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

export class PostgresWorkbookStore {
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: SqlClient,
    private readonly workbookId: string,
  ) {}

  async ensure(): Promise<void> {
    await ensureSchema(this.db);
  }

  async load(): Promise<WorkbookSnapshot | null> {
    await this.ensure();
    const book = await this.db.query<{
      name: string;
      calendar: unknown;
      sheets: unknown;
      scenario_list: unknown;
      active_scenario_id: string | null;
    }>("SELECT name, calendar, sheets, scenario_list, active_scenario_id FROM workbooks WHERE id = $1", [
      this.workbookId,
    ]);
    const row = book.rows[0];
    if (!row) return null;

    const tables = await this.db.query<{
      table_id: string;
      name: string;
      stored: unknown;
    }>("SELECT table_id, name, stored FROM tables WHERE workbook_id = $1", [this.workbookId]);

    const overlays = await this.db.query<{
      table_id: string;
      scenario_id: string;
      cells: unknown;
    }>("SELECT table_id, scenario_id, cells FROM overlays WHERE workbook_id = $1", [this.workbookId]);

    return hydrateWorkbook({
      id: this.workbookId,
      name: row.name,
      calendar: asJson(row.calendar),
      sheets: asJson(row.sheets),
      scenarioList: asJson(row.scenario_list),
      activeScenarioId: row.active_scenario_id,
      tables: tables.rows.map((table) => ({
        tableId: table.table_id,
        name: table.name,
        stored: asJson<TableStored>(table.stored),
      })),
      overlays: overlays.rows.map((overlay) => ({
        tableId: overlay.table_id,
        scenarioId: overlay.scenario_id,
        cells: asJson<OverlayCells>(overlay.cells),
      })),
    });
  }

  async sql<T extends Record<string, unknown>>(query: string): Promise<{ rows: T[] }> {
    await this.ensure();
    return this.db.query<T>(query);
  }

  async save(snapshot: WorkbookSnapshot): Promise<void> {
    const run = this.writing.then(() => this.writeSnapshot(snapshot));
    this.writing = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async writeSnapshot(snapshot: WorkbookSnapshot): Promise<void> {
    await this.ensure();
    await this.dropWorkbookViews();
    await this.deleteWorkbookRows();

    await this.db.query(
      `INSERT INTO workbooks (id, name, calendar, sheets, scenario_list, active_scenario_id)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)`,
      [
        this.workbookId,
        snapshot.name,
        jsonParam(snapshot.calendar),
        jsonParam(snapshot.sheets),
        jsonParam(snapshot.scenarios.map(({ id, name }) => ({ id, name }))),
        snapshot.activeScenarioId,
      ],
    );

    const overlays = overlaysByTable(snapshot);
    for (const table of snapshot.tables) {
      await this.db.query(
        `INSERT INTO tables (workbook_id, table_id, sheet_id, name, stored)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [this.workbookId, table.id, sheetIdForTable(snapshot, table.id), table.name, jsonParam(storedFromTable(table))],
      );
      const byScenario = overlays.get(table.id);
      if (!byScenario) continue;
      for (const [scenarioId, cells] of byScenario) {
        await this.db.query(
          `INSERT INTO overlays (workbook_id, table_id, scenario_id, cells)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [this.workbookId, table.id, scenarioId, jsonParam(cells)],
        );
      }
    }
    const computed = await evaluateComputed(snapshot);
    for (const table of snapshot.tables) {
      await this.db.query(
        `INSERT INTO computed (workbook_id, table_id, scenario_id, cells) VALUES ($1, $2, $3, $4::jsonb)`,
        [this.workbookId, table.id, BASE_SCENARIO_ID, jsonParam(computed.base[table.id] ?? {})],
      );
      for (const scenario of snapshot.scenarios) {
        await this.db.query(
          `INSERT INTO computed (workbook_id, table_id, scenario_id, cells) VALUES ($1, $2, $3, $4::jsonb)`,
          [this.workbookId, table.id, scenario.id, jsonParam(computed.scenarios[scenario.id]?.[table.id] ?? {})],
        );
      }
    }
    await createStoredViews(this.db, this.workbookId, snapshot);
  }

  async clear(): Promise<void> {
    await this.ensure();
    await this.dropWorkbookViews();
    await this.deleteWorkbookRows();
  }

  private async dropWorkbookViews(): Promise<void> {
    const existing = await this.db.query<{ sheets: unknown }>(
      "SELECT sheets FROM workbooks WHERE id = $1",
      [this.workbookId],
    );
    const sheets = existing.rows[0] ? asJson<SheetSnapshot[]>(existing.rows[0].sheets) : [];
    await dropSheetSchemas(
      this.db,
      sheets.map((sheet) => sheet.name),
    );
  }

  private async deleteWorkbookRows(): Promise<void> {
    await this.db.query("DELETE FROM workbooks WHERE id = $1", [this.workbookId]);
  }
}
