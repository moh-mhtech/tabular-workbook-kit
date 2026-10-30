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

  it("inserts before a lower table without landing one slot too low", async () => {
    const session = await open();
    session.addTable("sheet-assumptions", { name: "Notes", yearColumns: false });
    session.addTable("sheet-assumptions", { name: "Extra", yearColumns: false });
    const before = session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")!;
    const extraIndex = before.tableIds.indexOf(before.tableIds.at(-1)!);
    session.moveTable("tbl-lines", "sheet-assumptions", extraIndex);
    const after = session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")!;
    expect(after.tableIds).toEqual([before.tableIds[1], "tbl-lines", before.tableIds[2]]);
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

  it("reorders a locked table in the explorer", async () => {
    const session = await open();
    session.moveTable("tbl-params", "sheet-assumptions", 0);
    expect(session.getSnapshot().sheets.find((item) => item.id === "sheet-assumptions")!.tableIds[0]).toBe("tbl-params");
  });
});
