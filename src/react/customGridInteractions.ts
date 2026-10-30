import { effectiveCell } from "../engine/compileWorkbook.js";
import { layoutWorkbook, type WorkbookLayout } from "../model/layout.js";
import { isCellSelection, type Selection, type WorkbookSnapshot } from "../model/types.js";
import type { WorkbookSession } from "../session/WorkbookSession.js";
import {
  cellAfterCommitMove,
  cellsInProjectedRange,
  projectTable,
  projectedCell,
  projectedLocationForRef,
  selectionForProjectedCell,
  type SheetGridProjection,
} from "../grid/sheetProjection.js";
import type { TableSnapshot } from "../model/types.js";
import { hasTimeColumns, visibleTimeColCount, writePeriodIds } from "../model/yearColumns.js";

export interface CustomGridEdit {
  location: readonly [number, number];
  value: { data?: unknown };
}

export interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FinishEditNavigationGate = { active: boolean };

export function movementToCommitDelta(
  movement: readonly [number, number],
): readonly [-1 | 0 | 1, -1 | 0 | 1] {
  return [
    movement[0] < 0 ? -1 : movement[0] > 0 ? 1 : 0,
    movement[1] < 0 ? -1 : movement[1] > 0 ? 1 : 0,
  ];
}

/**
 * Enter/Tab after an inline commit must move selection at most once. The grid may
 * invoke finish-edit twice; the second call must not navigate again.
 */
export function runFinishEditNavigation(
  gate: FinishEditNavigationGate,
  from: readonly [number, number] | undefined,
  movement: readonly [number, number],
  navigate: (from: readonly [number, number], delta: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void,
): boolean {
  const delta = movementToCommitDelta(movement);
  if (delta[0] === 0 && delta[1] === 0) return false;
  if (gate.active) return false;
  if (!from) return false;
  gate.active = true;
  const commitFrom = from;
  try {
    navigate(commitFrom, delta);
    return true;
  } finally {
    // Glide's overlay may invoke finish-edit again on setTimeout(0) after type-to-edit.
    setTimeout(() => {
      gate.active = false;
    }, 0);
  }
}

export function focusAfterCommitMove(
  session: WorkbookSession,
  tableId: string,
  from: readonly [number, number],
  movement: readonly [-1 | 0 | 1, -1 | 0 | 1],
): { location: readonly [number, number]; selection: Selection } | undefined {
  const layout = layoutWorkbook(session.getSnapshot());
  const projection = projectTable(layout, tableId);
  if (!projection) return undefined;
  const next = cellAfterCommitMove(projection, layout, from, movement);
  if (!next) return undefined;
  session.setGridFocus({ tableId, col: next.location[0], row: next.location[1] });
  session.setSelection(next.selection);
  return next;
}

export function moveSelectionAfterCommit(
  session: WorkbookSession,
  _snapshot: WorkbookSnapshot,
  movement: readonly [-1 | 0 | 1, -1 | 0 | 1],
): boolean {
  const selection = session.selection;
  if (!isCellSelection(selection)) return false;
  const layout = layoutWorkbook(session.getSnapshot());
  const projection = projectTable(layout, selection.tableId);
  if (!projection) return false;
  const from = projectedLocationForRef(projection, layout, selection);
  if (!from) return false;
  return Boolean(focusAfterCommitMove(session, selection.tableId, from, movement));
}

/** Copies a single typed value onto every data or growth cell in the range. */
export function expandEditAcrossRange(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  edits: readonly CustomGridEdit[],
  range?: GridRect,
): CustomGridEdit[] {
  if (!range || edits.length !== 1) return [...edits];
  const value = edits[0]!.value;
  const filled: CustomGridEdit[] = [];
  for (let row = range.y; row < range.y + range.height; row++) {
    for (let col = range.x; col < range.x + range.width; col++) {
      const projected = projectedCell(projection, layout, col, row);
      if (projected.kind === "readonly") continue;
      if (projected.kind === "table" && projected.hit.kind !== "cell") continue;
      filled.push({ location: [col, row], value });
    }
  }
  return filled.length ? filled : [...edits];
}

export function rawGridValue(value: { data?: unknown }): string {
  const data = value.data;
  if (data === null || data === undefined) return "";
  if (Array.isArray(data)) return data.join(", ");
  return String(data);
}

function liveTable(session: WorkbookSession, tableId: string) {
  return session.getSnapshot().tables.find((table) => table.id === tableId);
}

function tableIdForPaste(
  session: WorkbookSession,
  projection: SheetGridProjection,
  target: readonly [number, number],
): string | undefined {
  if (projection.tableId) return projection.tableId;
  const layout = layoutWorkbook(session.getSnapshot());
  const cell = projectedCell(projection, layout, target[0], target[1]);
  if (cell.kind === "table") return cell.hit.tableId;
  if (cell.kind === "extension") return cell.expansion.tableId;
  return undefined;
}

function lastWritableCol(table: TableSnapshot, periods: { year: number; month: number; id: string; label: string; index: number }[]): number {
  return table.attributeColumns.length + visibleTimeColCount(table, periods);
}

function growTableToFit(
  session: WorkbookSession,
  tableId: string,
  startCol: number,
  startRow: number,
  width: number,
  height: number,
) {
  const neededRows = Math.max(0, startRow + height - 1);
  while ((liveTable(session, tableId)?.rows.length ?? 0) < neededRows) {
    session.addRow(tableId);
  }
  const table = liveTable(session, tableId);
  if (!table || hasTimeColumns(table) || table.promoteRowKeys) return;
  const neededLastCol = startCol + width - 1;
  while (1 + (liveTable(session, tableId)?.attributeColumns.length ?? 0) <= neededLastCol) {
    session.addColumn(tableId);
  }
}

function selectPastedRange(
  session: WorkbookSession,
  tableId: string,
  startCol: number,
  startRow: number,
  width: number,
  height: number,
) {
  const layout = layoutWorkbook(session.getSnapshot());
  const next = projectTable(layout, tableId);
  if (!next) return;
  session.gridFocus = { tableId, col: startCol, row: startRow };
  const range = cellsInProjectedRange(next, layout, { x: startCol, y: startRow, width, height });
  const origin = selectionForProjectedCell(next, layout, startCol, startRow);
  if (origin.kind === "cell") {
    session.setSelection(range.length ? { ...origin, range } : origin);
  } else if (range[0]) {
    session.setSelection({ kind: "cell", ...range[0], range });
  }
}

/** Grows the table so a pasted block fits, then writes it as one undo step. */
export function applyCustomGridPaste(
  session: WorkbookSession,
  projection: SheetGridProjection,
  target: readonly [number, number],
  values: readonly (readonly string[])[],
): number {
  const tableId = tableIdForPaste(session, projection, target);
  if (!tableId || !values.length) return 0;
  const height = values.length;
  const width = values.reduce((max, row) => Math.max(max, row.length), 0);
  if (!width) return 0;
  const [startCol, startRow] = target;
  let written = 0;
  session.transact(() => {
    growTableToFit(session, tableId, startCol, startRow, width, height);
    const table = liveTable(session, tableId);
    if (!table) return;
    const lastCol = lastWritableCol(table, layoutWorkbook(session.getSnapshot()).periods);
    const lastRow = table.rows.length;
    for (let row = 0; row < values.length; row++) {
      const line = values[row]!;
      const gridRow = startRow + row;
      if (gridRow > lastRow) continue;
      for (let col = 0; col < line.length; col++) {
        const gridCol = startCol + col;
        if (gridCol > lastCol) continue;
        session.writeGridCell(
          projection.sheetId,
          gridRow + projection.originRow,
          gridCol + projection.originCol,
          line[col] ?? "",
        );
        written += 1;
      }
    }
  });
  selectPastedRange(session, tableId, startCol, startRow, width, height);
  return written;
}

/**
 * Applies a Glide edit batch as one session transaction. Coordinates outside
 * table cells and their direct growth margins are intentionally discarded.
 */
export function applyCustomGridEdits(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  edits: readonly CustomGridEdit[],
): number {
  const accepted = edits.filter(({ location: [col, row] }) => {
    return projectedCell(projection, layout, col, row).kind !== "readonly";
  });
  if (!accepted.length) return 0;

  session.transact(() => {
    for (const edit of accepted) {
      const [col, row] = edit.location;
      session.writeGridCell(
        projection.sheetId,
        row + projection.originRow,
        col + projection.originCol,
        rawGridValue(edit.value),
      );
    }
  });
  return accepted.length;
}

export function applyCustomGridClear(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  rect: GridRect,
): number {
  const edits: CustomGridEdit[] = [];
  for (let row = rect.y; row < rect.y + rect.height; row++) {
    for (let col = rect.x; col < rect.x + rect.width; col++) {
      edits.push({ location: [col, row], value: { data: "" } });
    }
  }
  return applyCustomGridEdits(session, projection, layout, edits);
}

/** Copies the source rectangle into the destination, wrapping like Excel's fill handle. */
export function applyCustomGridFill(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  patternSource: GridRect,
  fillDestination: GridRect,
): number {
  const edits: CustomGridEdit[] = [];
  for (let row = fillDestination.y; row < fillDestination.y + fillDestination.height; row++) {
    for (let col = fillDestination.x; col < fillDestination.x + fillDestination.width; col++) {
      const srcCol =
        patternSource.x +
        ((((col - patternSource.x) % patternSource.width) + patternSource.width) % patternSource.width);
      const srcRow =
        patternSource.y +
        ((((row - patternSource.y) % patternSource.height) + patternSource.height) % patternSource.height);
      edits.push({
        location: [col, row],
        value: { data: readProjectedRaw(session, projection, layout, srcCol, srcRow) },
      });
    }
  }
  return applyCustomGridEdits(session, projection, layout, edits);
}

export function readProjectedRaw(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): string {
  const cell = projectedCell(projection, layout, col, row);
  if (cell.kind !== "table") return "";
  const table = layout.tables.get(cell.hit.tableId);
  if (!table) return "";
  const hit = cell.hit;
  if (hit.kind === "header") {
    return (
      projection.columns.find((column) => column.id === hit.columnId)?.title ||
      table.columns.find((column) => column.id === hit.columnId)?.name ||
      ""
    );
  }
  if (hit.kind === "key") {
    return table.table.rows.find((candidate) => candidate.id === hit.rowId)?.key ?? "";
  }
  const ids = writePeriodIds(table.table, hit.columnId, layout.periods);
  const sources = ids.map((id) => effectiveCell(session.getSnapshot(), hit.tableId, hit.rowId, id));
  const formulas = sources.filter((item) => item.kind === "formula").map((item) => item.formula ?? "");
  if (formulas.length && formulas.every((item) => item === formulas[0])) return formulas[0] ?? "";
  if (formulas.length) return formulas[0] ?? "";
  const numbers = sources.map((item) => item.value).filter((value): value is number => typeof value === "number");
  if (ids.length > 1 && numbers.length) return String(numbers.reduce((sum, value) => sum + value, 0));
  const source = sources[0];
  if (!source || source.value === null || source.value === undefined) return "";
  return String(source.value);
}

