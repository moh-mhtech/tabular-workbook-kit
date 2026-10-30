import type { Selection, TableSnapshot } from "./types.js";

/** Selection is on this table's grid (cell, row, column, growth, or corner) — not sheet/workbook/table object only. */
export function selectionAnchorsTable(tableId: string, selection: Selection | null): boolean {
  if (!selection) return false;
  switch (selection.kind) {
    case "cell":
    case "row":
    case "column":
    case "growth":
    case "corner":
      return selection.tableId === tableId;
    default:
      return false;
  }
}

/** Hidden tables stay collapsed unless the user is anchored on that table's grid. */
export function showTableGrid(table: TableSnapshot, selection: Selection | null): boolean {
  if (!table.hidden) return true;
  return selectionAnchorsTable(table.id, selection);
}
