import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applySuggestion, suggestFormula } from "../formula/formulaSuggest.js";
import { formulaErrorReason } from "../formula/formulaError.js";
import { layoutWorkbook } from "../model/layout.js";
import { formatDisplayValue, resolveCellFormat } from "../model/numberFormat.js";
import { HEADER_ROW_ID, KEY_COLUMN_ID, isCellSelection, selectedCellRefs, sharedOrStar, type CellRef, type Selection } from "../model/types.js";
import { projectTable, projectedLocationForRef } from "../grid/sheetProjection.js";
import { blurOnEnter } from "./blurOnEnter.js";
import { FormulaColoredText } from "./FormulaColoredText.js";
import { FormulaSuggestList } from "./FormulaSuggestList.js";
import { OutlinedField } from "./OutlinedField.js";
import { moveSelectionAfterCommit } from "./customGridInteractions.js";
import {
  applyFormulaOperator,
  canPointFromDraft,
  commitKeyMovement,
  cycleActiveFormulaRef,
  formulaKeyAction,
  overlayArrowMovement,
  pointFromArrow,
  toggleOverlayNavMode,
} from "./customGridOverlay.js";
import { SidePanelPinButton } from "./SidePanelPinButton.js";
import { useFormulaEdit, useSnapshot, useWorkbook } from "./WorkbookProvider.js";
import { WorkbookInspector } from "./inspectors/WorkbookInspector.js";
import { SheetInspector } from "./inspectors/SheetInspector.js";
import { TableInspector } from "./inspectors/TableInspector.js";
import { ColumnInspector } from "./inspectors/ColumnInspector.js";
import { RowInspector } from "./inspectors/RowInspector.js";
import { CellInspector, CellNameField } from "./inspectors/CellInspector.js";

export type HostInspectors = {
  workbook?: () => ReactNode;
  sheet?: () => ReactNode;
  table?: () => ReactNode;
};

function selectionTitle(selection: Selection | null): string {
  if (selection?.kind === "growth") return "Growth cell";
  const kind = selection?.kind ?? "workbook";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function inspectorRefsAreData(refs: readonly CellRef[]): boolean {
  return refs.length > 0 && refs.every((ref) => ref.columnId !== KEY_COLUMN_ID && ref.rowId !== HEADER_ROW_ID);
}

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function PropertiesPanel({ hostInspectors }: { hostInspectors?: HostInspectors }) {
  const { session } = useWorkbook();
  const formulaEdit = useFormulaEdit();
  const snapshot = useSnapshot();
  const selection = session.selection;
  return (
    <aside className="wk-properties" aria-label="Properties">
      <div className="wk-side-panel-head">
        <span className="wk-side-panel-title">Properties</span>
        <SidePanelPinButton side="properties" label="Properties" />
      </div>
      {selection?.kind === "corner" ? null : <h2>{selectionTitle(selection)}</h2>}
      {(selection?.kind === "cell" && inspectorRefsAreData(selectedCellRefs(selection))) || formulaEdit ? (
        <>
          {selection?.kind === "cell" ? (
            <CellNameField tableId={selection.tableId} rowId={selection.rowId} columnId={selection.columnId} />
          ) : null}
          <FormulaField />
        </>
      ) : null}
      {selection?.kind === "growth" && !formulaEdit ? <GrowthValueField /> : null}
      {!selection || selection.kind === "workbook" ? (
        <>
          <WorkbookInspector />
          {hostInspectors?.workbook?.()}
        </>
      ) : null}
      {selection?.kind === "sheet" ? (
        <>
          <SheetInspector sheetId={selection.sheetId} />
          {hostInspectors?.sheet?.()}
        </>
      ) : null}
      {selection?.kind === "table" ? (
        <>
          <TableInspector tableId={selection.tableId} />
          {hostInspectors?.table?.()}
        </>
      ) : null}
      {selection?.kind === "column" ? <ColumnInspector tableId={selection.tableId} columnId={selection.columnId} /> : null}
      {selection?.kind === "row" ? <RowInspector tableId={selection.tableId} rowId={selection.rowId} /> : null}
      {selection?.kind === "cell" && inspectorRefsAreData(selectedCellRefs(selection)) ? (
        <CellInspector tableId={selection.tableId} rowId={selection.rowId} columnId={selection.columnId} />
      ) : null}
      {!selection ? <p className="wk-muted">Select a sheet, table, or cell.</p> : null}
    </aside>
  );
}

function cellCommitted(session: ReturnType<typeof useWorkbook>["session"], snapshot: ReturnType<typeof useSnapshot>, ref: { tableId: string; rowId: string; columnId: string }) {
  const table = snapshot.tables.find((t) => t.id === ref.tableId);
  const row = table?.rows.find((r) => r.id === ref.rowId);
  if (!table || !row) return "";
  if (ref.columnId === KEY_COLUMN_ID) return row.key;
  try {
    const cell = session.getCell(table.name, row.key, ref.columnId);
    return cell.kind === "formula" ? (cell.formula ?? "") : rawInput(cell.input);
  } catch {
    const source = row.cells[ref.columnId];
    return source?.kind === "formula" ? (source.formula ?? "") : rawInput(source?.value);
  }
}

function cellEvaluated(session: ReturnType<typeof useWorkbook>["session"], snapshot: ReturnType<typeof useSnapshot>, ref: { tableId: string; rowId: string; columnId: string }) {
  const table = snapshot.tables.find((t) => t.id === ref.tableId);
  const row = table?.rows.find((r) => r.id === ref.rowId);
  if (!table || !row || ref.columnId === KEY_COLUMN_ID) return "";
  try {
    const cell = session.getCell(table.name, row.key, ref.columnId);
    if (cell.computed === null || cell.computed === undefined) return "";
    return formatDisplayValue(cell.computed, resolveCellFormat(table, ref.columnId, row.cells[ref.columnId]));
  } catch {
    return "";
  }
}

function FormulaField() {
  const { session, dataVersion, formulaEditVersion, setActiveSheetId } = useWorkbook();
  const snapshot = useSnapshot();
  const edit = useFormulaEdit();
  const selection = session.selection;
  const cellSel = isCellSelection(selection) ? selection : null;
  const refs = selectedCellRefs(selection);
  const table = snapshot.tables.find((t) => t.id === (edit?.tableId ?? cellSel?.tableId));
  const row = table?.rows.find((r) => r.id === (edit?.rowId ?? cellSel?.rowId));
  const committedValues = refs.map((ref) => cellCommitted(session, snapshot, ref));
  const evaluatedValues = refs.map((ref) => cellEvaluated(session, snapshot, ref));
  const committed = refs.length ? sharedOrStar(committedValues) : "";
  const firstCommitted = committedValues[0] ?? "";
  const evaluated = refs.length ? sharedOrStar(evaluatedValues) : undefined;
  const errorReason = cellErrorReason(session, snapshot, refs[0]);
  const display = edit?.draft ?? committed;
  const resetKey = `${refs.map((ref) => `${ref.tableId}:${ref.rowId}:${ref.columnId}`).join(",")}:${dataVersion}:${formulaEditVersion}:${committed}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F2" || edit || !table || !row || !cellSel || cellSel.columnId === KEY_COLUMN_ID) return;
      if (e.defaultPrevented) return;
      if (
        e.target instanceof Element &&
        e.target.closest(".wk-table-spreadsheet, #portal, .wk-overlay-editor")
      ) {
        return;
      }
      e.preventDefault();
      try {
        const cell = session.getCell(table.name, row.key, cellSel.columnId);
        const draft = cell.kind === "formula" ? (cell.formula ?? "=") : rawInput(cell.input);
        const layout = layoutWorkbook(snapshot);
        const projection = projectTable(layout, table.id);
        const location = projection
          ? projectedLocationForRef(projection, layout, cellSel)
          : undefined;
        session.beginFormulaEdit(table.id, row.id, cellSel.columnId, draft, {
          mode: "edit",
          editCell:
            projection && location
              ? { tableId: table.id, col: location[0], row: location[1] }
              : undefined,
        });
        requestAnimationFrame(() => {
          document.querySelector<HTMLTextAreaElement>(".wk-formula-bar textarea")?.focus();
        });
      } catch {
        /* wait for calculation */
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit, table, row, cellSel, session, snapshot]);

  return (
    <FormulaDraft
      committed={display}
      firstValue={firstCommitted}
      evaluated={evaluated}
      errorReason={errorReason}
      disabled={!refs.length}
      resetKey={resetKey}
      onChange={(next) => {
        if (edit) {
          session.setFormulaEditDraft(next);
          return;
        }
        if (!table || !row || !cellSel) return;
        const layout = layoutWorkbook(snapshot);
        const projection = projectTable(layout, table.id);
        const location = projection
          ? projectedLocationForRef(projection, layout, cellSel)
          : undefined;
        session.beginFormulaEdit(table.id, row.id, cellSel.columnId, next, {
          mode: "edit",
          editCell:
            projection && location
              ? { tableId: table.id, col: location[0], row: location[1] }
              : undefined,
        });
      }}
      onCommit={(next, movement) => {
        if (next === "*" && committed === "*") return;
        tryCall(() => {
          if (edit) {
            const sheet = snapshot.sheets.find((item) => item.tableIds.includes(edit.tableId));
            if (sheet) setActiveSheetId(sheet.id);
            session.setFormulaEditDraft(next);
            session.commitFormulaEdit();
            session.setSelection({
              kind: "cell",
              tableId: edit.tableId,
              rowId: edit.rowId,
              columnId: edit.columnId,
            });
            if (edit.editCell) session.setGridFocus(edit.editCell);
            if (movement) moveSelectionAfterCommit(session, snapshot, movement);
            return;
          }
          if (!refs.length) return;
          session.transact(() => {
            for (const ref of refs) {
              const targetTable = snapshot.tables.find((candidate) => candidate.id === ref.tableId);
              const targetRow = targetTable?.rows.find((candidate) => candidate.id === ref.rowId);
              if (!targetTable || !targetRow) continue;
              if (ref.columnId === KEY_COLUMN_ID) session.renameRow(targetTable.id, targetRow.id, next);
              else session.writeCell(targetTable.name, targetRow.key, ref.columnId, next);
            }
          });
          if (movement) moveSelectionAfterCommit(session, snapshot, movement);
        });
      }}
      onCancel={() => {
        const sheet = edit ? snapshot.sheets.find((item) => item.tableIds.includes(edit.tableId)) : undefined;
        if (sheet) setActiveSheetId(sheet.id);
        session.cancelFormulaEdit();
      }}
    />
  );
}

function cellErrorReason(
  session: ReturnType<typeof useWorkbook>["session"],
  snapshot: ReturnType<typeof useSnapshot>,
  ref: { tableId: string; rowId: string; columnId: string } | undefined,
): string | undefined {
  if (!ref) return undefined;
  const table = snapshot.tables.find((item) => item.id === ref.tableId);
  const row = table?.rows.find((item) => item.id === ref.rowId);
  if (!table || !row || ref.columnId === KEY_COLUMN_ID) return undefined;
  try {
    const cell = session.getCell(table.name, row.key, ref.columnId);
    if (!cell.error) return undefined;
    return formulaErrorReason(cell.error, cell.formula, layoutWorkbook(snapshot));
  } catch {
    return undefined;
  }
}

function FormulaDraft({
  committed,
  firstValue,
  evaluated,
  errorReason,
  disabled,
  resetKey,
  onChange,
  onCommit,
  onCancel,
}: {
  committed: string;
  firstValue: string;
  evaluated?: string;
  errorReason?: string;
  disabled: boolean;
  resetKey: string;
  onChange: (value: string) => void;
  onCommit: (value: string, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void;
  onCancel: () => void;
}) {
  const { session } = useWorkbook();
  const edit = useFormulaEdit();
  const snapshot = useSnapshot();
  const layout = useMemo(() => layoutWorkbook(snapshot), [snapshot]);
  const [draft, setDraft] = useState(committed);
  const [activeSuggest, setActiveSuggest] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(true);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const caret = areaRef.current?.selectionStart ?? draft.length;
  const suggestions = suggestOpen ? suggestFormula(draft, caret, layout) : [];
  const mode = edit?.mode ?? "edit";
  useEffect(() => {
    setDraft(committed);
  }, [committed, resetKey]);
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const fitHeight = () => {
      area.style.removeProperty("height");
      area.style.height = "0px";
      area.style.height = `${Math.max(area.scrollHeight, 38)}px`;
    };
    fitHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fitHeight);
    observer.observe(area);
    const field = area.closest(".wk-outlined");
    if (field) observer.observe(field);
    return () => observer.disconnect();
  }, [draft]);

  const pendingCaretRef = useRef<{ start: number; end: number }>({
    start: committed.length,
    end: committed.length,
  });
  const applyingCaretRef = useRef(false);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    if (edit?.mode === "edit") return;
    const start = edit?.selectionStart ?? pendingCaretRef.current.start;
    const end = edit?.selectionEnd ?? start;
    applyingCaretRef.current = true;
    area.setSelectionRange(start, end);
    pendingCaretRef.current = { start, end };
    applyingCaretRef.current = false;
  });

  const applyDraft = (next: string, nextCaret: number) => {
    pendingCaretRef.current = { start: nextCaret, end: nextCaret };
    setDraft(next);
    onChange(next);
  };

  const placeCaretInFormulaText = (event: { target: EventTarget | null }) => {
    if (event.target instanceof Element && event.target.closest(".wk-formula-suggest")) return;
    setSuggestOpen(false);
    if (edit) session.setFormulaEditMode("edit");
    const area = areaRef.current;
    if (area && event.target !== area) area.focus();
  };

  return (
    <div className="wk-formula-bar click-outside-ignore" onPointerDown={placeCaretInFormulaText}>
      <OutlinedField label="Value" endLabel={evaluated || undefined}>
        <FormulaColoredText draft={draft} active={Boolean(edit && canPointFromDraft(draft))} />
        <textarea
          ref={areaRef}
          rows={1}
          disabled={disabled}
          aria-label="Value"
          placeholder={disabled ? "Select a cell" : " "}
          value={draft}
          style={
            edit && canPointFromDraft(draft)
              ? { color: "transparent", caretColor: "#1e3a5f" }
              : undefined
          }
          onFocus={() => {
            if (draft === "*") setDraft(firstValue);
          }}
          onChange={(e) => {
            const start = e.target.selectionStart ?? e.target.value.length;
            const end = e.target.selectionEnd ?? start;
            pendingCaretRef.current = { start, end };
            setDraft(e.target.value);
            setSuggestOpen(true);
            setActiveSuggest(0);
            onChange(e.target.value);
            if (edit) session.syncFormulaEditCursor(e.target.value, start, end);
          }}
          onSelect={(e) => {
            const area = e.currentTarget;
            if (applyingCaretRef.current) return;
            if (edit && area.value !== edit.draft) return;
            const start = area.selectionStart ?? 0;
            const end = area.selectionEnd ?? start;
            pendingCaretRef.current = { start, end };
            if (edit) session.syncFormulaEditCursor(area.value, start, end);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              const liveEdit = session.formulaEdit;
              if (!liveEdit) return;
              if (liveEdit.mode === "point") return;
              const active = document.activeElement;
              if (active instanceof Element && active.closest(".wk-overlay-editor, .wk-formula-bar, #portal")) return;
              onCommit(liveEdit.draft);
            }, 0);
          }}
          onKeyDown={(e) => {
            const liveMode = edit?.mode ?? mode;
            const action = formulaKeyAction(liveMode, e, {
              suggestVisible: suggestions.length > 0,
              isFormula: canPointFromDraft(draft),
            });
            if (action === "hide-suggest") {
              e.preventDefault();
              setSuggestOpen(false);
              return;
            }
            if (action === "cancel") {
              onCancel();
              return;
            }
            if (action === "move-suggest") {
              e.preventDefault();
              setActiveSuggest((current) =>
                e.key === "ArrowDown"
                  ? (current + 1) % suggestions.length
                  : (current - 1 + suggestions.length) % suggestions.length,
              );
              return;
            }
            if (action === "pick-suggest") {
              e.preventDefault();
              const picked = suggestions[activeSuggest] ?? suggestions[0]!;
              const applied = applySuggestion(draft, e.currentTarget.selectionStart ?? draft.length, picked);
              applyDraft(applied.draft, applied.caret);
              setSuggestOpen(false);
              return;
            }
            if (action === "toggle-mode" || action === "toggle-text") {
              e.preventDefault();
              session.setFormulaEditMode(toggleOverlayNavMode(liveMode));
              return;
            }
            if (action === "cycle-lock") {
              e.preventDefault();
              const tableId =
                edit?.tableId ??
                (session.selection && "tableId" in session.selection ? session.selection.tableId : undefined);
              const projection = tableId ? projectTable(layout, tableId) : null;
              const applied = cycleActiveFormulaRef(session, e.currentTarget.value, layout, projection);
              if (!applied) return;
              applyDraft(applied.draft, applied.end);
              return;
            }
            if (action === "formula-operator") {
              e.preventDefault();
              const applied = applyFormulaOperator(
                e.currentTarget.value,
                edit?.activeFormulaRef ?? null,
                e.currentTarget.selectionStart ?? draft.length,
                e.currentTarget.selectionEnd ?? draft.length,
                e.key,
              );
              session.setFormulaEditMode("enter");
              applyDraft(applied.draft, applied.caret);
              return;
            }
            if (action === "point-cell" || action === "extend-range") {
              const tableId = edit?.tableId ?? (session.selection && "tableId" in session.selection ? session.selection.tableId : undefined);
              if (!edit || !tableId) return;
              const projection = projectTable(layout, tableId);
              const from = edit.editCell ? ([edit.editCell.col, edit.editCell.row] as const) : ([1, 1] as const);
              const movement = overlayArrowMovement(e.key);
              if (!projection || !movement) return;
              e.preventDefault();
              const pointed = pointFromArrow(session, from, movement, projection, layout, {
                extend: action === "extend-range",
              });
              if (!pointed) return;
              const next = edit?.draft ?? draft;
              const span = edit?.activeFormulaRef;
              applyDraft(next, span?.end ?? next.length);
              return;
            }
            if (action === "commit-move") {
              e.preventDefault();
              onCommit(draft, overlayArrowMovement(e.key) ?? commitKeyMovement(e));
              return;
            }
            blurOnEnter(e);
          }}
        />
      </OutlinedField>
      {errorReason ? <p className="wk-formula-error">{errorReason}</p> : null}
      <FormulaSuggestList
        items={suggestions}
        active={activeSuggest}
        onPick={(item) => {
          const applied = applySuggestion(draft, areaRef.current?.selectionStart ?? draft.length, item);
          applyDraft(applied.draft, applied.caret);
        }}
      />
    </div>
  );
}

function GrowthValueField() {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const selection = session.selection;
  const [draft, setDraft] = useState("");
  if (selection?.kind !== "growth") return null;
  const sheet = snapshot.sheets.find((item) => item.tableIds.includes(selection.tableId));
  const layout = layoutWorkbook(snapshot);
  const projection = projectTable(layout, selection.tableId);
  const commit = (raw: string) => {
    if (!sheet || !projection) return;
    tryCall(() => {
      session.writeGridCell(
        sheet.id,
        selection.row + projection.originRow,
        selection.col + projection.originCol,
        raw,
      );
    });
  };
  return (
    <OutlinedField label="Value">
      <textarea
        aria-label="Value"
        placeholder=" "
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          commit(draft);
          (event.currentTarget as HTMLTextAreaElement).blur();
        }}
      />
    </OutlinedField>
  );
}

function rawInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}
