import type { WorkbookLayout } from "../model/layout.js";
import { projectedCell, type SheetGridProjection } from "../grid/sheetProjection.js";
import type { WorkbookSession } from "../session/WorkbookSession.js";
import {
  applyCustomGridEdits,
  rawGridValue,
  readProjectedRaw,
  type CustomGridEdit,
} from "./customGridInteractions.js";

export type PendingCellDisplay = Map<string, string>;

export function pendingCellDisplayKey(tableId: string, rowId: string, columnId: string): string {
  return `${tableId}\u001f${rowId}\u001f${columnId}`;
}

export function notePendingCellDisplay(
  pending: PendingCellDisplay,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  location: readonly [number, number],
  raw: string,
): void {
  const cell = projectedCell(projection, layout, location[0], location[1]);
  if (cell.kind !== "table" || cell.hit.kind !== "cell") return;
  pending.set(
    pendingCellDisplayKey(cell.hit.tableId, cell.hit.rowId, cell.hit.columnId),
    raw,
  );
}

export function projectedCellRawMatches(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
  raw: string,
): boolean {
  return readProjectedRaw(session, projection, layout, col, row) === raw;
}

/** Synchronous model commit for one projected cell (navigation stays on finish-edit). */
export function commitProjectedCellEdit(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  location: readonly [number, number],
  raw: string,
  pending?: PendingCellDisplay,
): number {
  const value = rawGridValue({ data: raw });
  if (projectedCellRawMatches(session, projection, layout, location[0], location[1], value)) {
    return 0;
  }
  const edits: CustomGridEdit[] = [{ location, value: { data: raw } }];
  const written = applyCustomGridEdits(session, projection, layout, edits);
  if (written && pending) notePendingCellDisplay(pending, projection, layout, location, value);
  return written;
}

export function filterRedundantGridEdits(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  edits: readonly CustomGridEdit[],
): CustomGridEdit[] {
  return edits.filter(({ location: [col, row], value }) => {
    const raw = rawGridValue(value);
    return !projectedCellRawMatches(session, projection, layout, col, row, raw);
  });
}
