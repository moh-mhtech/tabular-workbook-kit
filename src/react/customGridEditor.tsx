import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GridCellKind, type GridCell, type Item } from "@glideapps/glide-data-grid";
import { projectedCell, type SheetGridProjection } from "../grid/sheetProjection.js";
import type { WorkbookLayout } from "../model/layout.js";
import {
  applyFormulaOperator,
  commitKeyMovement,
  overlayArrowMovement,
  overlayKeyAction,
  pointFromArrow,
  toggleOverlayNavMode,
  type OverlayNavMode,
} from "./customGridOverlay.js";
import { useWorkbook } from "./WorkbookProvider.js";

export type OverlayEditorProps = {
  value: GridCell;
  onChange: (value: GridCell) => void;
  onFinishedEditing: (value?: GridCell, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void;
  isHighlighted: boolean;
};

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
  const { session } = useWorkbook();
  const [mode, setMode] = useState(initialNavMode);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;
  const initial = value.kind === GridCellKind.Text ? value.data : "";
  const [draft, setDraft] = useState(initial);
  const sessionDraft = session.formulaEdit?.draft;

  useLayoutEffect(() => {
    const target = projectedCell(projection, layout, editingLocation[0], editingLocation[1]);
    if (target.kind !== "table" || target.hit.kind !== "cell") return;
    session.beginFormulaEdit(target.hit.tableId, target.hit.rowId, target.hit.columnId, initial, {
      pointing: true,
      editCell: projection.tableId
        ? { tableId: projection.tableId, col: editingLocation[0], row: editingLocation[1] }
        : undefined,
    });
    // Mount only: a later begin with the current value.data would wipe a pointed reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const end = input.value.length;
    const start = isHighlighted && initialNavMode === "cells" ? 0 : end;
    applySelection(input, start, end);
    session.syncFormulaEditCursor(input.value, start, end);
  }, [initialNavMode, isHighlighted, session]);

  useEffect(() => {
    if (sessionDraft === undefined || sessionDraft === draft) return;
    setDraft(sessionDraft);
    const span = session.formulaEdit?.activeFormulaRef;
    pendingSelectionRef.current = span
      ? { start: span.start, end: span.end }
      : { start: sessionDraft.length, end: sessionDraft.length };
    const current = valueRef.current;
    if (current.kind === GridCellKind.Text) {
      onChangeRef.current({ ...current, data: sessionDraft });
    }
  }, [draft, sessionDraft, session.formulaEdit?.activeFormulaRef]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || document.activeElement !== input) return;
    if (pendingSelectionRef.current) {
      const next = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      applySelection(input, next.start, next.end);
      return;
    }
    const { start, end } = selectionRef.current;
    if (input.selectionStart !== start || input.selectionEnd !== end) {
      input.setSelectionRange(start, end);
    }
  });

  const applySelection = (input: HTMLTextAreaElement, start: number, end: number) => {
    input.setSelectionRange(start, end);
    selectionRef.current = { start, end };
  };

  const writeDraft = (nextText: string, selectionStart: number, selectionEnd: number) => {
    pendingSelectionRef.current = null;
    setDraft(nextText);
    selectionRef.current = { start: selectionStart, end: selectionEnd };
    if (value.kind === GridCellKind.Text) onChange({ ...value, data: nextText });
    session.syncFormulaEditCursor(nextText, selectionStart, selectionEnd);
  };

  const syncInputCursor = (input: HTMLTextAreaElement) => {
    if (pendingSelectionRef.current) {
      const next = pendingSelectionRef.current;
      applySelection(input, next.start, next.end);
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    selectionRef.current = { start, end };
    session.syncFormulaEditCursor(input.value, start, end);
  };

  return (
    <textarea
      ref={inputRef}
      className="wk-overlay-editor"
      aria-label="Cell editor"
      value={draft}
      onChange={(event) => {
        const input = event.currentTarget;
        writeDraft(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length);
      }}
      onSelect={(event) => syncInputCursor(event.currentTarget)}
      onKeyDown={(event) => {
        const input = event.currentTarget;
        const commitMove = commitKeyMovement(event);
        if (commitMove) {
          event.preventDefault();
          event.stopPropagation();
          const next = value.kind === GridCellKind.Text ? { ...value, data: draft } : value;
          if (value.kind === GridCellKind.Text) onChange(next);
          onFinishedEditing(next, commitMove);
          return;
        }
        const action = overlayKeyAction(mode, event);
        if (action === "toggle-text") {
          event.preventDefault();
          event.stopPropagation();
          setMode(toggleOverlayNavMode(mode));
          if (mode === "cells") {
            requestAnimationFrame(() => applySelection(input, input.value.length, input.value.length));
          }
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
          writeDraft(applied.draft, applied.caret, applied.caret);
          pendingSelectionRef.current = { start: applied.caret, end: applied.caret };
          applySelection(input, applied.caret, applied.caret);
          return;
        }
        if (action !== "point-cell") return;
        event.preventDefault();
        event.stopPropagation();
        syncInputCursor(input);
        const movement = overlayArrowMovement(event.key);
        if (!movement) return;
        const pointed = pointFromArrow(session, editingLocation, movement, projection, layout);
        if (!pointed || !session.formulaEdit) return;
        const nextDraft = session.formulaEdit.draft;
        const span = session.formulaEdit.activeFormulaRef;
        const start = span?.start ?? nextDraft.length;
        const end = span?.end ?? nextDraft.length;
        pendingSelectionRef.current = { start, end };
        selectionRef.current = { start, end };
        setDraft(nextDraft);
        if (value.kind === GridCellKind.Text) onChange({ ...value, data: nextDraft });
        applySelection(input, start, end);
      }}
    />
  );
}
