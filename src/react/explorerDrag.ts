import type { WorkbookSession } from "../session/WorkbookSession.js";
import { requireTable } from "../model/structure.js";

export const EXPLORER_SHEET_DRAG = "application/x-wk-sheet-id";
export const EXPLORER_TABLE_DRAG = "application/x-wk-table-id";

export type ExplorerDropHint =
  | { placement: "before-sheet"; sheetId: string }
  | { placement: "after-sheet"; sheetId: string }
  | { placement: "append-tables"; sheetId: string }
  | { placement: "before-table"; sheetId: string; tableId: string };

export type ExplorerDragPayload = { kind: "sheet"; id: string } | { kind: "table"; id: string };

export function readExplorerDrag(dataTransfer: DataTransfer): { kind: "sheet"; id: string } | { kind: "table"; id: string } | null {
  const tableId = dataTransfer.getData(EXPLORER_TABLE_DRAG);
  if (tableId) return { kind: "table", id: tableId };
  const sheetId = dataTransfer.getData(EXPLORER_SHEET_DRAG);
  if (sheetId) return { kind: "sheet", id: sheetId };
  return null;
}

export function dropHintsEqual(a: ExplorerDropHint | null, b: ExplorerDropHint | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.placement !== b.placement) return false;
  if (a.placement === "before-table" && b.placement === "before-table") {
    return a.sheetId === b.sheetId && a.tableId === b.tableId;
  }
  return a.sheetId === b.sheetId;
}

export function dropHintForSheetRow(payload: ExplorerDragPayload, targetSheetId: string): ExplorerDropHint {
  if (payload.kind === "sheet") return { placement: "before-sheet", sheetId: targetSheetId };
  return { placement: "append-tables", sheetId: targetSheetId };
}

export function dropHintForTable(
  payload: ExplorerDragPayload,
  targetSheetId: string,
  targetTableId: string,
): ExplorerDropHint | null {
  if (payload.kind !== "table") return null;
  if (payload.id === targetTableId) return null;
  return { placement: "before-table", sheetId: targetSheetId, tableId: targetTableId };
}

export function dropHintAfterLastSheet(sheets: { id: string }[]): ExplorerDropHint | null {
  const last = sheets.at(-1);
  if (!last) return null;
  return { placement: "after-sheet", sheetId: last.id };
}

export function dropSheetOnSheet(session: WorkbookSession, draggedSheetId: string, targetSheetId: string) {
  const sheets = session.getSnapshot().sheets;
  const toIndex = sheets.findIndex((sheet) => sheet.id === targetSheetId);
  if (toIndex < 0) return;
  session.moveSheet(draggedSheetId, toIndex);
}

export function dropSheetAfterSheet(session: WorkbookSession, draggedSheetId: string, afterSheetId: string) {
  const sheets = session.getSnapshot().sheets;
  const afterIndex = sheets.findIndex((sheet) => sheet.id === afterSheetId);
  if (afterIndex < 0) return;
  session.moveSheet(draggedSheetId, afterIndex + 1);
}

export function dropTableOnSheet(session: WorkbookSession, draggedTableId: string, targetSheetId: string) {
  const sheet = session.getSnapshot().sheets.find((item) => item.id === targetSheetId);
  if (!sheet) return;
  session.moveTable(draggedTableId, targetSheetId, sheet.tableIds.length);
}

export function dropTableBeforeTable(
  session: WorkbookSession,
  draggedTableId: string,
  targetSheetId: string,
  targetTableId: string,
) {
  const sheet = session.getSnapshot().sheets.find((item) => item.id === targetSheetId);
  if (!sheet) return;
  const toIndex = sheet.tableIds.indexOf(targetTableId);
  if (toIndex < 0) return;
  session.moveTable(draggedTableId, targetSheetId, toIndex);
}

export function canDragTable(session: WorkbookSession, tableId: string): boolean {
  try {
    return !requireTable(session.getSnapshot(), tableId).locked;
  } catch {
    return false;
  }
}
