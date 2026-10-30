import { layoutWorkbook } from "../model/layout.js";
import { projectedLocationForRef, projectTable, selectionForProjectedCell } from "../grid/sheetProjection.js";
import type { WorkbookSession } from "../session/WorkbookSession.js";

export type UiCaptureScenarioId =
  | "properties-cell-multiline-formula"
  | "properties-budget-unpinned-reveal";

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

  throw new Error(`Unknown ui capture scenario: ${scenario}`);
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
