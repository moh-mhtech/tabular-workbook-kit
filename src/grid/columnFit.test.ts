import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { formatDisplayValue } from "../model/numberFormat.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import type { EvaluatedCell } from "../model/types.js";
import {
  TABLE_CELL_X_PADDING,
  TABLE_MAX_COLUMN_WIDTH,
  TABLE_ROW_HEIGHT,
  estimateTextWidth,
  fitProjectedColumnWidths,
  fitProjectedRowHeights,
  fittedColumnWidth,
  fittedRowHeight,
  visibleCellText,
} from "./columnFit.js";
import {
  GROWTH_HEADER_MARK,
  TABLE_GROWTH_COLUMN_WIDTH,
  TABLE_KEY_COLUMN_WIDTH,
  projectTable,
} from "./sheetProjection.js";

describe("column fit", () => {
  it("sizes a column to its widest sample, clamped to min and max", () => {
    expect(fittedColumnWidth([], TABLE_KEY_COLUMN_WIDTH)).toBe(TABLE_KEY_COLUMN_WIDTH);
    expect(fittedColumnWidth([{ text: "1" }], TABLE_KEY_COLUMN_WIDTH)).toBe(TABLE_KEY_COLUMN_WIDTH);
    expect(
      fittedColumnWidth([{ text: "AlternateShare", bold: true }], TABLE_KEY_COLUMN_WIDTH),
    ).toBe(
      Math.ceil(estimateTextWidth("AlternateShare", true) + TABLE_CELL_X_PADDING),
    );
    expect(fittedColumnWidth([{ text: "x".repeat(80) }], TABLE_KEY_COLUMN_WIDTH)).toBe(TABLE_MAX_COLUMN_WIDTH);
  });

  it("fits key and value columns to visible contents and leaves the growth gutter narrow", () => {
    const snapshot = createSampleWorkbook();
    const layout = layoutWorkbook(snapshot);
    const params = projectTable(layout, "tbl-params")!;
    const lines = projectTable(layout, "tbl-lines")!;
    const columns = fitProjectedColumnWidths(params, layout);

    expect(params.growthColumn).toBe(false);
    expect(columns[2]).toBeUndefined();
    expect(columns[0]!.width).toBeGreaterThan(TABLE_GROWTH_COLUMN_WIDTH);
    expect(columns[0]!.width).toBe(
      Math.ceil(estimateTextWidth("AlternateShare", true) + TABLE_CELL_X_PADDING),
    );
    expect(columns[1]!.width).toBeGreaterThan(TABLE_GROWTH_COLUMN_WIDTH);
    expect(columns[1]!.width).toBeGreaterThanOrEqual(
      Math.ceil(estimateTextWidth(formatDisplayValue(8_000_000)) + TABLE_CELL_X_PADDING),
    );
    expect(fitProjectedColumnWidths(lines, layout).at(-1)?.width).toBe(TABLE_GROWTH_COLUMN_WIDTH);
  });

  it("uses evaluated display values, not formula text", () => {
    const layout = layoutWorkbook(createSampleWorkbook());
    const projection = projectTable(layout, "tbl-params")!;
    expect(visibleCellText(projection, layout, new Map(), 1, 7)).toBe("");
    expect(visibleCellText(projection, layout, new Map(), 0, 8)).toBe(GROWTH_HEADER_MARK);
    expect(visibleCellText(projectTable(layout, "tbl-lines")!, layout, new Map(), projectTable(layout, "tbl-lines")!.colCount - 1, 0)).toBe(
      GROWTH_HEADER_MARK,
    );

    const evaluated = new Map<string, EvaluatedCell>([
      [
        "tbl-params\u001frow-start\u001fValue",
        { kind: "formula", formula: "=IF(Params[Growth]=0,1,2)", input: null, overlay: false, computed: 1234567 },
      ],
    ]);
    expect(visibleCellText(projection, layout, evaluated, 1, 7)).toBe(formatDisplayValue(1234567));
    const columns = fitProjectedColumnWidths(projection, layout, evaluated);
    expect(columns[1]!.width).toBeGreaterThanOrEqual(
      Math.ceil(estimateTextWidth(formatDisplayValue(1234567)) + TABLE_CELL_X_PADDING),
    );
  });

  it("grows a column when a cell is drawn in a larger font", () => {
    const plainSnapshot = createSampleWorkbook();
    const styledSnapshot = createSampleWorkbook();
    styledSnapshot.tables[0]!.rows[2]!.cells.Value!.style = { fontSize: 36 };
    const plainLayout = layoutWorkbook(plainSnapshot);
    const styledLayout = layoutWorkbook(styledSnapshot);
    const plain = fitProjectedColumnWidths(projectTable(plainLayout, "tbl-params")!, plainLayout);
    const styled = fitProjectedColumnWidths(projectTable(styledLayout, "tbl-params")!, styledLayout);
    expect(styled[1]!.width).toBeGreaterThan(plain[1]!.width);
    expect(estimateTextWidth("0.25", false, 36)).toBeGreaterThan(estimateTextWidth("0.25"));
  });

  it("treats cell bold as wider than the same text at regular weight", () => {
    expect(fittedColumnWidth([{ text: "AlternateShare", bold: true }], 0)).toBeGreaterThan(
      fittedColumnWidth([{ text: "AlternateShare" }], 0),
    );
    const plainSnapshot = createSampleWorkbook();
    const styledSnapshot = createSampleWorkbook();
    styledSnapshot.tables[0]!.attributeColumns[0]!.style = { bold: true };
    const plainLayout = layoutWorkbook(plainSnapshot);
    const styledLayout = layoutWorkbook(styledSnapshot);
    const plain = fitProjectedColumnWidths(projectTable(plainLayout, "tbl-params")!, plainLayout);
    const styled = fitProjectedColumnWidths(projectTable(styledLayout, "tbl-params")!, styledLayout);
    expect(styled[1]!.width).toBeGreaterThan(plain[1]!.width);
  });

  it("grows the row that holds a larger font and leaves other rows at the floor", () => {
    const snapshot = createSampleWorkbook();
    snapshot.tables[0]!.rows[2]!.cells.Value!.style = { fontSize: 36 };
    const layout = layoutWorkbook(snapshot);
    const heights = fitProjectedRowHeights(projectTable(layout, "tbl-params")!, layout);
    expect(fittedRowHeight()).toBe(TABLE_ROW_HEIGHT);
    expect(fittedRowHeight(13)).toBe(TABLE_ROW_HEIGHT);
    expect(fittedRowHeight(36)).toBeGreaterThan(TABLE_ROW_HEIGHT);
    expect(heights[0]).toBe(TABLE_ROW_HEIGHT);
    expect(heights[1]).toBe(TABLE_ROW_HEIGHT);
    expect(heights[3]).toBe(fittedRowHeight(36));
    expect(heights[3]).toBeGreaterThan(heights[2]!);
  });
});
