import {
  acceptTableGridSelection,
  projectedCell,
  selectionForProjectedCell,
  type SheetGridProjection,
} from "../grid/sheetProjection.js";
import type { WorkbookLayout } from "../model/layout.js";
import { canRegisterDefinedName, getCellName } from "../model/names.js";
import type { WorkbookSession } from "../session/WorkbookSession.js";

export type OverlayNavMode = "cells" | "text";

export type OverlayKeyAction = "toggle-text" | "point-cell" | "caret" | "formula-operator";

export type PointedRefSpan = { start: number; end: number };

export type PointedGridCell = { tableId: string; col: number; row: number };

/**
 * Vocabulary for formula pointing:
 * - Edit cell: the cell whose formula is open.
 * - Formula text: the draft string in the editor.
 * - Formula ref: one complete reference token in the formula text.
 * - Active formula ref: the formula ref under the caret/selection, or none.
 * - Target cell: the grid cell currently chosen for the active formula ref.
 * - Target origin: where the next arrow walk starts (target cell, else edit cell).
 */
export const FORMULA_OPERATORS = new Set(["+", "-", "*", "/", "^", "&", ",", "(", ")", ":", "%"]);

export function isFormulaOperatorKey(key: string): boolean {
  return FORMULA_OPERATORS.has(key);
}

export function toggleOverlayNavMode(mode: OverlayNavMode): OverlayNavMode {
  return mode === "cells" ? "text" : "cells";
}

export function commitKeyMovement(event: {
  key: string;
  shiftKey?: boolean;
}): readonly [-1 | 0 | 1, -1 | 0 | 1] | undefined {
  if (event.key === "Enter" && !event.shiftKey) return [0, 1];
  if (event.key === "Tab") return [event.shiftKey ? -1 : 1, 0];
  return undefined;
}

export function overlayArrowMovement(key: string): readonly [-1 | 0 | 1, -1 | 0 | 1] | undefined {
  switch (key) {
    case "ArrowUp":
      return [0, -1];
    case "ArrowDown":
      return [0, 1];
    case "ArrowLeft":
      return [-1, 0];
    case "ArrowRight":
      return [1, 0];
    default:
      return undefined;
  }
}

export function overlayKeyAction(
  mode: OverlayNavMode,
  event: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
): OverlayKeyAction {
  if (event.key === "F2") return "toggle-text";
  if (
    mode === "cells" &&
    overlayArrowMovement(event.key) &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    return "point-cell";
  }
  if (isFormulaOperatorKey(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return "formula-operator";
  }
  return "caret";
}

export function canPointFromDraft(draft: string): boolean {
  return draft.trimStart().startsWith("=");
}

const FORMULA_REF =
  /(?:[A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*\.)?[A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*\[[^\]]+\](?:\[[^\]]+\])?|\[[^\]]+\](?:\[[^\]]+\])?|[A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*(?!\s*\()/g;

export function formulaRefSpans(draft: string): PointedRefSpan[] {
  FORMULA_REF.lastIndex = 0;
  return Array.from(draft.matchAll(FORMULA_REF), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function cursorFormulaRef(
  draft: string,
  selectionStart: number,
  selectionEnd: number,
): PointedRefSpan | null {
  const refs = formulaRefSpans(draft);
  if (selectionStart !== selectionEnd) {
    return refs.find((span) => span.start === selectionStart && span.end === selectionEnd) ?? null;
  }
  if (selectionStart === 0) return null;
  return refs.find((span) => span.start <= selectionStart - 1 && selectionStart - 1 < span.end) ?? null;
}

export function activeFormulaRefKey(span: PointedRefSpan | null, draft: string): string | null {
  return span ? `${span.start}:${span.end}:${draft.slice(span.start, span.end)}` : null;
}

export function applyFormulaOperator(
  draft: string,
  activeRef: PointedRefSpan | null,
  selectionStart: number,
  selectionEnd: number,
  operator: string,
): { draft: string; caret: number } {
  if (activeRef) {
    const next = draft.slice(0, activeRef.end) + operator + draft.slice(activeRef.end);
    return { draft: next, caret: activeRef.end + operator.length };
  }
  const next = draft.slice(0, selectionStart) + operator + draft.slice(selectionEnd);
  return { draft: next, caret: selectionStart + operator.length };
}

export function pointingReplaceSpan(
  draft: string,
  selectionStart: number,
  selectionEnd: number,
): PointedRefSpan {
  return (
    cursorFormulaRef(draft, selectionStart, selectionEnd) ?? {
      start: selectionStart,
      end: selectionEnd,
    }
  );
}

export function applyPointedRef(
  draft: string,
  span: PointedRefSpan | null,
  ref: string,
  caret = draft.length,
): { draft: string; span: PointedRefSpan } {
  if (!draft.trim().startsWith("=")) {
    return { draft: `=${ref}`, span: { start: 1, end: 1 + ref.length } };
  }
  const start = span?.start ?? caret;
  const end = span?.end ?? caret;
  const next = draft.slice(0, start) + ref + draft.slice(end);
  return { draft: next, span: { start, end: start + ref.length } };
}

export function isSpreadsheetPointEvent(event: { target: EventTarget | null }): boolean {
  const target = event.target;
  if (!target || typeof target !== "object") return false;
  const node = target as { closest?: (selector: string) => unknown };
  return typeof node.closest === "function" && Boolean(node.closest(".wk-table-spreadsheet, #portal"));
}

export function formulaRefForProjectedCell(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): string | undefined {
  const cell = projectedCell(projection, layout, col, row);
  if (cell.kind !== "table" || cell.hit.kind !== "cell") return undefined;
  const named = getCellName(layout, cell.hit.tableId, cell.hit.rowId, cell.hit.columnId);
  return named.defined && canRegisterDefinedName(named.defined) ? named.defined : named.structured;
}

export function nextPointableCell(
  from: readonly [number, number],
  movement: readonly [-1 | 0 | 1, -1 | 0 | 1],
  projection: SheetGridProjection,
  layout: WorkbookLayout,
): { location: readonly [number, number]; ref: string } | undefined {
  let col = from[0] + movement[0];
  let row = from[1] + movement[1];
  while (col >= 0 && row >= 0 && col < projection.colCount && row < projection.rowCount) {
    const ref = formulaRefForProjectedCell(projection, layout, col, row);
    if (ref) return { location: [col, row], ref };
    col += movement[0];
    row += movement[1];
  }
  return undefined;
}

export function commitLiteralEditAndSelect(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): boolean {
  const edit = session.formulaEdit;
  if (!edit || canPointFromDraft(edit.draft)) return false;
  session.commitFormulaEdit();
  if (!projection.tableId || !acceptTableGridSelection(projection, [col, row])) return true;
  session.setGridFocus({ tableId: projection.tableId, col, row });
  session.setSelection(selectionForProjectedCell(projection, layout, col, row));
  return true;
}

export function pointAtProjectedCell(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): boolean {
  if (!session.formulaEdit || !projection.tableId) return false;
  const ref = formulaRefForProjectedCell(projection, layout, col, row);
  if (!ref) return false;
  session.pointFormulaRef(ref, { tableId: projection.tableId, col, row });
  return true;
}

export function targetWalkStart(
  session: WorkbookSession,
  fallback: readonly [number, number],
  projection: SheetGridProjection,
): readonly [number, number] {
  const edit = session.formulaEdit;
  const usable = (cell: { tableId: string; col: number; row: number } | undefined) =>
    cell && (!projection.tableId || cell.tableId === projection.tableId)
      ? ([cell.col, cell.row] as const)
      : undefined;
  if (edit?.activeFormulaRef) {
    return usable(edit.targetCell) ?? usable(edit.editCell) ?? fallback;
  }
  return usable(edit?.editCell) ?? fallback;
}

export function pointFromArrow(
  session: WorkbookSession,
  from: readonly [number, number],
  movement: readonly [-1 | 0 | 1, -1 | 0 | 1],
  projection: SheetGridProjection,
  layout: WorkbookLayout,
): { location: readonly [number, number]; ref: string } | undefined {
  const pointed = nextPointableCell(targetWalkStart(session, from, projection), movement, projection, layout);
  if (!pointed) return undefined;
  if (!pointAtProjectedCell(session, projection, layout, pointed.location[0], pointed.location[1])) {
    return undefined;
  }
  return pointed;
}
