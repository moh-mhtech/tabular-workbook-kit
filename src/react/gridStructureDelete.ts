import {
  cellsInProjectedRange,
  labeledTableRect,
  selectionForProjectedCell,
  type SheetGridProjection,
} from "../grid/sheetProjection.js";
import type { WorkbookLayout } from "../model/layout.js";
import { isTotalColumnId, isTotalRowId } from "../model/tableTotals.js";
import {
  HEADER_ROW_ID,
  KEY_COLUMN_ID,
  isCellSelection,
  selectedCellRefs,
  type CellRef,
  type Selection,
  type TableSnapshot,
  type WorkbookSnapshot,
} from "../model/types.js";

export type StructureDeleteTarget = {
  tableId: string;
  rowIds?: string[];
  columnIds?: string[];
  label: string;
};

export type StructureDeleteCommands = {
  rows: StructureDeleteTarget | null;
  columns: StructureDeleteTarget | null;
};

function tableById(snapshot: WorkbookSnapshot, tableId: string): TableSnapshot | undefined {
  return snapshot.tables.find((t) => t.id === tableId);
}

function attributeColumn(table: TableSnapshot, columnId: string) {
  return table.attributeColumns.find((c) => c.id === columnId || c.name === columnId);
}

function isDeletableAttributeColumn(table: TableSnapshot, columnId: string): boolean {
  if (columnId === KEY_COLUMN_ID || isTotalColumnId(columnId)) return false;
  const col = attributeColumn(table, columnId);
  if (!col) return false;
  if (table.promoteRowKeys && table.attributeColumns[0]?.id === col.id) return false;
  return true;
}

function rowDeleteLabel(count: number): string {
  return count === 1 ? "Delete row" : "Delete rows";
}

function columnDeleteLabel(count: number): string {
  return count === 1 ? "Delete column" : "Delete columns";
}

function keyCellRefs(refs: readonly CellRef[]): CellRef[] {
  return refs.filter((ref) => ref.columnId === KEY_COLUMN_ID && ref.rowId !== HEADER_ROW_ID);
}

function headerCellRefs(refs: readonly CellRef[]): CellRef[] {
  return refs.filter((ref) => ref.rowId === HEADER_ROW_ID && ref.columnId !== KEY_COLUMN_ID);
}

function rowTargets(snapshot: WorkbookSnapshot, selection: Selection): StructureDeleteTarget | null {
  if (selection.kind === "row") {
    if (isTotalRowId(selection.rowId)) return null;
    const table = tableById(snapshot, selection.tableId);
    if (!table?.rows.some((r) => r.id === selection.rowId)) return null;
    return {
      tableId: selection.tableId,
      rowIds: [selection.rowId],
      label: rowDeleteLabel(1),
    };
  }
  if (selection.kind !== "cell") return null;
  const refs = selectedCellRefs(selection);
  const keys = keyCellRefs(refs);
  if (!keys.length) return null;
  const tableId = keys[0]!.tableId;
  if (!keys.every((ref) => ref.tableId === tableId)) return null;
  const table = tableById(snapshot, tableId);
  if (!table) return null;
  let rowIds = [...new Set(keys.map((ref) => ref.rowId))].filter((rowId) => {
    if (isTotalRowId(rowId)) return false;
    return table.rows.some((r) => r.id === rowId);
  });
  if (!rowIds.length) return null;
  rowIds.sort(
    (a, b) => table.rows.findIndex((r) => r.id === a) - table.rows.findIndex((r) => r.id === b),
  );
  if (rowIds.length >= table.rows.length) return null;
  return {
    tableId,
    rowIds,
    label: rowDeleteLabel(rowIds.length),
  };
}

function columnTargets(snapshot: WorkbookSnapshot, selection: Selection): StructureDeleteTarget | null {
  if (selection.kind === "column") {
    const table = tableById(snapshot, selection.tableId);
    if (!table || !isDeletableAttributeColumn(table, selection.columnId)) return null;
    const col = attributeColumn(table, selection.columnId)!;
    return {
      tableId: selection.tableId,
      columnIds: [col.id],
      label: columnDeleteLabel(1),
    };
  }
  if (selection.kind !== "cell") return null;
  const refs = selectedCellRefs(selection);
  const headers = headerCellRefs(refs);
  if (!headers.length) return null;
  const tableId = headers[0]!.tableId;
  if (!headers.every((ref) => ref.tableId === tableId)) return null;
  const table = tableById(snapshot, tableId);
  if (!table) return null;
  const columnIds = [...new Set(headers.map((ref) => ref.columnId))].filter((id) =>
    isDeletableAttributeColumn(table, id),
  );
  if (!columnIds.length) return null;
  const resolved = columnIds.map((id) => attributeColumn(table, id)!.id);
  return {
    tableId,
    columnIds: resolved,
    label: columnDeleteLabel(resolved.length),
  };
}

export function structureDeleteCommands(
  snapshot: WorkbookSnapshot,
  selection: Selection | null,
): StructureDeleteCommands {
  if (!selection) return { rows: null, columns: null };
  return {
    rows: rowTargets(snapshot, selection),
    columns: columnTargets(snapshot, selection),
  };
}

/** Delete commands for a full table range (Table corner context menu), without changing selection. */
export function structureDeleteCommandsForTableRange(
  snapshot: WorkbookSnapshot,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
): StructureDeleteCommands {
  const rect = labeledTableRect(projection);
  const refs = cellsInProjectedRange(projection, layout, rect);
  const primary =
    refs.find((ref) => ref.columnId !== KEY_COLUMN_ID && ref.rowId !== HEADER_ROW_ID) ?? refs[0];
  if (!primary) return { rows: null, columns: null };
  return structureDeleteCommands(snapshot, { kind: "cell", ...primary, range: refs });
}

function cellRefFromProjected(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): CellRef | null {
  const hit = selectionForProjectedCell(projection, layout, col, row);
  if (hit.kind === "cell") {
    return { tableId: hit.tableId, rowId: hit.rowId, columnId: hit.columnId };
  }
  if (hit.kind === "row") {
    return { tableId: hit.tableId, rowId: hit.rowId, columnId: KEY_COLUMN_ID };
  }
  if (hit.kind === "column") {
    return { tableId: hit.tableId, rowId: HEADER_ROW_ID, columnId: hit.columnId };
  }
  return null;
}

/** Whether a grid location is covered by the current workbook selection (for context-menu targeting). */
export function selectionIncludesProjectedCell(
  selection: Selection | null,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): boolean {
  if (!selection) return false;
  const ref = cellRefFromProjected(projection, layout, col, row);
  if (!ref) return false;
  if (selection.kind === "row") {
    return selection.tableId === ref.tableId && selection.rowId === ref.rowId;
  }
  if (selection.kind === "column") {
    return selection.tableId === ref.tableId && selection.columnId === ref.columnId;
  }
  if (isCellSelection(selection)) {
    return selectedCellRefs(selection).some(
      (candidate) =>
        candidate.tableId === ref.tableId &&
        candidate.rowId === ref.rowId &&
        candidate.columnId === ref.columnId,
    );
  }
  return false;
}
