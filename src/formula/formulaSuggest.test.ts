import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { applySuggestion, formulaPrefix, suggestFormula } from "./formulaSuggest.js";

describe("formula suggestions", () => {
  it("suggests functions tables and names from a prefix", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    expect(suggestFormula("=Su", 3, layout).map((item) => item.label)).toContain("SUM");
    expect(suggestFormula("=Sa", 3, layout).some((item) => item.label === "Salg")).toBe(true);
    expect(suggestFormula("=V", 2, layout).some((item) => item.label === "Vat")).toBe(true);
    expect(suggestFormula("=Zz", 3, layout)).toEqual([]);
    expect(suggestFormula("=Salg[2", 7, layout).map((item) => item.label)).toEqual(
      expect.arrayContaining(["2025", "2025-Q1"]),
    );
  });

  it("lists functions after = and inserts at the prefix", () => {
    expect(formulaPrefix("=", 1)).toEqual({ start: 1, text: "" });
    expect(applySuggestion("=Su", 3, { label: "SUM", insert: "SUM(", kind: "function" })).toEqual({
      draft: "=SUM(",
      caret: 5,
    });
  });
});
