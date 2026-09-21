import { describe, expect, it } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import type { FormulaEngine } from "../engine/types.js";
import { layoutSheets } from "../model/sheetView.js";
import type { CellSnapshot, TableSnapshot } from "../model/types.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { WorkbookSession } from "./WorkbookSession.js";

/** These cases are about grid geometry, so they skip the calculation round trip. */
const inert: FormulaEngine = { evaluate: () => ({}) };

function playground() {
  return new WorkbookSession(createPlaygroundWorkbook(), inert);
}

/** A sheet holding one plain table: header at row 0, one row, key plus Value. */
function scratch(looseCells?: Record<string, CellSnapshot>) {
  const seed = playground();
  const sheetId = seed.addSheet("Scratch").id;
  seed.addTable(sheetId, { name: "Notes" });
  if (!looseCells) return { session: seed, sheetId };
  const snapshot = seed.getSnapshot();
  snapshot.sheets.find((s) => s.id === sheetId)!.looseCells = looseCells;
  return { session: new WorkbookSession(snapshot, inert), sheetId };
}

function table(session: WorkbookSession, name: string): TableSnapshot {
  return session.getSnapshot().tables.find((t) => t.name === name)!;
}

function looseCells(session: WorkbookSession, sheetId: string) {
  return session.getSnapshot().sheets.find((s) => s.id === sheetId)!.looseCells ?? {};
}

function extent(session: WorkbookSession, sheetId: string) {
  const view = layoutSheets(session.getSnapshot()).find((v) => v.sheetId === sheetId)!;
  return { rowCount: view.rowCount, colCount: view.colCount };
}

function sheetIdOf(session: WorkbookSession, name: string): string {
  return session.getSnapshot().sheets.find((s) => s.name === name)!.id;
}

describe("table auto-expansion", () => {
  it("appends a row when the cell below the table is edited", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 1, "42");

    const notes = table(session, "Notes");
    expect(notes.rows).toHaveLength(2);
    expect(notes.rows[1].cells[notes.attributeColumns[0].id]).toEqual({ kind: "input", value: 42 });
    expect(looseCells(session, sheetId)).toEqual({});
  });

  it("names the new row when the edit lands in the key column", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 0, "Total");

    expect(table(session, "Notes").rows.map((r) => r.key)).toEqual(["1", "Total"]);
  });

  it("appends a column when the cell right of the table is edited", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 1, 2, "7");

    const notes = table(session, "Notes");
    expect(notes.attributeColumns).toHaveLength(2);
    expect(notes.rows[0].cells[notes.attributeColumns[1].id]).toEqual({ kind: "input", value: 7 });
  });

  it("names the new column when the edit lands on the header row", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 0, 2, "Comment");

    expect(table(session, "Notes").attributeColumns.map((c) => c.name)).toEqual(["A", "Comment"]);
  });

  it("refuses to expand down when another cell in that row already holds data", () => {
    const { session, sheetId } = scratch({ "2:0": { kind: "input", value: "note" } });
    session.writeGridCell(sheetId, 2, 1, "42");

    expect(table(session, "Notes").rows).toHaveLength(1);
    expect(looseCells(session, sheetId)["2:1"]).toEqual({ kind: "input", value: 42 });
  });

  it("refuses to expand right when another cell in that column already holds data", () => {
    const { session, sheetId } = scratch({ "0:2": { kind: "input", value: "note" } });
    session.writeGridCell(sheetId, 1, 2, "7");

    expect(table(session, "Notes").attributeColumns).toHaveLength(1);
    expect(looseCells(session, sheetId)["1:2"]).toEqual({ kind: "input", value: 7 });
  });

  it("never expands diagonally past the corner of a table", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 2, "x");

    const notes = table(session, "Notes");
    expect(notes.rows).toHaveLength(1);
    expect(notes.attributeColumns).toHaveLength(1);
    expect(looseCells(session, sheetId)["2:2"]).toEqual({ kind: "input", value: "x" });
  });
});

describe("auto-expansion against table invariants", () => {
  it("grows a time-axis table downwards but never rightwards", () => {
    const session = playground();
    const sheetId = sheetIdOf(session, "Forudsætninger");

    // Salg is 4 rows plus a header, and 1 key column plus 12 periods.
    session.writeGridCell(sheetId, 1, 13, "x");
    expect(table(session, "Salg").attributeColumns).toHaveLength(0);
    expect(looseCells(session, sheetId)["1:13"]).toEqual({ kind: "input", value: "x" });

    session.writeGridCell(sheetId, 5, 1, "999");
    const salg = table(session, "Salg");
    expect(salg.rows).toHaveLength(5);
    expect(salg.rows[4].cells["2025-01"]).toEqual({ kind: "input", value: 999 });
  });

  it("keeps a promoteRowKeys table at one data column and allocates a promotable key", () => {
    const session = playground();
    const sheetId = sheetIdOf(session, "Parametre");

    // Params is 7 rows plus a header, and 1 key column plus Value.
    session.writeGridCell(sheetId, 1, 2, "7");
    expect(table(session, "Params").attributeColumns).toHaveLength(1);
    expect(looseCells(session, sheetId)["1:2"]).toEqual({ kind: "input", value: 7 });

    session.writeGridCell(sheetId, 8, 1, "5");
    const params = table(session, "Params");
    expect(params.rows).toHaveLength(8);
    expect(params.rows[7].key).toBe("Param");
    expect(params.rows[7].cells.Value).toEqual({ kind: "input", value: 5 });
  });

  it("rolls the whole expansion back when the new row key is not a legal name", () => {
    const session = playground();
    const sheetId = sheetIdOf(session, "Parametre");

    expect(() => session.writeGridCell(sheetId, 8, 0, "SUM")).toThrow(/reserved/);
    expect(table(session, "Params").rows).toHaveLength(7);
    expect(looseCells(session, sheetId)).toEqual({});
  });

  it("still expands a locked table, since locked only blocks deletion", () => {
    const session = playground();
    const sheetId = sheetIdOf(session, "Parametre");
    session.writeGridCell(sheetId, 8, 0, "Moms");

    expect(table(session, "Params").rows.map((r) => r.key)).toContain("Moms");
  });
});

describe("single-step undo", () => {
  it("restores the table shape and the value together", () => {
    const { session, sheetId } = scratch();
    const before = session.getSnapshot();

    session.writeGridCell(sheetId, 2, 1, "42");
    expect(table(session, "Notes").rows).toHaveLength(2);

    expect(session.undo()).toBe(true);
    expect(session.getSnapshot()).toEqual(before);

    expect(session.redo()).toBe(true);
    expect(table(session, "Notes").rows).toHaveLength(2);
  });

  it("restores a loose cell edit", () => {
    const { session, sheetId } = scratch();
    const before = session.getSnapshot();

    session.writeGridCell(sheetId, 2, 2, "x");
    session.undo();

    expect(session.getSnapshot()).toEqual(before);
  });
});

describe("sheet extent", () => {
  it("keeps one empty row and column past the last table", () => {
    const { session, sheetId } = scratch();
    expect(extent(session, sheetId)).toEqual({ rowCount: 3, colCount: 3 });
  });

  it("grows past a value typed in the last row and column", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 2, "x");

    expect(extent(session, sheetId)).toEqual({ rowCount: 4, colCount: 4 });
  });

  it("grows again on the next edit, so the margin never runs out", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 2, "x");
    session.writeGridCell(sheetId, 3, 3, "y");

    expect(extent(session, sheetId)).toEqual({ rowCount: 5, colCount: 5 });
  });

  it("grows only the axis the edit pushed out", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 2, "x");

    session.writeGridCell(sheetId, 2, 3, "right");
    expect(extent(session, sheetId)).toEqual({ rowCount: 4, colCount: 5 });

    session.writeGridCell(sheetId, 3, 2, "down");
    expect(extent(session, sheetId)).toEqual({ rowCount: 5, colCount: 5 });
  });

  it("grows when a table expansion consumes the padding", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 1, "42");

    expect(table(session, "Notes").rows).toHaveLength(2);
    expect(extent(session, sheetId)).toEqual({ rowCount: 4, colCount: 3 });
  });

  it("shrinks back when the value is cleared", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 2, "x");
    session.writeGridCell(sheetId, 2, 2, "");

    expect(looseCells(session, sheetId)).toEqual({});
    expect(extent(session, sheetId)).toEqual({ rowCount: 3, colCount: 3 });
  });

  // A blank entry would still read as occupied, so the grid could never retreat.
  it("deletes the loose entry rather than storing a blank", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 5, 0, "note");
    session.writeGridCell(sheetId, 6, 0, "keep");

    session.writeGridCell(sheetId, 5, 0, "");
    expect(looseCells(session, sheetId)).toEqual({ "6:0": { kind: "input", value: "keep" } });

    session.writeGridCell(sheetId, 6, 0, "");
    expect(session.getSnapshot().sheets.find((s) => s.id === sheetId)!.looseCells).toBeUndefined();
  });

  it("never shrinks below the rows a table occupies", () => {
    const { session, sheetId } = scratch();
    session.addRow("Notes");
    session.writeGridCell(sheetId, 2, 1, "9");
    session.writeGridCell(sheetId, 2, 1, "");

    expect(table(session, "Notes").rows).toHaveLength(2);
    expect(extent(session, sheetId)).toEqual({ rowCount: 4, colCount: 3 });
  });

  it("hands the grown extent and the loose value to HyperFormula", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 2, "x");

    const snapshot = session.getSnapshot();
    const sheetName = snapshot.sheets.find((sheet) => sheet.id === sheetId)!.name;
    const values = new HyperFormulaEngine().evaluate(snapshot);
    expect(values[sheetName]).toHaveLength(4);
    expect(values[sheetName]![0]).toHaveLength(4);
    expect(values[sheetName]![2]![2]).toBe("x");
  });
});

describe("cell value edits keep formatting", () => {
  it("preserves number format and cell style across writeCell, setInput, and setFormula", () => {
    const session = playground();
    const style = { bold: true, italic: true, fontSize: 24, fillColor: "#fff6d6" };
    session.setCellStyle("tbl-params", "row-vat", "Value", style);
    session.setCellFormat("tbl-params", "row-vat", "Value", "0.00");

    session.writeCell("Params", "Vat", "Value", "0.5");
    expect(table(session, "Params").rows[2]!.cells.Value).toEqual({
      kind: "input",
      value: 0.5,
      format: "0.00",
      style,
    });

    session.setInput("Params", "Vat", "Value", 0.4);
    expect(table(session, "Params").rows[2]!.cells.Value).toEqual({
      kind: "input",
      value: 0.4,
      format: "0.00",
      style,
    });

    session.setFormula("Params", "Vat", "Value", "=1+1");
    expect(table(session, "Params").rows[2]!.cells.Value).toEqual({
      kind: "formula",
      formula: "=1+1",
      format: "0.00",
      style,
    });
  });
});
