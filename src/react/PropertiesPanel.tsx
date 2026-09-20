import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { KEY_COLUMN_ID, isCellSelection } from "../model/types.js";
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
  const snapshot = useSnapshot();
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
      <p className="wk-muted">{snapshot.name}</p>
    </aside>
  );
}

function FormulaField() {
  const { session, version } = useWorkbook();
  const snapshot = useSnapshot();
  const edit = session.formulaEdit;
  const selection = session.selection;
  const cellSel = isCellSelection(selection) ? selection : null;
  const table = snapshot.tables.find((t) => t.id === (edit?.tableId ?? cellSel?.tableId));
  const row = table?.rows.find((r) => r.id === (edit?.rowId ?? cellSel?.rowId));
  let committed = "";
  let evaluated: string | undefined;
  if (table && row && (edit || cellSel)) {
    const columnId = edit?.columnId ?? cellSel!.columnId;
    if (columnId === KEY_COLUMN_ID) {
      committed = row.key;
    } else {
      try {
        const cell = session.getCell(table.name, row.key, columnId);
        committed = cell.kind === "formula" ? (cell.formula ?? "") : rawInput(cell.input);
        if (cell.computed !== null && cell.computed !== undefined) evaluated = String(cell.computed);
      } catch {
        committed = "";
      }
    }
  }
  const display = edit?.draft ?? committed;
  const resetKey = `${edit?.tableId ?? cellSel?.tableId}:${edit?.rowId}:${version}:${committed}`;

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
      evaluated={evaluated}
      disabled={!table || !row}
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
        if (!table || !row || !cellSel) return;
        if (cellSel.columnId === KEY_COLUMN_ID) {
          tryCall(() => session.renameRow(table.id, row.id, next));
          return;
        }
        if (edit) {
          session.setFormulaEditDraft(next);
          session.commitFormulaEdit();
          return;
        }
        tryCall(() => session.writeCell(table.name, row.key, cellSel.columnId, next));
      }}
      onCancel={() => session.cancelFormulaEdit()}
    />
  );
}

function FormulaDraft({
  committed,
  evaluated,
  disabled,
  resetKey,
  onChange,
  onCommit,
  onCancel,
}: {
  committed: string;
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
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onCommit(draft);
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      {evaluated !== undefined ? <span className="wk-evaluated">Evaluated: {evaluated}</span> : null}
    </label>
  );
}

function rawInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}
