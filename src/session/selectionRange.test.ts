import { describe, expect, it } from "vitest";
import { selectedCellRefs, sharedOrStar } from "../model/types.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "./WorkbookSession.js";

const inert = { evaluate: () => ({}) };

const range = [
  { tableId: "tbl-params", rowId: "row-annual", columnId: "Value" },
  { tableId: "tbl-params", rowId: "row-vat", columnId: "Value" },
];

describe("selected cell range properties", () => {
  it("reveals a table even when it is already selected", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    session.revealTable("tbl-params");
    expect(session.selection).toEqual({ kind: "table", tableId: "tbl-params" });
    const first = session.revealNonce;
    session.revealTable("tbl-params");
    expect(session.revealNonce).toBe(first + 1);
  });

  it("reports * when formats differ and writes one format to every cell", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    session.setSelection({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-annual",
      columnId: "Value",
      range,
    });
    session.setCellFormat("tbl-params", "row-annual", "Value", "G3A");
    const formats = selectedCellRefs(session.selection).map((ref) => {
      const table = session.getSnapshot().tables.find((candidate) => candidate.id === ref.tableId)!;
      const row = table.rows.find((candidate) => candidate.id === ref.rowId)!;
      return row.cells[ref.columnId]?.format ?? "";
    });
    expect(sharedOrStar(formats)).toBe("*");

    session.transact(() => {
      for (const ref of selectedCellRefs(session.selection)) {
        session.setCellFormat(ref.tableId, ref.rowId, ref.columnId, "G3K");
      }
    });
    const next = selectedCellRefs(session.selection).map((ref) => {
      const table = session.getSnapshot().tables.find((candidate) => candidate.id === ref.tableId)!;
      const row = table.rows.find((candidate) => candidate.id === ref.rowId)!;
      return row.cells[ref.columnId]?.format ?? "";
    });
    expect(sharedOrStar(next)).toBe("G3K");
  });
});
