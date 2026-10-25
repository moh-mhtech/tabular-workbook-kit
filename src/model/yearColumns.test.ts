import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { evenSplit, hideGrowthColumn, visibleTimeSlots } from "./yearColumns.js";
import { buildPeriods } from "./calendar.js";

describe("year columns", () => {
  it("even-splits so the last month absorbs the remainder", () => {
    const parts = evenSplit(1000, 12);
    expect(parts).toHaveLength(12);
    expect(parts.slice(0, -1).every((value) => value === 1000 / 12)).toBe(true);
    expect(parts[11]).toBeCloseTo(1000 - (1000 / 12) * 11, 10);
    expect(parts.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1000, 10);
  });

  it("hides the growth column on promoteRowKeys tables", () => {
    const snapshot = createSampleWorkbook();
    const params = snapshot.tables.find((table) => table.id === "tbl-params")!;
    const salg = snapshot.tables.find((table) => table.id === "tbl-sales")!;
    expect(hideGrowthColumn(params)).toBe(true);
    expect(hideGrowthColumn(salg)).toBe(false);
    expect(visibleTimeSlots(salg, buildPeriods(snapshot.calendar))).toHaveLength(12);
  });

  it("writes an even split onto stored months and does not rewrite them when grain changes", async () => {
    const session = new WorkbookSession(createSampleWorkbook(), new HyperFormulaEngine());
    await session.recalculate();
    session.setYearColumnGrain("Sales", "yc-2025", "year");
    session.writeCell("Sales", "CNC", "2025", "1200");
    const row = session.getSnapshot().tables.find((table) => table.id === "tbl-sales")!.rows[0]!;
    for (let month = 1; month <= 12; month++) {
      expect(row.cells[`2025-${String(month).padStart(2, "0")}`]).toEqual({ kind: "input", value: 100 });
    }
    session.setYearColumnGrain("Sales", "yc-2025", "quarter");
    session.writeCell("Sales", "CNC", "2025-Q1", "300");
    expect(row.cells["2025-01"]).toEqual({ kind: "input", value: 100 });
    expect(row.cells["2025-02"]).toEqual({ kind: "input", value: 100 });
    expect(row.cells["2025-03"]).toEqual({ kind: "input", value: 100 });
    session.setYearColumnGrain("Sales", "yc-2025", "month");
    expect(row.cells["2025-04"]).toEqual({ kind: "input", value: 100 });
  });

  it("extends the calendar when a later year-column is added and leaves it when removed", () => {
    const session = new WorkbookSession(createSampleWorkbook());
    session.addYearColumn("Sales", 2026, "year");
    expect(session.getSnapshot().calendar).toEqual({ startMonth: "2025-01", monthCount: 24 });
    const added = session.getSnapshot().tables.find((table) => table.id === "tbl-sales")!.yearColumns!;
    expect(added.map((col) => col.year)).toEqual([2025, 2026]);
    session.removeYearColumn("Sales", "yc-2026");
    expect(session.getSnapshot().calendar.monthCount).toBe(24);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-sales")!.yearColumns).toEqual([
      { id: "yc-2025", year: 2025, grain: "month" },
    ]);
  });
});
