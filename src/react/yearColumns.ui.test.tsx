/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { projectTable } from "../grid/sheetProjection.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { installGridDom, renderPlaygroundCanvas, selectProjectedCell } from "./playgroundCanvasTest.js";
import { applyCustomGridEdits } from "./customGridInteractions.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("year-column canvas", () => {
  it("keeps a Params growth row and hides the growth column", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    const params = projectTable(layoutWorkbook(session.getSnapshot()), "tbl-params")!;
    expect(params.growthColumn).toBe(false);
    expect(params.columns.map((column) => column.title)).toEqual(["", "Value"]);
    await act(async () => {
      applyCustomGridEdits(session, params, layoutWorkbook(session.getSnapshot()), [
        { location: [0, params.rowCount - 1], value: { data: "Extra" } },
      ]);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows.some((row) => row.key === "Extra")).toBe(
      true,
    );
    expect(() => session.deleteColumn("Params", "Value")).toThrow(/cannot be deleted/);
  });

  it("shows 12 Sales month headers and 4 after the selected year-column grain becomes quarter", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sales" }));
    });
    const month = projectTable(layoutWorkbook(session.getSnapshot()), "tbl-sales")!;
    expect(month.columns.filter((column) => column.title).map((column) => column.title)).toHaveLength(12);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Quarter" }));
    });
    await act(async () => {
      await session.recalculate();
    });
    const quarter = projectTable(layoutWorkbook(session.getSnapshot()), "tbl-sales")!;
    expect(quarter.columns.filter((column) => column.title).map((column) => column.title)).toEqual([
      "2025-Q1",
      "2025-Q2",
      "2025-Q3",
      "2025-Q4",
    ]);
    const jan = session.getCell("Sales", "Total", "2025-01").computed as number;
    const feb = session.getCell("Sales", "Total", "2025-02").computed as number;
    const mar = session.getCell("Sales", "Total", "2025-03").computed as number;
    expect(session.getTable("Sales", { timeGrain: "quarter" }).rows.find((row) => row.key === "Total")!.cells["2025-Q1"].computed).toBeCloseTo(
      jan + feb + mar,
      4,
    );
  });

  it("even-splits a year or quarter number onto stored months and last month absorbs 1000/12", async () => {
    const snapshot = createSampleWorkbook();
    snapshot.tables.push({
      id: "tbl-rev",
      name: "Rev",
      yearColumns: [{ id: "yc-2025", year: 2025, grain: "year" }],
      attributeColumns: [],
      rows: [
        {
          id: "row-rev",
          key: "A",
          cells: Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => [`2025-${String(i + 1).padStart(2, "0")}`, { kind: "input" as const, value: 0 }]),
          ),
        },
      ],
    });
    snapshot.sheets[1]!.tableIds.push("tbl-rev");
    const { session } = await renderPlaygroundCanvas({ snapshot, chrome: true });
    await act(async () => {
      session.writeCell("Rev", "A", "2025", "1200");
    });
    const row = () => session.getSnapshot().tables.find((table) => table.id === "tbl-rev")!.rows[0]!;
    for (let month = 1; month <= 12; month++) {
      expect(row().cells[`2025-${String(month).padStart(2, "0")}`]?.value).toBe(100);
    }
    await act(async () => {
      session.setYearColumnGrain("Rev", "yc-2025", "quarter");
      session.writeCell("Rev", "A", "2025-Q1", "300");
    });
    expect(row().cells["2025-01"]?.value).toBe(100);
    expect(row().cells["2025-02"]?.value).toBe(100);
    expect(row().cells["2025-03"]?.value).toBe(100);
    await act(async () => {
      session.setYearColumnGrain("Rev", "yc-2025", "year");
      session.writeCell("Rev", "A", "2025", "1000");
    });
    const months = Array.from({ length: 12 }, (_, i) => row().cells[`2025-${String(i + 1).padStart(2, "0")}`]?.value as number);
    expect(months.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1000, 10);
    expect(months[11]).toBeCloseTo(1000 - (1000 / 12) * 11, 10);
  });

  it("overwrites mixed formula and input months when even-splitting a quarter number", async () => {
    const snapshot = createSampleWorkbook();
    snapshot.tables.push({
      id: "tbl-mix",
      name: "Mix",
      yearColumns: [{ id: "yc-2025", year: 2025, grain: "quarter" }],
      attributeColumns: [],
      rows: [
        {
          id: "row-mix",
          key: "A",
          cells: {
            "2025-01": { kind: "formula", formula: "=1" },
            "2025-02": { kind: "input", value: 50 },
            "2025-03": { kind: "input", value: 50 },
          },
        },
      ],
    });
    snapshot.sheets[1]!.tableIds.push("tbl-mix");
    const { session } = await renderPlaygroundCanvas({ snapshot });
    await act(async () => {
      session.writeCell("Mix", "A", "2025-Q1", "300");
    });
    const row = session.getSnapshot().tables.find((table) => table.id === "tbl-mix")!.rows[0]!;
    expect(row.cells["2025-01"]).toEqual({ kind: "input", value: 100 });
    expect(row.cells["2025-02"]).toEqual({ kind: "input", value: 100 });
    expect(row.cells["2025-03"]).toEqual({ kind: "input", value: 100 });
  });

  it("keeps Sales[Jan] on the first year when a yearly 2026 column is added", async () => {
    const { session } = await renderPlaygroundCanvas();
    await act(async () => {
      session.addYearColumn("Sales", 2026, "year");
    });
    const salg = projectTable(layoutWorkbook(session.getSnapshot()), "tbl-sales")!;
    expect(salg.columns.some((column) => column.id === "2025-01")).toBe(true);
    expect(salg.columns.some((column) => column.id === "2026")).toBe(true);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-sales")!.rows[0]!.cells["2025-01"]?.formula).toContain(
      "CncShare",
    );
  });

  it("selects the Sales data Growth cell as Growth after a grain change", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sales" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Year" }));
    });
    const salg = projectTable(layoutWorkbook(session.getSnapshot()), "tbl-sales")!;
    await selectProjectedCell(session, "tbl-sales", salg.colCount - 1, 1);
    expect(session.selection).toEqual({
      kind: "growth",
      tableId: "tbl-sales",
      col: salg.colCount - 1,
      row: 1,
    });
  });
});
