import type { ICellData, IObjectMatrixPrimitiveType } from "@univerjs/core";
import { definedNameRefs, snapshotToUniverData } from "./compileWorkbook.js";
import { canRegisterDefinedName } from "../model/names.js";
import type { SheetView } from "../model/sheetView.js";
import type { WorkbookSnapshot } from "../model/types.js";

export interface ViewRange {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

/**
 * One step of moving a mounted Univer unit toward the snapshot. `rebuild` is the
 * escape hatch for changes the view cannot absorb in place, and never appears
 * alongside other ops.
 */
export type ViewOp =
  | { kind: "rebuild" }
  | { kind: "rowCount"; sheetId: string; rowCount: number }
  | { kind: "colCount"; sheetId: string; colCount: number }
  | { kind: "cell"; sheetId: string; row: number; col: number; cell: ICellData | null }
  | { kind: "tableAdd"; sheetId: string; tableId: string; name: string; range: ViewRange }
  | { kind: "tableRange"; sheetId: string; tableId: string; range: ViewRange }
  | { kind: "tableName"; sheetId: string; tableId: string; name: string }
  | { kind: "tableRemove"; sheetId: string; tableId: string }
  | { kind: "nameAdd"; name: string; ref: string }
  | { kind: "nameRemove"; name: string };

type CellMatrix = IObjectMatrixPrimitiveType<ICellData> | undefined;

export function diffWorkbook(prev: WorkbookSnapshot, next: WorkbookSnapshot): ViewOp[] {
  const before = snapshotToUniverData(prev);
  const after = snapshotToUniverData(next);
  // Sheet names are baked into compiled refs, and Univer rewrites formulas of its
  // own accord when a sheet is renamed, so identity changes start over instead.
  if (sheetIdentity(before.layout.sheets) !== sheetIdentity(after.layout.sheets)) {
    return [{ kind: "rebuild" }];
  }

  const extent: ViewOp[] = [];
  const cells: ViewOp[] = [];
  const tables: ViewOp[] = [];

  for (const view of after.layout.sheets) {
    const sheetId = view.sheetId;
    const was = before.data.sheets[sheetId] ?? {};
    const is = after.data.sheets[sheetId] ?? {};
    if (is.rowCount !== was.rowCount && is.rowCount !== undefined) {
      extent.push({ kind: "rowCount", sheetId, rowCount: is.rowCount });
    }
    if (is.columnCount !== was.columnCount && is.columnCount !== undefined) {
      extent.push({ kind: "colCount", sheetId, colCount: is.columnCount });
    }
    cells.push(...diffCells(sheetId, was.cellData, is.cellData));
    tables.push(
      ...diffTables(
        sheetId,
        bandsOf(before.layout.sheets.find((s) => s.sheetId === sheetId), prev),
        bandsOf(view, next),
      ),
    );
  }

  return [...extent, ...cells, ...tables, ...diffNames(prev, next)];
}

function sheetIdentity(views: SheetView[]): string {
  return views.map((v) => `${v.sheetId}\u001f${v.sheetName}`).join("\u001e");
}

function diffCells(sheetId: string, was: CellMatrix, is: CellMatrix): ViewOp[] {
  const ops: ViewOp[] = [];
  for (const row of union(was, is)) {
    const wasRow = was?.[row] ?? {};
    const isRow = is?.[row] ?? {};
    for (const col of union(wasRow, isRow)) {
      const left = wasRow[col];
      const right = isRow[col];
      if (JSON.stringify(left ?? null) === JSON.stringify(right ?? null)) continue;
      ops.push({ kind: "cell", sheetId, row, col, cell: right ?? null });
    }
  }
  return ops;
}

function union(a: object | undefined, b: object | undefined): number[] {
  const keys = new Set<number>();
  for (const key of Object.keys(a ?? {})) keys.add(Number(key));
  for (const key of Object.keys(b ?? {})) keys.add(Number(key));
  return [...keys].sort((x, y) => x - y);
}

function bandsOf(
  view: SheetView | undefined,
  snapshot: WorkbookSnapshot,
): Map<string, { name: string; range: ViewRange }> {
  const out = new Map<string, { name: string; range: ViewRange }>();
  for (const band of view?.bands ?? []) {
    const table = snapshot.tables.find((t) => t.id === band.tableId);
    if (!table) continue;
    out.set(band.tableId, {
      name: table.name,
      range: {
        startRow: band.headerRow,
        startColumn: band.startCol,
        endRow: band.headerRow + band.rowCount - 1,
        endColumn: band.startCol + band.colCount - 1,
      },
    });
  }
  return out;
}

function diffTables(
  sheetId: string,
  was: Map<string, { name: string; range: ViewRange }>,
  is: Map<string, { name: string; range: ViewRange }>,
): ViewOp[] {
  const ops: ViewOp[] = [];
  for (const tableId of was.keys()) {
    if (!is.has(tableId)) ops.push({ kind: "tableRemove", sheetId, tableId });
  }
  for (const [tableId, band] of is) {
    const before = was.get(tableId);
    if (!before) {
      ops.push({ kind: "tableAdd", sheetId, tableId, name: band.name, range: band.range });
      continue;
    }
    if (!sameRange(before.range, band.range)) {
      ops.push({ kind: "tableRange", sheetId, tableId, range: band.range });
    }
    if (before.name !== band.name) {
      ops.push({ kind: "tableName", sheetId, tableId, name: band.name });
    }
  }
  return ops;
}

function sameRange(a: ViewRange, b: ViewRange): boolean {
  return (
    a.startRow === b.startRow &&
    a.startColumn === b.startColumn &&
    a.endRow === b.endRow &&
    a.endColumn === b.endColumn
  );
}

function diffNames(prev: WorkbookSnapshot, next: WorkbookSnapshot): ViewOp[] {
  const was = registrable(prev);
  const is = registrable(next);
  const ops: ViewOp[] = [];
  for (const name of was.keys()) {
    if (!is.has(name)) ops.push({ kind: "nameRemove", name });
  }
  for (const [name, ref] of is) {
    const before = was.get(name);
    if (before === ref) continue;
    if (before !== undefined) ops.push({ kind: "nameRemove", name });
    ops.push({ kind: "nameAdd", name, ref });
  }
  return ops;
}

function registrable(snapshot: WorkbookSnapshot): Map<string, string> {
  return new Map(
    definedNameRefs(snapshot)
      .filter((item) => canRegisterDefinedName(item.name))
      .map((item) => [item.name, item.ref] as const),
  );
}
