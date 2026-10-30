import { describe, expect, it } from "vitest";
import { ignoreTableCornerDuringRangeDrag } from "./tableCornerSelection.js";

describe("ignoreTableCornerDuringRangeDrag", () => {
  it("ignores corner while a range drag is active", () => {
    expect(
      ignoreTableCornerDuringRangeDrag({
        onTableCorner: true,
        unitSelection: true,
        cornerPointerDown: false,
        rangeSelectDrag: true,
      }),
    ).toBe(true);
  });

  it("ignores corner when the previous grid range was multi-cell", () => {
    expect(
      ignoreTableCornerDuringRangeDrag({
        onTableCorner: true,
        unitSelection: true,
        cornerPointerDown: false,
        rangeSelectDrag: false,
        previousRange: { width: 2, height: 3 },
      }),
    ).toBe(true);
  });

  it("allows an intentional corner pointer down", () => {
    expect(
      ignoreTableCornerDuringRangeDrag({
        onTableCorner: true,
        unitSelection: true,
        cornerPointerDown: true,
        rangeSelectDrag: false,
      }),
    ).toBe(false);
  });
});
