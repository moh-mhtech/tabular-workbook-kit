import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { projectTable } from "../grid/sheetProjection.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import {
  applyFormulaOperator,
  applyPointedRef,
  canPointFromDraft,
  cursorFormulaRef,
  formulaRefForProjectedCell,
  formulaRefSpans,
  isSpreadsheetPointEvent,
  nextPointableCell,
  commitKeyMovement,
  overlayArrowMovement,
  overlayKeyAction,
  pointAtProjectedCell,
  pointFromArrow,
  targetWalkStart,
  toggleOverlayNavMode,
} from "./customGridOverlay.js";

const inert = { evaluate: () => ({}) };

describe("custom grid overlay navigation", () => {
  it("toggles between pointing at cells and in-cell caret", () => {
    expect(toggleOverlayNavMode("cells")).toBe("text");
    expect(toggleOverlayNavMode("text")).toBe("cells");
  });

  it("maps Enter and Tab to the next cell after a commit", () => {
    expect(commitKeyMovement({ key: "Enter" })).toEqual([0, 1]);
    expect(commitKeyMovement({ key: "Tab" })).toEqual([1, 0]);
    expect(commitKeyMovement({ key: "Tab", shiftKey: true })).toEqual([-1, 0]);
    expect(commitKeyMovement({ key: "Enter", shiftKey: true })).toBeUndefined();
  });

  it("maps arrow keys to overlay movement", () => {
    expect(overlayArrowMovement("ArrowUp")).toEqual([0, -1]);
    expect(overlayArrowMovement("ArrowDown")).toEqual([0, 1]);
    expect(overlayArrowMovement("ArrowLeft")).toEqual([-1, 0]);
    expect(overlayArrowMovement("ArrowRight")).toEqual([1, 0]);
    expect(overlayArrowMovement("Enter")).toBeUndefined();
  });

  it("uses F2 to enter in-cell focus", () => {
    expect(overlayKeyAction("cells", { key: "F2" })).toBe("toggle-text");
    expect(overlayKeyAction("text", { key: "F2" })).toBe("toggle-text");
  });

  it("points at cells on arrows until F2", () => {
    expect(overlayKeyAction("cells", { key: "ArrowDown" })).toBe("point-cell");
    expect(overlayKeyAction("cells", { key: "ArrowLeft" })).toBe("point-cell");
    expect(overlayKeyAction("text", { key: "ArrowDown" })).toBe("caret");
    expect(overlayKeyAction("cells", { key: "a" })).toBe("caret");
    expect(overlayKeyAction("cells", { key: "+" })).toBe("formula-operator");
    expect(overlayKeyAction("text", { key: "*" })).toBe("formula-operator");
  });

  it("leaves modified arrows inside the cell", () => {
    expect(overlayKeyAction("cells", { key: "ArrowRight", ctrlKey: true })).toBe("caret");
    expect(overlayKeyAction("cells", { key: "ArrowUp", altKey: true })).toBe("caret");
    expect(overlayKeyAction("cells", { key: "ArrowDown", metaKey: true })).toBe("caret");
  });

  it("can start a formula from any draft, including a literal", () => {
    expect(canPointFromDraft("")).toBe(true);
    expect(canPointFromDraft("=")).toBe(true);
    expect(canPointFromDraft("=Vat")).toBe(true);
    expect(canPointFromDraft("100")).toBe(true);
  });

  it("inserts a pointed ref at the caret and replaces the last pointed token", () => {
    expect(applyPointedRef("=", null, "Vat", 1)).toEqual({
      draft: "=Vat",
      span: { start: 1, end: 4 },
    });
    expect(applyPointedRef("=Vat", { start: 1, end: 4 }, "AndelCNC")).toEqual({
      draft: "=AndelCNC",
      span: { start: 1, end: 9 },
    });
    expect(applyPointedRef("=Vat+", null, "AndelCNC", 5)).toEqual({
      draft: "=Vat+AndelCNC",
      span: { start: 5, end: 13 },
    });
    expect(applyPointedRef("", null, "Vat")).toEqual({
      draft: "=Vat",
      span: { start: 1, end: 4 },
    });
    expect(applyPointedRef("100", null, "Vat")).toEqual({
      draft: "=Vat",
      span: { start: 1, end: 4 },
    });
  });

  it("finds the formula ref at the caret or an exact selection", () => {
    expect(formulaRefSpans("=Vat+AndelCNC")).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 13 },
    ]);
    expect(cursorFormulaRef("=Vat", 4, 4)).toEqual({ start: 1, end: 4 });
    expect(cursorFormulaRef("=Vat+", 5, 5)).toBeNull();
    expect(cursorFormulaRef("=Vat+AndelCNC", 4, 4)).toEqual({ start: 1, end: 4 });
    expect(cursorFormulaRef("=Vat+AndelCNC", 5, 5)).toBeNull();
    expect(cursorFormulaRef("=Vat+AndelCNC", 13, 13)).toEqual({ start: 5, end: 13 });
    expect(cursorFormulaRef("=Vat", 1, 4)).toEqual({ start: 1, end: 4 });
    expect(cursorFormulaRef("=Vat", 1, 3)).toBeNull();
    expect(cursorFormulaRef("=Vat+", 0, 5)).toBeNull();
    expect(cursorFormulaRef("=SUM(Vat)", 8, 8)).toEqual({ start: 5, end: 8 });
    expect(cursorFormulaRef("=SUM(", 5, 5)).toBeNull();
    expect(cursorFormulaRef("=Params[Vækst]", 14, 14)).toEqual({ start: 1, end: 14 });
    expect(cursorFormulaRef("=", 1, 1)).toBeNull();
  });

  it("keeps the formula edit open when a click or arrow points at a cell", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-start", "Value", "=", {
      pointing: true,
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });

    expect(pointAtProjectedCell(session, projection, layout, 1, 3)).toBe(true);
    expect(session.formulaEdit?.draft).toBe("=Vat");
    expect(session.formulaEdit).not.toBeNull();

    expect(pointFromArrow(session, [1, 3], [0, 1], projection, layout)).toEqual({
      location: [1, 4],
      ref: "AndelCNC",
    });
    expect(session.formulaEdit?.draft).toBe("=AndelCNC");
    expect(session.formulaEdit?.targetCell).toEqual({ tableId: "tbl-params", col: 1, row: 4 });
  });

  it("starts a new pointed ref from the edited cell after the cursor leaves a ref", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "=", {
      pointing: true,
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });
    session.syncFormulaEditCursor("=", 1, 1);

    expect(pointFromArrow(session, [1, 3], [0, 1], projection, layout)).toEqual({
      location: [1, 4],
      ref: "AndelCNC",
    });
    expect(session.formulaEdit?.draft).toBe("=AndelCNC");

    const afterOp = applyFormulaOperator("=AndelCNC", session.formulaEdit?.activeFormulaRef ?? null, 1, 9, "+");
    expect(afterOp).toEqual({ draft: "=AndelCNC+", caret: 10 });
    session.syncFormulaEditCursor(afterOp.draft, afterOp.caret, afterOp.caret);
    expect(session.formulaEdit?.targetCell).toEqual({ tableId: "tbl-params", col: 1, row: 3 });
    expect(session.formulaEdit?.activeFormulaRef).toBeNull();
    expect(targetWalkStart(session, [1, 4], projection)).toEqual([1, 3]);

    expect(pointFromArrow(session, [1, 3], [0, 1], projection, layout)).toEqual({
      location: [1, 4],
      ref: "AndelCNC",
    });
    expect(session.formulaEdit?.draft).toBe("=AndelCNC+AndelCNC");
  });

  it("walks from the edit cell when inserting even if the old target cell is stale", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "=AndelCNC+", {
      pointing: true,
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });
    session.formulaEdit = {
      ...session.formulaEdit!,
      activeFormulaRef: null,
      targetCell: { tableId: "tbl-params", col: 1, row: 5 },
    };
    expect(targetWalkStart(session, [1, 5], projection)).toEqual([1, 3]);
    expect(pointFromArrow(session, [1, 5], [0, 1], projection, layout)).toEqual({
      location: [1, 4],
      ref: "AndelCNC",
    });
    expect(session.formulaEdit?.draft).toBe("=AndelCNC+AndelCNC");
  });

  it("updates the ref under the caret instead of appending", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "=Vat+AndelCNC", {
      pointing: true,
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });
    session.syncFormulaEditCursor("=Vat+AndelCNC", 4, 4);

    expect(pointAtProjectedCell(session, projection, layout, 1, 5)).toBe(true);
    expect(session.formulaEdit?.draft).toBe("=AndelOutsource+AndelCNC");

    session.syncFormulaEditCursor("=AndelOutsource+AndelCNC", 16, 24);
    expect(pointAtProjectedCell(session, projection, layout, 1, 3)).toBe(true);
    expect(session.formulaEdit?.draft).toBe("=AndelOutsource+Vat");
  });

  it("treats spreadsheet and overlay clicks as in-grid pointing, not outside clicks", () => {
    const inside = {
      closest: (selector: string) => (selector.includes(".wk-table-spreadsheet") ? {} : null),
    };
    const outside = { closest: () => null };
    expect(isSpreadsheetPointEvent({ target: inside as unknown as EventTarget })).toBe(true);
    expect(isSpreadsheetPointEvent({ target: outside as unknown as EventTarget })).toBe(false);
    expect(isSpreadsheetPointEvent({ target: null })).toBe(false);
  });

  it("walks to the next addressable cell and names it", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const projection = projectTable(layout, "tbl-params")!;

    expect(formulaRefForProjectedCell(projection, layout, 1, 3)).toBe("Vat");
    expect(nextPointableCell([1, 3], [0, 1], projection, layout)).toEqual({
      location: [1, 4],
      ref: "AndelCNC",
    });
    expect(nextPointableCell([1, 1], [0, -1], projection, layout)).toBeUndefined();
    expect(nextPointableCell([1, 1], [-1, 0], projection, layout)).toBeUndefined();
  });
});
