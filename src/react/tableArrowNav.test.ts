import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import type { WorkbookSnapshot } from "../model/types.js";
import { projectTable } from "../grid/sheetProjection.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import {
  adjacentTableArrowTarget,
  arrowNavDirection,
  ctrlArrowNavTarget,
  focusAdjacentTable,
} from "./tableArrowNav.js";

const inert = { evaluate: () => ({}) };

/**
 * Wide table: key + Alpha + Gamma + growth (cols 0..3), header + 3 data + growth (rows 0..4).
 * Narrow table: key + Beta + growth (cols 0..2), header + 1 data + growth (rows 0..2).
 * Unused corners: wide (0,0) and (3,4); narrow (0,0) and (2,2).
 */
function stackedTables(): WorkbookSnapshot {
  return {
    id: "wb-nav",
    name: "Nav",
    calendar: { startMonth: "2025-01", monthCount: 1 },
    sheets: [{ id: "sheet-nav", name: "Nav", tableIds: ["tbl-wide", "tbl-narrow"] }],
    tables: [
      {
        id: "tbl-wide",
        name: "Wide",
        yearColumns: [],
        attributeColumns: [
          { id: "col-alpha", name: "Alpha" },
          { id: "col-gamma", name: "Gamma" },
        ],
        rows: [
          { id: "rw-1", key: "1", cells: {} },
          { id: "rw-2", key: "2", cells: {} },
          { id: "rw-3", key: "3", cells: {} },
        ],
      },
      {
        id: "tbl-narrow",
        name: "Narrow",
        yearColumns: [],
        attributeColumns: [{ id: "col-beta", name: "Beta" }],
        rows: [{ id: "rn-1", key: "1", cells: {} }],
      },
    ],
    scenarios: [],
    activeScenarioId: null,
  };
}

function sheetTables() {
  const layout = layoutWorkbook(stackedTables());
  return [projectTable(layout, "tbl-wide")!, projectTable(layout, "tbl-narrow")!];
}

describe("table arrow navigation", () => {
  it("maps arrow keys to directions", () => {
    expect(arrowNavDirection("ArrowDown")).toBe("down");
    expect(arrowNavDirection("ArrowUp")).toBe("up");
    expect(arrowNavDirection("ArrowLeft")).toBe("left");
    expect(arrowNavDirection("ArrowRight")).toBe("right");
    expect(arrowNavDirection("Enter")).toBeUndefined();
  });

  it("moves down from the last row onto the next table at the same column", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 1, row: 4 }, "down")).toEqual({
      tableId: "tbl-narrow",
      col: 1,
      row: 0,
    });
  });

  it("moves up from the first row onto the previous table at the same column", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-narrow", col: 1, row: 0 }, "up")).toEqual({
      tableId: "tbl-wide",
      col: 1,
      row: 4,
    });
  });

  it("wraps right from the bottom of the growth column onto the growth-row key", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 3, row: 3 }, "right")).toEqual({
      tableId: "tbl-wide",
      col: 0,
      row: 4,
    });
  });

  it("wraps left from the growth-row key onto the bottom of the growth column", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 0, row: 4 }, "left")).toEqual({
      tableId: "tbl-wide",
      col: 3,
      row: 3,
    });
  });

  it("moves right from the last growth-row cell onto the next table header", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 2, row: 4 }, "right")).toEqual({
      tableId: "tbl-narrow",
      col: 1,
      row: 0,
    });
  });

  it("moves left from the first header cell onto the previous table growth row", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-narrow", col: 1, row: 0 }, "left")).toEqual({
      tableId: "tbl-wide",
      col: 2,
      row: 4,
    });
  });

  it("wraps left from a key-column cell onto the growth cell of the row above", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 0, row: 2 }, "left")).toEqual({
      tableId: "tbl-wide",
      col: 3,
      row: 1,
    });
  });

  it("wraps right from a growth-column cell onto the key cell of the row below", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 3, row: 1 }, "right")).toEqual({
      tableId: "tbl-wide",
      col: 0,
      row: 2,
    });
  });

  it("clamps to the last selectable column when the target is narrower", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 3, row: 3 }, "down")).toEqual({
      tableId: "tbl-narrow",
      col: 2,
      row: 0,
    });
  });

  it("lands on the first selectable header of the next table, not a clamped same row", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 2, row: 4 }, "right")).toEqual({
      tableId: "tbl-narrow",
      col: 1,
      row: 0,
    });
  });

  it("lands on the first selectable key row instead of the unused top-left corner", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 0, row: 4 }, "down")).toEqual({
      tableId: "tbl-narrow",
      col: 0,
      row: 1,
    });
  });

  it("lands on the first selectable header instead of the unused top-left corner", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 2, row: 4 }, "right")).toEqual({
      tableId: "tbl-narrow",
      col: 1,
      row: 0,
    });
  });

  it("moves to the next selectable cell in the same table, including growth cells", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 1, row: 3 }, "down")).toEqual({
      tableId: "tbl-wide",
      col: 1,
      row: 4,
    });
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 2, row: 1 }, "right")).toEqual({
      tableId: "tbl-wide",
      col: 3,
      row: 1,
    });
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 0, row: 4 }, "right")).toEqual({
      tableId: "tbl-wide",
      col: 1,
      row: 4,
    });
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 3, row: 0 }, "down")).toEqual({
      tableId: "tbl-wide",
      col: 3,
      row: 1,
    });
  });

  it("skips unused top-left and bottom-right corners", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 1, row: 0 }, "left")).toBeUndefined();
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 2, row: 4 }, "right")).toEqual({
      tableId: "tbl-narrow",
      col: 1,
      row: 0,
    });
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 0, row: 4 }, "down")).toEqual({
      tableId: "tbl-narrow",
      col: 0,
      row: 1,
    });
  });

  it("does nothing at the first or last table on the sheet", () => {
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 1, row: 0 }, "up")).toBeUndefined();
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-narrow", col: 1, row: 2 }, "down")).toBeUndefined();
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-wide", col: 1, row: 0 }, "left")).toBeUndefined();
    expect(adjacentTableArrowTarget(sheetTables(), { tableId: "tbl-narrow", col: 1, row: 2 }, "right")).toBeUndefined();
  });

  it("uses the same 0-based grid column index, not column id", () => {
    const tables = sheetTables();
    expect(tables[0]!.columns[1]?.id).toBe("col-alpha");
    expect(tables[1]!.columns[1]?.id).toBe("col-beta");
    expect(adjacentTableArrowTarget(tables, { tableId: "tbl-wide", col: 1, row: 4 }, "down")).toEqual({
      tableId: "tbl-narrow",
      col: 1,
      row: 0,
    });
  });

  it("moves from the bottom growth-column cell onto the growth-row key even when both are table selections", () => {
    const snapshot = stackedTables();
    const session = new WorkbookSession(snapshot, inert);
    const layout = layoutWorkbook(snapshot);
    session.setSelection({ kind: "table", tableId: "tbl-wide" });
    let notified = 0;
    session.subscribe(() => {
      notified += 1;
    });
    expect(
      focusAdjacentTable(session, sheetTables(), { tableId: "tbl-wide", col: 3, row: 3 }, "right", layout),
    ).toEqual({ tableId: "tbl-wide", col: 0, row: 4 });
    expect(notified).toBeGreaterThan(0);
    expect(session.gridFocus).toEqual({ tableId: "tbl-wide", col: 0, row: 4 });
    expect(session.selection).toEqual({ kind: "table", tableId: "tbl-wide" });
  });

  it("focuses the landing cell without revealing the table as a title click", () => {
    const snapshot = stackedTables();
    const session = new WorkbookSession(snapshot, inert);
    const layout = layoutWorkbook(snapshot);
    const first = session.revealNonce;
    expect(
      focusAdjacentTable(session, sheetTables(), { tableId: "tbl-wide", col: 1, row: 4 }, "down", layout),
    ).toEqual({ tableId: "tbl-narrow", col: 1, row: 0 });
    expect(session.selection).toEqual({
      kind: "column",
      tableId: "tbl-narrow",
      columnId: "col-beta",
    });
    expect(session.revealNonce).toBe(first);
    expect(session.gridFocus).toEqual({ tableId: "tbl-narrow", col: 1, row: 0 });
  });

  it("keeps Salg selected when arrowing onto its locked time-axis growth column", () => {
    const snapshot = createPlaygroundWorkbook();
    const session = new WorkbookSession(snapshot, inert);
    const layout = layoutWorkbook(snapshot);
    const salg = projectTable(layout, "tbl-salg")!;
    const lastPeriodCol = salg.colCount - 2;
    const growthCol = salg.colCount - 1;
    session.setSelection({
      kind: "cell",
      tableId: "tbl-salg",
      rowId: "row-cnc",
      columnId: "2025-12",
    });
    expect(focusAdjacentTable(session, [salg], { tableId: "tbl-salg", col: lastPeriodCol, row: 1 }, "right", layout)).toEqual({
      tableId: "tbl-salg",
      col: growthCol,
      row: 1,
    });
    expect(session.selection).toEqual({ kind: "table", tableId: "tbl-salg" });
    expect(session.gridFocus).toEqual({ tableId: "tbl-salg", col: growthCol, row: 1 });
  });
});

/**
 * A: key + CA/CB/CC/CD/CE + growth. R1 = 1,2,empty,4,5. R2 = 1,empty,empty,8,9. R3 empty.
 * B: key + CA/CB + growth. S1 CA = 9.
 */
function filledBlocks(): WorkbookSnapshot {
  return {
    id: "wb-ctrl",
    name: "Ctrl",
    calendar: { startMonth: "2025-01", monthCount: 1 },
    sheets: [{ id: "sheet-ctrl", name: "Ctrl", tableIds: ["tbl-a", "tbl-b"] }],
    tables: [
      {
        id: "tbl-a",
        name: "A",
        yearColumns: [],
        attributeColumns: [
          { id: "ca", name: "CA" },
          { id: "cb", name: "CB" },
          { id: "cc", name: "CC" },
          { id: "cd", name: "CD" },
          { id: "ce", name: "CE" },
        ],
        rows: [
          {
            id: "ra1",
            key: "R1",
            cells: {
              ca: { kind: "input", value: 1 },
              cb: { kind: "input", value: 2 },
              cd: { kind: "input", value: 4 },
              ce: { kind: "input", value: 5 },
            },
          },
          {
            id: "ra2",
            key: "R2",
            cells: {
              ca: { kind: "input", value: 1 },
              cd: { kind: "input", value: 8 },
              ce: { kind: "input", value: 9 },
            },
          },
          { id: "ra3", key: "R3", cells: {} },
        ],
      },
      {
        id: "tbl-b",
        name: "B",
        yearColumns: [],
        attributeColumns: [
          { id: "ca", name: "CA" },
          { id: "cb", name: "CB" },
        ],
        rows: [{ id: "rb1", key: "S1", cells: { ca: { kind: "input", value: 9 } } }],
      },
    ],
    scenarios: [],
    activeScenarioId: null,
  };
}

function blockTables() {
  const layout = layoutWorkbook(filledBlocks());
  return { layout, tables: [projectTable(layout, "tbl-a")!, projectTable(layout, "tbl-b")!] };
}

describe("ctrl arrow navigation", () => {
  it("stops on the last filled cell before a blank, not the last filled cell in the row", () => {
    const { layout, tables } = blockTables();
    expect(ctrlArrowNavTarget(tables, { tableId: "tbl-a", col: 1, row: 1 }, "right", layout)).toEqual({
      tableId: "tbl-a",
      col: 2,
      row: 1,
    });
  });

  it("jumps only the blank cells and lands on the first following filled cell", () => {
    const { layout, tables } = blockTables();
    expect(ctrlArrowNavTarget(tables, { tableId: "tbl-a", col: 2, row: 1 }, "right", layout)).toEqual({
      tableId: "tbl-a",
      col: 4,
      row: 1,
    });
  });

  it("from that filled cell, continues to the next phase change on the filled side", () => {
    const { layout, tables } = blockTables();
    expect(ctrlArrowNavTarget(tables, { tableId: "tbl-a", col: 4, row: 1 }, "right", layout)).toEqual({
      tableId: "tbl-a",
      col: 5,
      row: 1,
    });
  });

  it("goes to the end of the table when no more phase changes remain, and does not wrap rows", () => {
    const { layout, tables } = blockTables();
    expect(ctrlArrowNavTarget(tables, { tableId: "tbl-a", col: 5, row: 1 }, "right", layout)).toEqual({
      tableId: "tbl-a",
      col: 6,
      row: 1,
    });
    expect(ctrlArrowNavTarget(tables, { tableId: "tbl-a", col: 6, row: 1 }, "right", layout)).toBeUndefined();
  });

  it("moves down to the last filled cell before a blank in the same column", () => {
    const { layout, tables } = blockTables();
    expect(ctrlArrowNavTarget(tables, { tableId: "tbl-a", col: 1, row: 0 }, "down", layout)).toEqual({
      tableId: "tbl-a",
      col: 1,
      row: 2,
    });
  });

  it("goes to the end of table data, then the first cell of the next table, skipping the growth row", () => {
    const { layout, tables } = blockTables();
    expect(ctrlArrowNavTarget(tables, { tableId: "tbl-a", col: 1, row: 2 }, "down", layout)).toEqual({
      tableId: "tbl-b",
      col: 1,
      row: 0,
    });
    expect(ctrlArrowNavTarget(tables, { tableId: "tbl-a", col: 1, row: 3 }, "down", layout)).toEqual({
      tableId: "tbl-b",
      col: 1,
      row: 0,
    });
    expect(ctrlArrowNavTarget(tables, { tableId: "tbl-b", col: 1, row: 0 }, "up", layout)).toEqual({
      tableId: "tbl-a",
      col: 1,
      row: 3,
    });
  });

  it("moves down the last table growth column to its last data row", () => {
    const { layout, tables } = blockTables();
    expect(ctrlArrowNavTarget(tables, { tableId: "tbl-b", col: 3, row: 0 }, "down", layout)).toEqual({
      tableId: "tbl-b",
      col: 3,
      row: 1,
    });
  });
});
