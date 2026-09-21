import { describe, expect, it } from "vitest";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { WorkbookSession } from "./WorkbookSession.js";

async function open() {
  const session = new WorkbookSession(createPlaygroundWorkbook());
  await session.recalculate();
  return session;
}

describe("table structure editing", () => {
  it("renames table, row, and column and rewrites formulas", async () => {
    const session = await open();
    session.renameTable("Params", "Assumptions");
    await session.recalculate();
    expect(session.getTable("Assumptions").rows.find((r) => r.key === "Start")!.cells.Value.formula).toContain(
      "Assumptions[",
    );
    expect(session.getTable("Salg").rows.find((r) => r.key === "CNC")!.cells["2025-01"].formula).toContain(
      "Assumptions[Start]",
    );

    session.renameRow("Staff", "Karol", "CamLead");
    await session.recalculate();
    expect(session.getTable("Resultat").rows.find((r) => r.key === "Løn")!.cells["2025-01"].formula).toContain(
      "Staff[@][CamLead]",
    );

    session.renameColumn("Staff", "BaseSalary", "Salary");
    await session.recalculate();
    expect(session.getTable("Staff").rows.find((r) => r.key === "CamLead")!.cells["2025-01"].formula).toBe("=[Salary]");
    expect(session.getCell("Staff", "CamLead", "Salary").computed).toBe(45000);
  });

  it("adds and deletes rows and attribute columns", async () => {
    const session = await open();
    const row = session.addRow("Params", "Årssalg");
    await session.recalculate();
    expect(session.getTable("Params").rows.map((r) => r.key)).toContain(row.key);
    session.renameRow("Params", row.id, "Note");
    session.setInput("Params", "Note", "Value", "hello");
    await session.recalculate();
    expect(session.getCell("Params", "Note", "Value").computed).toBe("hello");

    const col = session.addColumn("Staff", "Role");
    await session.recalculate();
    expect(session.getTable("Staff").columns.some((c) => c.id === col.id)).toBe(true);
    session.renameColumn("Staff", col.id, "Comment");
    session.setInput("Staff", "Karol", "Comment", "senior");
    await session.recalculate();
    expect(session.getCell("Staff", "Karol", "Comment").computed).toBe("senior");

    session.deleteColumn("Staff", "Comment");
    await session.recalculate();
    expect(session.getTable("Staff").columns.some((c) => c.name === "Comment")).toBe(false);

    session.deleteRow("Params", "Note");
    await session.recalculate();
    expect(session.getTable("Params").rows.some((r) => r.key === "Note")).toBe(false);
  });

  it("stores sheet horizontal scroll only when it is not the per-table default", async () => {
    const session = await open();
    const sheet = session.getSnapshot().sheets[1];
    expect(sheet.horizontalScroll).toBeUndefined();
    session.setSheetHorizontalScroll(sheet.id, "sheet");
    expect(session.getSnapshot().sheets[1].horizontalScroll).toBe("sheet");
    session.setSheetHorizontalScroll(sheet.id, "table");
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
