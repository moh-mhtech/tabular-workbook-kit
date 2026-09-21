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
  formulaKeyAction,
  overlayArrowMovement,
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

export function overlayProvideOptions(identifier: boolean, columnWidth: number, rowHeight: number) {
  if (!identifier) return { styleOverride: { minWidth: columnWidth * 2 } };
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
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = value.kind === GridCellKind.Text ? value.data : "";
  const [draft, setDraft] = useState(initial);
  const editing = projectedCell(projection, layout, editingLocation[0], editingLocation[1]);
  const error = identifierDraftError(editing, session.getSnapshot(), draft);

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
  const { session } = useWorkbook();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const applyingSelectionRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;
  const initial = value.kind === GridCellKind.Text ? value.data : "";
  const [draft, setDraft] = useState(initial);
  const [activeSuggest, setActiveSuggest] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(true);
  const sessionDraft = session.formulaEdit?.draft;
  const mode = session.formulaEdit?.mode ?? initialNavMode;
  const suggestCursor = selectionRef.current.start || draft.length;
  const suggestions = suggestOpen ? suggestFormula(draft, suggestCursor, layout) : [];

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
    rememberSelection(span?.start ?? sessionDraft.length, span?.end ?? sessionDraft.length);
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

  const syncInputCursor = (input: HTMLTextAreaElement) => {
    if (applyingSelectionRef.current) return;
    if (session.formulaEdit && input.value !== session.formulaEdit.draft) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    rememberSelection(start, end);
    session.syncFormulaEditCursor(input.value, start, end);
  };

  return (
    <>
    <div className="wk-overlay-editor-host" onPointerDown={placeCaretInFormulaText}>
    <textarea
      ref={inputRef}
      className="wk-overlay-editor"
      aria-label="Cell editor"
      value={draft}
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
        if (action === "cancel") return;
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
          session.setFormulaEditMode("enter");
          return;
        }
        if (action !== "point-cell" && action !== "extend-range") {
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
        writeDraft(nextDraft, span?.start ?? nextDraft.length, span?.end ?? nextDraft.length);
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
