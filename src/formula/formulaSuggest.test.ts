import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { applySuggestion, formulaPrefix, suggestFormula } from "./formulaSuggest.js";

describe("formula suggestions", () => {
  it("suggests functions tables and names from a prefix", () => {
    const layout = layoutWorkbook(createSampleWorkbook());
    expect(suggestFormula("=Su", 3, layout).map((item) => item.label)).toContain("SUM");
    expect(suggestFormula("=Sa", 3, layout).some((item) => item.label === "Sales")).toBe(true);
    expect(suggestFormula("=V", 2, layout).some((item) => item.label === "Vat")).toBe(true);
    expect(suggestFormula("=Zz", 3, layout)).toEqual([]);
    expect(suggestFormula("=Sales[2", 8, layout).map((item) => item.label)).toEqual(
      expect.arrayContaining(["2025", "2025-Q1"]),
    );
  });

  it("does not suggest after = or an operator, and names complete as you type", () => {
    const layout = layoutWorkbook(createSampleWorkbook());
    expect(formulaPrefix("=", 1)).toBeNull();
    expect(suggestFormula("=", 1, layout)).toEqual([]);
    expect(suggestFormula("=Vat+", 5, layout)).toEqual([]);
    expect(suggestFormula("=V", 2, layout).some((item) => item.label === "Vat")).toBe(true);
    expect(suggestFormula("=Sa", 3, layout).some((item) => item.label === "Sales")).toBe(true);
    const withCafe = createSampleWorkbook();
    withCafe.tables[0]!.rows[2]!.key = "Café";
    expect(formulaPrefix("=Café", 5)).toEqual({ start: 1, text: "Café", bracket: false });
    expect(suggestFormula("=Ca", 3, layoutWorkbook(withCafe)).some((item) => item.label === "Café")).toBe(true);
    expect(suggestFormula("=Sales[", 7, layout).some((item) => item.kind === "column")).toBe(true);
  });

  it("lists functions after a letter prefix and inserts at the prefix", () => {
    expect(formulaPrefix("=", 1)).toBeNull();
    expect(formulaPrefix("=Su", 3)).toEqual({ start: 1, text: "Su", bracket: false });
    expect(applySuggestion("=Su", 3, { label: "SUM", insert: "SUM(", kind: "function" })).toEqual({
      draft: "=SUM(",
      caret: 5,
    });
  });
});
