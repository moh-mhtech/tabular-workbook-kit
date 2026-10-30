import { describe, expect, it, vi } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { waitForDataNotification } from "../perf/perfMeasure.js";
import { WorkbookSession } from "./WorkbookSession.js";

describe("session emit contracts (C2 C5 T1 T2)", () => {
  it("view-only chrome does not emit data notifications", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    let dataNotifications = 0;
    let viewNotifications = 0;
    session.subscribe((change) => {
      if (change?.viewOnly) viewNotifications++;
      else if (!change?.formulaEditOnly) dataNotifications++;
    });
    session.setExplorerPinned(!session.isExplorerPinned());
    session.setPropertiesPinned(!session.isPropertiesPinned());
    expect(dataNotifications).toBe(0);
    expect(viewNotifications).toBeGreaterThan(0);
  });

  it("one writeCell emit produces one recalculate span and one data notification", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    let dataNotifications = 0;
    session.subscribe((change) => {
      if (!change?.viewOnly && !change?.formulaEditOnly) dataNotifications++;
    });
    session.drainPerfSpans();
    const wait = waitForDataNotification(session);
    session.writeCell("Params", "AnnualUnits", "Value", "8000000");
    await wait;

    const recalcSpans = session.drainPerfSpans().filter((s) => s.name === "recalculate");
    expect(recalcSpans.length, "one recalculate span per writeCell emit").toBe(1);
    expect(dataNotifications, "one data notification after recalc").toBe(1);
  });

  it("formula edit cursor sync does not recalculate or notify data (C1)", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    const recalcSpy = vi.spyOn(session, "recalculate");
    let dataNotifications = 0;
    let formulaNotifications = 0;
    session.subscribe((change) => {
      if (change?.formulaEditOnly) formulaNotifications++;
      else if (!change?.viewOnly) dataNotifications++;
    });
    session.beginFormulaEdit("tbl-params", "row-annual", "Value", "=1", { pointing: true });
    for (let i = 0; i < 20; i++) {
      session.syncFormulaEditCursor(`=1+${i}`, 3, 3);
    }
    expect(recalcSpy).not.toHaveBeenCalled();
    expect(dataNotifications).toBe(0);
    expect(formulaNotifications).toBeGreaterThan(0);
    recalcSpy.mockRestore();
  });

  it("formula edit cursor sync does not call getSnapshot (T5 C1)", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    const getSnapshotSpy = vi.spyOn(session, "getSnapshot");
    session.beginFormulaEdit("tbl-params", "row-annual", "Value", "=1", { pointing: true });
    for (let i = 0; i < 20; i++) {
      session.syncFormulaEditCursor(`=1+${i}`, 3, 3);
    }
    expect(getSnapshotSpy.mock.calls.length).toBe(0);
    getSnapshotSpy.mockRestore();
  });
});
