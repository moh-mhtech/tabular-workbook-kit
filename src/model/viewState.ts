import { requireTable } from "./structure.js";
import { KEY_COLUMN_ID } from "./types.js";
import type { Selection, WorkbookSnapshot, WorkbookViewSnapshot } from "./types.js";

export function stripViewFromSnapshot(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  const { view: _view, ...rest } = snapshot;
  return rest as WorkbookSnapshot;
}

export function shouldPersistView(snapshot: WorkbookSnapshot, view: WorkbookViewSnapshot): boolean {
  const defaults = resolvePersistedView(snapshot, undefined);
  return (
    view.activeSheetId !== defaults.activeSheetId ||
    view.selection !== null ||
    view.explorerPinned === false ||
    view.propertiesPinned === false
  );
}

export function attachViewToSnapshot(snapshot: WorkbookSnapshot, view: WorkbookViewSnapshot): WorkbookSnapshot {
  const doc = stripViewFromSnapshot(snapshot);
  return shouldPersistView(doc, view) ? { ...doc, view } : doc;
}

export function resolvePersistedView(
  snapshot: WorkbookSnapshot,
  view: WorkbookViewSnapshot | undefined,
): WorkbookViewSnapshot {
  const firstSheetId = snapshot.sheets[0]?.id ?? "";
  let activeSheetId = view?.activeSheetId ?? firstSheetId;
  if (!snapshot.sheets.some((sheet) => sheet.id === activeSheetId)) {
    activeSheetId = firstSheetId;
  }
  const selection = sanitizeSelection(snapshot, view?.selection ?? null);
  const explorerPinned = view?.explorerPinned !== false;
  const propertiesPinned = view?.propertiesPinned !== false;
  return {
    activeSheetId,
    selection,
    ...(explorerPinned ? {} : { explorerPinned: false as const }),
    ...(propertiesPinned ? {} : { propertiesPinned: false as const }),
  };
}

export function sanitizeSelection(snapshot: WorkbookSnapshot, selection: Selection | null): Selection | null {
  if (!selection) return null;
  switch (selection.kind) {
    case "workbook":
      return selection;
    case "sheet": {
      if (!snapshot.sheets.some((sheet) => sheet.id === selection.sheetId)) return null;
      return selection;
    }
    case "table":
    case "corner":
      return tableSelection(snapshot, selection.tableId, selection.kind);
    case "column":
      return columnSelection(snapshot, selection.tableId, selection.columnId)
        ? selection
        : tableSelection(snapshot, selection.tableId, "table");
    case "row":
      return rowSelection(snapshot, selection.tableId, selection.rowId)
        ? selection
        : tableSelection(snapshot, selection.tableId, "table");
    case "growth":
      return tableSelection(snapshot, selection.tableId, "table");
    case "cell": {
      const primary = cellRefValid(snapshot, selection);
      if (!primary) return tableSelection(snapshot, selection.tableId, "table");
      const range = selection.range?.filter((ref) => cellRefValid(snapshot, ref));
      if (!range?.length) {
        return { kind: "cell", tableId: selection.tableId, rowId: selection.rowId, columnId: selection.columnId };
      }
      return { ...selection, range };
    }
  }
}

function tableSelection(
  snapshot: WorkbookSnapshot,
  tableId: string,
  kind: "table" | "corner",
): Selection | null {
  try {
    requireTable(snapshot, tableId);
    return { kind, tableId };
  } catch {
    return null;
  }
}

function columnSelection(snapshot: WorkbookSnapshot, tableId: string, columnId: string): boolean {
  try {
    const table = requireTable(snapshot, tableId);
    if (columnId === KEY_COLUMN_ID) return true;
    if (table.attributeColumns.some((col) => col.id === columnId || col.name === columnId)) return true;
    return table.rows.some((row) => columnId in row.cells);
  } catch {
    return false;
  }
}

function rowSelection(snapshot: WorkbookSnapshot, tableId: string, rowId: string): boolean {
  try {
    const table = requireTable(snapshot, tableId);
    return table.rows.some((row) => row.id === rowId) || rowId === "__header__";
  } catch {
    return false;
  }
}

function cellRefValid(snapshot: WorkbookSnapshot, ref: { tableId: string; rowId: string; columnId: string }): boolean {
  if (!rowSelection(snapshot, ref.tableId, ref.rowId)) return false;
  return columnSelection(snapshot, ref.tableId, ref.columnId);
}
