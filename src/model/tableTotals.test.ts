import { describe, expect, it } from "vitest";
import { aggregateTotalValues, resolveTotalsRange } from "./tableTotals.js";

describe("Total aggregation", () => {
  it("Calculate when all cells are numeric", () => {
    expect(aggregateTotalValues([10, 20])).toBe(30);
  });

  it("Calculate when cells are numeric or empty", () => {
    expect(aggregateTotalValues([10, null])).toBe(10);
  });

  it("Error when any cell is Error", () => {
    expect(aggregateTotalValues([10, "#DIV/0!"])).toBe("#VALUE!");
  });

  it("Blank when all cells are empty or non-numeric", () => {
    expect(aggregateTotalValues([null, null])).toBe(null);
    expect(aggregateTotalValues(["a", "b"])).toBe(null);
    expect(aggregateTotalValues([null, "x"])).toBe(null);
  });

  it("Error on mixed numeric and non-numeric", () => {
    expect(aggregateTotalValues([10, "x"])).toBe("#VALUE!");
  });
});

describe("Total range", () => {
  const labels = ["Red", "Secondary", "Channel"] as const;

  it("Blank means all indexes", () => {
    expect(resolveTotalsRange("", labels)).toBeNull();
    expect(resolveTotalsRange(undefined, labels)).toBeNull();
  });

  it("Resolves a single key, list, and inclusive span", () => {
    expect([...(resolveTotalsRange("Red", labels) ?? [])]).toEqual(["Red"]);
    expect([...(resolveTotalsRange("Red,Channel", labels) ?? [])].sort()).toEqual(["Channel", "Red"]);
    expect([...(resolveTotalsRange("Red:Channel", labels) ?? [])]).toEqual(["Red", "Secondary", "Channel"]);
  });
});
