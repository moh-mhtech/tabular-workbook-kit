import { describe, expect, it } from "vitest";
import { cycleFormulaRefLock } from "./formulaRefLock.js";

const febOut = {
  columnName: "Jan",
  rowKey: "Secondary",
  sameColumn: true,
  sameRow: false,
};

describe("F4 Formula-ref lock", () => {
  it("cycles Relative, Fixed both, Fixed row, Fixed column", () => {
    expect(cycleFormulaRefLock("[@][Secondary]", febOut)).toBe("[$Jan][$Secondary]");
    expect(cycleFormulaRefLock("[$Jan][$Secondary]", febOut)).toBe("[@][$Secondary]");
    expect(cycleFormulaRefLock("[@][$Secondary]", febOut)).toBe("[$Jan][Secondary]");
    expect(cycleFormulaRefLock("[$Jan][Secondary]", febOut)).toBe("[@][Secondary]");
  });

  it("keeps a Qualified Formula ref prefix", () => {
    expect(cycleFormulaRefLock("Lines[@][Secondary]", febOut)).toBe("Lines[$Jan][$Secondary]");
  });

  it("leaves a Defined name unchanged", () => {
    expect(cycleFormulaRefLock("Mix", febOut)).toBe("Mix");
  });
});
