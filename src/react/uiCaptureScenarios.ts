import { layoutWorkbook } from "../model/layout.js";
import { projectedLocationForRef, projectTable, selectionForProjectedCell } from "../grid/sheetProjection.js";
import type { WorkbookSession } from "../session/WorkbookSession.js";

export type UiCaptureScenarioId =
  | "properties-cell-multiline-formula"
  | "properties-budget-unpinned-reveal"
  | "properties-table-inspector";

export type UiCaptureMetrics = {
  scenario: UiCaptureScenarioId;
  textareaHeight: number;
  textareaScrollHeight: number;
  textareaSlackPx: number;
  propertiesClientHeight: number;
  propertiesScrollHeight: number;
  propertiesHasVerticalScroll: boolean;
  hostClientHeight: number;
  hostScrollHeight: number;
  hostHasVerticalScroll: boolean;
};

function selectDataCell(session: WorkbookSession, tableName: string, rowKey: string, columnId: string): void {
  const snapshot = session.getSnapshot();
  const table = snapshot.tables.find((t) => t.name === tableName);
  if (!table) throw new Error(`ui capture: table ${tableName} missing`);
  const row = table.rows.find((r) => r.key === rowKey);
  if (!row) throw new Error(`ui capture: row ${rowKey} missing`);
  const layout = layoutWorkbook(snapshot);
  const projection = projectTable(layout, table.id);
  if (!projection) throw new Error("ui capture: no projection");
  const location = projectedLocationForRef(projection, layout, {
    tableId: table.id,
    rowId: row.id,
    columnId,
  });
  if (!location) throw new Error("ui capture: cell not on sheet");
  const [col, rowIndex] = location;
  const sheet = snapshot.sheets.find((s) => s.tableIds.includes(table.id));
  if (!sheet) throw new Error("ui capture: sheet missing");
  session.setViewActiveSheet(sheet.id);
  session.setGridFocus({ tableId: table.id, col, row: rowIndex });
  session.setSelection(selectionForProjectedCell(projection, layout, col, rowIndex));
}

/** Drive workbook state the same way UI tests do (session API, no private DOM). */
export function runUiCaptureScenario(session: WorkbookSession, scenario: UiCaptureScenarioId): void {
  if (scenario === "properties-cell-multiline-formula") {
    session.setExplorerPinned(true);
    session.setPropertiesPinned(true);
    selectDataCell(session, "Params", "Start", "Value");
    return;
  }

  if (scenario === "properties-budget-unpinned-reveal") {
    session.setExplorerPinned(false);
    session.setPropertiesPinned(false);
    selectDataCell(session, "Resultat", "Bruttofortjeneste", "2025-06");
    return;
  }

  if (scenario === "properties-table-inspector") {
    session.setExplorerPinned(true);
    session.setPropertiesPinned(true);
    session.setTableTotalsRow("tbl-lines", true);
    session.setTableTotalsColumn("tbl-lines", true);
    session.setSelection({ kind: "table", tableId: "tbl-lines" });
    return;
  }

  throw new Error(`Unknown ui capture scenario: ${scenario}`);
}

export type TableInspectorCaptureMetrics = {
  scenario: "properties-table-inspector";
  checkRowCount: number;
  firstCheckRowFlexDirection: string;
  checkboxAboveLabelCenterPx: number;
  propertiesHasVerticalScroll: boolean;
};

export function measureTableInspectorPanel(): TableInspectorCaptureMetrics {
  const properties = document.querySelector<HTMLElement>(".wk-properties");
  if (!properties) throw new Error("ui capture: properties panel missing");
  const checkRows = [...properties.querySelectorAll<HTMLElement>(".wk-check-row")];
  if (checkRows.length < 2) throw new Error("ui capture: expected table inspector check rows");
  const first = checkRows[0]!;
  const box = first.getBoundingClientRect();
  const checkbox = first.querySelector("input[type=checkbox]");
  const label = first.querySelector("span");
  if (!checkbox || !label) throw new Error("ui capture: check row structure missing");
  const cbBox = checkbox.getBoundingClientRect();
  const labelBox = label.getBoundingClientRect();
  const checkboxCenterY = cbBox.top + cbBox.height / 2;
  const labelCenterY = labelBox.top + labelBox.height / 2;
  return {
    scenario: "properties-table-inspector",
    checkRowCount: checkRows.length,
    firstCheckRowFlexDirection: getComputedStyle(first).flexDirection,
    checkboxAboveLabelCenterPx: labelCenterY - checkboxCenterY,
    propertiesHasVerticalScroll: properties.scrollHeight > properties.clientHeight + 1,
  };
}

export function measurePropertiesValueField(scenario: UiCaptureScenarioId): UiCaptureMetrics {
  const host = document.querySelector<HTMLElement>(".wk-side-panel-host-properties");
  const properties = document.querySelector<HTMLElement>(".wk-properties");
  const textarea = document.querySelector<HTMLTextAreaElement>(".wk-formula-bar textarea");
  if (!host || !properties || !textarea) {
    throw new Error("ui capture: properties host, panel, or Value textarea missing");
  }
  const textareaHeight = textarea.offsetHeight;
  const textareaScrollHeight = textarea.scrollHeight;
  const propertiesClientHeight = properties.clientHeight;
  const propertiesScrollHeight = properties.scrollHeight;
  const hostClientHeight = host.clientHeight;
  const hostScrollHeight = host.scrollHeight;
  return {
    scenario,
    textareaHeight,
    textareaScrollHeight,
    textareaSlackPx: textareaHeight - textareaScrollHeight,
    propertiesClientHeight,
    propertiesScrollHeight,
    propertiesHasVerticalScroll: propertiesScrollHeight > propertiesClientHeight + 1,
    hostClientHeight,
    hostScrollHeight,
    hostHasVerticalScroll: hostScrollHeight > hostClientHeight + 1,
  };
}
