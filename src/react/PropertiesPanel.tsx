import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatDisplayValue, resolveCellFormat } from "../model/numberFormat.js";
import { KEY_COLUMN_ID, isCellSelection, selectedCellRefs, sharedOrStar } from "../model/types.js";
import { blurOnEnter } from "./blurOnEnter.js";
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
        <CellNameField tableId={selection.tableId} rowId={selection.rowId} columnId={selection.columnId} />
      ) : null}
      <FormulaField />
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
        session.beginFormulaEdit(table.id, row.id, cellSel.columnId, draft);
      } catch {
        /* wait for calculation */
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit, table, row, cellSel, session]);

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
        session.beginFormulaEdit(table.id, row.id, cellSel.columnId, next);
      }}
      onCommit={(next) => {
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
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(committed);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setDraft(committed);
  }, [committed, resetKey]);
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "0px";
    area.style.height = `${area.scrollHeight}px`;
  }, [draft]);

  return (
    <label className="wk-formula-bar">
      Value
      <textarea
        ref={areaRef}
        rows={1}
        disabled={disabled}
        placeholder={disabled ? "Select a cell" : undefined}
        value={draft}
        onFocus={() => {
          if (draft === "*") setDraft(firstValue);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          else blurOnEnter(e);
        }}
      />
      {evaluated !== undefined ? <span className="wk-evaluated">{evaluated}</span> : null}
    </label>
  );
}

function rawInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}
