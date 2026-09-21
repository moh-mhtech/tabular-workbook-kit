import { buildPeriods, resolvePeriodToken, type Period } from "./calendar.js";
import { layoutSheets, type TableBand } from "./sheetView.js";
import { KEY_COLUMN_ID, type TableSnapshot, type WorkbookSnapshot } from "./types.js";
import { tableYearColumns } from "./yearColumns.js";

export interface LaidOutColumn {
  id: string;
  name: string;
  kind: "key" | "attribute" | "period";
  colIndex: number;
  periodId?: string;
  periodIds?: string[];
  yearColumnId?: string;
}

export interface LaidOutRow {
  id: string;
  key: string;
  rowIndex: number;
}

export interface TableLayout {
  table: TableSnapshot;
  sheetId: string;
  sheetName: string;
  band: TableBand;
  columns: LaidOutColumn[];
  rows: LaidOutRow[];
  keyByLower: Map<string, LaidOutRow>;
  columnByLower: Map<string, LaidOutColumn>;
}

export interface WorkbookLayout {
  snapshot: WorkbookSnapshot;
  periods: Period[];
  sheets: ReturnType<typeof layoutSheets>;
  tables: Map<string, TableLayout>;
  tablesByName: Map<string, TableLayout>;
}

export function engineSheetSize(layout: WorkbookLayout, sheetId: string): { rowCount: number; colCount: number } {
  const view = layout.sheets.find((sheet) => sheet.sheetId === sheetId);
  let rowCount = view?.rowCount ?? 1;
  let colCount = view?.colCount ?? 1;
  for (const table of layout.tables.values()) {
    if (table.sheetId !== sheetId) continue;
    for (const column of table.columns) colCount = Math.max(colCount, column.colIndex + 2);
    for (const row of table.rows) rowCount = Math.max(rowCount, row.rowIndex + 2);
  }
  return { rowCount, colCount };
}

export function layoutWorkbook(snapshot: WorkbookSnapshot): WorkbookLayout {
  const periods = buildPeriods(snapshot.calendar);
  const sheets = layoutSheets(snapshot, periods);
  const tables = new Map<string, TableLayout>();
  const tablesByName = new Map<string, TableLayout>();

  for (const view of sheets) {
    for (const band of view.bands) {
      const table = snapshot.tables.find((t) => t.id === band.tableId);
      if (!table) continue;
      const layout = buildTableLayout(table, view.sheetId, view.sheetName, band, periods);
      tables.set(table.id, layout);
      tablesByName.set(table.name.toLowerCase(), layout);
    }
  }

  return { snapshot, periods, sheets, tables, tablesByName };
}

function buildTableLayout(
  table: TableSnapshot,
  sheetId: string,
  sheetName: string,
  band: TableBand,
  periods: Period[],
): TableLayout {
  const columns: LaidOutColumn[] = [
    { id: KEY_COLUMN_ID, name: "key", kind: "key", colIndex: band.startCol },
  ];
  table.attributeColumns.forEach((col, i) => {
    columns.push({
      id: col.id,
      name: col.name,
      kind: "attribute",
      colIndex: band.startCol + 1 + i,
    });
  });
  for (const yearCol of tableYearColumns(table)) {
    const months = periods.filter((period) => period.year === yearCol.year);
    months.forEach((period) => {
      columns.push({
        id: period.id,
        name: period.label,
        kind: "period",
        colIndex: band.startCol + columns.length,
        periodId: period.id,
        periodIds: [period.id],
        yearColumnId: yearCol.id,
      });
    });
  }
  const rows: LaidOutRow[] = table.rows.map((row, i) => ({
    id: row.id,
    key: row.key,
    rowIndex: band.headerRow + 1 + i,
  }));
  const layout: TableLayout = {
    table,
    sheetId,
    sheetName,
    band,
    columns,
    rows,
    keyByLower: new Map(rows.map((row) => [row.key.toLowerCase(), row])),
    columnByLower: new Map(),
  };
  for (const col of columns) {
    layout.columnByLower.set(col.name.toLowerCase(), col);
    layout.columnByLower.set(col.id.toLowerCase(), col);
    if (col.periodId) layout.columnByLower.set(col.periodId.toLowerCase(), col);
  }
  return layout;
}

export function findColumn(layout: TableLayout, token: string, periods: Period[]): LaidOutColumn | undefined {
  const direct = layout.columnByLower.get(token.toLowerCase());
  if (direct) return direct;
  const period = resolvePeriodToken(token, periods);
  if (!period) return undefined;
  return layout.columns.find((col) => col.periodId === period.id);
}

export function valueColumn(layout: TableLayout): LaidOutColumn | undefined {
  const attributes = layout.columns.filter((col) => col.kind === "attribute");
  if (attributes.length === 1) return attributes[0];
  const named = attributes.find((col) => col.name.toLowerCase() === "value");
  return named ?? attributes[0];
}

export function a1(colIndex: number, rowIndex: number): string {
  return `${columnLetters(colIndex)}${rowIndex + 1}`;
}

export function columnLetters(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
