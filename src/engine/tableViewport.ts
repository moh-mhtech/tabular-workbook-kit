import { BooleanNumber, type IWorkbookData } from "@univerjs/core";
import type { TableBand } from "../model/sheetView.js";

export const TABLE_VIEWPORT_COLUMN_WIDTH = 100;
export const TABLE_VIEWPORT_ROW_HEIGHT = 24;

export interface TableViewport {
  data: IWorkbookData;
  width: number;
  height: number;
}

/**
 * Keeps workbook coordinates intact for formulas, while hiding every row and
 * column except one table and the single expansion cell band around it.
 */
export function createTableViewport(data: IWorkbookData, sheetId: string, band: TableBand): TableViewport {
  const sheet = data.sheets[sheetId];
  if (!sheet) throw new Error(`Sheet "${sheetId}" is missing from the workbook view`);

  const lastVisibleRow = band.headerRow + band.rowCount;
  const lastVisibleColumn = band.startCol + band.colCount;
  const rowData = { ...(sheet.rowData ?? {}) };
  const columnData = { ...(sheet.columnData ?? {}) };

  for (let row = 0; row < (sheet.rowCount ?? 0); row += 1) {
    rowData[row] = {
      ...(rowData[row] ?? {}),
      hd:
        row < band.headerRow || row > lastVisibleRow
          ? BooleanNumber.TRUE
          : BooleanNumber.FALSE,
    };
  }
  for (let column = 0; column < (sheet.columnCount ?? 0); column += 1) {
    columnData[column] = {
      ...(columnData[column] ?? {}),
      hd:
        column < band.startCol || column > lastVisibleColumn
          ? BooleanNumber.TRUE
          : BooleanNumber.FALSE,
    };
  }

  return {
    data: {
      ...data,
      sheets: {
        ...data.sheets,
        [sheetId]: {
          ...sheet,
          defaultColumnWidth: TABLE_VIEWPORT_COLUMN_WIDTH,
          defaultRowHeight: TABLE_VIEWPORT_ROW_HEIGHT,
          rowHeader: { width: 46, hidden: BooleanNumber.TRUE },
          columnHeader: { height: 20, hidden: BooleanNumber.TRUE },
          rowData,
          columnData,
        },
      },
    },
    width: (band.colCount + 1) * TABLE_VIEWPORT_COLUMN_WIDTH + 2,
    height: (band.rowCount + 1) * TABLE_VIEWPORT_ROW_HEIGHT + 2,
  };
}
