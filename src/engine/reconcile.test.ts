import { describe, expect, it } from "vitest";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import type { WorkbookSnapshot } from "../model/types.js";
import type { FormulaEngine } from "./types.js";
import { diffWorkbook, type ViewOp } from "./reconcile.js";

/** The diff is pure geometry, so it skips the calculation round trip. */
const inert: FormulaEngine = { evaluate: () => ({}) };

/** A sheet holding one plain table: header at row 0, one row, key plus Value. */
function scratch() {
  const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
  const sheetId = session.addSheet("Scratch").id;
  session.addTable(sheetId, { name: "Notes" });
  return { session, sheetId };
}

function valueColumn(snapshot: WorkbookSnapshot): string {
  return snapshot.tables.find((t) => t.name === "Notes")!.attributeColumns[0].id;
}

function record(session: WorkbookSession, change: () => void): ViewOp[] {
  const before = session.getSnapshot();
  change();
  return diffWorkbook(before, session.getSnapshot());
}

function sheetIdOf(session: WorkbookSession, name: string): string {
  return session.getSnapshot().sheets.find((s) => s.name === name)!.id;
}

describe("reconciling a cell edit", () => {
  it("produces nothing when the snapshot did not change", () => {
    const { session } = scratch();
    const snapshot = session.getSnapshot();

    expect(diffWorkbook(snapshot, session.getSnapshot())).toEqual([]);
  });

  it("writes exactly the one cell that changed", () => {
    const { session, sheetId } = scratch();
    const ops = record(session, () => session.writeGridCell(sheetId, 1, 1, "42"));

    expect(ops).toEqual([{ kind: "cell", sheetId, row: 1, col: 1, cell: { v: 42 } }]);
  });

  it("clears a cell that lost its value", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 1, 1, "42");
    const ops = record(session, () => session.writeGridCell(sheetId, 1, 1, ""));

    expect(ops).toEqual([{ kind: "cell", sheetId, row: 1, col: 1, cell: null }]);
  });

  it("replaces rather than merges when a formula becomes a value", () => {
    const { session, sheetId } = scratch();
    session.setFormula("Notes", "1", valueColumn(session.getSnapshot()), "=1+1");
    const ops = record(session, () => session.writeGridCell(sheetId, 1, 1, "5"));

    expect(ops).toEqual([{ kind: "cell", sheetId, row: 1, col: 1, cell: { v: 5 } }]);
  });
});

describe("reconciling the viewport", () => {
  it("grows both counts and writes the loose value, touching no table", () => {
    const { session, sheetId } = scratch();
    const ops = record(session, () => session.writeGridCell(sheetId, 2, 2, "x"));

    expect(ops).toEqual([
      { kind: "rowCount", sheetId, rowCount: 4 },
      { kind: "colCount", sheetId, colCount: 4 },
      { kind: "cell", sheetId, row: 2, col: 2, cell: { v: "x" } },
    ]);
  });

  it("grows the extent before writing into the new margin", () => {
    const { session, sheetId } = scratch();
    const ops = record(session, () => session.writeGridCell(sheetId, 2, 2, "x"));

    expect(ops.findIndex((op) => op.kind === "rowCount")).toBeLessThan(
      ops.findIndex((op) => op.kind === "cell"),
    );
  });

});

// The grid is the occupied extent plus one row and one column, so a clear walks
// it back the same way an edit pushed it out.
describe("reconciling a shrinking viewport", () => {
  it("retreats on both axes when the corner value is cleared", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 2, "x");
    const ops = record(session, () => session.writeGridCell(sheetId, 2, 2, ""));

    expect(ops).toEqual([
      { kind: "rowCount", sheetId, rowCount: 3 },
      { kind: "colCount", sheetId, colCount: 3 },
      { kind: "cell", sheetId, row: 2, col: 2, cell: null },
    ]);
  });

  it("drops only the row count when the last occupied row is cleared", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 5, 0, "note");
    const ops = record(session, () => session.writeGridCell(sheetId, 5, 0, ""));

    expect(ops).toEqual([
      { kind: "rowCount", sheetId, rowCount: 3 },
      { kind: "cell", sheetId, row: 5, col: 0, cell: null },
    ]);
  });

  it("drops only the column count when the last occupied column is cleared", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 0, 5, "note");
    const ops = record(session, () => session.writeGridCell(sheetId, 0, 5, ""));

    expect(ops).toEqual([
      { kind: "colCount", sheetId, colCount: 3 },
      { kind: "cell", sheetId, row: 0, col: 5, cell: null },
    ]);
  });

  it("cascades past every row cleared in one step", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 3, 0, "a");
    session.writeGridCell(sheetId, 4, 0, "b");
    session.writeGridCell(sheetId, 5, 0, "c");
    const ops = record(session, () =>
      session.transact(() => {
        session.writeGridCell(sheetId, 5, 0, "");
        session.writeGridCell(sheetId, 4, 0, "");
        session.writeGridCell(sheetId, 3, 0, "");
      }),
    );

    expect(ops.filter((op) => op.kind === "rowCount")).toEqual([
      { kind: "rowCount", sheetId, rowCount: 3 },
    ]);
  });

  it("leaves the extent alone when a cell inside a band is cleared", () => {
    const { session, sheetId } = scratch();
    session.addRow("Notes");
    session.writeGridCell(sheetId, 2, 1, "9");
    const ops = record(session, () => session.writeGridCell(sheetId, 2, 1, ""));

    expect(ops).toEqual([{ kind: "cell", sheetId, row: 2, col: 1, cell: null }]);
  });

  it("restores both the value and the grid size on undo", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 5, 0, "note");
    const grown = session.getSnapshot();
    session.writeGridCell(sheetId, 5, 0, "");
    const shrunk = session.getSnapshot();
    session.undo();

    expect(session.getSnapshot()).toEqual(grown);
    expect(diffWorkbook(shrunk, session.getSnapshot())).toEqual([
      { kind: "rowCount", sheetId, rowCount: 7 },
      { kind: "cell", sheetId, row: 5, col: 0, cell: { v: "note" } },
    ]);
  });
});

describe("reconciling a table that grew", () => {
  it("appends a row as an extent change, two cells, and a new range", () => {
    const { session, sheetId } = scratch();
    const tableId = session.getSnapshot().tables.find((t) => t.name === "Notes")!.id;
    const ops = record(session, () => session.writeGridCell(sheetId, 2, 1, "42"));

    expect(ops).toEqual([
      { kind: "rowCount", sheetId, rowCount: 4 },
      { kind: "cell", sheetId, row: 2, col: 0, cell: { v: "2" } },
      { kind: "cell", sheetId, row: 2, col: 1, cell: { v: 42 } },
      {
        kind: "tableRange",
        sheetId,
        tableId,
        range: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 1 },
      },
    ]);
  });

  it("appends a column as an extent change, two cells, and a new range", () => {
    const { session, sheetId } = scratch();
    const tableId = session.getSnapshot().tables.find((t) => t.name === "Notes")!.id;
    const ops = record(session, () => session.writeGridCell(sheetId, 1, 2, "7"));

    expect(ops).toEqual([
      { kind: "colCount", sheetId, colCount: 4 },
      { kind: "cell", sheetId, row: 0, col: 2, cell: { v: "B" } },
      { kind: "cell", sheetId, row: 1, col: 2, cell: { v: 7 } },
      {
        kind: "tableRange",
        sheetId,
        tableId,
        range: { startRow: 0, startColumn: 0, endRow: 1, endColumn: 2 },
      },
    ]);
  });

  it("re-registers the range only after the cells behind it are written", () => {
    const { session, sheetId } = scratch();
    const ops = record(session, () => session.writeGridCell(sheetId, 2, 1, "42"));

    const rangeAt = ops.findIndex((op) => op.kind === "tableRange");
    expect(ops.every((op, i) => op.kind !== "cell" || i < rangeAt)).toBe(true);
  });

  it("registers a promoted row key as a defined name", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
    const sheetId = sheetIdOf(session, "Parametre");
    const ops = record(session, () => session.writeGridCell(sheetId, 8, 0, "Moms"));

    expect(ops).toContainEqual({ kind: "nameAdd", name: "Moms", ref: "'Parametre'!$B$9" });
  });

  it("drops the table registration when the table is deleted", () => {
    const { session, sheetId } = scratch();
    const tableId = session.getSnapshot().tables.find((t) => t.name === "Notes")!.id;
    const ops = record(session, () => session.deleteTable("Notes"));

    expect(ops).toContainEqual({ kind: "tableRemove", sheetId, tableId });
  });
});

describe("reconciling loose cells around a moving band", () => {
  it("moves the loose value down with the band that grew above it", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 4, 0, "note");
    const ops = record(session, () => session.addRow("Notes"));

    expect(session.getSnapshot().sheets.find((s) => s.id === sheetId)!.looseCells).toEqual({
      "5:0": { kind: "input", value: "note" },
    });
    expect(ops).toContainEqual({ kind: "cell", sheetId, row: 4, col: 0, cell: null });
    expect(ops).toContainEqual({ kind: "cell", sheetId, row: 5, col: 0, cell: { v: "note" } });
  });

  it("absorbs the loose value the expanding table covers", () => {
    const { session, sheetId } = scratch();
    session.writeGridCell(sheetId, 2, 2, "x");
    session.writeGridCell(sheetId, 2, 1, "42");

    const sheet = session.getSnapshot().sheets.find((s) => s.id === sheetId)!;
    expect(sheet.looseCells).toEqual({ "3:2": { kind: "input", value: "x" } });
  });
});

describe("changes the view cannot absorb", () => {
  it("rebuilds when a sheet is added", () => {
    const { session } = scratch();

    expect(record(session, () => session.addSheet("Extra"))).toEqual([{ kind: "rebuild" }]);
  });

  it("rebuilds when a sheet is renamed", () => {
    const { session, sheetId } = scratch();

    expect(record(session, () => session.renameSheet(sheetId, "Scratchpad"))).toEqual([
      { kind: "rebuild" },
    ]);
  });
});
