import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { projectTable } from "../grid/sheetProjection.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import {
  applyFormulaOperator,
  applyGridPointerToFormulaEdit,
  applyPointedRef,
  canPointFromDraft,
  commitLiteralEditAndSelect,
  cursorFormulaRef,
  formulaKeyAction,
  formulaRefForProjectedCell,
  formulaRefSpans,
  gridLocationFromPointer,
  isSpreadsheetPointEvent,
  isFormulaEditOutsideClick,
  isValidInsertPoint,
  nextPointableCell,
  commitKeyMovement,
  overlayArrowMovement,
  overlayKeyAction,
  overlayModeForActivation,
  pointAtProjectedCell,
  pointFromArrow,
  targetWalkStart,
  toggleOverlayNavMode,
} from "./customGridOverlay.js";

const inert = { evaluate: () => ({}) };

describe("custom grid overlay navigation", () => {
  it("starts Edit from a double-click or F2, and Enter from typing", () => {
    expect(overlayModeForActivation("double-click")).toBe("edit");
    expect(overlayModeForActivation("f2")).toBe("edit");
    expect(overlayModeForActivation("type")).toBe("enter");
    expect(overlayModeForActivation("enter-key")).toBe("enter");
  });

  it("toggles between pointing at cells and in-cell caret", () => {
    expect(toggleOverlayNavMode("enter")).toBe("edit");
    expect(toggleOverlayNavMode("edit")).toBe("enter");
    expect(toggleOverlayNavMode("point")).toBe("edit");
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
    expect(overlayKeyAction("enter", { key: "F2" })).toBe("toggle-text");
    expect(overlayKeyAction("edit", { key: "F2" })).toBe("toggle-text");
  });

  it("points at cells on arrows until F2", () => {
    expect(overlayKeyAction("enter", { key: "ArrowDown" })).toBe("point-cell");
    expect(overlayKeyAction("enter", { key: "ArrowLeft" })).toBe("point-cell");
    expect(overlayKeyAction("edit", { key: "ArrowDown" })).toBe("caret");
    expect(overlayKeyAction("enter", { key: "a" })).toBe("caret");
    expect(overlayKeyAction("enter", { key: "+" })).toBe("caret");
    expect(overlayKeyAction("point", { key: "+" })).toBe("formula-operator");
    expect(overlayKeyAction("point", { key: ")" })).toBe("formula-operator");
    expect(overlayKeyAction("edit", { key: "*" })).toBe("caret");
    expect(overlayKeyAction("edit", { key: ")" })).toBe("caret");
  });

  it("leaves modified arrows inside the cell", () => {
    expect(overlayKeyAction("enter", { key: "ArrowRight", ctrlKey: true })).toBe("caret");
    expect(overlayKeyAction("enter", { key: "ArrowUp", altKey: true })).toBe("caret");
    expect(overlayKeyAction("enter", { key: "ArrowDown", metaKey: true })).toBe("caret");
  });

  it("only points from a formula draft", () => {
    expect(canPointFromDraft("")).toBe(false);
    expect(canPointFromDraft("=")).toBe(true);
    expect(canPointFromDraft("=Mix")).toBe(true);
    expect(canPointFromDraft("100")).toBe(false);
  });

  it("inserts a pointed ref at the caret and replaces the last pointed token", () => {
    expect(applyPointedRef("=", null, "Mix", 1)).toEqual({
      draft: "=Mix",
      span: { start: 1, end: 4 },
    });
    expect(applyPointedRef("=Mix", { start: 1, end: 4 }, "TopShare")).toEqual({
      draft: "=TopShare",
      span: { start: 1, end: 9 },
    });
    expect(applyPointedRef("=Mix+", null, "TopShare", 5)).toEqual({
      draft: "=Mix+TopShare",
      span: { start: 5, end: 13 },
    });
    expect(applyPointedRef("", null, "Mix")).toEqual({
      draft: "=Mix",
      span: { start: 1, end: 4 },
    });
    expect(applyPointedRef("100", null, "Mix")).toEqual({
      draft: "=Mix",
      span: { start: 1, end: 4 },
    });
  });

  it("finds the formula ref at the caret or an exact selection", () => {
    expect(formulaRefSpans("=Mix+TopShare")).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 13 },
    ]);
    expect(cursorFormulaRef("=Mix", 4, 4)).toEqual({ start: 1, end: 4 });
    expect(cursorFormulaRef("=Mix+", 5, 5)).toBeNull();
    expect(cursorFormulaRef("=Mix+TopShare", 4, 4)).toEqual({ start: 1, end: 4 });
    expect(cursorFormulaRef("=Mix+TopShare", 5, 5)).toBeNull();
    expect(cursorFormulaRef("=Mix+TopShare", 13, 13)).toEqual({ start: 5, end: 13 });
    expect(cursorFormulaRef("=Mix", 1, 4)).toEqual({ start: 1, end: 4 });
    expect(cursorFormulaRef("=Mix", 1, 3)).toBeNull();
    expect(cursorFormulaRef("=Mix+", 0, 5)).toBeNull();
    expect(cursorFormulaRef("=SUM(Mix)", 8, 8)).toEqual({ start: 5, end: 8 });
    expect(cursorFormulaRef("=SUM(", 5, 5)).toBeNull();
    expect(cursorFormulaRef("=Params[Growth]", 15, 15)).toEqual({ start: 1, end: 15 });
    expect(cursorFormulaRef("=", 1, 1)).toBeNull();
    expect(formulaRefSpans("=Mix:TopShare")).toEqual([{ start: 1, end: 13 }]);
    expect(cursorFormulaRef("=Mix:TopShare", 13, 13)).toEqual({ start: 1, end: 13 });
  });

  it("keeps the formula edit open when a click or arrow points at a cell", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-start", "Value", "=", {
      pointing: true,
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });

    expect(pointAtProjectedCell(session, projection, layout, 1, 3)).toBe(true);
    expect(session.formulaEdit?.draft).toBe("=");
    expect(session.formulaEdit).not.toBeNull();

    expect(pointFromArrow(session, [1, 3], [0, 1], projection, layout)).toEqual({
      location: [1, 4],
      ref: "TopShare",
    });
    expect(session.formulaEdit?.draft).toBe("=TopShare");
    expect(session.formulaEdit?.targetCell).toEqual({ tableId: "tbl-params", col: 1, row: 4 });
  });

  it("starts a new pointed ref from the edited cell after the cursor leaves a ref", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "=", {
      pointing: true,
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });
    session.syncFormulaEditCursor("=", 1, 1);

    expect(pointFromArrow(session, [1, 3], [0, 1], projection, layout)).toEqual({
      location: [1, 4],
      ref: "TopShare",
    });
    expect(session.formulaEdit?.draft).toBe("=TopShare");

    const afterOp = applyFormulaOperator("=TopShare", session.formulaEdit?.activeFormulaRef ?? null, 1, 9, "+");
    expect(afterOp).toEqual({ draft: "=TopShare+", caret: 10 });
    session.setFormulaEditMode("enter");
    session.syncFormulaEditCursor(afterOp.draft, afterOp.caret, afterOp.caret);
    expect(session.formulaEdit?.targetCell).toEqual({ tableId: "tbl-params", col: 1, row: 3 });
    expect(session.formulaEdit?.activeFormulaRef).toBeNull();
    expect(targetWalkStart(session, [1, 4], projection)).toEqual([1, 3]);

    expect(pointFromArrow(session, [1, 3], [0, 1], projection, layout)).toEqual({
      location: [1, 4],
      ref: "TopShare",
    });
    expect(session.formulaEdit?.draft).toBe("=TopShare+TopShare");
  });

  it("walks from the edit cell when inserting even if the old target cell is stale", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "=TopShare+", {
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
      ref: "TopShare",
    });
    expect(session.formulaEdit?.draft).toBe("=TopShare+TopShare");
  });

  it("updates the ref under the caret instead of appending", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "=Mix+TopShare", {
      pointing: true,
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });
    session.syncFormulaEditCursor("=Mix+TopShare", 4, 4);

    expect(pointAtProjectedCell(session, projection, layout, 1, 5)).toBe(true);
    expect(session.formulaEdit?.draft).toBe("=AlternateShare+TopShare");

    session.syncFormulaEditCursor("=AlternateShare+TopShare", 16, 24);
    expect(pointAtProjectedCell(session, projection, layout, 1, 3)).toBe(true);
    expect(session.formulaEdit?.draft).toBe("=AlternateShare+");
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

  it("does not treat Formula text as an outside click while Pointing a Formula range", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "=Mix:TopShare", {
      pointing: true,
      mode: "point",
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });
    const formulaBar = {
      closest: (selector: string) => (selector.includes(".wk-formula-bar") ? {} : null),
    };
    const overlay = {
      closest: (selector: string) => (selector.includes(".wk-overlay-editor") ? {} : null),
    };
    const grid = {
      closest: (selector: string) => (selector.includes(".wk-table-spreadsheet") ? {} : null),
    };
    const chrome = { closest: () => null };
    expect(isFormulaEditOutsideClick({ target: formulaBar as unknown as EventTarget }, session)).toBe(false);
    expect(isFormulaEditOutsideClick({ target: overlay as unknown as EventTarget }, session)).toBe(false);
    expect(isFormulaEditOutsideClick({ target: grid as unknown as EventTarget }, session)).toBe(false);
    expect(isFormulaEditOutsideClick({ target: chrome as unknown as EventTarget }, session)).toBe(true);
  });

  it("moves the Caret with ArrowLeft in Edit mode, not Point", () => {
    expect(
      formulaKeyAction("edit", { key: "ArrowLeft" }, { suggestVisible: false, isFormula: true }),
    ).toBe("caret");
    expect(
      formulaKeyAction("point", { key: "ArrowLeft" }, { suggestVisible: false, isFormula: true }),
    ).toBe("point-cell");
  });

  it("walks to the next addressable cell and names it", () => {
    const layout = layoutWorkbook(createSampleWorkbook());
    const projection = projectTable(layout, "tbl-params")!;

    expect(formulaRefForProjectedCell(projection, layout, 1, 3)).toBe("Mix");
    expect(nextPointableCell([1, 3], [0, 1], projection, layout)).toEqual({
      location: [1, 4],
      ref: "TopShare",
    });
    expect(nextPointableCell([1, 1], [0, -1], projection, layout)).toEqual({
      location: [1, 0],
      ref: "Params[Value]",
    });
    expect(nextPointableCell([1, 1], [-1, 0], projection, layout)).toEqual({
      location: [0, 1],
      ref: "AnnualUnits",
    });
  });

  it("writes a Local Formula ref on the Edit cell's Table", () => {
    const layout = layoutWorkbook(createSampleWorkbook());
    const lines = projectTable(layout, "tbl-lines")!;
    expect(formulaRefForProjectedCell(lines, layout, 1, 1)).toBe("Lines[Jan][Red]");
    expect(formulaRefForProjectedCell(lines, layout, 1, 1, "tbl-lines")).toBe("[Jan][Red]");
    expect(formulaRefForProjectedCell(lines, layout, 1, 2, "tbl-lines")).toBe("[Jan][Secondary]");
    expect(formulaRefForProjectedCell(lines, layout, 1, 1, "tbl-params")).toBe("Lines[Jan][Red]");
    expect(
      formulaRefForProjectedCell(lines, layout, 1, 2, { tableId: "tbl-lines", col: 1, row: 1 }),
    ).toBe("[@][Secondary]");
    expect(
      formulaRefForProjectedCell(lines, layout, 2, 1, { tableId: "tbl-lines", col: 1, row: 1 }),
    ).toBe("[Feb][@]");
  });

  it("cycles the Active formula ref with F4", () => {
    expect(overlayKeyAction("point", { key: "F4" })).toBe("cycle-lock");
    expect(overlayKeyAction("edit", { key: "F4" })).toBe("cycle-lock");
    expect(formulaKeyAction("enter", { key: "F4" }, { suggestVisible: false, isFormula: false })).toBe(
      "caret",
    );
  });

  it("commits a literal edit and selects the clicked cell", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "0.4");
    expect(commitLiteralEditAndSelect(session, projection, layout, 1, 4)).toBe(true);
    expect(session.formulaEdit).toBeNull();
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.cells.Value).toEqual({
      kind: "input",
      value: 0.4,
    });
    expect(session.selection).toEqual({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-top-share",
      columnId: "Value",
    });
  });

  it("does not commit when the draft is a formula", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "=Mix");
    expect(commitLiteralEditAndSelect(session, projection, layout, 1, 4)).toBe(false);
    expect(session.formulaEdit?.draft).toBe("=Mix");
  });

  it("points a click in Edit only at a valid insert point", () => {
    expect(isValidInsertPoint("=", 1)).toBe(true);
    expect(isValidInsertPoint("=Mix+", 5)).toBe(true);
    expect(isValidInsertPoint("=SUM(", 5)).toBe(true);
    expect(isValidInsertPoint("=SUM(Mix)", 3)).toBe(false);
    expect(isValidInsertPoint("=Mix", 4)).toBe(true);
  });

  it("lets suggestions steal arrows only when the list is visible", () => {
    expect(
      formulaKeyAction("enter", { key: "ArrowDown" }, { suggestVisible: true, isFormula: true }),
    ).toBe("move-suggest");
    expect(
      formulaKeyAction("enter", { key: "ArrowDown" }, { suggestVisible: false, isFormula: true }),
    ).toBe("point-cell");
    expect(
      formulaKeyAction("point", { key: "ArrowDown" }, { suggestVisible: true, isFormula: true }),
    ).toBe("point-cell");
    expect(
      formulaKeyAction("enter", { key: "Enter" }, { suggestVisible: true, isFormula: true }),
    ).toBe("pick-suggest");
    expect(
      formulaKeyAction("enter", { key: "Enter" }, { suggestVisible: false, isFormula: true }),
    ).toBe("commit-move");
  });

  it("extends a pointed ref into a same-table range", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "=", {
      pointing: true,
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });
    expect(pointAtProjectedCell(session, projection, layout, 1, 3)).toBe(true);
    expect(session.formulaEdit?.draft).toBe("=");
    expect(pointAtProjectedCell(session, projection, layout, 1, 4, { extend: true })).toBe(true);
    expect(session.formulaEdit?.draft).toBe("=Mix:TopShare");
    expect(session.formulaEdit?.mode).toBe("point");
    expect(pointFromArrow(session, [1, 4], [0, 1], projection, layout, { extend: true })).toEqual({
      location: [1, 5],
      ref: "AlternateShare",
    });
    expect(session.formulaEdit?.draft).toBe("=Mix:AlternateShare");
  });

  it("points a formula click and commits a literal click away from the edit cell", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "=", {
      pointing: true,
      mode: "edit",
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });
    expect(applyGridPointerToFormulaEdit(session, projection, layout, 1, 4)).toBe("point");
    expect(session.formulaEdit?.draft).toBe("=TopShare");
    session.cancelFormulaEdit();
    session.beginFormulaEdit("tbl-params", "row-vat", "Value", "12", {
      mode: "edit",
      editCell: { tableId: "tbl-params", col: 1, row: 3 },
    });
    expect(applyGridPointerToFormulaEdit(session, projection, layout, 1, 3)).toBe("ignore");
    expect(applyGridPointerToFormulaEdit(session, projection, layout, 1, 4)).toBe("commit");
    expect(session.formulaEdit).toBeNull();
  });

  it("maps a pointer to a projected cell from host-local coordinates", () => {
    const host = {
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    } as HTMLElement;
    expect(gridLocationFromPointer(host, 11, 21, [40, 80], [28, 28, 28])).toEqual([0, 0]);
    expect(gridLocationFromPointer(host, 51, 49, [40, 80], [28, 28, 28])).toEqual([1, 1]);
    expect(gridLocationFromPointer(host, 9, 21, [40, 80], [28, 28, 28])).toBeNull();
    expect(gridLocationFromPointer(host, 200, 21, [40, 80], [28, 28, 28])).toBeNull();
  });
});
