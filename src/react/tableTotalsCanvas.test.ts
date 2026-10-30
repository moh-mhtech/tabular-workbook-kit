import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { projectTable } from "../grid/sheetProjection.js";
import { layoutWorkbook } from "../model/layout.js";
import { TOTAL_ROW_ID } from "../model/tableTotals.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { evaluatedCells, gridCell } from "./CustomSheetCanvas.js";

describe("Total row canvas at quarter grain", () => {
  it("aggregates monthly total cells into the quarter column", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    session.setYearColumnGrain("tbl-lines", "yc-2025", "quarter");
    await session.recalculate();
    const snapshot = session.getSnapshot();
    const layout = layoutWorkbook(snapshot);
    const projection = projectTable(layout, "tbl-lines")!;
    const values = evaluatedCells(session, snapshot);
    const totalRow = layout.tables.get("tbl-lines")!.rows.find((row) => row.id === TOTAL_ROW_ID)!;
    const q1Col = projection.columns.findIndex((column) => column.title === "2025-Q1");
    expect(q1Col).toBeGreaterThan(0);
    const cell = gridCell(projection, layout, values, [q1Col, totalRow.rowIndex - projection.originRow]);
    expect(cell.displayData).toMatch(/\d/);
  });
});
