import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "./WorkbookSession.js";

async function open() {
  const session = new WorkbookSession(createSampleWorkbook());
  await session.recalculate();
  return session;
}

describe("Table hidden", () => {
  it("stores hidden on the table snapshot for reload", async () => {
    const session = await open();
    session.toggleTableHidden("tbl-lines");
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-lines")!.hidden).toBe(true);
    const reloaded = new WorkbookSession(session.getSnapshot());
    expect(reloaded.getSnapshot().tables.find((table) => table.id === "tbl-lines")!.hidden).toBe(true);
  });

  it("does not recalculate when toggling hidden and notifies view-only", async () => {
    const session = await open();
    let recalcRuns = 0;
    const recalculate = session.recalculate.bind(session);
    session.recalculate = async () => {
      recalcRuns += 1;
      return recalculate();
    };
    let viewOnly = false;
    session.subscribe((change) => {
      viewOnly = change?.viewOnly === true;
    });
    session.toggleTableHidden("tbl-lines");
    await Promise.resolve();
    expect(recalcRuns).toBe(0);
    expect(viewOnly).toBe(true);
  });
});
