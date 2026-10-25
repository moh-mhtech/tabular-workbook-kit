import { describe, expect, it } from "vitest";
import { compileFormula } from "./compile.js";
import { layoutWorkbook } from "../model/layout.js";
import { hitTest, layoutSheets } from "../model/sheetView.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";

describe("column-first compile", () => {
  it("compiles named rows to INDEX/MATCH and this-row to [@Col]", () => {
    const snapshot = createSampleWorkbook();
    const layout = layoutWorkbook(snapshot);
    const staff = layout.tablesByName.get("teams")!;
    const karol = staff.keyByLower.get("karol")!;
    const jan = staff.columns.find((c) => c.name === "Jan")!;

    expect(
      compileFormula("=Lines[Jan][Total]", {
        layout,
        currentTable: staff,
        currentRowIndex: karol.rowIndex,
        currentPeriodId: jan.periodId,
      }),
    ).toBe('=INDEX(Lines[Jan],MATCH("Total",Lines[key],0))');

    expect(
      compileFormula("=[BaseNumber]", {
        layout,
        currentTable: staff,
        currentRowIndex: karol.rowIndex,
        currentPeriodId: jan.periodId,
        currentColumnId: jan.id,
      }),
    ).toBe("=[@BaseNumber]");

    expect(compileFormula("=Params[AnnualUnits]", { layout })).toBe(
      '=INDEX(Params[Value],MATCH("AnnualUnits",Params[key],0))',
    );
  });

  it("strips Fixed $ before compiling", () => {
    const snapshot = createSampleWorkbook();
    const layout = layoutWorkbook(snapshot);
    const lines = layout.tablesByName.get("lines")!;
    const outsource = lines.keyByLower.get("secondary")!;
    const jan = lines.columns.find((c) => c.name === "Jan")!;
    expect(
      compileFormula("=[$Jan][$Red]", {
        layout,
        currentTable: lines,
        currentRowIndex: outsource.rowIndex,
        currentPeriodId: jan.periodId,
        currentColumnId: jan.id,
      }),
    ).toBe('=INDEX(Lines[Jan],MATCH("Red",Lines[key],0))');
  });

  it("resolves @-1 on the period axis", () => {
    const snapshot = createSampleWorkbook();
    const layout = layoutWorkbook(snapshot);
    const lines = layout.tablesByName.get("lines")!;
    const cnc = lines.keyByLower.get("red")!;
    const feb = lines.columns.find((c) => c.name === "Feb")!;
    expect(
      compileFormula("=[@-1][@]", {
        layout,
        currentTable: lines,
        currentRowIndex: cnc.rowIndex,
        currentPeriodId: feb.periodId,
        currentColumnId: feb.id,
      }),
    ).toBe("=[@Jan]");
  });

  it("compiles quarter and year tokens as the sum of stored months", () => {
    const snapshot = createSampleWorkbook();
    const layout = layoutWorkbook(snapshot);
    expect(compileFormula("=Lines[2025-Q1][Total]", { layout })).toBe(
      '=SUM(INDEX(Lines[Jan],MATCH("Total",Lines[key],0)),INDEX(Lines[Feb],MATCH("Total",Lines[key],0)),INDEX(Lines[Mar],MATCH("Total",Lines[key],0)))',
    );
    expect(compileFormula("=Lines[2025][Total]", { layout })).toContain("INDEX(Lines[Dec]");
    expect(compileFormula("=Lines[2025][Total]", { layout })).toContain("SUM(");
  });

  it("compiles a pointed name range to SUM of the rectangle", () => {
    const snapshot = createSampleWorkbook();
    const layout = layoutWorkbook(snapshot);
    expect(compileFormula("=Mix:TopShare", { layout })).toBe("=SUM(Mix,TopShare)");
  });
});

describe("sheet hitTest", () => {
  it("maps stacked bands to table cells", () => {
    const snapshot = createSampleWorkbook();
    const periods = layoutWorkbook(snapshot).periods;
    const views = layoutSheets(snapshot, periods);
    const capacity = views.find((v) => v.sheetName === "Capacity")!;
    const header = hitTest(capacity, snapshot, capacity.bands[0].headerRow, 2, periods);
    expect(header.kind).toBe("header");
    const cell = hitTest(capacity, snapshot, capacity.bands[0].headerRow + 1, 1, periods);
    expect(cell).toMatchObject({ kind: "cell", tableId: "tbl-teams" });
    expect(hitTest(capacity, snapshot, 0, 50, periods).kind).toBe("outside");
  });

  it("stops the grid one row and column past the last band", () => {
    const snapshot = createSampleWorkbook();
    const periods = layoutWorkbook(snapshot).periods;
    const views = layoutSheets(snapshot, periods);
    for (const view of views) {
      const lastRow = Math.max(...view.bands.map((b) => b.headerRow + b.rowCount - 1));
      const lastCol = Math.max(...view.bands.map((b) => b.startCol + b.colCount - 1));
      expect(view.rowCount).toBe(lastRow + 2);
      expect(view.colCount).toBe(lastCol + 2);
    }
    const capacity = views.find((v) => v.sheetName === "Capacity")!;
    expect([capacity.rowCount, capacity.colCount]).toEqual([4, 16]);
  });
});
