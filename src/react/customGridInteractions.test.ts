import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { projectSheet, projectTable } from "../grid/sheetProjection.js";
import {
  applyCustomGridClear,
  applyCustomGridEdits,
  applyCustomGridFill,
  applyCustomGridPaste,
  expandEditAcrossRange,
  focusAfterCommitMove,
  moveSelectionAfterCommit,
  rawGridValue,
} from "./customGridInteractions.js";

const inert = { evaluate: () => ({}) };

describe("custom grid interactions", () => {
  it("selects the next row or column after a cell commit", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    session.setSelection({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-vat",
      columnId: "Value",
    });
    expect(moveSelectionAfterCommit(session, session.getSnapshot(), [0, 1])).toBe(true);
    expect(session.selection).toEqual({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-cnc-share",
      columnId: "Value",
    });

    session.setSelection({
      kind: "cell",
      tableId: "tbl-sales",
      rowId: "row-cnc",
      columnId: "2025-01",
    });
    expect(moveSelectionAfterCommit(session, session.getSnapshot(), [1, 0])).toBe(true);
    expect(session.selection).toEqual({
      kind: "cell",
      tableId: "tbl-sales",
      rowId: "row-cnc",
      columnId: "2025-02",
    });
  });

  it("moves from the last row onto the unused growth cell", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    session.setSelection({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-start",
      columnId: "Value",
    });
    expect(moveSelectionAfterCommit(session, session.getSnapshot(), [0, 1])).toBe(true);
    expect(session.selection).toEqual({ kind: "growth", tableId: "tbl-params", col: 1, row: 8 });
    expect(session.gridFocus).toEqual({ tableId: "tbl-params", col: 1, row: 8 });
  });

  it("moves from the last column onto the unused growth cell when the table can grow", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const notes = session.addTable("sheet-forud", { name: "Notes" });
    const columnId = notes.attributeColumns[0]!.id;
    const rowId = notes.rows[0]!.id;
    session.setSelection({ kind: "cell", tableId: notes.id, rowId, columnId });
    expect(moveSelectionAfterCommit(session, session.getSnapshot(), [1, 0])).toBe(true);
    expect(session.selection).toEqual({ kind: "growth", tableId: notes.id, col: 2, row: 1 });
    expect(session.gridFocus).toEqual({ tableId: notes.id, col: 2, row: 1 });
  });

  it("moves from a just-filled growth cell onto the new unused cell", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    expect(applyCustomGridEdits(session, projection, layout, [{ location: [1, 8], value: { data: "9" } }])).toBe(1);

    expect(focusAfterCommitMove(session, "tbl-params", [1, 8], [0, 1])).toEqual({
      location: [1, 9],
      selection: { kind: "growth", tableId: "tbl-params", col: 1, row: 9 },
    });
    expect(session.gridFocus).toEqual({ tableId: "tbl-params", col: 1, row: 9 });

    const notes = session.addTable("sheet-forud", { name: "Notes" });
    const notesLayout = layoutWorkbook(session.getSnapshot());
    const notesProjection = projectTable(notesLayout, notes.id)!;
    expect(applyCustomGridEdits(session, notesProjection, notesLayout, [{ location: [2, 1], value: { data: "7" } }])).toBe(1);
    expect(focusAfterCommitMove(session, notes.id, [2, 1], [1, 0])).toEqual({
      location: [3, 1],
      selection: { kind: "growth", tableId: notes.id, col: 3, row: 1 },
    });
  });

  it("converts editor values to session input", () => {
    expect(rawGridValue({ data: 42 })).toBe("42");
    expect(rawGridValue({ data: false })).toBe("false");
    expect(rawGridValue({ data: null })).toBe("");
  });

  it("propagates a single typed value across the selected range", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    const edits = expandEditAcrossRange(
      projection,
      layout,
      [{ location: [1, 1], value: { data: "0.5" } }],
      { x: 1, y: 1, width: 1, height: 3 },
    );
    expect(edits).toHaveLength(3);
    expect(applyCustomGridEdits(session, projection, layout, edits)).toBe(3);
    const params = session.getSnapshot().tables.find((table) => table.id === "tbl-params")!;
    expect(params.rows[0].cells.Value).toEqual({ kind: "input", value: 0.5 });
    expect(params.rows[1].cells.Value).toEqual({ kind: "input", value: 0.5 });
    expect(params.rows[2].cells.Value).toEqual({ kind: "input", value: 0.5 });
  });

  it("does not expand a pasted multi-cell edit across the selection", () => {
    const layout = layoutWorkbook(createSampleWorkbook());
    const projection = projectTable(layout, "tbl-params")!;
    const edits = expandEditAcrossRange(
      projection,
      layout,
      [
        { location: [1, 1], value: { data: "10" } },
        { location: [1, 2], value: { data: "20" } },
      ],
      { x: 1, y: 1, width: 1, height: 3 },
    );
    expect(edits).toEqual([
      { location: [1, 1], value: { data: "10" } },
      { location: [1, 2], value: { data: "20" } },
    ]);
  });

  it("commits a pasted range as one undo step", () => {
    const before = createSampleWorkbook();
    const session = new WorkbookSession(before, inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectSheet(layout, "sheet-params")!;

    expect(applyCustomGridEdits(session, projection, layout, [
      { location: [1, 1], value: { data: "10" } },
      { location: [1, 2], value: { data: "=1+2" } },
    ])).toBe(2);

    const params = session.getSnapshot().tables.find((table) => table.id === "tbl-params")!;
    expect(params.rows[0].cells.Value).toEqual({ kind: "input", value: 10 });
    expect(params.rows[1].cells.Value).toEqual({ kind: "formula", formula: "=1+2" });
    expect(session.undo()).toBe(true);
    expect(session.getSnapshot()).toEqual(before);
  });

  it("ignores edits outside a table growth margin", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectSheet(layout, "sheet-params")!;

    expect(applyCustomGridEdits(session, projection, layout, [
      { location: [2, 1], value: { data: "loose" } },
      { location: [2, 8], value: { data: "corner" } },
    ])).toBe(0);
    expect(session.getSnapshot().sheets[0].looseCells).toBeUndefined();
  });

  it("clears a range as one undo step", () => {
    const before = createSampleWorkbook();
    const session = new WorkbookSession(before, inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectSheet(layout, "sheet-params")!;

    expect(applyCustomGridClear(session, projection, layout, { x: 1, y: 1, width: 1, height: 1 })).toBe(1);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[0].cells.Value).toEqual({
      kind: "input",
      value: null,
    });
    expect(session.undo()).toBe(true);
    expect(session.getSnapshot()).toEqual(before);
  });

  it("renames a table identifier through the table viewport", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-staff")!;

    expect(applyCustomGridEdits(session, projection, layout, [
      { location: [0, 1], value: { data: "CamLead" } },
      { location: [1, 0], value: { data: "Position" } },
    ])).toBe(2);

    const staff = session.getSnapshot().tables.find((table) => table.id === "tbl-staff")!;
    expect(staff.rows[0].key).toBe("CamLead");
    expect(staff.attributeColumns[0].name).toBe("Position");
  });

  it("fills downward by repeating the source cell", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectSheet(layout, "sheet-params")!;
    applyCustomGridEdits(session, projection, layout, [{ location: [1, 1], value: { data: "42" } }]);

    expect(
      applyCustomGridFill(
        session,
        projection,
        layout,
        { x: 1, y: 1, width: 1, height: 1 },
        { x: 1, y: 2, width: 1, height: 1 },
      ),
    ).toBe(1);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[1].cells.Value).toEqual({
      kind: "input",
      value: 42,
    });
  });

  it("grows a table so a pasted block fits", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const notes = session.addTable("sheet-forud", { name: "Notes" });
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, notes.id)!;

    expect(
      applyCustomGridPaste(session, projection, [1, 1], [
        ["10", "20"],
        ["30", "40"],
        ["50", "60"],
      ]),
    ).toBe(6);

    const table = session.getSnapshot().tables.find((candidate) => candidate.id === notes.id)!;
    expect(table.rows).toHaveLength(3);
    expect(table.attributeColumns).toHaveLength(2);
    expect(table.rows.map((row) => [row.cells[table.attributeColumns[0]!.id], row.cells[table.attributeColumns[1]!.id]])).toEqual([
      [{ kind: "input", value: 10 }, { kind: "input", value: 20 }],
      [{ kind: "input", value: 30 }, { kind: "input", value: 40 }],
      [{ kind: "input", value: 50 }, { kind: "input", value: 60 }],
    ]);
    expect(session.gridFocus).toEqual({ tableId: notes.id, col: 1, row: 1 });
  });

  it("grows rows but not columns when pasting into a promoteRowKeys table", () => {
    const before = createSampleWorkbook();
    const session = new WorkbookSession(before, inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;

    expect(
      applyCustomGridPaste(session, projection, [1, 8], [
        ["8", "ignored"],
        ["9"],
        ["10"],
      ]),
    ).toBe(3);

    const params = session.getSnapshot().tables.find((table) => table.id === "tbl-params")!;
    expect(params.rows).toHaveLength(10);
    expect(params.attributeColumns).toHaveLength(1);
    expect(params.rows[6]!.cells.Value).toEqual(before.tables[0]!.rows[6]!.cells.Value);
    expect(params.rows.slice(7).map((row) => row.cells.Value)).toEqual([
      { kind: "input", value: 8 },
      { kind: "input", value: 9 },
      { kind: "input", value: 10 },
    ]);
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-params")?.looseCells).toBeUndefined();
    expect(session.undo()).toBe(true);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows).toHaveLength(7);
  });

  it("does not add columns when pasting past a time-axis table", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-sales")!;

    expect(
      applyCustomGridPaste(session, projection, [12, 5], [
        ["1", "2"],
        ["3", "4"],
      ]),
    ).toBe(2);

    const salg = session.getSnapshot().tables.find((table) => table.id === "tbl-sales")!;
    expect(salg.rows).toHaveLength(6);
    expect(salg.attributeColumns).toHaveLength(0);
    expect(salg.rows[4]!.cells["2025-12"]).toEqual({ kind: "input", value: 1 });
    expect(salg.rows[5]!.cells["2025-12"]).toEqual({ kind: "input", value: 3 });
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-forud")?.looseCells).toBeUndefined();
  });
});

