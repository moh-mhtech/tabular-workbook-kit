import { describe, expect, it } from "vitest";

import {
  applyExplorerDropHint,
  closestSheetDropHint,
  closestTableDropHint,
  dropHintAfterLastSheet,
  dropHintForTable,
  readExplorerDragPayload,
} from "./explorerDrag.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";



describe("explorer drop hints", () => {

  it("marks a trailing sheet drop after the last sheet", () => {

    expect(dropHintAfterLastSheet([{ id: "sheet-a" }, { id: "sheet-b" }])).toEqual({

      placement: "after-sheet",

      sheetId: "sheet-b",

    });

  });



  it("moves a table before another from a before-table drop hint", () => {
    const session = new WorkbookSession(createSampleWorkbook());
    const notes = session.addTable("sheet-assumptions", { name: "Notes", yearColumns: false });
    applyExplorerDropHint(
      session,
      { kind: "table", id: "tbl-lines" },
      { placement: "before-table", sheetId: "sheet-assumptions", tableId: notes.id },
    );
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")!.tableIds).toEqual([
      notes.id,
      "tbl-lines",
    ]);
  });

  it("appends a table from an append-tables drop hint", () => {
    const session = new WorkbookSession(createSampleWorkbook());
    const notes = session.addTable("sheet-assumptions", { name: "Notes", yearColumns: false });
    applyExplorerDropHint(
      session,
      { kind: "table", id: "tbl-lines" },
      { placement: "append-tables", sheetId: "sheet-assumptions" },
    );
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")!.tableIds).toEqual([
      notes.id,
      "tbl-lines",
    ]);
  });

  it("moves a table before a lower row without landing one slot too low", () => {
    const session = new WorkbookSession(createSampleWorkbook());
    session.addTable("sheet-assumptions", { name: "Notes", yearColumns: false });
    const extra = session.addTable("sheet-assumptions", { name: "Extra", yearColumns: false });
    applyExplorerDropHint(
      session,
      { kind: "table", id: "tbl-lines" },
      { placement: "before-table", sheetId: "sheet-assumptions", tableId: extra.id },
    );
    const tableIds = session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")!.tableIds;
    expect(tableIds).toEqual([
      session.getSnapshot().tables.find((t) => t.name === "Notes")!.id,
      "tbl-lines",
      extra.id,
    ]);
  });

  it("reorders sheets from a before-sheet drop hint", () => {
    const session = new WorkbookSession(createSampleWorkbook());
    applyExplorerDropHint(session, { kind: "sheet", id: "sheet-capacity" }, { placement: "before-sheet", sheetId: "sheet-assumptions" });
    expect(session.getSnapshot().sheets.map((sheet) => sheet.id)).toEqual([
      "sheet-params",
      "sheet-capacity",
      "sheet-assumptions",
      "sheet-res",
    ]);
  });

  it("falls back to the active drag payload when drop data is empty", () => {
    const dataTransfer = { getData: () => "" } as DataTransfer;
    expect(readExplorerDragPayload(dataTransfer, { kind: "sheet", id: "sheet-a" })).toEqual({
      kind: "sheet",
      id: "sheet-a",
    });
  });

  it("targets the closest table slot above the pointer, not always append", () => {
    const rows = [
      { id: "tbl-a", top: 0, bottom: 20 },
      { id: "tbl-b", top: 20, bottom: 40 },
      { id: "tbl-c", top: 40, bottom: 60 },
    ];
    expect(closestTableDropHint("tbl-c", "sheet-1", rows, 15)).toEqual({
      placement: "before-table",
      sheetId: "sheet-1",
      tableId: "tbl-b",
    });
    expect(closestTableDropHint("tbl-a", "sheet-1", rows, 10)).toEqual({
      placement: "before-table",
      sheetId: "sheet-1",
      tableId: "tbl-b",
    });
    expect(closestTableDropHint("tbl-a", "sheet-1", rows, 55)).toEqual({
      placement: "append-tables",
      sheetId: "sheet-1",
    });
  });

  it("targets the closest sheet slot from pointer Y", () => {
    const rows = [
      { id: "sheet-a", top: 0, bottom: 24 },
      { id: "sheet-b", top: 24, bottom: 48 },
      { id: "sheet-c", top: 48, bottom: 72 },
    ];
    expect(closestSheetDropHint("sheet-c", rows, 30)).toEqual({
      placement: "before-sheet",
      sheetId: "sheet-b",
    });
    expect(closestSheetDropHint("sheet-a", rows, 65)).toEqual({
      placement: "after-sheet",
      sheetId: "sheet-c",
    });
  });

  it("marks a sheet drop before the sheet when hovering its tables", () => {

    expect(dropHintForTable({ kind: "sheet", id: "sheet-a" }, "sheet-b", "tbl-x")).toEqual({

      placement: "before-sheet",

      sheetId: "sheet-b",

    });

  });

});


