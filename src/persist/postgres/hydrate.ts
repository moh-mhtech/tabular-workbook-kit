import type { ScenarioSnapshot, SheetSnapshot, TableSnapshot, WorkbookSnapshot } from "../../model/types.js";
import { flattenOverlays, type OverlayCells, type TableStored } from "./split.js";

export function hydrateWorkbook(args: {
  id: string;
  name: string;
  calendar: WorkbookSnapshot["calendar"];
  sheets: SheetSnapshot[];
  scenarioList: { id: string; name: string }[];
  activeScenarioId: string | null;
  tables: { tableId: string; name: string; stored: TableStored }[];
  overlays: { tableId: string; scenarioId: string; cells: OverlayCells }[];
}): WorkbookSnapshot {
  const tables: TableSnapshot[] = args.tables.map(({ tableId, name, stored }) => ({
    id: tableId,
    name,
    attributeColumns: stored.attributeColumns,
    yearColumns: stored.yearColumns,
    rows: stored.rows,
    locked: stored.locked,
    promoteRowKeys: stored.promoteRowKeys,
    columnFormats: stored.columnFormats,
    columnStyles: stored.columnStyles,
  }));

  const scenarios: ScenarioSnapshot[] = args.scenarioList.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    overlays: Object.assign(
      {},
      ...args.overlays
        .filter((overlay) => overlay.scenarioId === scenario.id)
        .map((overlay) => flattenOverlays(overlay.tableId, overlay.cells)),
    ),
  }));

  return {
    id: args.id,
    name: args.name,
    calendar: args.calendar,
    sheets: args.sheets,
    tables,
    scenarios,
    activeScenarioId: args.activeScenarioId,
  };
}
