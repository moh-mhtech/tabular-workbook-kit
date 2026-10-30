import { describe, expect, it, vi } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "./WorkbookSession.js";

describe("session notifications", () => {
  it("formula edit cursor updates do not count as data changes", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    const recalcSpy = vi.spyOn(session, "recalculate");
    let dataNotifications = 0;
    session.subscribe((change) => {
      if (!change?.viewOnly && !change?.formulaEditOnly) dataNotifications++;
    });
    session.beginFormulaEdit("tbl-params", "row-annual", "Value", "=1", { pointing: true });
    for (let i = 0; i < 20; i++) {
      session.syncFormulaEditCursor(`=1+${i}`, 3, 3);
    }
    expect(recalcSpy).not.toHaveBeenCalled();
    expect(dataNotifications).toBe(0);
    recalcSpy.mockRestore();
  });
});
