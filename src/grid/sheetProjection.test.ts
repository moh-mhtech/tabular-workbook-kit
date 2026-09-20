import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import {
  projectSheet,
  projectTable,
  projectedCell,
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

  it("uses table column names as identifiers instead of ABC defaults", () => {
    const layout = layoutWorkbook(createPlaygroundWorkbook());
    const projection = projectTable(layout, "tbl-params")!;

    expect(projection.columns.map((column) => column.title)).toEqual(["key", "Value", ""]);
    expect(projection.rowCount).toBe(9);
    expect(projection.originRow).toBe(0);
    expect(projectedCell(projection, layout, 0, 1)).toMatchObject({
      kind: "table",
      hit: { kind: "key", tableId: "tbl-params", rowId: "row-aarsalg" },
    });
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
});

