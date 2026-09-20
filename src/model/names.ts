import { TABLE_NAME_PATTERN } from "./structure.js";
import { valueColumn, type WorkbookLayout } from "./layout.js";
import type { WorkbookSnapshot } from "./types.js";

const RESERVED_NAMES = new Set(
  [
    "SUM",
    "IF",
    "IFS",
    "AND",
    "OR",
    "NOT",
    "TRUE",
    "FALSE",
    "INDEX",
    "MATCH",
    "VALUE",
    "IFERROR",
    "ROUND",
    "ABS",
    "MIN",
    "MAX",
    "AVERAGE",
  ].map((n) => n.toLowerCase()),
);

export function canPromoteRowKeys(table: {
  timeAxis: boolean;
  attributeColumns: unknown[];
}): boolean {
  return !table.timeAxis && table.attributeColumns.length === 1;
}

export function promotedNames(snapshot: WorkbookSnapshot): { name: string; tableId: string; rowId: string; columnId: string }[] {
  const out: { name: string; tableId: string; rowId: string; columnId: string }[] = [];
  for (const table of snapshot.tables) {
    if (!table.promoteRowKeys) continue;
    const col = table.attributeColumns[0];
    if (!col) continue;
    for (const row of table.rows) {
      out.push({ name: row.key, tableId: table.id, rowId: row.id, columnId: col.id });
    }
  }
  return out;
}

/** Univer defined names reject non-ASCII identifiers; structured refs still work. */
export function canRegisterDefinedName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export function assertGlobalName(
  snapshot: WorkbookSnapshot,
  candidate: string,
  except?: { rowId?: string; tableId?: string; sheetId?: string },
): string {
  const trimmed = candidate.trim();
  if (!TABLE_NAME_PATTERN.test(trimmed) || trimmed === "@" || /^@[+-]\d+$/.test(trimmed)) {
    throw new Error("Name must start with a letter and cannot be @.");
  }
  if (RESERVED_NAMES.has(trimmed.toLowerCase())) {
    throw new Error(`"${trimmed}" is a reserved formula name.`);
  }
  const lower = trimmed.toLowerCase();
  for (const sheet of snapshot.sheets) {
    if (except?.sheetId && sheet.id === except.sheetId) continue;
    if (except?.tableId && sheet.tableIds.includes(except.tableId) && sheet.name.toLowerCase() === lower) continue;
    if (sheet.name.toLowerCase() === lower) {
      throw new Error(`Name "${trimmed}" collides with sheet "${sheet.name}".`);
    }
  }
  for (const table of snapshot.tables) {
    if (table.id !== except?.tableId && table.name.toLowerCase() === lower) {
      throw new Error(`Name "${trimmed}" collides with table "${table.name}".`);
    }
    if (!table.promoteRowKeys) continue;
    for (const row of table.rows) {
      if (row.id === except?.rowId) continue;
      if (row.key.toLowerCase() === lower) {
        throw new Error(`Name "${trimmed}" collides with a promoted key.`);
      }
    }
  }
  return trimmed;
}

export function nextPromotableKey(snapshot: WorkbookSnapshot): string {
  let i = 1;
  for (;;) {
    const candidate = i === 1 ? "Param" : `Param${i}`;
    try {
      return assertGlobalName(snapshot, candidate);
    } catch {
      i++;
      if (i > 1000) throw new Error("Could not allocate a parameter key.");
    }
  }
}

export function getCellName(
  layout: WorkbookLayout,
  tableId: string,
  rowId: string,
  columnId: string,
): { structured: string; defined?: string } {
  const table = layout.tables.get(tableId);
  if (!table) throw new Error("Unknown table");
  const row = table.rows.find((r) => r.id === rowId);
  const col = table.columns.find((c) => c.id === columnId);
  if (!row || !col) throw new Error("Unknown cell");
  const structured = `${table.table.name}[${col.name}][${row.key}]`;
  if (table.table.promoteRowKeys) {
    const value = valueColumn(table);
    if (value && col.id === value.id) {
      return { structured, defined: row.key };
    }
  }
  return { structured };
}
