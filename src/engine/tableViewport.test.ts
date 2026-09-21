import { BooleanNumber } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { snapshotToUniverData } from "./compileWorkbook.js";
import {
  createTableViewport,
  TABLE_VIEWPORT_COLUMN_WIDTH,
  TABLE_VIEWPORT_ROW_HEIGHT,
} from "./tableViewport.js";

describe("createTableViewport", () => {
  it("shows only one table plus one empty row and column, without grid headers", () => {
    const compiled = snapshotToUniverData(createPlaygroundWorkbook());
    const view = compiled.layout.sheets.find((sheet) => sheet.sheetId === "sheet-params")!;
    const band = view.bands[0];

    const viewport = createTableViewport(compiled.data, view.sheetId, band);
    const sheet = viewport.data.sheets[view.sheetId]!;
    const lastRow = band.headerRow + band.rowCount;
    const lastColumn = band.startCol + band.colCount;

    expect(sheet.rowHeader).toEqual({ width: 46, hidden: BooleanNumber.TRUE });
    expect(sheet.columnHeader).toEqual({ height: 20, hidden: BooleanNumber.TRUE });
    expect(sheet.rowData?.[band.headerRow]?.hd).toBe(BooleanNumber.FALSE);
    expect(sheet.rowData?.[lastRow]?.hd).toBe(BooleanNumber.FALSE);
    expect(sheet.columnData?.[band.startCol]?.hd).toBe(BooleanNumber.FALSE);
    expect(sheet.columnData?.[lastColumn]?.hd).toBe(BooleanNumber.FALSE);
    expect(viewport.width).toBe((band.colCount + 1) * TABLE_VIEWPORT_COLUMN_WIDTH + 2);
    expect(viewport.height).toBe((band.rowCount + 1) * TABLE_VIEWPORT_ROW_HEIGHT + 2);
  });

  it("hides the other table bands while retaining workbook coordinates", () => {
    const snapshot = createPlaygroundWorkbook();
    snapshot.sheets[1].tableIds.push("tbl-resultat");
    snapshot.sheets[3].tableIds = [];
    const compiled = snapshotToUniverData(snapshot);
    const view = compiled.layout.sheets.find((sheet) => sheet.sheetId === "sheet-forud")!;
    const target = view.bands[1];

    const viewport = createTableViewport(compiled.data, view.sheetId, target);
    const sheet = viewport.data.sheets[view.sheetId]!;

    expect(sheet.rowData?.[view.bands[0].headerRow]?.hd).toBe(BooleanNumber.TRUE);
    expect(sheet.rowData?.[target.headerRow]?.hd).toBe(BooleanNumber.FALSE);
    expect(sheet.cellData?.[target.headerRow]?.[target.startCol]).toBeUndefined();
  });
});
