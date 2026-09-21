import { effectiveCell } from "../engine/compileWorkbook.js";
import { DEFAULT_CELL_FONT_SIZE, resolveCellStyle } from "../model/cellStyle.js";
import { formatDisplayValue, resolveCellFormat } from "../model/numberFormat.js";
import type { CellStyle, EvaluatedCell } from "../model/types.js";
import type { WorkbookLayout } from "../model/layout.js";
import { writePeriodIds } from "../model/yearColumns.js";
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
export const TABLE_ROW_HEIGHT = 28;
const CHAR_WIDTH = 7.4;
const BOLD_CHAR_WIDTH = 8;
const ITALIC_WIDTH = 1.06;

type FitSample = { text: string; bold?: boolean; italic?: boolean; fontSize?: number };

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

function measureFont(bold: boolean, italic: boolean, fontSize: number): string {
  const weight = bold ? (fontSize === DEFAULT_CELL_FONT_SIZE && !italic ? "600" : "bold") : "";
  return [italic ? "italic" : "", weight, `${fontSize}px "Segoe UI", sans-serif`].filter(Boolean).join(" ");
}

function cellFitStyle(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  col: number,
  row: number,
): CellStyle | undefined {
  const projected = projectedCell(projection, layout, col, row);
  if (projected.kind !== "table") return undefined;
  if (projected.hit.kind === "header" || projected.hit.kind === "key") return { bold: true };
  if (projected.hit.kind !== "cell") return undefined;
  const tableLayout = layout.tables.get(projected.hit.tableId);
  if (!tableLayout) return undefined;
  const sourceRow = tableLayout.table.rows.find((candidate) => candidate.id === projected.hit.rowId);
  const periodIds = writePeriodIds(tableLayout.table, projected.hit.columnId, layout.periods);
  const columnId = periodIds[0] ?? projected.hit.columnId;
  return resolveCellStyle(tableLayout.table, columnId, sourceRow?.cells[columnId]);
}

/** Deterministic Segoe-style estimate; used when canvas fonts are unavailable. */
export function estimateTextWidth(
  text: string,
  bold = false,
  fontSize = DEFAULT_CELL_FONT_SIZE,
  italic = false,
): number {
  if (!text) return 0;
  const unit = (bold ? BOLD_CHAR_WIDTH : CHAR_WIDTH) * (fontSize / DEFAULT_CELL_FONT_SIZE);
  let width = 0;
  for (const ch of text) {
    if (ch === " " || ch === "." || ch === "," || ch === "%") width += unit * 0.5;
    else width += unit;
  }
  return italic ? width * ITALIC_WIDTH : width;
}

export function measureCellTextWidth(
  text: string,
  bold = false,
  fontSize = DEFAULT_CELL_FONT_SIZE,
  italic = false,
): number {
  const estimated = estimateTextWidth(text, bold, fontSize, italic);
  const context = measureContext();
  if (!context) return estimated;
  context.font = measureFont(bold, italic, fontSize);
  const measured = context.measureText(text).width;
  return measured > 0 ? measured : estimated;
}

export function fittedColumnWidth(
  samples: readonly FitSample[],
  min: number,
  max = TABLE_MAX_COLUMN_WIDTH,
): number {
  let content = 0;
  for (const sample of samples) {
    if (!sample.text) continue;
    content = Math.max(
      content,
      measureCellTextWidth(sample.text, sample.bold, sample.fontSize ?? DEFAULT_CELL_FONT_SIZE, sample.italic),
    );
  }
  return Math.min(max, Math.max(min, Math.ceil(content + TABLE_CELL_X_PADDING)));
}

export function fittedRowHeight(fontSize = DEFAULT_CELL_FONT_SIZE): number {
  if (fontSize <= DEFAULT_CELL_FONT_SIZE) return TABLE_ROW_HEIGHT;
  return Math.ceil((fontSize * TABLE_ROW_HEIGHT) / DEFAULT_CELL_FONT_SIZE);
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
    const samples: FitSample[] = [];
    for (let row = 0; row < projection.rowCount; row++) {
      const text = visibleCellText(projection, layout, evaluated, col, row);
      if (!text) continue;
      const style = cellFitStyle(projection, layout, col, row);
      samples.push({
        text,
        bold: style?.bold,
        italic: style?.italic,
        fontSize: style?.fontSize,
      });
    }
    return { ...column, width: fittedColumnWidth(samples, min) };
  });
}

/** One height per projected row, grown to the largest font drawn on that row. */
export function fitProjectedRowHeights(projection: SheetGridProjection, layout: WorkbookLayout): number[] {
  return Array.from({ length: projection.rowCount }, (_, row) => {
    let fontSize = DEFAULT_CELL_FONT_SIZE;
    for (let col = 0; col < projection.colCount; col++) {
      const size = cellFitStyle(projection, layout, col, row)?.fontSize;
      if (size && size > fontSize) fontSize = size;
    }
    return fittedRowHeight(fontSize);
  });
}
