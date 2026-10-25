import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { projectTable } from "../grid/sheetProjection.js";
import {
  FORMULA_REF_COLORS,
  colorFormulaRefs,
  formulaRefGridMarks,
} from "./formulaRefColors.js";
import {
  formulaEditorPopupSize,
  placeFormulaEditor,
  FORMULA_EDITOR_MIN_WIDTH,
  FORMULA_EDITOR_MAX_WIDTH,
  FORMULA_EDITOR_MAX_HEIGHT,
} from "../react/formulaEditorPopup.js";

describe("Formula-edit popup size", () => {
  it("starts at 110px, grows to 400px, then 120px, then scrolls", () => {
    expect(FORMULA_EDITOR_MIN_WIDTH).toBe(110);
    expect(formulaEditorPopupSize(80, 28, 28)).toEqual({ width: 110, height: 28, overflow: "hidden" });
    expect(formulaEditorPopupSize(200, 28, 28)).toEqual({ width: 200, height: 28, overflow: "hidden" });
    expect(formulaEditorPopupSize(400, 28, 28)).toEqual({ width: 400, height: 28, overflow: "hidden" });
    expect(formulaEditorPopupSize(401, 28, 56)).toEqual({ width: 400, height: 56, overflow: "hidden" });
    expect(formulaEditorPopupSize(800, 28, 200)).toEqual({
      width: FORMULA_EDITOR_MAX_WIDTH,
      height: FORMULA_EDITOR_MAX_HEIGHT,
      overflow: "auto",
    });
  });

  it("keeps the Popup in the canvas and flips off a Target cell below", () => {
    const canvas = { left: 200, top: 0, width: 400, height: 400 };
    const cell = { left: 220, top: 200, width: 110, height: 28 };
    const box = { width: 200, height: 80 };
    expect(placeFormulaEditor(cell, box, canvas)).toEqual({ left: 220, top: 200 });
    expect(
      placeFormulaEditor(cell, box, canvas, {
        flipY: true,
        avoid: { left: 220, top: 228, width: 110, height: 28 },
      }),
    ).toEqual({ left: 220, top: 148 });
    expect(placeFormulaEditor({ left: 180, top: 10, width: 110, height: 28 }, { width: 400, height: 28 }, canvas)).toEqual({
      left: 200,
      top: 10,
    });
  });
});

describe("Formula-ref colors", () => {
  it("cycles 7 Excel colors and reuses the color for identical Formula refs", () => {
    expect(FORMULA_REF_COLORS).toEqual([
      "#0000FF",
      "#FF0000",
      "#00B050",
      "#FFC000",
      "#7030A0",
      "#00B0F0",
      "#C00000",
    ]);
    expect(colorFormulaRefs("=Mix+TopShare")).toEqual([
      { text: "Mix", color: "#0000FF", start: 1, end: 4 },
      { text: "TopShare", color: "#FF0000", start: 5, end: 13 },
    ]);
    expect(colorFormulaRefs("=Mix+Mix")).toEqual([
      { text: "Mix", color: "#0000FF", start: 1, end: 4 },
      { text: "Mix", color: "#0000FF", start: 5, end: 8 },
    ]);
  });

  it("marks the matching cells on the same Table", () => {
    const layout = layoutWorkbook(createSampleWorkbook());
    const params = projectTable(layout, "tbl-params")!;
    expect(formulaRefGridMarks("=Mix+TopShare", layout, params)).toEqual([
      { text: "Mix", color: "#0000FF", range: { x: 1, y: 3, width: 1, height: 1 } },
      { text: "TopShare", color: "#FF0000", range: { x: 1, y: 4, width: 1, height: 1 } },
    ]);
  });

  it("marks a Local Formula ref on the same Table", () => {
    const layout = layoutWorkbook(createSampleWorkbook());
    const lines = projectTable(layout, "tbl-lines")!;
    expect(formulaRefGridMarks("=[Jan][Red]", layout, lines)).toEqual([
      { text: "[Jan][Red]", color: "#0000FF", range: { x: 1, y: 1, width: 1, height: 1 } },
    ]);
    expect(formulaRefGridMarks("=[$Jan][$Red]", layout, lines)).toEqual([
      { text: "[$Jan][$Red]", color: "#0000FF", range: { x: 1, y: 1, width: 1, height: 1 } },
    ]);
    expect(
      formulaRefGridMarks("=[@][Secondary]", layout, lines, { tableId: "tbl-lines", col: 1, row: 1 }),
    ).toEqual([{ text: "[@][Secondary]", color: "#0000FF", range: { x: 1, y: 2, width: 1, height: 1 } }]);
  });
});
