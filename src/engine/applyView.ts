import type { ICellData } from "@univerjs/core";
import type { ViewOp, ViewRange } from "./reconcile.js";

/**
 * Univer mutation ids. They are spelled out rather than imported from
 * `@univerjs/sheets`, which is not a direct dependency and resolves to a second
 * copy of the package that the running instance would not share.
 */
const SET_RANGE_VALUES = "sheet.mutation.set-range-values";
const SET_ROW_COUNT = "sheet.mutation.set-worksheet-row-count";
const SET_COLUMN_COUNT = "sheet.mutation.set-worksheet-column-count";

export interface ViewSheet {
  addTable(name: string, range: ViewRange, tableId: string): Promise<boolean> | boolean;
  setTableRange(tableId: string, range: ViewRange): Promise<boolean>;
  setTableName(tableId: string, name: string): Promise<boolean> | boolean;
  removeTable(tableId: string): Promise<boolean>;
}

export interface ViewWorkbook {
  getId(): string;
  getSheetBySheetId(sheetId: string): ViewSheet | null | undefined;
  insertDefinedName(name: string, ref: string): unknown;
  deleteDefinedName(name: string): unknown;
}

export interface ViewCommands {
  syncExecuteCommand(id: string, params: Record<string, unknown>): unknown;
}

type CellPatch = Record<number, Record<number, ICellData | null>>;

function patchOf(patches: Map<string, CellPatch>, sheetId: string): CellPatch {
  const existing = patches.get(sheetId);
  if (existing) return existing;
  const created: CellPatch = {};
  patches.set(sheetId, created);
  return created;
}

function put(patch: CellPatch, row: number, col: number, cell: ICellData | null) {
  patch[row] ??= {};
  patch[row][col] = cell;
}

/**
 * Moves a mounted Univer unit onto the ops from `diffWorkbook`.
 *
 * Cells and sheet extents go through Univer mutations rather than the Facade's
 * commands: mutations still drive the skeleton and the formula engine, but they
 * push nothing onto the undo stack, which the WorkbookSession owns instead.
 */
export async function applyViewOps(
  commands: ViewCommands,
  workbook: ViewWorkbook,
  ops: ViewOp[],
): Promise<void> {
  const unitId = workbook.getId();

  // Extents move first: a write only ever lands inside the new bounds, and a
  // clear is a delete that does not care whether the row still exists.
  for (const op of ops) {
    if (op.kind === "rowCount") {
      commands.syncExecuteCommand(SET_ROW_COUNT, { unitId, subUnitId: op.sheetId, rowCount: op.rowCount });
    }
    if (op.kind === "colCount") {
      commands.syncExecuteCommand(SET_COLUMN_COUNT, { unitId, subUnitId: op.sheetId, columnCount: op.colCount });
    }
  }

  // Univer merges incoming keys into the existing cell, so a formula that became
  // a plain value would keep its old `f`. Deleting first makes every write a
  // replacement; both passes land in one frame, so nothing flickers.
  const clears = new Map<string, CellPatch>();
  const writes = new Map<string, CellPatch>();
  for (const op of ops) {
    if (op.kind !== "cell") continue;
    put(patchOf(clears, op.sheetId), op.row, op.col, null);
    if (op.cell) put(patchOf(writes, op.sheetId), op.row, op.col, op.cell);
  }
  for (const [subUnitId, cellValue] of clears) {
    commands.syncExecuteCommand(SET_RANGE_VALUES, { unitId, subUnitId, cellValue });
  }
  for (const [subUnitId, cellValue] of writes) {
    commands.syncExecuteCommand(SET_RANGE_VALUES, { unitId, subUnitId, cellValue });
  }

  for (const op of ops) {
    if (op.kind === "nameRemove") workbook.deleteDefinedName(op.name);
    if (op.kind === "nameAdd") {
      try {
        workbook.insertDefinedName(op.name, op.ref);
      } catch {
        /* structured refs still evaluate */
      }
    }
  }

  for (const op of ops) {
    if (!("tableId" in op)) continue;
    const sheet = workbook.getSheetBySheetId(op.sheetId);
    if (!sheet) continue;
    try {
      if (op.kind === "tableRemove") await sheet.removeTable(op.tableId);
      if (op.kind === "tableAdd") await sheet.addTable(op.name, op.range, op.tableId);
      if (op.kind === "tableRange") await sheet.setTableRange(op.tableId, op.range);
      if (op.kind === "tableName") await sheet.setTableName(op.tableId, op.name);
    } catch {
      /* bands still show as grid cells */
    }
  }
}
