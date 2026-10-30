import { buildPeriods, type Period } from "./calendar.js";
import { hasTimeColumns, visibleTimeColCount, visibleTimeSlots } from "./yearColumns.js";
import {
  hasContent,
  looseCellKey,
  parseLooseCellKey,
  type CellSnapshot,
  type TableSnapshot,
  type WorkbookSnapshot,
} from "./types.js";
import {
  tableHasTotalsColumn,
  tableHasTotalsRow,
  TOTAL_COLUMN_ID,
  TOTAL_ROW_ID,
} from "./tableTotals.js";

export const TABLE_GAP_ROWS = 2;
export const START_COL = 0;
export const START_ROW = 0;

export interface TableBand {
  tableId: string;
  startRow: number;
  startCol: number;
  headerRow: number;
  rowCount: number;
  colCount: number;
}

export interface SheetView {
  sheetId: string;
  sheetName: string;
  bands: TableBand[];
  looseCells: Record<string, CellSnapshot>;
  rowCount: number;
  colCount: number;
}

export type HitTestResult =
  | { kind: "outside" }
  | { kind: "gap" }
  | { kind: "header"; tableId: string; columnId: string }
  | { kind: "key"; tableId: string; rowId: string }
  | { kind: "cell"; tableId: string; rowId: string; columnId: string };

/**
 * An edit that Excel would answer by growing a table.
 * A `below` edit on the key column names the new row; a `right` edit with no
 * `rowId` landed on the header row and names the new column.
 */
export type GridExpansion =
  | { direction: "below"; tableId: string; columnId: string }
  | { direction: "right"; tableId: string; rowId: string | null };

function columnCount(table: TableSnapshot, periods: Period[]): number {
  let count = 1 + table.attributeColumns.length + visibleTimeColCount(table, periods);
  if (tableHasTotalsColumn(table)) count += 1;
  return count;
}

function columnIdAt(table: TableSnapshot, periods: Period[], offset: number): string | null {
  if (offset === 0) return "__key__";
  const attrCount = table.attributeColumns.length;
  const timeCount = visibleTimeColCount(table, periods);
  if (offset <= attrCount) return table.attributeColumns[offset - 1]?.id ?? null;
  const timeOffset = offset - 1 - attrCount;
  if (timeOffset < timeCount) {
    return visibleTimeSlots(table, periods)[timeOffset]?.id ?? null;
  }
  if (tableHasTotalsColumn(table) && offset === 1 + attrCount + timeCount) return TOTAL_COLUMN_ID;
  return null;
}

function stackBands(tables: TableSnapshot[], periods: Period[]): TableBand[] {
  let row = START_ROW;
  return tables.map((table) => {
    const band: TableBand = {
      tableId: table.id,
      startRow: row,
      startCol: START_COL,
      headerRow: row,
      rowCount: 1 + table.rows.length + (tableHasTotalsRow(table) ? 1 : 0),
      colCount: columnCount(table, periods),
    };
    row += band.rowCount + TABLE_GAP_ROWS;
    return band;
  });
}

/** The grid stops one row and one column past everything that holds data. */
function extentOf(
  bands: TableBand[],
  looseCells: Record<string, CellSnapshot>,
): { rowCount: number; colCount: number } {
  let lastRow = START_ROW - 1;
  let lastCol = START_COL - 1;
  for (const band of bands) {
    lastRow = Math.max(lastRow, band.headerRow + band.rowCount - 1);
    lastCol = Math.max(lastCol, band.startCol + band.colCount - 1);
  }
  for (const [key, cell] of Object.entries(looseCells)) {
    if (!hasContent(cell)) continue;
    const { row, col } = parseLooseCellKey(key);
    lastRow = Math.max(lastRow, row);
    lastCol = Math.max(lastCol, col);
  }
  return { rowCount: lastRow + 2, colCount: lastCol + 2 };
}

export function layoutSheets(snapshot: WorkbookSnapshot, periods?: Period[]): SheetView[] {
  const calendarPeriods = periods ?? buildPeriods(snapshot.calendar);
  const placed = new Set<string>();
  const views: SheetView[] = snapshot.sheets.map((sheet) => {
    const tables = sheet.tableIds
      .map((tableId) => snapshot.tables.find((t) => t.id === tableId))
      .filter((t): t is TableSnapshot => Boolean(t));
    for (const table of tables) placed.add(table.id);
    const bands = stackBands(tables, calendarPeriods);
    const looseCells = sheet.looseCells ?? {};
    return {
      sheetId: sheet.id,
      sheetName: sheet.name,
      bands,
      looseCells,
      ...extentOf(bands, looseCells),
    };
  });

  const orphan = snapshot.tables.filter((t) => !placed.has(t.id));
  if (orphan.length) {
    const bands = stackBands(orphan, calendarPeriods);
    views.push({
      sheetId: "sheet-orphan",
      sheetName: "Tables",
      bands,
      looseCells: {},
      ...extentOf(bands, {}),
    });
  }
  return views;
}

export function hitTest(
  view: SheetView,
  snapshot: WorkbookSnapshot,
  row: number,
  col: number,
  periods?: Period[],
): HitTestResult {
  const calendarPeriods = periods ?? buildPeriods(snapshot.calendar);
  for (const band of view.bands) {
    if (row < band.headerRow || row >= band.headerRow + band.rowCount) continue;
    if (col < band.startCol || col >= band.startCol + band.colCount) continue;
    const table = snapshot.tables.find((t) => t.id === band.tableId);
    if (!table) return { kind: "outside" };
    const offset = col - band.startCol;
    const columnId = columnIdAt(table, calendarPeriods, offset);
    if (!columnId) return { kind: "outside" };
    if (row === band.headerRow) {
      return { kind: "header", tableId: table.id, columnId };
    }
    const dataIndex = row - band.headerRow - 1;
    if (tableHasTotalsRow(table) && dataIndex === table.rows.length) {
      if (columnId === "__key__") return { kind: "key", tableId: table.id, rowId: TOTAL_ROW_ID };
      return { kind: "cell", tableId: table.id, rowId: TOTAL_ROW_ID, columnId };
    }
    const dataRow = table.rows[dataIndex];
    if (!dataRow) return { kind: "gap" };
    if (columnId === "__key__") return { kind: "key", tableId: table.id, rowId: dataRow.id };
    if (columnId === TOTAL_COLUMN_ID) {
      return { kind: "cell", tableId: table.id, rowId: dataRow.id, columnId: TOTAL_COLUMN_ID };
    }
    return { kind: "cell", tableId: table.id, rowId: dataRow.id, columnId };
  }
  return { kind: "outside" };
}

/**
 * Where a grid row ends up after the bands above it change height. Loose cells
 * are anchored to absolute rows, so they have to ride along with the band they
 * sit under, the way Excel pushes content down when a table gains a row.
 */
export function restackedRow(before: TableBand[], after: TableBand[], row: number): number {
  let shift = 0;
  for (let i = 0; i < before.length && i < after.length; i++) {
    const wasEnd = before[i].headerRow + before[i].rowCount;
    if (wasEnd > row) break;
    shift = after[i].headerRow + after[i].rowCount - wasEnd;
  }
  return row + shift;
}

function isOccupied(
  view: SheetView,
  snapshot: WorkbookSnapshot,
  row: number,
  col: number,
  periods: Period[],
): boolean {
  if (hasContent(view.looseCells[looseCellKey(row, col)])) return true;
  const hit = hitTest(view, snapshot, row, col, periods);
  return hit.kind === "header" || hit.kind === "key" || hit.kind === "cell";
}

/**
 * Excel-style auto-expansion: an edit directly beneath the last row or directly
 * right of the last column grows that table, but only while every other cell
 * adjacent in the same direction is empty, so an unrelated block next to the
 * table is never swallowed. The diagonal corner belongs to neither direction.
 */
export function planExpansion(
  view: SheetView,
  snapshot: WorkbookSnapshot,
  row: number,
  col: number,
  periods?: Period[],
): GridExpansion | null {
  const calendarPeriods = periods ?? buildPeriods(snapshot.calendar);
  for (const band of view.bands) {
    const table = snapshot.tables.find((t) => t.id === band.tableId);
    if (!table) continue;
    const endRow = band.headerRow + band.rowCount;
    const endCol = band.startCol + band.colCount;

    if (row === endRow && col >= band.startCol && col < endCol) {
      for (let c = band.startCol; c < endCol; c++) {
        if (c !== col && isOccupied(view, snapshot, row, c, calendarPeriods)) return null;
      }
      const columnId = columnIdAt(table, calendarPeriods, col - band.startCol);
      if (!columnId) return null;
      return { direction: "below", tableId: table.id, columnId };
    }

    if (col === endCol && row >= band.headerRow && row < endRow) {
      // Period columns come from the calendar and a promoted table owns exactly
      // one data column, so neither can take an appended column.
      if (hasTimeColumns(table) || table.promoteRowKeys) return null;
      for (let r = band.headerRow; r < endRow; r++) {
        if (r !== row && isOccupied(view, snapshot, r, col, calendarPeriods)) return null;
      }
      if (row === band.headerRow) return { direction: "right", tableId: table.id, rowId: null };
      const dataRow = table.rows[row - band.headerRow - 1];
      if (!dataRow) return null;
      return { direction: "right", tableId: table.id, rowId: dataRow.id };
    }
  }
  return null;
}

export function addressOf(
  view: SheetView,
  snapshot: WorkbookSnapshot,
  tableId: string,
  rowId: string,
  columnId: string,
  periods?: Period[],
): { sheetName: string; row: number; col: number } | null {
  const calendarPeriods = periods ?? buildPeriods(snapshot.calendar);
  const band = view.bands.find((b) => b.tableId === tableId);
  const table = snapshot.tables.find((t) => t.id === tableId);
  if (!band || !table) return null;
  const rowIndex = table.rows.findIndex((r) => r.id === rowId);
  if (rowIndex < 0) return null;
  const cols = [
    "__key__",
    ...table.attributeColumns.map((c) => c.id),
    ...visibleTimeSlots(table, calendarPeriods).map((slot) => slot.id),
  ];
  const slot = visibleTimeSlots(table, calendarPeriods).find((candidate) =>
    candidate.periodIds.includes(columnId),
  );
  if (slot && !cols.includes(columnId)) {
    const colOffset = cols.indexOf(slot.id);
    if (colOffset >= 0) {
      return {
        sheetName: view.sheetName,
        row: band.headerRow + 1 + rowIndex,
        col: band.startCol + colOffset,
      };
    }
  }
  const colOffset = cols.indexOf(columnId);
  if (colOffset < 0) return null;
  return {
    sheetName: view.sheetName,
    row: band.headerRow + 1 + rowIndex,
    col: band.startCol + colOffset,
  };
}
