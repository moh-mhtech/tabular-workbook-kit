import { describe, expect, it } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { promotedNames } from "../model/names.js";
import { WorkbookSession } from "./WorkbookSession.js";

async function open() {
  const session = new WorkbookSession(createPlaygroundWorkbook());
  await session.recalculate();
  return session;
}

describe("parameters sheet and table", () => {
  it("seeds a locked Parametre sheet whose Value keys are promoted names", async () => {
    const session = await open();
    const snapshot = session.getSnapshot();
    const sheet = snapshot.sheets.find((s) => s.locked);
    const table = snapshot.tables.find((t) => t.promoteRowKeys);
    expect(sheet?.name).toBe("Parametre");
    expect(sheet?.tableIds).toEqual(["tbl-params"]);
    expect(snapshot.sheets.find((g) => g.name === "Forudsætninger")?.tableIds).toEqual(["tbl-salg"]);
    expect(table?.name).toBe("Params");
    expect(promotedNames(snapshot).map((p) => p.name)).toEqual(
      expect.arrayContaining(["Årssalg", "Vækst", "Vat", "Start"]),
    );
    expect(session.getCell("Params", "Vat", "Value").computed).toBe(0.25);
  });

  it("refuses to delete the parameters table or sheet", async () => {
    const session = await open();
    const sheet = session.getSnapshot().sheets.find((s) => s.locked)!;
    expect(() => session.deleteTable("Params")).toThrow(/cannot be deleted/);
    expect(() => session.deleteSheet(sheet.id)).toThrow(/cannot be deleted/);
  });

  it("still allows extra tables on Parametre to be deleted", async () => {
    const session = await open();
    const groupId = session.getSnapshot().sheets.find((s) => s.locked)!.id;
    const notes = session.addTable(groupId, { name: "Notes" });
    await session.recalculate();
    session.deleteTable(notes.id);
    await session.recalculate();
    expect(() => session.getTable("Notes")).toThrow();
  });

  it("locks year columns and extra columns when promoteRowKeys is on", async () => {
    const session = await open();
    expect(() => session.addYearColumn("Params")).toThrow(/year column/);
    expect(() => session.deleteColumn("Params", "Value")).toThrow(/cannot be deleted/);
    expect(() => session.renameColumn("Params", "Value", "Amount")).toThrow(/cannot be renamed/);
    expect(() => session.addColumn("Params")).toThrow(/extra columns/);
  });

  it("does not change stored values or formula results when a compact format is applied", async () => {
    const session = await open();
    const start = session.getCell("Params", "Start", "Value").computed;
    session.setColumnFormat("Params", "Value", "DKK G3A");
    await session.recalculate();
    expect(session.getCell("Params", "Årssalg", "Value").computed).toBe(8_000_000);
    expect(session.getCell("Params", "Start", "Value").computed).toBeCloseTo(Number(start), 6);
  });

  it("rejects parameter keys that collide with functions or tables", async () => {
    const session = await open();
    expect(() => session.renameRow("Params", "Vat", "SUM")).toThrow(/reserved/);
    expect(() => session.renameRow("Params", "Vat", "Salg")).toThrow(/collides with table/);
    expect(() => session.renameTable("Salg", "Vat")).toThrow(/promoted key/);
    const added = session.addRow("Params");
    expect(added.key).toBe("Param");
    session.renameRow("Params", added.id, "Moms");
    expect(promotedNames(session.getSnapshot()).map((p) => p.name)).toContain("Moms");
  });

  it("accepts a Defined name with letters outside æøå", async () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), new HyperFormulaEngine());
    await session.recalculate();
    session.renameRow("Params", "Vat", "Café");
    session.setFormula("Params", "AndelCNC", "Value", "=Café");
    await session.recalculate();
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.key).toBe("Café");
    expect(session.getCell("Params", "AndelCNC", "Value").computed).toBe(0.25);
  });
});
