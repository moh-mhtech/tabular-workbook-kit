import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "./WorkbookSession.js";

async function open() {
  const session = new WorkbookSession(createSampleWorkbook());
  await session.recalculate();
  return session;
}

describe("table structure editing", () => {
  it("renames table, row, and column and rewrites formulas", async () => {
    const session = await open();
    session.renameTable("Params", "Drivers");
    await session.recalculate();
    expect(session.getTable("Drivers").rows.find((r) => r.key === "Start")!.cells.Value.formula).toContain(
      "Drivers[",
    );
    expect(session.getTable("Lines").rows.find((r) => r.key === "Red")!.cells["2025-01"].formula).toContain(
      "Drivers[Start]",
    );

    session.renameRow("Teams", "Karol", "CamLead");
    await session.recalculate();
    expect(session.getTable("Result").rows.find((r) => r.key === "Usage")!.cells["2025-01"].formula).toContain(
      "Teams[@][CamLead]",
    );

    session.renameColumn("Teams", "BaseNumber", "Salary");
    await session.recalculate();
    expect(session.getTable("Teams").rows.find((r) => r.key === "CamLead")!.cells["2025-01"].formula).toBe("=[Salary]");
    expect(session.getCell("Teams", "CamLead", "Salary").computed).toBe(45000);
  });

  it("rewrites Defined name Formula refs when a Key is renamed", async () => {
    const session = await open();
    const extra = session.addRow("Params");
    expect(extra.key).toBe("Param");
    const param2 = session.addRow("Params");
    expect(param2.key).toBe("Param2");
    session.setInput("Params", param2.id, "Value", 1);
    session.setFormula("Params", "AlternateShare", "Value", "=Mix");
    session.setFormula("Params", extra.id, "Value", "=Mix:TopShare");
    session.setFormula("Params", "LastShare", "Value", "=Param2");
    session.renameRow("Params", "Mix", "Levy");
    await session.recalculate();
    expect(session.getTable("Params").rows.find((row) => row.id === "row-alt-share")!.cells.Value.formula).toBe("=Levy");
    expect(session.getTable("Params").rows.find((row) => row.id === extra.id)!.cells.Value.formula).toBe("=Levy:TopShare");
    expect(session.getTable("Params").rows.find((row) => row.id === "row-last-share")!.cells.Value.formula).toBe(
      "=Param2",
    );
    expect(session.getCell("Params", "AlternateShare", "Value").computed).toBe(0.25);
    expect(session.getCell("Params", extra.key, "Value").computed).toBe(1.05);

    session.setFormula("Params", "TopShare", "Value", "=Param");
    session.renameRow("Params", extra.id, "Keep");
    await session.recalculate();
    expect(session.getTable("Params").rows.find((row) => row.id === "row-top-share")!.cells.Value.formula).toBe("=Keep");
    expect(session.getTable("Params").rows.find((row) => row.id === "row-last-share")!.cells.Value.formula).toBe(
      "=Param2",
    );
    expect(session.getCell("Params", "LastShare", "Value").computed).toBe(1);
  });

  it("adds and deletes rows and attribute columns", async () => {
    const session = await open();
    const row = session.addRow("Params", "AnnualUnits");
    await session.recalculate();
    expect(session.getTable("Params").rows.map((r) => r.key)).toContain(row.key);
    session.renameRow("Params", row.id, "Note");
    session.setInput("Params", "Note", "Value", "hello");
    await session.recalculate();
    expect(session.getCell("Params", "Note", "Value").computed).toBe("hello");

    const col = session.addColumn("Teams", "Role");
    await session.recalculate();
    expect(session.getTable("Teams").columns.some((c) => c.id === col.id)).toBe(true);
    session.renameColumn("Teams", col.id, "Comment");
    session.setInput("Teams", "Karol", "Comment", "senior");
    await session.recalculate();
    expect(session.getCell("Teams", "Karol", "Comment").computed).toBe("senior");

    session.deleteColumn("Teams", "Comment");
    await session.recalculate();
    expect(session.getTable("Teams").columns.some((c) => c.name === "Comment")).toBe(false);

    session.deleteRow("Params", "Note");
    await session.recalculate();
    expect(session.getTable("Params").rows.some((r) => r.key === "Note")).toBe(false);
  });

  it("stores per-table horizontal scroll explicitly and omits the sheet default", async () => {
    const session = await open();
    const sheet = session.getSnapshot().sheets[1];
    expect(sheet.horizontalScroll).toBeUndefined();
    session.setSheetHorizontalScroll(sheet.id, "table");
    expect(session.getSnapshot().sheets[1].horizontalScroll).toBe("table");
    session.setSheetHorizontalScroll(sheet.id, "sheet");
    expect(session.getSnapshot().sheets[1].horizontalScroll).toBeUndefined();
  });

  it("adds a table to a sheet", async () => {
    const session = await open();
    const sheetId = session.getSnapshot().sheets[0].id;
    const table = session.addTable(sheetId, { name: "Notes" });
    await session.recalculate();
    expect(session.getTable("Notes").rows).toHaveLength(1);
    expect(table.attributeColumns.map((column) => column.name)).toEqual(["A"]);
    expect(table.rows.map((row) => row.key)).toEqual(["1"]);
    expect(session.addColumn(table.id).name).toBe("B");
    expect(session.addRow(table.id).key).toBe("2");
    session.deleteTable(table.id);
    await session.recalculate();
    expect(() => session.getTable("Notes")).toThrow();
  });
});
