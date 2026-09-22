import type { SheetSnapshot, WorkbookSnapshot } from "../../model/types.js";
import type { SqlClient } from "./sqlClient.js";
import type { TableStored } from "./split.js";

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function escapeLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function storedColumnIds(stored: TableStored): string[] {
  const ids = stored.attributeColumns.map((column) => column.id);
  const seen = new Set(ids);
  for (const year of stored.yearColumns ?? []) {
    for (let month = 1; month <= 12; month += 1) {
      const id = `${year.year}-${String(month).padStart(2, "0")}`;
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

function storedCellSql(columnId: string): string {
  const key = quoteIdent(columnId);
  const path = `'${columnId.replaceAll("'", "''")}'`;
  return `CASE WHEN r.cells->${path}->>'kind' = 'formula' THEN to_jsonb(r.cells->${path}->>'formula') ELSE r.cells->${path}->'value' END AS ${key}`;
}

export function sheetNameForTable(sheets: SheetSnapshot[], tableId: string): string | undefined {
  return sheets.find((sheet) => sheet.tableIds.includes(tableId))?.name;
}

export async function dropSheetSchemas(db: SqlClient, sheetNames: string[]): Promise<void> {
  for (const name of [...new Set(sheetNames)].filter(Boolean)) {
    await db.exec(`DROP SCHEMA IF EXISTS ${quoteIdent(name)} CASCADE`);
  }
}

export async function createStoredViews(
  db: SqlClient,
  workbookId: string,
  snapshot: WorkbookSnapshot,
): Promise<void> {
  for (const table of snapshot.tables) {
    const sheetName = sheetNameForTable(snapshot.sheets, table.id);
    if (!sheetName) continue;
    await db.exec(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(sheetName)}`);
    const columns = storedColumnIds({
      attributeColumns: table.attributeColumns,
      yearColumns: table.yearColumns,
      rows: table.rows,
    });
    const select = ["r.id AS row_id", "r.key AS row_key", ...columns.map((id) => storedCellSql(id))].join(",\n      ");
    await db.exec(`
      CREATE VIEW ${quoteIdent(sheetName)}.${quoteIdent(table.name)} AS
      SELECT
        ${select}
      FROM tables AS t
      CROSS JOIN LATERAL jsonb_to_recordset(t.stored->'rows') AS r(id text, key text, cells jsonb)
      WHERE t.workbook_id = ${escapeLiteral(workbookId)} AND t.table_id = ${escapeLiteral(table.id)}
    `);
    const computedSelect = [
      "r.id AS row_id",
      "r.key AS row_key",
      ...columns.map((id) => {
        const path = `'${id.replaceAll("'", "''")}'`;
        return `c.cells->r.id->${path} AS ${quoteIdent(id)}`;
      }),
    ].join(",\n      ");
    await db.exec(`
      CREATE VIEW ${quoteIdent(sheetName)}.${quoteIdent(`${table.name}.c`)} AS
      SELECT
        ${computedSelect}
      FROM tables AS t
      JOIN computed AS c
        ON c.workbook_id = t.workbook_id AND c.table_id = t.table_id AND c.scenario_id = ''
      CROSS JOIN LATERAL jsonb_to_recordset(t.stored->'rows') AS r(id text, key text, cells jsonb)
      WHERE t.workbook_id = ${escapeLiteral(workbookId)} AND t.table_id = ${escapeLiteral(table.id)}
    `);

    for (const scenario of snapshot.scenarios) {
      if (scenario.name === "c") continue;
      const storedMerge = [
        "r.id AS row_id",
        "r.key AS row_key",
        ...columns.map((id) => {
          const path = `'${id.replaceAll("'", "''")}'`;
          return `CASE
        WHEN o.cells->r.id ? ${path} THEN o.cells->r.id->${path}
        WHEN r.cells->${path}->>'kind' = 'formula' THEN to_jsonb(r.cells->${path}->>'formula')
        ELSE r.cells->${path}->'value'
      END AS ${quoteIdent(id)}`;
        }),
      ].join(",\n      ");
      await db.exec(`
        CREATE VIEW ${quoteIdent(sheetName)}.${quoteIdent(`${table.name}.${scenario.name}`)} AS
        SELECT
          ${storedMerge}
        FROM tables AS t
        LEFT JOIN overlays AS o
          ON o.workbook_id = t.workbook_id AND o.table_id = t.table_id AND o.scenario_id = ${escapeLiteral(scenario.id)}
        CROSS JOIN LATERAL jsonb_to_recordset(t.stored->'rows') AS r(id text, key text, cells jsonb)
        WHERE t.workbook_id = ${escapeLiteral(workbookId)} AND t.table_id = ${escapeLiteral(table.id)}
      `);

      const computedMerge = [
        "r.id AS row_id",
        "r.key AS row_key",
        ...columns.map((id) => {
          const path = `'${id.replaceAll("'", "''")}'`;
          return `CASE
        WHEN d.cells->r.id ? ${path} THEN d.cells->r.id->${path}
        ELSE b.cells->r.id->${path}
      END AS ${quoteIdent(id)}`;
        }),
      ].join(",\n      ");
      await db.exec(`
        CREATE VIEW ${quoteIdent(sheetName)}.${quoteIdent(`${table.name}.${scenario.name}.c`)} AS
        SELECT
          ${computedMerge}
        FROM tables AS t
        JOIN computed AS b
          ON b.workbook_id = t.workbook_id AND b.table_id = t.table_id AND b.scenario_id = ''
        LEFT JOIN computed AS d
          ON d.workbook_id = t.workbook_id AND d.table_id = t.table_id AND d.scenario_id = ${escapeLiteral(scenario.id)}
        CROSS JOIN LATERAL jsonb_to_recordset(t.stored->'rows') AS r(id text, key text, cells jsonb)
        WHERE t.workbook_id = ${escapeLiteral(workbookId)} AND t.table_id = ${escapeLiteral(table.id)}
      `);
    }
  }
}
