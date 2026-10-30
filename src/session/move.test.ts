import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "./WorkbookSession.js";

async function open() {
  const session = new WorkbookSession(createSampleWorkbook());
  await session.recalculate();
  return session;
}

describe("explorer reorder", () => {
  it("reorders sheets in the snapshot", async () => {
    const session = await open();
    session.moveSheet("sheet-capacity", 0);
    expect(session.getSnapshot().sheets.map((sheet) => sheet.id)).toEqual([
      "sheet-capacity",
      "sheet-params",
      "sheet-assumptions",
      "sheet-res",
    ]);
  });

  it("moves a sheet after the last sheet", async () => {
    const session = await open();
    session.moveSheet("sheet-assumptions", session.getSnapshot().sheets.length);
    expect(session.getSnapshot().sheets.map((sheet) => sheet.id)).toEqual([
      "sheet-params",
      "sheet-capacity",
      "sheet-res",
      "sheet-assumptions",
    ]);
  });

  it("reorders tables within a sheet", async () => {
    const session = await open();
    const notes = session.addTable("sheet-assumptions", { name: "Notes", yearColumns: false });
    session.moveTable("tbl-lines", "sheet-assumptions", 1);
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")!.tableIds).toEqual([
      notes.id,
      "tbl-lines",
    ]);
  });

  it("rewrites sheet-qualified refs when a table moves to another sheet", async () => {
    const session = await open();
    session.setFormula("Result", "Usage", "2025-01", "=Assumptions.Lines[2025-01][Total]");
    session.moveTable("tbl-lines", "sheet-capacity", 0);
    const result = session.getSnapshot().tables.find((table) => table.id === "tbl-result")!;
    expect(result.rows.find((row) => row.key === "Usage")!.cells["2025-01"].formula).toBe(
      "=Capacity.Lines[2025-01][Total]",
    );
    await session.recalculate();
    expect(session.getCell("Result", "Usage", "2025-01").computed).toBeTruthy();
  });

  it("rejects moving a locked table", async () => {
    const session = await open();
    expect(() => session.moveTable("tbl-params", "sheet-assumptions", 0)).toThrow(/cannot be moved/);
  });
});
