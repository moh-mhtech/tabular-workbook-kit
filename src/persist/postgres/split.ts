import { overlayKey, type Primitive, type TableSnapshot, type WorkbookSnapshot } from "../../model/types.js";

export type OverlayCells = Record<string, Record<string, Primitive>>;

export type TableStored = Pick<
  TableSnapshot,
  | "locked"
  | "promoteRowKeys"
  | "attributeColumns"
  | "yearColumns"
  | "columnFormats"
  | "columnStyles"
  | "rows"
>;

export function sheetIdForTable(snapshot: WorkbookSnapshot, tableId: string): string {
  const sheet = snapshot.sheets.find((candidate) => candidate.tableIds.includes(tableId));
  return sheet?.id ?? "";
}

export function storedFromTable(table: TableSnapshot): TableStored {
  return {
    locked: table.locked,
    promoteRowKeys: table.promoteRowKeys,
    attributeColumns: table.attributeColumns,
    yearColumns: table.yearColumns,
    columnFormats: table.columnFormats,
    columnStyles: table.columnStyles,
    rows: table.rows,
  };
}

export function overlaysByTable(snapshot: WorkbookSnapshot): Map<string, Map<string, OverlayCells>> {
  const byTable = new Map<string, Map<string, OverlayCells>>();
  for (const scenario of snapshot.scenarios) {
    for (const [key, value] of Object.entries(scenario.overlays)) {
      const [tableId, rowId, columnId] = key.split("\u001f");
      if (!tableId || !rowId || !columnId) continue;
      let byScenario = byTable.get(tableId);
      if (!byScenario) {
        byScenario = new Map();
        byTable.set(tableId, byScenario);
      }
      let cells = byScenario.get(scenario.id);
      if (!cells) {
        cells = {};
        byScenario.set(scenario.id, cells);
      }
      cells[rowId] ??= {};
      cells[rowId]![columnId] = value;
    }
  }
  return byTable;
}

export function flattenOverlays(tableId: string, cells: OverlayCells): Record<string, Primitive> {
  const overlays: Record<string, Primitive> = {};
  for (const [rowId, columns] of Object.entries(cells)) {
    for (const [columnId, value] of Object.entries(columns)) {
      overlays[overlayKey(tableId, rowId, columnId)] = value;
    }
  }
  return overlays;
}
