import { effectiveCell } from "../engine/compileWorkbook.js";
import { formatDisplayValue, resolveCellFormat } from "../model/numberFormat.js";
import type { EvaluatedCell } from "../model/types.js";
import type { WorkbookLayout } from "../model/layout.js";
import {
  GROWTH_HEADER_MARK,
  TABLE_GROWTH_COLUMN_WIDTH,
  TABLE_KEY_COLUMN_WIDTH,
  isGrowthHeaderCell,
  projectedCell,
  type SheetGridColumn,
  type SheetGridProjection,
} from "./sheetProjection.js";

export const TABLE_MAX_COLUMN_WIDTH = 360;
export const TABLE_CELL_X_PADDING = 16;
const CELL_FONT = '13px "Segoe UI", sans-serif';
const HEADER_FONT = '600 13px "Segoe UI", sans-serif';
const CHAR_WIDTH = 7.4;
const BOLD_CHAR_WIDTH = 8;

let measureCtx: CanvasRenderingContext2D | undefined;

function measureContext(): CanvasRenderingContext2D | undefined {
  if (measureCtx) return measureCtx;
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  measureCtx = context;
  return context;
}

/** Deterministic 13px Segoe-style estimate; used when canvas fonts are unavailable. */
export function estimateTextWidth(text: string, bold = false): number {
  if (!text) return 0;
  const unit = bold ? BOLD_CHAR_WIDTH : CHAR_WIDTH;
  let width = 0;
  for (const ch of text) {
    if (ch === " " || ch === "." || ch === "," || ch === "%") width += unit * 0.5;
    else width += unit;
  }
  return width;
}

export function measureCellTextWidth(text: string, bold = false): number {
  const estimated = estimateTextWidth(text, bold);
  const context = measureContext();
  if (!context) return estimated;
  context.font = bold ? HEADER_FONT : CELL_FONT;
  const measured = context.measureText(text).width;
  return measured > 0 ? measured : estimated;
}

export function fittedColumnWidth(
  samples: readonly { text: string; bold?: boolean }[],
  min: number,
  max = TABLE_MAX_COLUMN_WIDTH,
): number {
  let content = 0;
  for (const sample of samples) {
    if (!sample.text) continue;
    content = Math.max(content, measureCellTextWidth(sample.text, sample.bold));
  }
  return Math.min(max, Math.max(min, Math.ceil(content + TABLE_CELL_X_PADDING)));
}

/** Visible grid text: headers, row keys, and formatted evaluated values — not formulas. */
export function visibleCellText(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  evaluated: ReadonlyMap<string, EvaluatedCell>,
  col: number,
  row: number,
): string {
  const projected = projectedCell(projection, layout, col, row);
  if (isGrowthHeaderCell(projection, col, row)) return GROWTH_HEADER_MARK;
  if (projected.kind !== "table") return "";
  const tableLayout = layout.tables.get(projected.hit.tableId);
  if (!tableLayout) return "";
  const hit = projected.hit;
  if (hit.kind === "header") {
    return tableLayout.columns.find((column) => column.id === hit.columnId)?.name ?? "";
  }
  if (hit.kind === "key") {
    return tableLayout.table.rows.find((candidate) => candidate.id === hit.rowId)?.key ?? "";
  }
  const value = evaluated.get(`${hit.tableId}\u001f${hit.rowId}\u001f${hit.columnId}`);
  const source = effectiveCell(layout.snapshot, hit.tableId, hit.rowId, hit.columnId);
  const sourceRow = tableLayout.table.rows.find((candidate) => candidate.id === hit.rowId);
  const pattern = resolveCellFormat(tableLayout.table, hit.columnId, sourceRow?.cells[hit.columnId]);
  const computed = value?.computed ?? (source.kind === "input" ? source.value ?? null : null);
  return formatDisplayValue(computed, pattern);
}

/** Grows each column to the widest visible cell, with a small floor for empty/growth columns. */
export function fitProjectedColumnWidths(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  evaluated: ReadonlyMap<string, EvaluatedCell> = new Map(),
): SheetGridColumn[] {
  return projection.columns.map((column, col) => {
    const table = projection.tableId ? layout.tables.get(projection.tableId) : undefined;
    const min = table?.columns[col] ? TABLE_KEY_COLUMN_WIDTH : TABLE_GROWTH_COLUMN_WIDTH;
    const samples: { text: string; bold?: boolean }[] = [];
    for (let row = 0; row < projection.rowCount; row++) {
      const text = visibleCellText(projection, layout, evaluated, col, row);
      if (!text) continue;
      const projected = projectedCell(projection, layout, col, row);
      const bold = projected.kind === "table" && (projected.hit.kind === "header" || projected.hit.kind === "key");
      samples.push({ text, bold });
    }
    return { ...column, width: fittedColumnWidth(samples, min) };
  });
}
