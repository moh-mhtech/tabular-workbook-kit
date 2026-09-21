import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { formatDisplayValue } from "../model/numberFormat.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import type { EvaluatedCell } from "../model/types.js";
import {
  TABLE_CELL_X_PADDING,
  TABLE_MAX_COLUMN_WIDTH,
  estimateTextWidth,
  fitProjectedColumnWidths,
  fittedColumnWidth,
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
      fittedColumnWidth([{ text: "AndelOutsource", bold: true }], TABLE_KEY_COLUMN_WIDTH),
    ).toBe(
      Math.ceil(estimateTextWidth("AndelOutsource", true) + TABLE_CELL_X_PADDING),
    );
    expect(fittedColumnWidth([{ text: "x".repeat(80) }], TABLE_KEY_COLUMN_WIDTH)).toBe(TABLE_MAX_COLUMN_WIDTH);
  });

  it("fits key and value columns to visible contents and leaves the growth gutter narrow", () => {
    const snapshot = createPlaygroundWorkbook();
    const layout = layoutWorkbook(snapshot);
    const projection = projectTable(layout, "tbl-params")!;
    const columns = fitProjectedColumnWidths(projection, layout);

    expect(columns[2]?.width).toBe(TABLE_GROWTH_COLUMN_WIDTH);
    expect(columns[0]!.width).toBeGreaterThan(TABLE_GROWTH_COLUMN_WIDTH);
    expect(columns[0]!.width).toBe(
      Math.ceil(estimateTextWidth("AndelOutsource", true) + TABLE_CELL_X_PADDING),
    );
    expect(columns[1]!.width).toBeGreaterThan(TABLE_GROWTH_COLUMN_WIDTH);
    expect(columns[1]!.width).toBeGreaterThanOrEqual(
      Math.ceil(estimateTextWidth(formatDisplayValue(8_000_000)) + TABLE_CELL_X_PADDING),
    );
  });

  it("uses evaluated display values, not formula text", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const projection = projectTable(layout, "tbl-params")!;
    expect(visibleCellText(projection, layout, new Map(), 1, 7)).toBe("");
    expect(visibleCellText(projection, layout, new Map(), 0, 8)).toBe(GROWTH_HEADER_MARK);
    expect(visibleCellText(projection, layout, new Map(), 2, 0)).toBe(GROWTH_HEADER_MARK);

    const evaluated = new Map<string, EvaluatedCell>([
      [
        "tbl-params\u001frow-start\u001fValue",
        { kind: "formula", formula: "=IF(Params[Vækst]=0,1,2)", input: null, overlay: false, computed: 1234567 },
      ],
    ]);
    expect(visibleCellText(projection, layout, evaluated, 1, 7)).toBe(formatDisplayValue(1234567));
    const columns = fitProjectedColumnWidths(projection, layout, evaluated);
    expect(columns[1]!.width).toBeGreaterThanOrEqual(
      Math.ceil(estimateTextWidth(formatDisplayValue(1234567)) + TABLE_CELL_X_PADDING),
    );
  });
});
