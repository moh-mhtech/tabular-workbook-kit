import { columnLetters, type WorkbookLayout } from "../model/layout.js";
import {
  hitTest,
  planExpansion,
  type GridExpansion,
  type HitTestResult,
  type SheetView,
} from "../model/sheetView.js";
import { overlayKey, type CellRef, type Selection } from "../model/types.js";

export interface SheetGridColumn {
  id: string;
  title: string;
  width: number;
}

export interface SheetGridProjection {
  sheetId: string;
  sheetName: string;
  tableId?: string;
  originRow: number;
  originCol: number;
  rowCount: number;
  colCount: number;
  columns: SheetGridColumn[];
  view: SheetView;
}

export type ProjectedCell =
  | { kind: "table"; row: number; col: number; hit: Exclude<HitTestResult, { kind: "outside" | "gap" }> }
  | { kind: "extension"; row: number; col: number; expansion: GridExpansion }
  | { kind: "readonly"; row: number; col: number };

/**
 * Projects only table bands. Loose cells deliberately do not participate in
 * this viewport, so the final row and column are always the sole outer margin.
 */
export function projectSheet(layout: WorkbookLayout, sheetId: string): SheetGridProjection | null {
  const view = layout.sheets.find((candidate) => candidate.sheetId === sheetId);
  if (!view) return null;

  let lastRow = -1;
  let lastCol = -1;
  for (const band of view.bands) {
    lastRow = Math.max(lastRow, band.headerRow + band.rowCount - 1);
    lastCol = Math.max(lastCol, band.startCol + band.colCount - 1);
  }
  const rowCount = lastRow + 2;
  const colCount = lastCol + 2;

  return {
    sheetId: view.sheetId,
    sheetName: view.sheetName,
    originRow: 0,
    originCol: 0,
    rowCount: Math.max(1, rowCount),
    colCount: Math.max(1, colCount),
    columns: Array.from({ length: Math.max(1, colCount) }, (_, index) => ({
      id: `sheet-column-${index}`,
      title: columnLetters(index),
      width: index === 0 ? 150 : 110,
    })),
    view,
  };
}

/** One table plus its empty growth row and column. Identifiers are table names. */
export function projectTable(layout: WorkbookLayout, tableId: string): SheetGridProjection | null {
  const tableLayout = layout.tables.get(tableId);
  const view = layout.sheets.find((candidate) => candidate.sheetId === tableLayout?.sheetId);
  if (!tableLayout || !view) return null;

  const colCount = tableLayout.band.colCount + 1;
  const rowCount = tableLayout.band.rowCount + 1;
  return {
    sheetId: view.sheetId,
    sheetName: view.sheetName,
    tableId,
    originRow: tableLayout.band.headerRow,
    originCol: tableLayout.band.startCol,
    rowCount,
    colCount,
    columns: Array.from({ length: colCount }, (_, index) => {
      const column = tableLayout.columns[index];
      return {
        id: column?.id ?? `empty-${index}`,
        title: column?.name ?? "",
        width: index === 0 ? 150 : 110,
      };
    }),
    view,
  };
}

export function projectedCell(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): ProjectedCell {
  if (row < 0 || col < 0 || row >= projection.rowCount || col >= projection.colCount) {
    return { kind: "readonly", row, col };
  }
  const sheetRow = row + projection.originRow;
  const sheetCol = col + projection.originCol;
  const hit = hitTest(projection.view, layout.snapshot, sheetRow, sheetCol, layout.periods);
  if (hit.kind !== "outside" && hit.kind !== "gap") {
    return { kind: "table", row, col, hit };
  }
  const expansion = planExpansion(projection.view, layout.snapshot, sheetRow, sheetCol, layout.periods);
  return expansion
    ? { kind: "extension", row, col, expansion }
    : { kind: "readonly", row, col };
}

export function selectionForProjectedCell(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): Selection {
  const cell = projectedCell(projection, layout, col, row);
  if (cell.kind === "extension") return { kind: "table", tableId: cell.expansion.tableId };
  if (cell.kind === "readonly") return { kind: "sheet", sheetId: projection.sheetId };
  const hit = cell.hit;
  if (hit.kind === "cell") {
    return {
      kind: "cell",
      tableId: hit.tableId,
      rowId: hit.rowId,
      columnId: hit.columnId,
    };
  }
  if (hit.kind === "key") return { kind: "row", tableId: hit.tableId, rowId: hit.rowId };
  return { kind: "column", tableId: hit.tableId, columnId: hit.columnId };
}

export function cellsInProjectedRange(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  range: { x: number; y: number; width: number; height: number },
): CellRef[] {
  const cells: CellRef[] = [];
  const seen = new Set<string>();
  for (let row = range.y; row < range.y + range.height; row++) {
    for (let col = range.x; col < range.x + range.width; col++) {
      const selection = selectionForProjectedCell(projection, layout, col, row);
      if (selection.kind !== "cell") continue;
      const key = overlayKey(selection.tableId, selection.rowId, selection.columnId);
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push({ tableId: selection.tableId, rowId: selection.rowId, columnId: selection.columnId });
    }
  }
  return cells;
}

