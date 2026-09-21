import { columnLetters, type WorkbookLayout } from "../model/layout.js";
import {
  hitTest,
  planExpansion,
  type GridExpansion,
  type HitTestResult,
  type SheetView,
} from "../model/sheetView.js";
import { overlayKey, type CellRef, type Selection } from "../model/types.js";

export const TABLE_KEY_COLUMN_WIDTH = 48;
export const TABLE_GROWTH_COLUMN_WIDTH = 48;
export const TABLE_DATA_COLUMN_WIDTH = 110;
export const GROWTH_HEADER_MARK = "+";

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
        title: column && column.kind !== "key" ? column.name : "",
        width: !column
          ? TABLE_GROWTH_COLUMN_WIDTH
          : column.kind === "key"
            ? TABLE_KEY_COLUMN_WIDTH
            : TABLE_DATA_COLUMN_WIDTH,
      };
    }),
    view,
  };
}

/** Growth-row key and growth-column header — the add-row / add-column affordances. */
export function isGrowthHeaderCell(
  projection: SheetGridProjection,
  col: number,
  row: number,
): boolean {
  if (isUnusedTableCorner(projection, col, row)) return false;
  return (col === 0 && row === projection.rowCount - 1) || (row === 0 && col === projection.colCount - 1);
}

/** Key header and unused growth corner — not fields, not expansion cells. */
export function isUnusedTableCorner(
  projection: SheetGridProjection,
  col: number,
  row: number,
): boolean {
  const sheetRow = row + projection.originRow;
  const sheetCol = col + projection.originCol;
  return projection.view.bands.some((band) => {
    const topLeft = sheetRow === band.headerRow && sheetCol === band.startCol;
    const bottomRight =
      sheetRow === band.headerRow + band.rowCount && sheetCol === band.startCol + band.colCount;
    return topLeft || bottomRight;
  });
}

export function acceptTableGridSelection(
  projection: SheetGridProjection,
  cell: readonly [number, number] | undefined,
): boolean {
  if (!cell) return true;
  return !isUnusedTableCorner(projection, cell[0], cell[1]);
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
  if (isUnusedTableCorner(projection, col, row)) {
    return { kind: "readonly", row, col };
  }
  const hit = hitTest(projection.view, layout.snapshot, sheetRow, sheetCol, layout.periods);
  if (hit.kind !== "outside" && hit.kind !== "gap") {
    return { kind: "table", row, col, hit };
  }
  const expansion = planExpansion(projection.view, layout.snapshot, sheetRow, sheetCol, layout.periods);
  return expansion
    ? { kind: "extension", row, col, expansion }
    : { kind: "readonly", row, col };
}

function isLockedGrowthMargin(projection: SheetGridProjection, col: number, row: number): boolean {
  if (!projection.tableId || isUnusedTableCorner(projection, col, row)) return false;
  return col === projection.colCount - 1 || row === projection.rowCount - 1;
}

export function selectionForProjectedCell(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): Selection {
  const cell = projectedCell(projection, layout, col, row);
  if (cell.kind === "extension") return { kind: "table", tableId: cell.expansion.tableId };
  if (cell.kind === "readonly") {
    if (projection.tableId && isLockedGrowthMargin(projection, col, row)) {
      return { kind: "table", tableId: projection.tableId };
    }
    return { kind: "sheet", sheetId: projection.sheetId };
  }
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

export function projectedLocationForRef(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  ref: CellRef,
): readonly [number, number] | undefined {
  const table = layout.tables.get(ref.tableId);
  if (!table || (projection.tableId && projection.tableId !== ref.tableId)) return undefined;
  const col = table.columns.findIndex((column) => column.id === ref.columnId);
  const row = table.rows.findIndex((candidate) => candidate.id === ref.rowId);
  if (col < 0 || row < 0) return undefined;
  return [col + table.band.startCol - projection.originCol, row + 1 + table.band.headerRow - projection.originRow];
}

/** Walks Enter/Tab from a committed cell onto the next data cell or unused growth cell. */
export function cellAfterCommitMove(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  from: readonly [number, number],
  movement: readonly [-1 | 0 | 1, -1 | 0 | 1],
): { location: readonly [number, number]; selection: Selection } | undefined {
  if (movement[0] === 0 && movement[1] === 0) return undefined;
  let col = from[0] + movement[0];
  let row = from[1] + movement[1];
  while (col >= 0 && row >= 0 && col < projection.colCount && row < projection.rowCount) {
    const projected = projectedCell(projection, layout, col, row);
    if (projected.kind === "extension" || (projected.kind === "table" && projected.hit.kind === "cell")) {
      return { location: [col, row], selection: selectionForProjectedCell(projection, layout, col, row) };
    }
    col += movement[0];
    row += movement[1];
  }
  return undefined;
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

