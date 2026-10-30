import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GridCellKind, type GridCell, type Item } from "@glideapps/glide-data-grid";
import { applySuggestion, suggestFormula } from "../formula/formulaSuggest.js";
import { projectedCell, type ProjectedCell, type SheetGridProjection } from "../grid/sheetProjection.js";
import { invalidColumnName, invalidRowKey } from "../model/names.js";
import { KEY_COLUMN_ID, type WorkbookSnapshot } from "../model/types.js";
import type { WorkbookLayout } from "../model/layout.js";
import { FormulaSuggestList } from "./FormulaSuggestList.js";
import {
  applyFormulaOperator,
  canPointFromDraft,
  commitKeyMovement,
  cycleActiveFormulaRef,
  formulaKeyAction,
  overlayArrowMovement,
  pointFromArrow,
  toggleOverlayNavMode,
  type OverlayNavMode,
} from "./customGridOverlay.js";
import {
  FORMULA_EDITOR_MAX_HEIGHT,
  FORMULA_EDITOR_MAX_WIDTH,
  FORMULA_EDITOR_MIN_WIDTH,
  inlineCaretScrollLeft,
  measureFormulaDraftSize,
  placeFormulaEditor,
  type FormulaEditorRect,
} from "./formulaEditorPopup.js";
import { FormulaColoredText } from "./FormulaColoredText.js";
import { useWorkbook, type FormulaEditPlacement } from "./WorkbookProvider.js";
import { useGridCommit } from "./gridCommitContext.js";

export type OverlayEditorProps = {
  value: GridCell;
  onChange: (value: GridCell) => void;
  onFinishedEditing: (value?: GridCell, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void;
  isHighlighted: boolean;
};

export type GridOverlayEditorProps = OverlayEditorProps & {
  initialNavMode: OverlayNavMode;
  editingLocation: Item;
  projection: SheetGridProjection;
  layout: WorkbookLayout;
};

export function isIdentifierEdit(editing: ProjectedCell, snapshot: WorkbookSnapshot): boolean {
  if (editing.kind === "table") {
    if (editing.hit.kind === "key") return true;
    if (editing.hit.kind !== "header" || editing.hit.columnId === KEY_COLUMN_ID) return false;
    const table = snapshot.tables.find((item) => item.id === editing.hit.tableId);
    return Boolean(table?.attributeColumns.some((column) => column.id === editing.hit.columnId));
  }
  if (editing.kind !== "extension") return false;
  if (editing.expansion.direction === "below") return editing.expansion.columnId === KEY_COLUMN_ID;
  return editing.expansion.rowId === null;
}

export const GRID_CELL_PAD_X = 8;
export const GRID_CELL_PAD_Y = 3;

export function overlayProvideOptions(
  identifier: boolean,
  columnWidth: number,
  rowHeight: number,
  placement: FormulaEditPlacement = "popup",
) {
  if (identifier || placement === "inline") {
    return {
      disablePadding: true,
      disableStyling: true,
      styleOverride: {
        width: columnWidth,
        minWidth: columnWidth,
        maxWidth: columnWidth,
        height: rowHeight,
        minHeight: rowHeight,
        maxHeight: rowHeight,
        padding: 0,
        boxShadow: "none",
        borderRadius: 0,
      },
    };
  }
  return {
    disablePadding: true,
    disableStyling: true,
    styleOverride: {
      minWidth: FORMULA_EDITOR_MIN_WIDTH,
      padding: 0,
      boxShadow: "none",
    },
  };
}

export function ProjectedOverlayEditor(props: GridOverlayEditorProps) {
  const editing = projectedCell(props.projection, props.layout, props.editingLocation[0], props.editingLocation[1]);
  const Editor = isIdentifierEdit(editing, props.layout.snapshot) ? IdentifierEditor : SpreadsheetTextEditor;
  return <Editor {...props} />;
}

export function IdentifierEditor({
  value,
  onChange,
  onFinishedEditing,
  isHighlighted,
  initialNavMode,
  editingLocation,
  projection,
  layout,
}: GridOverlayEditorProps) {
  const { session } = useWorkbook();
  const gridCommit = useGridCommit();
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = value.kind === GridCellKind.Text ? value.data : "";
  const [draft, setDraft] = useState(initial);
  const editing = projectedCell(projection, layout, editingLocation[0], editingLocation[1]);
  const error = identifierDraftError(editing, session.getSnapshot(), draft);

  useLayoutEffect(() => {
    const queued = gridCommit?.takeQueuedChars(editingLocation) ?? "";
    if (!queued) return;
    setDraft((current) => current + queued);
  }, [editingLocation, gridCommit]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const end = input.value.length;
    const start = isHighlighted && initialNavMode === "enter" ? 0 : end;
    input.setSelectionRange(start, end);
  }, [initialNavMode, isHighlighted]);

  return (
    <input
      ref={inputRef}
      className="wk-overlay-editor wk-inline-editor"
      aria-label="Cell editor"
      aria-invalid={error ? true : undefined}
      title={error}
      value={draft}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setDraft(next);
        if (value.kind === GridCellKind.Text) onChange({ ...value, data: next });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") return;
        event.stopPropagation();
        if (event.key !== "Enter" && event.key !== "Tab") return;
        event.preventDefault();
        if (error) return;
        const next = value.kind === GridCellKind.Text ? { ...value, data: draft } : value;
        if (value.kind === GridCellKind.Text) onChange(next);
        const commitMove = commitKeyMovement(event);
        if (!commitMove) return;
        gridCommit?.commitAt(editingLocation, draft);
        onFinishedEditing(next, commitMove);
      }}
    />
  );
}

export function SpreadsheetTextEditor({
  value,
  onChange,
  onFinishedEditing,
  isHighlighted,
  initialNavMode,
  editingLocation,
  projection,
  layout,
}: OverlayEditorProps & {
  initialNavMode: OverlayNavMode;
  editingLocation: Item;
  projection: SheetGridProjection;
  layout: WorkbookLayout;
}) {
  const { session, formulaEditPlacement } = useWorkbook();
  const gridCommit = useGridCommit();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const applyingSelectionRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;
  const initial = value.kind === GridCellKind.Text ? value.data : "";
  const [draft, setDraft] = useState(initial);
  useLayoutEffect(() => {
    const queued = gridCommit?.takeQueuedChars(editingLocation) ?? "";
    if (!queued) return;
    setDraft((current) => current + queued);
  }, [editingLocation, gridCommit]);
  const [activeSuggest, setActiveSuggest] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(true);
  const sessionDraft = session.formulaEdit?.draft;
  const mode = session.formulaEdit?.mode ?? initialNavMode;
  const suggestCursor = selectionRef.current.start || draft.length;
  const suggestions = suggestOpen ? suggestFormula(draft, suggestCursor, layout) : [];
  const columnWidth = projection.columns[editingLocation[0]]?.width ?? FORMULA_EDITOR_MIN_WIDTH;
  const rowHeight = 28;
  const inline = formulaEditPlacement === "inline";
  const measured = measureFormulaDraftSize(draft, rowHeight);
  const popup = inline ? { width: columnWidth, height: rowHeight, overflow: "hidden" as const } : measured;

  const rememberSelection = (start: number, end: number) => {
    selectionRef.current = { start, end };
  };

  const placeCaretInFormulaText = (event: { target: EventTarget | null }) => {
    if (event.target instanceof Element && event.target.closest(".wk-formula-suggest")) return;
    setSuggestOpen(false);
    if (session.formulaEdit) session.setFormulaEditMode("edit");
    const input = inputRef.current;
    if (input && event.target !== input) input.focus();
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target instanceof Element ? event.target : null;
      if (!node) return;
      if (node.closest(".wk-formula-suggest")) return;
      if (!node.closest("#portal, .wk-overlay-editor-host, .wk-overlay-editor, .wk-formula-bar")) return;
      setSuggestOpen(false);
      if (session.formulaEdit) session.setFormulaEditMode("edit");
      if (node.closest(".wk-formula-bar")) return;
      const input = inputRef.current;
      if (input && event.target !== input) input.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [session]);

  useLayoutEffect(() => {
    const target = projectedCell(projection, layout, editingLocation[0], editingLocation[1]);
    if (target.kind !== "table" || target.hit.kind !== "cell") return;
    session.beginFormulaEdit(target.hit.tableId, target.hit.rowId, target.hit.columnId, initial, {
      pointing: initial.trimStart().startsWith("="),
      mode: initialNavMode,
      editCell: projection.tableId
        ? { tableId: projection.tableId, col: editingLocation[0], row: editingLocation[1] }
        : undefined,
    });
    // Mount only: a later begin with the current value.data would wipe a pointed reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const overlay = host?.closest<HTMLElement>(".gdg-style, .gdg-unstyle");
    if (!host || !overlay) return;
    overlay.style.width = `${popup.width}px`;
    overlay.style.height = `${popup.height}px`;
    overlay.style.minWidth = `${popup.width}px`;
    overlay.style.minHeight = `${popup.height}px`;
    overlay.style.maxWidth = `${inline ? popup.width : FORMULA_EDITOR_MAX_WIDTH}px`;
    overlay.style.maxHeight = `${inline ? popup.height : FORMULA_EDITOR_MAX_HEIGHT}px`;
    overlay.style.padding = "0";
    if (inline) {
      overlay.style.boxShadow = "none";
      return;
    }
    const canvas = document.querySelector<HTMLElement>(".wk-canvas");
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const targetX = Number.parseFloat(overlay.getAttribute("targetx") ?? overlay.style.left);
    const targetY = Number.parseFloat(overlay.getAttribute("targety") ?? overlay.style.top);
    const cell = {
      left: Number.isFinite(targetX) ? targetX : overlay.getBoundingClientRect().left,
      top: Number.isFinite(targetY) ? targetY : overlay.getBoundingClientRect().top,
      width: columnWidth,
      height: rowHeight,
    };
    const edit = session.formulaEdit;
    const flipX = Boolean(edit?.targetCell && edit.editCell && edit.targetCell.col > edit.editCell.col);
    const flipY = Boolean(edit?.targetCell && edit.editCell && edit.targetCell.row > edit.editCell.row);
    let avoid: FormulaEditorRect | undefined;
    if (edit?.targetCell && edit.editCell && (edit.targetCell.col !== edit.editCell.col || edit.targetCell.row !== edit.editCell.row)) {
      const leftCol = edit.rangeAnchor ? Math.min(edit.rangeAnchor.col, edit.targetCell.col) : edit.targetCell.col;
      const topRow = edit.rangeAnchor ? Math.min(edit.rangeAnchor.row, edit.targetCell.row) : edit.targetCell.row;
      const rightCol = edit.rangeAnchor ? Math.max(edit.rangeAnchor.col, edit.targetCell.col) : edit.targetCell.col;
      const bottomRow = edit.rangeAnchor ? Math.max(edit.rangeAnchor.row, edit.targetCell.row) : edit.targetCell.row;
      avoid = {
        left: cell.left + (leftCol - edit.editCell.col) * columnWidth,
        top: cell.top + (topRow - edit.editCell.row) * rowHeight,
        width: (rightCol - leftCol + 1) * columnWidth,
        height: (bottomRow - topRow + 1) * rowHeight,
      };
    }
    const placed = placeFormulaEditor(cell, popup, canvasRect, { avoid, flipX, flipY });
    overlay.style.left = `${placed.left}px`;
    overlay.style.top = `${placed.top}px`;
  }, [
    popup.width,
    popup.height,
    inline,
    columnWidth,
    rowHeight,
    session.formulaEdit?.targetCell,
    session.formulaEdit?.rangeAnchor,
    session.formulaEdit?.editCell,
  ]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const edit = session.formulaEdit;
    if (edit?.mode === "edit") return;
    const start = edit?.selectionStart ?? selectionRef.current.start;
    const end = edit?.selectionEnd ?? start;
    applyingSelectionRef.current = true;
    input.setSelectionRange(start, end);
    rememberSelection(start, end);
    applyingSelectionRef.current = false;
  });

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const end = input.value.length;
    const start = isHighlighted && initialNavMode === "enter" ? 0 : end;
    rememberSelection(start, end);
    input.setSelectionRange(start, end);
    session.syncFormulaEditCursor(input.value, start, end);
  }, [initialNavMode, isHighlighted, session]);

  useEffect(() => {
    if (sessionDraft === undefined || sessionDraft === draft) return;
    setDraft(sessionDraft);
    const span = session.formulaEdit?.activeFormulaRef;
    rememberSelection(span?.end ?? sessionDraft.length, span?.end ?? sessionDraft.length);
    const current = valueRef.current;
    if (current.kind === GridCellKind.Text) {
      onChangeRef.current({ ...current, data: sessionDraft });
    }
  }, [draft, sessionDraft, session.formulaEdit?.activeFormulaRef]);

  const writeDraft = (nextText: string, selectionStart: number, selectionEnd: number) => {
    rememberSelection(selectionStart, selectionEnd);
    setDraft(nextText);
    if (value.kind === GridCellKind.Text) onChange({ ...value, data: nextText });
    session.syncFormulaEditCursor(nextText, selectionStart, selectionEnd);
  };

  const scrollInlineCaret = (input: HTMLTextAreaElement) => {
    if (!inline) return;
    const caret = selectionRef.current.end;
    input.scrollLeft = inlineCaretScrollLeft(
      input.scrollLeft,
      caret,
      input.value.length,
      input.clientWidth - GRID_CELL_PAD_X * 2,
      input.scrollWidth,
    );
    const mirror = hostRef.current?.querySelector<HTMLElement>(".wk-formula-color-mirror");
    if (mirror) mirror.scrollLeft = input.scrollLeft;
  };

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    scrollInlineCaret(input);
  });

  const syncInputCursor = (input: HTMLTextAreaElement) => {
    if (applyingSelectionRef.current) return;
    if (session.formulaEdit && input.value !== session.formulaEdit.draft) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    rememberSelection(start, end);
    session.syncFormulaEditCursor(input.value, start, end);
    scrollInlineCaret(input);
  };

  return (
    <>
    <div
      ref={hostRef}
      className={`wk-overlay-editor-host ${inline ? "is-inline" : "is-popup"}`}
      onPointerDown={placeCaretInFormulaText}
      style={{ width: popup.width, height: popup.height }}
    >
    <FormulaColoredText draft={draft} active={canPointFromDraft(draft)} />
    <textarea
      ref={inputRef}
      className="wk-overlay-editor"
      aria-label="Cell editor"
      wrap={inline ? "off" : undefined}
      value={draft}
      style={{
        width: popup.width,
        minWidth: inline ? popup.width : FORMULA_EDITOR_MIN_WIDTH,
        maxWidth: inline ? popup.width : FORMULA_EDITOR_MAX_WIDTH,
        height: popup.height,
        maxHeight: inline ? popup.height : FORMULA_EDITOR_MAX_HEIGHT,
        overflow: popup.overflow,
        whiteSpace: inline ? "nowrap" : undefined,
        overflowX: inline ? "auto" : undefined,
        overflowY: inline ? "hidden" : undefined,
        padding: inline ? `${GRID_CELL_PAD_Y}px ${GRID_CELL_PAD_X}px` : undefined,
        ...(canPointFromDraft(draft) ? { color: "transparent", caretColor: "#1e3a5f" } : {}),
      }}
      onScroll={(event) => {
        const mirror = hostRef.current?.querySelector<HTMLElement>(".wk-formula-color-mirror");
        if (mirror) mirror.scrollLeft = event.currentTarget.scrollLeft;
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        setSuggestOpen(true);
        setActiveSuggest(0);
        writeDraft(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length);
      }}
      onSelect={(event) => syncInputCursor(event.currentTarget)}
      onKeyDown={(event) => {
        const input = event.currentTarget;
        const liveMode = session.formulaEdit?.mode ?? mode;
        const liveSuggest = suggestOpen
          ? suggestFormula(draft, input.selectionStart || draft.length, layout)
          : [];
        const action = formulaKeyAction(liveMode, event, {
          suggestVisible: liveSuggest.length > 0,
          isFormula: canPointFromDraft(draft),
        });
        if (action === "hide-suggest") {
          event.preventDefault();
          event.stopPropagation();
          setSuggestOpen(false);
          return;
        }
        if (action === "cancel") {
          session.cancelFormulaEdit();
          return;
        }
        if (action === "move-suggest") {
          event.preventDefault();
          event.stopPropagation();
          setActiveSuggest((current) =>
            event.key === "ArrowDown"
              ? (current + 1) % liveSuggest.length
              : (current - 1 + liveSuggest.length) % liveSuggest.length,
          );
          return;
        }
        if (action === "pick-suggest") {
          event.preventDefault();
          event.stopPropagation();
          const picked = liveSuggest[activeSuggest] ?? liveSuggest[0]!;
          const cursor = Math.max(input.selectionStart ?? 0, selectionRef.current.start, 1);
          const applied = applySuggestion(draft, cursor, picked);
          writeDraft(applied.draft, applied.caret, applied.caret);
          setSuggestOpen(false);
          return;
        }
        if (action === "commit-move") {
          event.preventDefault();
          event.stopPropagation();
          const commitMove = overlayArrowMovement(event.key) ?? commitKeyMovement(event);
          if (!commitMove) return;
          const next = value.kind === GridCellKind.Text ? { ...value, data: draft } : value;
          if (value.kind === GridCellKind.Text) onChange(next);
          gridCommit?.commitAt(editingLocation, draft);
          onFinishedEditing(next, commitMove);
          return;
        }
        if (action === "toggle-mode" || action === "toggle-text") {
          event.preventDefault();
          event.stopPropagation();
          const nextMode = toggleOverlayNavMode(liveMode);
          session.setFormulaEditMode(nextMode);
          if (liveMode !== "edit") {
            rememberSelection(input.value.length, input.value.length);
          }
          return;
        }
        if (action === "cycle-lock") {
          event.preventDefault();
          event.stopPropagation();
          const applied = cycleActiveFormulaRef(session, input.value, layout, projection);
          if (!applied) return;
          writeDraft(applied.draft, applied.end, applied.end);
          return;
        }
        if (action === "formula-operator") {
          event.preventDefault();
          event.stopPropagation();
          syncInputCursor(input);
          const applied = applyFormulaOperator(
            input.value,
            session.formulaEdit?.activeFormulaRef ?? null,
            input.selectionStart ?? input.value.length,
            input.selectionEnd ?? input.value.length,
            event.key,
          );
          session.setFormulaEditMode("enter");
          writeDraft(applied.draft, applied.caret, applied.caret);
          return;
        }
        if (action !== "point-cell" && action !== "extend-range") {
          if (inline && event.key === "Enter") event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const movement = overlayArrowMovement(event.key);
        if (!movement) return;
        const pointed = pointFromArrow(session, editingLocation, movement, projection, layout, {
          extend: action === "extend-range",
        });
        if (!pointed || !session.formulaEdit) return;
        const nextDraft = session.formulaEdit.draft;
        const span = session.formulaEdit.activeFormulaRef;
        writeDraft(nextDraft, span?.end ?? nextDraft.length, span?.end ?? nextDraft.length);
      }}
    />
    </div>
      <FormulaSuggestList
        items={suggestions}
        active={activeSuggest}
        onPick={(item) => {
          const applied = applySuggestion(draft, selectionRef.current.start, item);
          writeDraft(applied.draft, applied.caret, applied.caret);
        }}
      />
    </>
  );
}

function identifierDraftError(editing: ProjectedCell, snapshot: WorkbookSnapshot, draft: string): string | undefined {
  if (editing.kind === "table") {
    if (editing.hit.kind === "key") return invalidRowKey(snapshot, editing.hit.tableId, editing.hit.rowId, draft);
    if (editing.hit.kind === "header" && editing.hit.columnId !== KEY_COLUMN_ID) {
      return invalidColumnName(snapshot, editing.hit.tableId, editing.hit.columnId, draft);
    }
    return undefined;
  }
  if (editing.kind !== "extension") return undefined;
  if (editing.expansion.direction === "below" && editing.expansion.columnId === KEY_COLUMN_ID) {
    return invalidRowKey(snapshot, editing.expansion.tableId, null, draft);
  }
  if (editing.expansion.direction === "right" && editing.expansion.rowId === null) {
    return invalidColumnName(snapshot, editing.expansion.tableId, null, draft);
  }
  return undefined;
}
