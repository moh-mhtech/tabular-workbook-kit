import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applySuggestion, suggestFormula } from "../formula/formulaSuggest.js";
import { layoutWorkbook } from "../model/layout.js";
import { formatDisplayValue, resolveCellFormat } from "../model/numberFormat.js";
import { KEY_COLUMN_ID, isCellSelection, selectedCellRefs, sharedOrStar } from "../model/types.js";
import { projectTable, projectedLocationForRef } from "../grid/sheetProjection.js";
import { blurOnEnter } from "./blurOnEnter.js";
import { FormulaSuggestList } from "./FormulaSuggestList.js";
import { OutlinedField } from "./OutlinedField.js";
import { moveSelectionAfterCommit } from "./customGridInteractions.js";
import {
  applyFormulaOperator,
  canPointFromDraft,
  commitKeyMovement,
  formulaKeyAction,
  overlayArrowMovement,
  pointFromArrow,
  toggleOverlayNavMode,
} from "./customGridOverlay.js";
import { useSnapshot, useWorkbook } from "./WorkbookProvider.js";
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

function selectionTitle(selection: { kind: string } | null): string {
  const kind = selection?.kind ?? "workbook";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function PropertiesPanel({
  hostInspectors,
  workbookLabel = "Workbook",
}: {
  hostInspectors?: HostInspectors;
  workbookLabel?: string;
}) {
  const { session } = useWorkbook();
  const selection = session.selection;

  return (
    <aside className="wk-properties">
      <h2>{selectionTitle(selection)}</h2>
      {selection?.kind === "cell" ? (
        <>
          <CellNameField tableId={selection.tableId} rowId={selection.rowId} columnId={selection.columnId} />
          <FormulaField />
        </>
      ) : null}
      {!selection || selection.kind === "workbook" ? (
        <>
          <WorkbookInspector label={workbookLabel} />
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
      {selection?.kind === "cell" ? (
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
  const { session, version } = useWorkbook();
  const snapshot = useSnapshot();
  const edit = session.formulaEdit;
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
  const display = edit?.draft ?? committed;
  const resetKey = `${refs.map((ref) => `${ref.tableId}:${ref.rowId}:${ref.columnId}`).join(",")}:${version}:${committed}`;

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
        if (!refs.length) return;
        if (next === "*" && committed === "*") return;
        tryCall(() => {
          session.transact(() => {
            if (session.formulaEdit) session.cancelFormulaEdit();
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
      onCancel={() => session.cancelFormulaEdit()}
    />
  );
}

function FormulaDraft({
  committed,
  firstValue,
  evaluated,
  disabled,
  resetKey,
  onChange,
  onCommit,
  onCancel,
}: {
  committed: string;
  firstValue: string;
  evaluated?: string;
  disabled: boolean;
  resetKey: string;
  onChange: (value: string) => void;
  onCommit: (value: string, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void;
  onCancel: () => void;
}) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const layout = useMemo(() => layoutWorkbook(snapshot), [snapshot]);
  const [draft, setDraft] = useState(committed);
  const [activeSuggest, setActiveSuggest] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(true);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const caret = areaRef.current?.selectionStart ?? draft.length;
  const suggestions = suggestOpen ? suggestFormula(draft, caret, layout) : [];
  const mode = session.formulaEdit?.mode ?? "edit";
  useEffect(() => {
    setDraft(committed);
  }, [committed, resetKey]);
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "0px";
    area.style.height = `${area.scrollHeight}px`;
  }, [draft]);

  const applyDraft = (next: string, nextCaret: number) => {
    setDraft(next);
    onChange(next);
    requestAnimationFrame(() => {
      const area = areaRef.current;
      if (area) area.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <div className="wk-formula-bar">
      <OutlinedField label="Value" endLabel={evaluated || undefined}>
        <textarea
          ref={areaRef}
          rows={1}
          disabled={disabled}
          aria-label="Value"
          placeholder={disabled ? "Select a cell" : " "}
          value={draft}
          onFocus={() => {
            if (draft === "*") setDraft(firstValue);
            if (session.formulaEdit) session.setFormulaEditMode(session.formulaEdit.mode === "point" ? "point" : "edit");
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setSuggestOpen(true);
            setActiveSuggest(0);
            onChange(e.target.value);
          }}
          onSelect={(e) => {
            const area = e.currentTarget;
            if (session.formulaEdit) {
              session.syncFormulaEditCursor(area.value, area.selectionStart ?? 0, area.selectionEnd ?? 0);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (!session.formulaEdit) return;
              if (session.formulaEdit.mode === "point") return;
              onCommit(session.formulaEdit.draft);
            }, 0);
          }}
          onKeyDown={(e) => {
            const action = formulaKeyAction(mode, e, {
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
              session.setFormulaEditMode(toggleOverlayNavMode(mode));
              return;
            }
            if (action === "formula-operator") {
              e.preventDefault();
              const applied = applyFormulaOperator(
                e.currentTarget.value,
                session.formulaEdit?.activeFormulaRef ?? null,
                e.currentTarget.selectionStart ?? draft.length,
                e.currentTarget.selectionEnd ?? draft.length,
                e.key,
              );
              applyDraft(applied.draft, applied.caret);
              session.setFormulaEditMode("enter");
              return;
            }
            if (action === "point-cell" || action === "extend-range") {
              const edit = session.formulaEdit;
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
              const next = session.formulaEdit?.draft ?? draft;
              const span = session.formulaEdit?.activeFormulaRef;
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

function rawInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}
