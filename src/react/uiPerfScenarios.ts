import { buildPeriods } from "../model/calendar.js";
import { layoutWorkbook } from "../model/layout.js";
import { projectedLocationForRef, projectTable, selectionForProjectedCell } from "../grid/sheetProjection.js";
import type { WorkbookSession } from "../session/WorkbookSession.js";

export type UiPerfScenarioId = "perf-cell-edit-budget";

export type UiPerfMetrics = {
  scenario: UiPerfScenarioId;
  /** Session-only: one writeCell through emit (ms until data notification). */
  commitRecalcMs: number;
  /** Session-only: twenty formula-edit cursor syncs (ms total). */
  formulaEditCursorMs: number;
};

function waitForDataNotification(session: WorkbookSession): Promise<void> {
  return new Promise((resolve) => {
    const unsub = session.subscribe((change) => {
      if (!change?.viewOnly && !change?.formulaEditOnly) {
        unsub();
        resolve();
      }
    });
  });
}

function selectInputCell(session: WorkbookSession, tableName: string, rowKey: string, columnId: string): void {
  const snapshot = session.getSnapshot();
  const table = snapshot.tables.find((t) => t.name === tableName);
  if (!table) throw new Error(`ui perf: table ${tableName} missing`);
  const row = table.rows.find((r) => r.key === rowKey);
  if (!row) throw new Error(`ui perf: row ${rowKey} missing`);
  const layout = layoutWorkbook(snapshot);
  const projection = projectTable(layout, table.id);
  if (!projection) throw new Error("ui perf: no projection");
  const location = projectedLocationForRef(projection, layout, {
    tableId: table.id,
    rowId: row.id,
    columnId,
  });
  if (!location) throw new Error("ui perf: cell not on sheet");
  const [col, rowIndex] = location;
  const sheet = snapshot.sheets.find((s) => s.tableIds.includes(table.id));
  if (!sheet) throw new Error("ui perf: sheet missing");
  session.setViewActiveSheet(sheet.id);
  session.setGridFocus({ tableId: table.id, col, row: rowIndex });
  session.setSelection(selectionForProjectedCell(projection, layout, col, rowIndex));
}

function firstOmsaetningInputCell(session: WorkbookSession): { rowKey: string; columnId: string; tableId: string; rowId: string } {
  const table = session.getSnapshot().tables.find((t) => t.name === "Omsætning");
  if (!table?.rows[0]) throw new Error("ui perf: Omsætning missing");
  const periodId = buildPeriods(session.getSnapshot().calendar)[0]?.id;
  if (!periodId) throw new Error("ui perf: calendar period missing");
  const row = table.rows[0]!;
  if (!row.cells[periodId]) throw new Error(`ui perf: column ${periodId} missing on Omsætning`);
  return { rowKey: row.key, columnId: periodId, tableId: table.id, rowId: row.id };
}

/** Prepare budget workbook for perf-cell-edit-budget (first revenue line, first month). */
export function runUiPerfScenario(session: WorkbookSession, scenario: UiPerfScenarioId): void {
  if (scenario !== "perf-cell-edit-budget") throw new Error(`Unknown ui perf scenario: ${scenario}`);
  session.setExplorerPinned(true);
  session.setPropertiesPinned(false);
  const cell = firstOmsaetningInputCell(session);
  selectInputCell(session, "Omsætning", cell.rowKey, cell.columnId);
}

export async function measureUiPerfScenario(session: WorkbookSession, scenario: UiPerfScenarioId): Promise<UiPerfMetrics> {
  if (scenario !== "perf-cell-edit-budget") throw new Error(`Unknown ui perf scenario: ${scenario}`);
  const cell = firstOmsaetningInputCell(session);
  session.beginFormulaEdit(cell.tableId, cell.rowId, cell.columnId, "1", { mode: "edit" });
  const cursorStart = performance.now();
  for (let i = 0; i < 20; i++) {
    session.syncFormulaEditCursor(String(i), 1, 1);
  }
  const formulaEditCursorMs = performance.now() - cursorStart;
  session.cancelFormulaEdit();

  const commitStart = performance.now();
  const wait = waitForDataNotification(session);
  session.writeCell("Omsætning", cell.rowKey, cell.columnId, "42");
  await wait;
  const commitRecalcMs = performance.now() - commitStart;

  return { scenario, commitRecalcMs, formulaEditCursorMs };
}
