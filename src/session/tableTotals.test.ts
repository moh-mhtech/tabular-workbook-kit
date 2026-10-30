import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { TOTAL_ROW_ID } from "../model/tableTotals.js";
import { bandCellKey, KEY_COLUMN_ID } from "../model/types.js";
import { WorkbookSession } from "./WorkbookSession.js";

describe("table totals row", () => {
  it("sums data rows for each Period on the Total row", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    const red = session.getCell("Lines", "Red", "2025-01").computed as number;
    const secondary = session.getCell("Lines", "Secondary", "2025-01").computed as number;
    const channel = session.getCell("Lines", "Channel", "2025-01").computed as number;
    expect(session.getCell("Lines", "Total", "2025-01").computed).toBe(red + secondary + channel);
  });

  it("updates the Total row when a data row is added", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    const extra = session.addRow("tbl-lines");
    session.renameRow("tbl-lines", extra.id, "Extra");
    session.setInput("Lines", "Extra", "2025-01", 100);
    await session.recalculate();
    const red = session.getCell("Lines", "Red", "2025-01").computed as number;
    const secondary = session.getCell("Lines", "Secondary", "2025-01").computed as number;
    const channel = session.getCell("Lines", "Channel", "2025-01").computed as number;
    expect(session.getCell("Lines", "Total", "2025-01").computed).toBe(red + secondary + channel + 100);
  });

  it("keeps Lines[Jan][Total] valid for other tables", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    expect(session.getCell("Teams", "RequiredNum", "2025-01").computed).toBe(1);
    expect(session.getCell("Result", "Inbound", "2025-01").computed).toBe(
      session.getCell("Lines", "Total", "2025-01").computed,
    );
  });

  it("rejects editing a Total row cell", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    expect(() => session.setInput("Lines", "Total", "2025-01", 1)).toThrow(/computed/i);
  });

  it("sums only rows in Total row range", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    session.setTableTotalsRowRange("tbl-lines", "Red,Channel");
    await session.recalculate();
    const red = session.getCell("Lines", "Red", "2025-01").computed as number;
    const channel = session.getCell("Lines", "Channel", "2025-01").computed as number;
    expect(session.getCell("Lines", "Total", "2025-01").computed).toBe(red + channel);
  });

  it("exposes Total row values at quarter grain", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    const table = session.getSnapshot().tables.find((t) => t.id === "tbl-lines")!;
    session.setYearColumnGrain("tbl-lines", table.yearColumns![0]!.id, "quarter");
    await session.recalculate();
    const total = session
      .getTable("Lines", { timeGrain: "quarter" })
      .rows.find((row) => row.key === "Total")
      ?.cells["2025-Q1"]?.computed;
    expect(typeof total).toBe("number");
    expect(total as number).toBeGreaterThan(0);
  });

  it("stores band cell style on Total row and row key cells", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    session.setCellStyle("tbl-lines", TOTAL_ROW_ID, "2025-01", { fillColor: "#112233" });
    session.setCellStyle("tbl-lines", "row-red", KEY_COLUMN_ID, { italic: true });
    const table = session.getSnapshot().tables.find((t) => t.id === "tbl-lines")!;
    expect(table.bandCellStyles?.[bandCellKey(TOTAL_ROW_ID, "2025-01")]).toEqual({ fillColor: "#112233" });
    expect(table.bandCellStyles?.[bandCellKey("row-red", KEY_COLUMN_ID)]).toEqual({ italic: true });
  });
});
