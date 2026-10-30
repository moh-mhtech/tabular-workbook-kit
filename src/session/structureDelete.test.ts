import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { TOTAL_ROW_ID } from "../model/tableTotals.js";
import { WorkbookSession } from "./WorkbookSession.js";

async function open() {
  const session = new WorkbookSession(createSampleWorkbook());
  await session.recalculate();
  return session;
}

describe("deleteRows", () => {
  it("removes multiple rows in one undo step", async () => {
    const session = await open();
    const params = () => session.getSnapshot().tables.find((t) => t.name === "Params")!;
    const ids = params().rows.filter((r) => r.key === "Mix" || r.key === "TopShare").map((r) => r.id);
    session.deleteRows("Params", ids);
    await session.recalculate();
    expect(params().rows.some((r) => r.key === "Mix" || r.key === "TopShare")).toBe(false);
    session.undo();
    expect(params().rows.some((r) => r.key === "Mix")).toBe(true);
    expect(params().rows.some((r) => r.key === "TopShare")).toBe(true);
  });

  it("requires at least one row to remain", async () => {
    const session = await open();
    const table = session.getSnapshot().tables.find((t) => t.name === "Params")!;
    const allIds = table.rows.map((r) => r.id);
    expect(() => session.deleteRows("Params", allIds)).toThrow(/at least one row/);
  });

  it("rejects the total row id", async () => {
    const session = await open();
    expect(() => session.deleteRows("Params", [TOTAL_ROW_ID])).toThrow(/total row/i);
  });
});

describe("deleteColumns", () => {
  it("removes multiple attribute columns in one undo step", async () => {
    const session = await open();
    const teams = () => session.getSnapshot().tables.find((t) => t.name === "Teams")!;
    const role = teams().attributeColumns.find((c) => c.name === "Role")!.id;
    const base = teams().attributeColumns.find((c) => c.name === "BaseNumber")!.id;
    session.deleteColumns("Teams", [role, base]);
    await session.recalculate();
    expect(teams().attributeColumns.some((c) => c.name === "Role" || c.name === "BaseNumber")).toBe(false);
    session.undo();
    expect(teams().attributeColumns.some((c) => c.name === "Role")).toBe(true);
  });

  it("blocks promoted Value on key-value tables", async () => {
    const session = await open();
    expect(() => session.deleteColumns("Params", ["Value"])).toThrow(/cannot be deleted/);
  });
});
