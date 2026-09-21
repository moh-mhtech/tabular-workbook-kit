import { describe, expect, it } from "vitest";
import { compileFormula } from "./compile.js";
import { layoutWorkbook } from "../model/layout.js";
import { hitTest, layoutSheets } from "../model/sheetView.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";

describe("column-first compile", () => {
  it("compiles named rows to INDEX/MATCH and this-row to [@Col]", () => {
    const snapshot = createPlaygroundWorkbook();
    const layout = layoutWorkbook(snapshot);
    const staff = layout.tablesByName.get("staff")!;
    const karol = staff.keyByLower.get("karol")!;
    const jan = staff.columns.find((c) => c.name === "Jan")!;

    expect(
      compileFormula("=Salg[Jan][Total]", {
        layout,
        currentTable: staff,
        currentRowIndex: karol.rowIndex,
        currentPeriodId: jan.periodId,
      }),
    ).toBe('=INDEX(Salg[Jan],MATCH("Total",Salg[key],0))');

    expect(
      compileFormula("=[BaseSalary]", {
        layout,
        currentTable: staff,
        currentRowIndex: karol.rowIndex,
        currentPeriodId: jan.periodId,
        currentColumnId: jan.id,
      }),
    ).toBe("=[@BaseSalary]");

    expect(compileFormula("=Params[Årssalg]", { layout })).toBe(
      '=INDEX(Params[Value],MATCH("Årssalg",Params[key],0))',
    );
  });

  it("resolves @-1 on the period axis", () => {
    const snapshot = createPlaygroundWorkbook();
    const layout = layoutWorkbook(snapshot);
    const salg = layout.tablesByName.get("salg")!;
    const cnc = salg.keyByLower.get("cnc")!;
    const feb = salg.columns.find((c) => c.name === "Feb")!;
    expect(
      compileFormula("=[@-1][@]", {
        layout,
        currentTable: salg,
        currentRowIndex: cnc.rowIndex,
        currentPeriodId: feb.periodId,
        currentColumnId: feb.id,
      }),
    ).toBe("=[@Jan]");
  });

  it("compiles quarter and year tokens as the sum of stored months", () => {
    const snapshot = createPlaygroundWorkbook();
    const layout = layoutWorkbook(snapshot);
    expect(compileFormula("=Salg[2025-Q1][Total]", { layout })).toBe(
      '=SUM(INDEX(Salg[Jan],MATCH("Total",Salg[key],0)),INDEX(Salg[Feb],MATCH("Total",Salg[key],0)),INDEX(Salg[Mar],MATCH("Total",Salg[key],0)))',
    );
    expect(compileFormula("=Salg[2025][Total]", { layout })).toContain("INDEX(Salg[Dec]");
    expect(compileFormula("=Salg[2025][Total]", { layout })).toContain("SUM(");
  });
});

describe("sheet hitTest", () => {
  it("maps stacked bands to table cells", () => {
    const snapshot = createPlaygroundWorkbook();
    const periods = layoutWorkbook(snapshot).periods;
    const views = layoutSheets(snapshot, periods);
    const kap = views.find((v) => v.sheetName === "Kapacitet")!;
    const header = hitTest(kap, snapshot, kap.bands[0].headerRow, 2, periods);
    expect(header.kind).toBe("header");
    const cell = hitTest(kap, snapshot, kap.bands[0].headerRow + 1, 1, periods);
    expect(cell).toMatchObject({ kind: "cell", tableId: "tbl-staff" });
    expect(hitTest(kap, snapshot, 0, 50, periods).kind).toBe("outside");
  });

  it("stops the grid one row and column past the last band", () => {
    const snapshot = createPlaygroundWorkbook();
    const periods = layoutWorkbook(snapshot).periods;
    const views = layoutSheets(snapshot, periods);
    for (const view of views) {
      const lastRow = Math.max(...view.bands.map((b) => b.headerRow + b.rowCount - 1));
      const lastCol = Math.max(...view.bands.map((b) => b.startCol + b.colCount - 1));
      expect(view.rowCount).toBe(lastRow + 2);
      expect(view.colCount).toBe(lastCol + 2);
    }
    const kap = views.find((v) => v.sheetName === "Kapacitet")!;
    expect([kap.rowCount, kap.colCount]).toEqual([4, 16]);
  });
});
