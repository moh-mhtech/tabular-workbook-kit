import {
  acceptTableGridSelection,
  projectedCell,
  selectionForProjectedCell,
  type SheetGridProjection,
} from "../grid/sheetProjection.js";
import type { WorkbookLayout } from "../model/layout.js";
import { applyFormulaRefLockCycle, type FormulaRefLockContext } from "../formula/formulaRefLock.js";
import { formulaRefSpans, type FormulaRefSpan } from "../formula/formulaRefs.js";
import { getCellName } from "../model/names.js";
import { KEY_COLUMN_ID } from "../model/types.js";
import type { WorkbookSession } from "../session/WorkbookSession.js";

export type FormulaEditMode = "enter" | "edit" | "point";
export type OverlayNavMode = FormulaEditMode;

export type OverlayKeyAction =
  | "toggle-text"
  | "toggle-mode"
  | "point-cell"
  | "extend-range"
  | "commit-move"
  | "hide-suggest"
  | "move-suggest"
  | "pick-suggest"
  | "cancel"
  | "caret"
  | "formula-operator"
  | "cycle-lock";

export type PointedRefSpan = FormulaRefSpan;

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
  return mode === "edit" ? "enter" : "edit";
}

export type OverlayActivation = "double-click" | "f2" | "type" | "enter-key";

/** Excel: double-click and F2 start Edit (arrows move the Caret); typing or Enter starts Enter. */
export function overlayModeForActivation(activation: OverlayActivation): OverlayNavMode {
  return activation === "double-click" || activation === "f2" ? "edit" : "enter";
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

export function formulaKeyAction(
  mode: FormulaEditMode,
  event: { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  opts: { suggestVisible: boolean; isFormula: boolean },
): OverlayKeyAction {
  if (event.key === "Escape") return opts.suggestVisible ? "hide-suggest" : "cancel";
  if (opts.suggestVisible && mode !== "point" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    return "move-suggest";
  }
  if (opts.suggestVisible && event.key === "Tab") return "pick-suggest";
  if (opts.suggestVisible && event.key === "Enter" && !event.shiftKey) return "pick-suggest";
  if (opts.suggestVisible && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    return formulaKeyAction(mode, event, { ...opts, suggestVisible: false });
  }
  if (event.key === "F2") return "toggle-mode";
  if (event.key === "F4" && opts.isFormula) return "cycle-lock";
  const modified = Boolean(event.altKey || event.ctrlKey || event.metaKey);
  const arrow = overlayArrowMovement(event.key);
  if (arrow && !modified) {
    if (opts.isFormula && (mode === "enter" || mode === "point")) {
      return event.shiftKey ? "extend-range" : "point-cell";
    }
    if (!opts.isFormula && mode === "enter" && !event.shiftKey) return "commit-move";
    return "caret";
  }
  if (isFormulaOperatorKey(event.key) && !modified && mode === "point") return "formula-operator";
  if (commitKeyMovement(event)) return "commit-move";
  return "caret";
}

export function overlayKeyAction(
  mode: OverlayNavMode,
  event: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
): OverlayKeyAction {
  const action = formulaKeyAction(mode, event, { suggestVisible: false, isFormula: true });
  return action === "toggle-mode" ? "toggle-text" : action;
}

export function canPointFromDraft(draft: string): boolean {
  return draft.trimStart().startsWith("=");
}

export function isValidInsertPoint(draft: string, caret: number): boolean {
  if (!canPointFromDraft(draft)) return false;
  const before = draft.slice(0, caret);
  if (before.endsWith("=") || /[+\-*/^&,(]$/.test(before)) return true;
  return cursorFormulaRef(draft, caret, caret) !== null;
}

export function canPointClick(mode: FormulaEditMode | undefined, draft: string, caret: number): boolean {
  if (!canPointFromDraft(draft)) return false;
  if (!mode || mode === "enter" || mode === "point") return true;
  return isValidInsertPoint(draft, caret);
}

export { formulaRefSpans };

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

export function formulaRefLockContext(
  layout: WorkbookLayout,
  projection: SheetGridProjection,
  edit: FormulaRefEditOrigin,
  target: FormulaRefEditOrigin,
): FormulaRefLockContext | null {
  const names = structuredNamesAt(layout, projection, target.col, target.row);
  if (!names) return null;
  return {
    columnName: names.columnName,
    rowKey: names.rowKey,
    sameColumn: edit.tableId === target.tableId && edit.col === target.col,
    sameRow: edit.tableId === target.tableId && edit.row === target.row,
  };
}

function structuredNamesAt(
  layout: WorkbookLayout,
  projection: SheetGridProjection,
  col: number,
  row: number,
): { columnName: string; rowKey: string } | null {
  const cell = projectedCell(projection, layout, col, row);
  if (cell.kind !== "table" || cell.hit.kind !== "cell") return null;
  const named = getCellName(layout, cell.hit.tableId, cell.hit.rowId, cell.hit.columnId);
  const match = named.structured.match(/\[([^\]]+)\]\[([^\]]+)\]/);
  if (!match) return null;
  return { columnName: match[1]!, rowKey: match[2]! };
}

export function cycleActiveFormulaRef(
  session: WorkbookSession,
  draft: string,
  layout: WorkbookLayout,
  projection: SheetGridProjection | null,
): { draft: string; start: number; end: number } | null {
  const edit = session.formulaEdit;
  if (!edit) return null;
  const span =
    edit.activeFormulaRef ??
    cursorFormulaRef(
      draft,
      edit.selectionStart ?? draft.length,
      edit.selectionEnd ?? edit.selectionStart ?? draft.length,
    );
  const ctx =
    projection && edit.editCell
      ? formulaRefLockContext(layout, projection, edit.editCell, edit.targetCell ?? edit.editCell)
      : null;
  return applyFormulaRefLockCycle(draft, span, ctx);
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

export function isFormulaEditOutsideClick(
  event: { target: EventTarget | null },
  session: WorkbookSession,
): boolean {
  const node = event.target as { closest?: (selector: string) => unknown } | null;
  if (typeof node?.closest === "function" && node.closest(".wk-formula-bar, .wk-overlay-editor-host, .wk-overlay-editor, .wk-formula-suggest")) {
    return false;
  }
  if (!isSpreadsheetPointEvent(event)) return true;
  return !shouldPointGridClick(session);
}

export type FormulaRefEditOrigin = { tableId: string; col?: number; row?: number };

export function formulaRefForProjectedCell(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
  edit?: string | FormulaRefEditOrigin,
): string | undefined {
  const origin = typeof edit === "string" ? { tableId: edit } : edit;
  const cell = projectedCell(projection, layout, col, row);
  if (cell.kind !== "table") return undefined;
  const table = layout.snapshot.tables.find((item) => item.id === cell.hit.tableId);
  if (!table) return undefined;
  const local = origin?.tableId === table.id;
  const qualify = (qualified: string, localBody: string) => {
    if (local) return localBody;
    const dup = layout.snapshot.tables.filter((item) => item.name.toLowerCase() === table.name.toLowerCase()).length > 1;
    const sheet = layout.snapshot.sheets.find((item) => item.tableIds.includes(table.id));
    return dup && sheet ? `${sheet.name}.${qualified}` : qualified;
  };
  if (cell.hit.kind === "key") {
    const tableRow = table.rows.find((item) => item.id === cell.hit.rowId);
    if (!tableRow) return undefined;
    return table.promoteRowKeys ? tableRow.key : qualify(`${table.name}[${tableRow.key}]`, `[${tableRow.key}]`);
  }
  if (cell.hit.kind === "header") {
    if (cell.hit.columnId === KEY_COLUMN_ID) return undefined;
    const title =
      projection.columns.find((column) => column.id === cell.hit.columnId)?.title ||
      table.attributeColumns.find((column) => column.id === cell.hit.columnId)?.name;
    if (!title) return undefined;
    return qualify(`${table.name}[${title}]`, `[${title}]`);
  }
  if (cell.hit.kind !== "cell") return undefined;
  const named = getCellName(layout, cell.hit.tableId, cell.hit.rowId, cell.hit.columnId);
  if (named.defined) return named.defined;
  const localBody = applyThisRefs(
    named.structured.replace(/^(?:[^.[]+\.)?[^\[]+/, ""),
    origin,
    col,
    row,
  );
  return qualify(named.structured, localBody);
}

function applyThisRefs(
  localBody: string,
  origin: FormulaRefEditOrigin | undefined,
  col: number,
  row: number,
): string {
  const match = localBody.match(/^\[([^\]]+)\]\[([^\]]+)\]$/);
  if (!match || origin?.col === undefined || origin.row === undefined) return localBody;
  const column = origin.col === col ? "@" : match[1]!;
  const rowKey = origin.row === row ? "@" : match[2]!;
  return `[${column}][${rowKey}]`;
}

export function nextPointableCell(
  from: readonly [number, number],
  movement: readonly [-1 | 0 | 1, -1 | 0 | 1],
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  edit?: string | FormulaRefEditOrigin,
): { location: readonly [number, number]; ref: string } | undefined {
  let col = from[0] + movement[0];
  let row = from[1] + movement[1];
  while (col >= 0 && row >= 0 && col < projection.colCount && row < projection.rowCount) {
    const ref = formulaRefForProjectedCell(projection, layout, col, row, edit);
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

export function rangeFormulaRef(start: string, end: string): string {
  return start === end ? start : `${start}:${end}`;
}

export function pointAtProjectedCell(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
  options?: { extend?: boolean },
): boolean {
  const edit = session.formulaEdit;
  if (!edit || !projection.tableId) return false;
  const origin = { tableId: projection.tableId, col, row };
  if (
    !options?.extend &&
    edit.editCell &&
    edit.editCell.tableId === projection.tableId &&
    edit.editCell.col === col &&
    edit.editCell.row === row
  ) {
    session.pointFormulaRef("", origin);
    return true;
  }
  const ref = formulaRefForProjectedCell(projection, layout, col, row, edit.editCell ?? edit.tableId);
  if (!ref) return false;
  if (options?.extend && edit.rangeAnchor && edit.rangeAnchor.tableId === projection.tableId) {
    const startRef = formulaRefForProjectedCell(
      projection,
      layout,
      edit.rangeAnchor.col,
      edit.rangeAnchor.row,
      edit.editCell ?? edit.tableId,
    );
    if (!startRef) return false;
    session.pointFormulaRef(rangeFormulaRef(startRef, ref), origin, { keepAnchor: true });
    return true;
  }
  session.pointFormulaRef(ref, origin);
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
  options?: { extend?: boolean },
): { location: readonly [number, number]; ref: string } | undefined {
  const origin = options?.extend
    ? session.formulaEdit?.targetCell &&
      (!projection.tableId || session.formulaEdit.targetCell.tableId === projection.tableId)
      ? ([session.formulaEdit.targetCell.col, session.formulaEdit.targetCell.row] as const)
      : targetWalkStart(session, from, projection)
    : targetWalkStart(session, from, projection);
  const pointed = nextPointableCell(
    origin,
    movement,
    projection,
    layout,
    session.formulaEdit?.editCell ?? session.formulaEdit?.tableId,
  );
  if (!pointed) return undefined;
  if (
    !pointAtProjectedCell(session, projection, layout, pointed.location[0], pointed.location[1], {
      extend: options?.extend,
    })
  ) {
    return undefined;
  }
  return pointed;
}

export function shouldPointGridClick(session: WorkbookSession): boolean {
  const edit = session.formulaEdit;
  if (!edit) return false;
  const caret = edit.selectionEnd ?? edit.selectionStart ?? edit.draft.length;
  return canPointClick(edit.mode, edit.draft, caret);
}

export function applyGridPointerToFormulaEdit(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
  options?: { extend?: boolean },
): "point" | "commit" | "ignore" {
  const edit = session.formulaEdit;
  if (!edit || !projection.tableId) return "ignore";
  if (edit.editCell && edit.editCell.tableId === projection.tableId && edit.editCell.col === col && edit.editCell.row === row) {
    if (!shouldPointGridClick(session)) return "ignore";
  }
  if (shouldPointGridClick(session)) {
    return pointAtProjectedCell(session, projection, layout, col, row, options) ? "point" : "ignore";
  }
  if (options?.extend) return "ignore";
  if (commitLiteralEditAndSelect(session, projection, layout, col, row)) return "commit";
  session.commitFormulaEdit();
  if (!acceptTableGridSelection(projection, [col, row])) return "commit";
  session.setGridFocus({ tableId: projection.tableId, col, row });
  session.setSelection(selectionForProjectedCell(projection, layout, col, row));
  return "commit";
}

export function gridLocationFromPointer(
  host: HTMLElement,
  clientX: number,
  clientY: number,
  columnWidths: number[],
  rowHeights: number[],
): readonly [number, number] | null {
  const rect = host.getBoundingClientRect();
  let x = clientX - rect.left;
  let y = clientY - rect.top;
  if (x < 0 || y < 0) return null;
  let col = 0;
  for (; col < columnWidths.length; col++) {
    x -= columnWidths[col]!;
    if (x < 0) break;
  }
  if (col >= columnWidths.length) return null;
  let row = 0;
  for (; row < rowHeights.length; row++) {
    y -= rowHeights[row]!;
    if (y < 0) break;
  }
  if (row >= rowHeights.length) return null;
  return [col, row];
}
