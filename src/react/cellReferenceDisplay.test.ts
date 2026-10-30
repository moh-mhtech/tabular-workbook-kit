import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { layoutWorkbook } from "../model/layout.js";
import { cellReferenceDisplay, parseFormulaRefSegments } from "./cellReferenceDisplay.js";

describe("parseFormulaRefSegments", () => {
  it("splits sheet, table, and cell body", () => {
    expect(parseFormulaRefSegments("Plan.Lines[Jan][Red]")).toEqual({
      kind: "structured",
      sheet: "Plan",
      table: "Lines",
      body: "[Jan][Red]",
    });
  });

  it("splits table and cell body", () => {
    expect(parseFormulaRefSegments("Lines[Jan][Red]")).toEqual({
      kind: "structured",
      table: "Lines",
      body: "[Jan][Red]",
    });
  });

  it("treats a Defined name as one segment", () => {
    expect(parseFormulaRefSegments("Mix")).toEqual({ kind: "defined", name: "Mix" });
  });
});

describe("cellReferenceDisplay", () => {
  it("shows a Defined name for a promoted Value cell", () => {
    const layout = layoutWorkbook(createSampleWorkbook());
    const display = cellReferenceDisplay(layout, {
      tableId: "tbl-params",
      rowId: "row-vat",
      columnId: "Value",
    });
    expect(display?.workbookText).toBe("Mix");
    expect(display?.segments).toEqual({ kind: "defined", name: "Mix" });
  });

  it("shows table and cell segments for a structured cell", () => {
    const layout = layoutWorkbook(createSampleWorkbook());
    const display = cellReferenceDisplay(layout, {
      tableId: "tbl-lines",
      rowId: "row-red",
      columnId: "2025-01",
    });
    expect(display?.workbookText).toBe("Lines[Jan][Red]");
    expect(display?.segments).toEqual({
      kind: "structured",
      table: "Lines",
      body: "[Jan][Red]",
    });
  });
});
