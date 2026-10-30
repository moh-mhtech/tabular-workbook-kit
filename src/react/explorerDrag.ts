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



export function writeExplorerDragData(dataTransfer: DataTransfer, payload: ExplorerDragPayload) {

  dataTransfer.setData("text/plain", `${payload.kind}:${payload.id}`);

  if (payload.kind === "sheet") dataTransfer.setData(EXPLORER_SHEET_DRAG, payload.id);

  else dataTransfer.setData(EXPLORER_TABLE_DRAG, payload.id);

  dataTransfer.effectAllowed = "move";

}



export function readExplorerDrag(dataTransfer: DataTransfer): { kind: "sheet"; id: string } | { kind: "table"; id: string } | null {

  const tableId = dataTransfer.getData(EXPLORER_TABLE_DRAG);

  if (tableId) return { kind: "table", id: tableId };

  const sheetId = dataTransfer.getData(EXPLORER_SHEET_DRAG);

  if (sheetId) return { kind: "sheet", id: sheetId };

  const plain = dataTransfer.getData("text/plain");

  if (plain.startsWith("table:")) return { kind: "table", id: plain.slice("table:".length) };

  if (plain.startsWith("sheet:")) return { kind: "sheet", id: plain.slice("sheet:".length) };

  return null;

}

export function readExplorerDragPayload(
  dataTransfer: DataTransfer,
  active: ExplorerDragPayload | null,
): ExplorerDragPayload | null {
  return readExplorerDrag(dataTransfer) ?? active;
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



export function dropHintBeforeSheet(payload: ExplorerDragPayload, targetSheetId: string): ExplorerDropHint | null {

  if (payload.kind !== "sheet") return null;

  return { placement: "before-sheet", sheetId: targetSheetId };

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

  if (payload.kind === "table") {

    if (payload.id === targetTableId) return null;

    return { placement: "before-table", sheetId: targetSheetId, tableId: targetTableId };

  }

  return dropHintBeforeSheet(payload, targetSheetId);

}

export type ExplorerRowBounds = { id: string; top: number; bottom: number };

/** Pick before-table or append from pointer Y and row midpoints (excluding the dragged row). */
export function closestTableDropHint(
  draggedTableId: string,
  sheetId: string,
  rows: ExplorerRowBounds[],
  pointerY: number,
): ExplorerDropHint {
  const ordered = rows.filter((row) => row.bottom > row.top);
  const visible = ordered.filter((row) => row.id !== draggedTableId);
  if (visible.length === 0) return { placement: "append-tables", sheetId };

  for (const row of visible) {
    const mid = (row.top + row.bottom) / 2;
    if (pointerY <= mid) {
      return { placement: "before-table", sheetId, tableId: row.id };
    }
  }
  return { placement: "append-tables", sheetId };
}

/** Pick before-sheet or after-sheet from pointer Y and sheet row midpoints. */
export function closestSheetDropHint(
  draggedSheetId: string,
  rows: ExplorerRowBounds[],
  pointerY: number,
): ExplorerDropHint {
  const ordered = rows.filter((row) => row.bottom > row.top);
  const visible = ordered.filter((row) => row.id !== draggedSheetId);
  if (visible.length === 0) {
    const last = ordered.at(-1);
    return last
      ? { placement: "after-sheet", sheetId: last.id }
      : { placement: "after-sheet", sheetId: draggedSheetId };
  }

  for (const row of visible) {
    const mid = (row.top + row.bottom) / 2;
    if (pointerY <= mid) {
      return { placement: "before-sheet", sheetId: row.id };
    }
  }
  const last = visible[visible.length - 1]!;
  return { placement: "after-sheet", sheetId: last.id };
}

export function readTableRowBounds(list: Element): ExplorerRowBounds[] {
  return [...list.querySelectorAll(":scope > li[data-explorer-table-id]")].flatMap((item) => {
    const id = item.getAttribute("data-explorer-table-id");
    if (!id) return [];
    const rect = item.getBoundingClientRect();
    return [{ id, top: rect.top, bottom: rect.bottom }];
  });
}

export function readSheetRowBounds(root: Element): ExplorerRowBounds[] {
  return [...root.querySelectorAll(".wk-explorer-group[data-explorer-sheet-id]")].flatMap((group) => {
    const id = group.getAttribute("data-explorer-sheet-id");
    const row = group.querySelector(".wk-explorer-sheet-row");
    if (!id || !row) return [];
    const rect = row.getBoundingClientRect();
    return [{ id, top: rect.top, bottom: rect.bottom }];
  });
}



export function dropHintAfterLastSheet(sheets: { id: string }[]): ExplorerDropHint | null {

  const last = sheets.at(-1);

  if (!last) return null;

  return { placement: "after-sheet", sheetId: last.id };

}



export function applyExplorerDropHint(
  session: WorkbookSession,
  payload: ExplorerDragPayload,
  hint: ExplorerDropHint,
) {
  switch (hint.placement) {
    case "before-sheet":
      if (payload.kind === "sheet") dropSheetOnSheet(session, payload.id, hint.sheetId);
      else dropTableOnSheet(session, payload.id, hint.sheetId);
      break;
    case "after-sheet":
      if (payload.kind === "sheet") dropSheetAfterSheet(session, payload.id, hint.sheetId);
      break;
    case "append-tables":
      if (payload.kind === "table") dropTableOnSheet(session, payload.id, hint.sheetId);
      else dropSheetOnSheet(session, payload.id, hint.sheetId);
      break;
    case "before-table":
      if (payload.kind === "table") dropTableBeforeTable(session, payload.id, hint.sheetId, hint.tableId);
      else dropSheetOnSheet(session, payload.id, hint.sheetId);
      break;
  }
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

    requireTable(session.getSnapshot(), tableId);

    return true;

  } catch {

    return false;

  }

}


