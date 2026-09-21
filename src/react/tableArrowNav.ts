import { visibleCellText } from "../grid/columnFit.js";
import {
  isGrowthHeaderCell,
  isUnusedTableCorner,
  projectTable,
  projectedCell,
  selectionForProjectedCell,
  type SheetGridProjection,
} from "../grid/sheetProjection.js";
import type { WorkbookLayout } from "../model/layout.js";
import type { EvaluatedCell } from "../model/types.js";
import type { WorkbookSession } from "../session/WorkbookSession.js";

export type ArrowNavDirection = "up" | "down" | "left" | "right";

export type TableArrowNavCell = {
  tableId: string;
  col: number;
  row: number;
};

const DIRECTION_DELTA: Record<ArrowNavDirection, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export function arrowNavDirection(key: string): ArrowNavDirection | undefined {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return undefined;
  }
}

export function sheetTableProjections(layout: WorkbookLayout, sheetId: string): SheetGridProjection[] {
  const view = layout.sheets.find((sheet) => sheet.sheetId === sheetId);
  if (!view) return [];
  return view.bands
    .map((band) => projectTable(layout, band.tableId))
    .filter((projection): projection is SheetGridProjection => Boolean(projection?.tableId));
}

function isSelectable(projection: SheetGridProjection, col: number, row: number): boolean {
  return (
    col >= 0 &&
    row >= 0 &&
    col < projection.colCount &&
    row < projection.rowCount &&
    !isUnusedTableCorner(projection, col, row)
  );
}

function stepToNextCell(
  projection: SheetGridProjection,
  from: TableArrowNavCell,
  direction: ArrowNavDirection,
): TableArrowNavCell | undefined {
  if (!projection.tableId) return undefined;
  const [dx, dy] = DIRECTION_DELTA[direction];
  let col = from.col + dx;
  let row = from.row + dy;
  while (col >= 0 && row >= 0 && col < projection.colCount && row < projection.rowCount) {
    if (isSelectable(projection, col, row)) return { tableId: projection.tableId, col, row };
    col += dx;
    row += dy;
  }
  return undefined;
}

/** Shift+Arrow: one data cell in that direction, same Table, no wrap, no Growth. */
export function shiftArrowNavTarget(
  projection: SheetGridProjection,
  from: TableArrowNavCell,
  direction: ArrowNavDirection,
): TableArrowNavCell | undefined {
  if (projection.tableId !== from.tableId) return undefined;
  const next = stepToNextCell(projection, from, direction);
  if (!next || !inDataArea(projection, next.col, next.row)) return undefined;
  return next;
}

function firstSelectableRow(projection: SheetGridProjection, col: number): number | undefined {
  for (let row = 0; row < projection.rowCount; row++) {
    if (isSelectable(projection, col, row)) return row;
  }
  return undefined;
}

function lastSelectableRow(projection: SheetGridProjection, col: number): number | undefined {
  for (let row = projection.rowCount - 1; row >= 0; row--) {
    if (isSelectable(projection, col, row)) return row;
  }
  return undefined;
}

function firstSelectableCol(projection: SheetGridProjection, row: number): number | undefined {
  for (let col = 0; col < projection.colCount; col++) {
    if (isSelectable(projection, col, row)) return col;
  }
  return undefined;
}

function lastSelectableCol(projection: SheetGridProjection, row: number): number | undefined {
  for (let col = projection.colCount - 1; col >= 0; col--) {
    if (isSelectable(projection, col, row)) return col;
  }
  return undefined;
}

function clampIndex(value: number, count: number): number {
  return Math.max(0, Math.min(value, Math.max(0, count - 1)));
}

function cellAt(tableId: string, col: number | undefined, row: number | undefined): TableArrowNavCell | undefined {
  if (col === undefined || row === undefined) return undefined;
  return { tableId, col, row };
}

function lastGrowthRowCell(projection: SheetGridProjection): TableArrowNavCell | undefined {
  if (!projection.tableId) return undefined;
  const row = projection.rowCount - 1;
  return cellAt(projection.tableId, lastSelectableCol(projection, row), row);
}

function isGrowthRow(projection: SheetGridProjection, row: number): boolean {
  return row === projection.rowCount - 1;
}

function isGrowthColumn(projection: SheetGridProjection, col: number): boolean {
  return projection.growthColumn && col === projection.colCount - 1;
}

function lastDataRow(projection: SheetGridProjection, col: number): number | undefined {
  for (let row = projection.rowCount - 2; row >= 0; row--) {
    if (isSelectable(projection, col, row)) return row;
  }
  return undefined;
}

function lastDataCol(projection: SheetGridProjection, row: number): number | undefined {
  const last = projection.growthColumn ? projection.colCount - 2 : projection.colCount - 1;
  for (let col = last; col >= 0; col--) {
    if (isSelectable(projection, col, row)) return col;
  }
  return undefined;
}

function inDataArea(projection: SheetGridProjection, col: number, row: number): boolean {
  return isSelectable(projection, col, row) && !isGrowthRow(projection, row) && !isGrowthColumn(projection, col);
}

function firstHeaderCell(projection: SheetGridProjection): TableArrowNavCell | undefined {
  if (!projection.tableId) return undefined;
  return cellAt(projection.tableId, firstSelectableCol(projection, 0), 0);
}

function isBlankNavCell(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  evaluated: ReadonlyMap<string, EvaluatedCell>,
  col: number,
  row: number,
): boolean {
  if (!isSelectable(projection, col, row)) return true;
  if (isGrowthHeaderCell(projection, col, row)) return true;
  const projected = projectedCell(projection, layout, col, row);
  if (projected.kind !== "table") return true;
  return !visibleCellText(projection, layout, evaluated, col, row).trim();
}

function axisEnd(
  projection: SheetGridProjection,
  col: number,
  row: number,
  direction: ArrowNavDirection,
  confineToData = false,
): TableArrowNavCell | undefined {
  if (!projection.tableId) return undefined;
  if (direction === "right") {
    return cellAt(
      projection.tableId,
      confineToData ? lastDataCol(projection, row) : lastSelectableCol(projection, row),
      row,
    );
  }
  if (direction === "left") return cellAt(projection.tableId, firstSelectableCol(projection, row), row);
  if (direction === "down") return cellAt(projection.tableId, col, lastDataRow(projection, col));
  return cellAt(projection.tableId, col, firstSelectableRow(projection, col));
}

function axisEntry(
  projection: SheetGridProjection,
  col: number,
  direction: ArrowNavDirection,
): TableArrowNavCell | undefined {
  const clamped = clampIndex(col, projection.colCount);
  if (direction === "down") return cellAt(projection.tableId!, clamped, firstSelectableRow(projection, clamped));
  if (direction === "up") return cellAt(projection.tableId!, clamped, lastDataRow(projection, clamped));
  return undefined;
}

function sameNavCell(left: TableArrowNavCell, right: TableArrowNavCell | undefined): boolean {
  return Boolean(right && left.tableId === right.tableId && left.col === right.col && left.row === right.row);
}

function ctrlStepFrom(
  projection: SheetGridProjection,
  from: TableArrowNavCell,
  direction: ArrowNavDirection,
  layout: WorkbookLayout,
  evaluated: ReadonlyMap<string, EvaluatedCell>,
  confineToData = false,
): TableArrowNavCell | undefined {
  if (!projection.tableId) return undefined;
  if (confineToData && !inDataArea(projection, from.col, from.row)) return undefined;
  const [dx, dy] = DIRECTION_DELTA[direction];
  const vertical = direction === "up" || direction === "down";
  if (vertical && direction === "down" && isGrowthRow(projection, from.row)) return undefined;
  const inLine = (col: number, row: number) =>
    col >= 0 &&
    row >= 0 &&
    col < projection.colCount &&
    row < projection.rowCount &&
    !(vertical && isGrowthRow(projection, row)) &&
    !(confineToData && isGrowthColumn(projection, col));

  const lastFilledOfRun = (startCol: number, startRow: number): TableArrowNavCell => {
    let col = startCol;
    let row = startRow;
    let last = { tableId: projection.tableId!, col, row };
    col += dx;
    row += dy;
    while (inLine(col, row) && !isBlankNavCell(projection, layout, evaluated, col, row)) {
      last = { tableId: projection.tableId!, col, row };
      col += dx;
      row += dy;
    }
    return last;
  };

  let col = from.col + dx;
  let row = from.row + dy;
  if (inLine(col, row) && !isBlankNavCell(projection, layout, evaluated, col, row)) {
    return lastFilledOfRun(col, row);
  }
  while (inLine(col, row)) {
    if (isBlankNavCell(projection, layout, evaluated, col, row)) {
      col += dx;
      row += dy;
      continue;
    }
    return { tableId: projection.tableId, col, row };
  }
  const end = axisEnd(projection, from.col, from.row, direction, confineToData);
  if (!end || sameNavCell(from, end)) return undefined;
  if (
    vertical &&
    isBlankNavCell(projection, layout, evaluated, end.col, end.row) &&
    !isGrowthColumn(projection, end.col)
  ) {
    return undefined;
  }
  return end;
}

/**
 * Ctrl+arrow: move to the next filled/blank phase change, always landing on the
 * filled side. Jumping blanks lands on the first following filled cell. If no
 * phase remains, go to the end of the table data (growth row is not a stop or a
 * table change); the next press (up/down only) enters the adjacent table.
 * `confineToData` keeps the walk inside this table's data cells (no Growth, no
 * other table) — Shift+Ctrl+arrow uses that to extend a Cell range.
 */
export function ctrlArrowNavTarget(
  tables: readonly SheetGridProjection[],
  from: TableArrowNavCell,
  direction: ArrowNavDirection,
  layout: WorkbookLayout,
  evaluated: ReadonlyMap<string, EvaluatedCell> = new Map(),
  options?: { confineToData?: boolean },
): TableArrowNavCell | undefined {
  const startIndex = tables.findIndex((table) => table.tableId === from.tableId);
  if (startIndex < 0) return undefined;
  const current = tables[startIndex];
  if (!current) return undefined;

  const hit = ctrlStepFrom(current, from, direction, layout, evaluated, options?.confineToData);
  if (hit) return hit;

  if (options?.confineToData || direction === "left" || direction === "right") return undefined;
  const next = tables[startIndex + (direction === "down" ? 1 : -1)];
  return next ? axisEntry(next, from.col, direction) : undefined;
}

function wrapToAdjacentRow(
  projection: SheetGridProjection,
  from: TableArrowNavCell,
  direction: ArrowNavDirection,
): TableArrowNavCell | undefined {
  if (!projection.tableId) return undefined;
  if (direction === "right") {
    if (from.col !== lastSelectableCol(projection, from.row)) return undefined;
    const nextRow = from.row + 1;
    if (nextRow >= projection.rowCount) return undefined;
    return cellAt(projection.tableId, firstSelectableCol(projection, nextRow), nextRow);
  }
  if (direction === "left") {
    if (from.col !== firstSelectableCol(projection, from.row)) return undefined;
    const prevRow = from.row - 1;
    if (prevRow < 0) return undefined;
    return cellAt(projection.tableId, lastSelectableCol(projection, prevRow), prevRow);
  }
  return undefined;
}

/**
 * Next selectable cell for an arrow key.
 * Right/left: next cell in that row (growth included, unused corners skipped),
 * else first/last cell of the next/previous row, else first/last cell of the
 * next/previous table. Up/down: next cell in the same column, else that column
 * in the next/previous table.
 */
export function adjacentTableArrowTarget(
  tables: readonly SheetGridProjection[],
  from: TableArrowNavCell,
  direction: ArrowNavDirection,
): TableArrowNavCell | undefined {
  const index = tables.findIndex((table) => table.tableId === from.tableId);
  if (index < 0) return undefined;
  const current = tables[index];
  if (!current) return undefined;

  const stepped = stepToNextCell(current, from, direction);
  if (stepped) return stepped;

  if (direction === "right" || direction === "left") {
    const wrapped = wrapToAdjacentRow(current, from, direction);
    if (wrapped) return wrapped;
  }

  const nextIndex = direction === "down" || direction === "right" ? index + 1 : index - 1;
  const target = tables[nextIndex];
  if (!target?.tableId) return undefined;

  if (direction === "down" || direction === "up") {
    const col = clampIndex(from.col, target.colCount);
    const row = direction === "down" ? firstSelectableRow(target, col) : lastSelectableRow(target, col);
    if (row === undefined) return undefined;
    return { tableId: target.tableId, col, row };
  }

  return direction === "right" ? firstHeaderCell(target) : lastGrowthRowCell(target);
}

export function focusAdjacentTable(
  session: WorkbookSession,
  tables: readonly SheetGridProjection[],
  from: TableArrowNavCell,
  direction: ArrowNavDirection,
  layout: WorkbookLayout,
  options: { ctrl?: boolean; evaluated?: ReadonlyMap<string, EvaluatedCell> } = {},
): TableArrowNavCell | undefined {
  const target = options.ctrl
    ? ctrlArrowNavTarget(tables, from, direction, layout, options.evaluated)
    : adjacentTableArrowTarget(tables, from, direction);
  if (!target) return undefined;
  const projection = tables.find((table) => table.tableId === target.tableId);
  if (!projection) return undefined;
  session.setGridFocus({ tableId: target.tableId, col: target.col, row: target.row });
  session.setSelection(selectionForProjectedCell(projection, layout, target.col, target.row));
  return target;
}
