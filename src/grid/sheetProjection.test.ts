import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import {
  TABLE_DATA_COLUMN_WIDTH,
  TABLE_GROWTH_COLUMN_WIDTH,
  TABLE_KEY_COLUMN_WIDTH,
  cellAfterCommitMove,
  cellsInProjectedRange,
  acceptTableGridSelection,
  isGrowthHeaderCell,
  isUnusedTableCorner,
  projectSheet,
  projectTable,
  projectedCell,
  projectedLocationForRef,
  selectionForProjectedCell,
} from "./sheetProjection.js";

describe("sheet grid projection", () => {
  it("uses sheet coordinates and exposes one outer row and column", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const projection = projectSheet(layout, "sheet-params")!;

    expect(projection.rowCount).toBe(9);
    expect(projection.colCount).toBe(3);
    expect(projection.columns.map((column) => column.title)).toEqual(["A", "B", "C"]);
  });

  it("classifies table cells and only direct growth margins as editable", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const projection = projectSheet(layout, "sheet-params")!;

    expect(projectedCell(projection, layout, 1, 1)).toMatchObject({
      kind: "table",
      hit: { kind: "cell", tableId: "tbl-params", rowId: "row-aarsalg", columnId: "Value" },
    });
    expect(projectedCell(projection, layout, 0, 8)).toMatchObject({
      kind: "extension",
      expansion: { direction: "below", tableId: "tbl-params" },
    });
    // Params owns a promoted value column and is therefore not allowed to grow right.
    expect(projectedCell(projection, layout, 2, 1)).toEqual({
      kind: "readonly",
      row: 1,
      col: 2,
    });
    expect(projectedCell(projection, layout, 2, 8)).toEqual({
      kind: "readonly",
      row: 8,
      col: 2,
    });
  });

  it("maps cells, keys, headers, and margins to session selections", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const projection = projectSheet(layout, "sheet-params")!;

    expect(selectionForProjectedCell(projection, layout, 1, 1)).toEqual({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-aarsalg",
      columnId: "Value",
    });
    expect(selectionForProjectedCell(projection, layout, 0, 1)).toEqual({
      kind: "row",
      tableId: "tbl-params",
      rowId: "row-aarsalg",
    });
    expect(selectionForProjectedCell(projection, layout, 1, 0)).toEqual({
      kind: "column",
      tableId: "tbl-params",
      columnId: "Value",
    });
    expect(selectionForProjectedCell(projection, layout, 1, 8)).toEqual({
      kind: "table",
      tableId: "tbl-params",
    });
  });

  it("collects data cells in a projected range in row-major order", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const projection = projectTable(layout, "tbl-params")!;
    expect(cellsInProjectedRange(projection, layout, { x: 1, y: 1, width: 1, height: 3 })).toEqual([
      { tableId: "tbl-params", rowId: "row-aarsalg", columnId: "Value" },
      { tableId: "tbl-params", rowId: "row-vaekst", columnId: "Value" },
      { tableId: "tbl-params", rowId: "row-vat", columnId: "Value" },
    ]);
  });

  it("maps a committed cell to the next row or column", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const params = projectTable(layout, "tbl-params")!;
    const salg = projectTable(layout, "tbl-salg")!;

    expect(projectedLocationForRef(params, layout, {
      tableId: "tbl-params",
      rowId: "row-vat",
      columnId: "Value",
    })).toEqual([1, 3]);
    expect(cellAfterCommitMove(params, layout, [1, 3], [0, 1])).toEqual({
      location: [1, 4],
      selection: { kind: "cell", tableId: "tbl-params", rowId: "row-andel-cnc", columnId: "Value" },
    });
    expect(cellAfterCommitMove(params, layout, [1, 3], [1, 0])).toBeUndefined();
    expect(cellAfterCommitMove(params, layout, [1, 7], [0, 1])).toEqual({
      location: [1, 8],
      selection: { kind: "table", tableId: "tbl-params" },
    });

    expect(cellAfterCommitMove(salg, layout, [1, 1], [1, 0])).toEqual({
      location: [2, 1],
      selection: { kind: "cell", tableId: "tbl-salg", rowId: "row-cnc", columnId: "2025-02" },
    });
    expect(cellAfterCommitMove(salg, layout, [1, 1], [0, 1])).toEqual({
      location: [1, 2],
      selection: { kind: "cell", tableId: "tbl-salg", rowId: "row-out", columnId: "2025-01" },
    });
    expect(cellAfterCommitMove(salg, layout, [1, 4], [0, 1])).toEqual({
      location: [1, 5],
      selection: { kind: "table", tableId: "tbl-salg" },
    });
  });

  it("moves Enter from a Key cell onto the next Key cell, not Growth", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const params = projectTable(layout, "tbl-params")!;
    expect(cellAfterCommitMove(params, layout, [0, 3], [0, 1])).toEqual({
      location: [0, 4],
      selection: { kind: "row", tableId: "tbl-params", rowId: "row-andel-cnc" },
    });
  });

  it("moves Tab from a Header cell onto the next Header cell", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const staff = projectTable(layout, "tbl-staff")!;
    expect(cellAfterCommitMove(staff, layout, [1, 0], [1, 0])).toEqual({
      location: [2, 0],
      selection: { kind: "column", tableId: "tbl-staff", columnId: "BaseSalary" },
    });
  });

  it("uses table column names as identifiers instead of ABC defaults", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const projection = projectTable(layout, "tbl-params")!;

    expect(projection.columns.map((column) => column.title)).toEqual(["", "Value"]);
    expect(projection.growthColumn).toBe(false);
    expect(projection.rowCount).toBe(9);
    expect(projection.originRow).toBe(0);
    expect(projectedCell(projection, layout, 0, 0)).toEqual({ kind: "readonly", row: 0, col: 0 });
    expect(isUnusedTableCorner(projection, 0, 0)).toBe(true);
    expect(acceptTableGridSelection(projection, [0, 0])).toBe(false);
    expect(acceptTableGridSelection(projection, [1, 1])).toBe(true);
    expect(projectedCell(projection, layout, 0, 1)).toMatchObject({
      kind: "table",
      hit: { kind: "key", tableId: "tbl-params", rowId: "row-aarsalg" },
    });
    expect(isGrowthHeaderCell(projection, 0, 8)).toBe(true);
    expect(isGrowthHeaderCell(projection, 1, 0)).toBe(false);
    expect(isGrowthHeaderCell(projection, 0, 0)).toBe(false);
    expect(isGrowthHeaderCell(projection, 1, 1)).toBe(false);
  });

  it("uses a narrower default width for the key and growth columns", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const params = projectTable(layout, "tbl-params")!;
    const salg = projectTable(layout, "tbl-salg")!;

    expect(params.columns.map((column) => column.width)).toEqual([
      TABLE_KEY_COLUMN_WIDTH,
      TABLE_DATA_COLUMN_WIDTH,
    ]);
    expect(salg.columns[0]?.width).toBe(TABLE_KEY_COLUMN_WIDTH);
    expect(salg.columns.at(-1)?.width).toBe(TABLE_GROWTH_COLUMN_WIDTH);
    expect(salg.columns.slice(1, -1).every((column) => column.width === TABLE_DATA_COLUMN_WIDTH)).toBe(true);
    expect(TABLE_KEY_COLUMN_WIDTH).toBeLessThan(TABLE_DATA_COLUMN_WIDTH);
    expect(TABLE_GROWTH_COLUMN_WIDTH).toBeLessThan(TABLE_DATA_COLUMN_WIDTH);
  });

  it("keeps inter-table gaps visible but read-only", () => {
    const snapshot = createPlaygroundWorkbook();
    snapshot.sheets[0].tableIds.push("tbl-salg");
    const layout = layoutWorkbook(snapshot);
    const projection = projectSheet(layout, "sheet-params")!;

    // Params occupies rows 0..7; rows 8 and 9 are its two-row stacking gap.
    expect(projectedCell(projection, layout, 2, 9)).toEqual({
      kind: "readonly",
      row: 9,
      col: 2,
    });
    expect(projectedCell(projection, layout, 1, 10)).toMatchObject({
      kind: "table",
      hit: { kind: "header", tableId: "tbl-salg" },
    });
  });

  it("keeps a time-axis growth column selected as the table, not the sheet", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const salg = projectTable(layout, "tbl-salg")!;
    const growthCol = salg.colCount - 1;
    expect(selectionForProjectedCell(salg, layout, growthCol, 0)).toEqual({
      kind: "table",
      tableId: "tbl-salg",
    });
    expect(selectionForProjectedCell(salg, layout, growthCol, 1)).toEqual({
      kind: "table",
      tableId: "tbl-salg",
    });
  });
});

