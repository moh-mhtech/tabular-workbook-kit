import { effectiveCell } from "../engine/compileWorkbook.js";
import type { WorkbookLayout } from "../model/layout.js";
import type { WorkbookSession } from "../session/WorkbookSession.js";
import {
  projectedCell,
  type SheetGridProjection,
} from "../grid/sheetProjection.js";

export interface CustomGridEdit {
  location: readonly [number, number];
  value: { data?: unknown };
}

export function rawGridValue(value: { data?: unknown }): string {
  const data = value.data;
  if (data === null || data === undefined) return "";
  if (Array.isArray(data)) return data.join(", ");
  return String(data);
}

/**
 * Applies a Glide edit batch as one session transaction. Coordinates outside
 * table cells and their direct growth margins are intentionally discarded.
 */
export function applyCustomGridEdits(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  edits: readonly CustomGridEdit[],
): number {
  const accepted = edits.filter(({ location: [col, row] }) => {
    return projectedCell(projection, layout, col, row).kind !== "readonly";
  });
  if (!accepted.length) return 0;

  session.transact(() => {
    for (const edit of accepted) {
      const [col, row] = edit.location;
      session.writeGridCell(
        projection.sheetId,
        row + projection.originRow,
        col + projection.originCol,
        rawGridValue(edit.value),
      );
    }
  });
  return accepted.length;
}

export interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function applyCustomGridClear(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  rect: GridRect,
): number {
  const edits: CustomGridEdit[] = [];
  for (let row = rect.y; row < rect.y + rect.height; row++) {
    for (let col = rect.x; col < rect.x + rect.width; col++) {
      edits.push({ location: [col, row], value: { data: "" } });
    }
  }
  return applyCustomGridEdits(session, projection, layout, edits);
}

/** Copies the source rectangle into the destination, wrapping like Excel's fill handle. */
export function applyCustomGridFill(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  patternSource: GridRect,
  fillDestination: GridRect,
): number {
  const edits: CustomGridEdit[] = [];
  for (let row = fillDestination.y; row < fillDestination.y + fillDestination.height; row++) {
    for (let col = fillDestination.x; col < fillDestination.x + fillDestination.width; col++) {
      const srcCol =
        patternSource.x +
        ((((col - patternSource.x) % patternSource.width) + patternSource.width) % patternSource.width);
      const srcRow =
        patternSource.y +
        ((((row - patternSource.y) % patternSource.height) + patternSource.height) % patternSource.height);
      edits.push({
        location: [col, row],
        value: { data: readProjectedRaw(session, projection, layout, srcCol, srcRow) },
      });
    }
  }
  return applyCustomGridEdits(session, projection, layout, edits);
}

export function readProjectedRaw(
  session: WorkbookSession,
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): string {
  const cell = projectedCell(projection, layout, col, row);
  if (cell.kind !== "table") return "";
  const table = layout.tables.get(cell.hit.tableId);
  if (!table) return "";
  const hit = cell.hit;
  if (hit.kind === "header") {
    return table.columns.find((column) => column.id === hit.columnId)?.name ?? "";
  }
  if (hit.kind === "key") {
    return table.table.rows.find((candidate) => candidate.id === hit.rowId)?.key ?? "";
  }
  const source = effectiveCell(session.getSnapshot(), hit.tableId, hit.rowId, hit.columnId);
  if (source.kind === "formula") return source.formula ?? "";
  if (source.value === null || source.value === undefined) return "";
  return String(source.value);
}

