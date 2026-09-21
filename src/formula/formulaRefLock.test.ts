import { describe, expect, it } from "vitest";
import { cycleFormulaRefLock } from "./formulaRefLock.js";

const febOut = {
  columnName: "Jan",
  rowKey: "Outsource",
  sameColumn: true,
  sameRow: false,
};

describe("F4 Formula-ref lock", () => {
  it("cycles Relative, Fixed both, Fixed row, Fixed column", () => {
    expect(cycleFormulaRefLock("[@][Outsource]", febOut)).toBe("[$Jan][$Outsource]");
    expect(cycleFormulaRefLock("[$Jan][$Outsource]", febOut)).toBe("[@][$Outsource]");
    expect(cycleFormulaRefLock("[@][$Outsource]", febOut)).toBe("[$Jan][Outsource]");
    expect(cycleFormulaRefLock("[$Jan][Outsource]", febOut)).toBe("[@][Outsource]");
  });

  it("keeps a Qualified Formula ref prefix", () => {
    expect(cycleFormulaRefLock("Salg[@][Outsource]", febOut)).toBe("Salg[$Jan][$Outsource]");
  });

  it("leaves a Defined name unchanged", () => {
    expect(cycleFormulaRefLock("Vat", febOut)).toBe("Vat");
  });
});
