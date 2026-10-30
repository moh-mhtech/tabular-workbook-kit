import type { WorkbookLayout } from "../model/layout.js";
import { readComputed } from "./compileWorkbook.js";
import {
  aggregateTotalValues,
  isTotalColumnId,
  isTotalRowId,
  resolveTotalsRange,
  tableHasTotalsColumn,
  tableHasTotalsRow,
} from "../model/tableTotals.js";
import type { Primitive, WorkbookSnapshot } from "../model/types.js";
import type { SheetGrid } from "./types.js";

export interface TotalCellPatch {
  sheetName: string;
  row: number;
  col: number;
  value: Primitive;
}

export function collectTotalCellPatches(
  snapshot: WorkbookSnapshot,
  layout: WorkbookLayout,
  values: Record<string, SheetGrid>,
): TotalCellPatch[] {
  const patches: TotalCellPatch[] = [];
  for (const tableLayout of layout.tables.values()) {
    const table = tableLayout.table;
    const hasRow = tableHasTotalsRow(table);
    const hasCol = tableHasTotalsColumn(table);
    if (!hasRow && !hasCol) continue;

    let dataRows = tableLayout.rows.filter((row) => !isTotalRowId(row.id));
    let dataCols = tableLayout.columns.filter(
      (col) => col.kind !== "key" && !isTotalColumnId(col.id),
    );

    const rowLabels = dataRows.map((row) => row.key);
    const colLabels = dataCols.map((col) => col.name);
    const rowPick = resolveTotalsRange(table.totalsRowRange, rowLabels);
    const colPick = resolveTotalsRange(table.totalsColumnRange, colLabels);
    if (rowPick) dataRows = dataRows.filter((row) => rowPick.has(row.key));
    if (colPick) dataCols = dataCols.filter((col) => colPick.has(col.name));

    const totalRow = tableLayout.rows.find((row) => isTotalRowId(row.id));
    const totalCol = tableLayout.columns.find((col) => isTotalColumnId(col.id));

    if (hasRow && totalRow) {
      for (const col of dataCols) {
        const included = dataRows.map((row) =>
          readComputed(values, tableLayout.sheetName, row.rowIndex, col.colIndex),
        );
        patches.push({
          sheetName: tableLayout.sheetName,
          row: totalRow.rowIndex,
          col: col.colIndex,
          value: aggregateTotalValues(included),
        });
      }
      if (hasCol && totalCol) {
        patches.push({
          sheetName: tableLayout.sheetName,
          row: totalRow.rowIndex,
          col: totalCol.colIndex,
          value: aggregateGrandTotal(values, tableLayout.sheetName, dataRows, dataCols),
        });
      }
    }

    if (hasCol && totalCol) {
      for (const row of dataRows) {
        const included = dataCols.map((col) =>
          readComputed(values, tableLayout.sheetName, row.rowIndex, col.colIndex),
        );
        patches.push({
          sheetName: tableLayout.sheetName,
          row: row.rowIndex,
          col: totalCol.colIndex,
          value: aggregateTotalValues(included),
        });
      }
    }
  }
  return patches;
}

function aggregateGrandTotal(
  values: Record<string, SheetGrid>,
  sheetName: string,
  dataRows: { rowIndex: number }[],
  dataCols: { colIndex: number }[],
): Primitive {
  const flat: Primitive[] = [];
  for (const row of dataRows) {
    for (const col of dataCols) {
      flat.push(readComputed(values, sheetName, row.rowIndex, col.colIndex));
    }
  }
  return aggregateTotalValues(flat);
}

export function applyTotalPatches(values: Record<string, SheetGrid>, patches: TotalCellPatch[]): boolean {
  let changed = false;
  for (const patch of patches) {
    const grid = values[patch.sheetName];
    if (!grid) continue;
    const row = grid[patch.row];
    if (!row) continue;
    const prev = row[patch.col] ?? null;
    const next = patch.value;
    if (prev !== next && !(prev === null && next === null)) changed = true;
    row[patch.col] = next;
  }
  return changed;
}
