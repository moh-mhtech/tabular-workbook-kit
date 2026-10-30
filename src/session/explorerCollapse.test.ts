import { describe, expect, it } from "vitest";

import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";

import { WorkbookSession } from "./WorkbookSession.js";



async function open() {

  const session = new WorkbookSession(createSampleWorkbook());

  await session.recalculate();

  return session;

}



describe("Explorer sheet collapse", () => {

  it("stores collapse on the sheet snapshot for reload", async () => {

    const session = await open();

    session.toggleSheetExplorerCollapsed("sheet-params");

    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-params")!.explorerCollapsed).toBe(true);

    const reloaded = new WorkbookSession(session.getSnapshot());

    expect(reloaded.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-params")!.explorerCollapsed).toBe(true);

  });

  it("does not recalculate when toggling explorer collapse", async () => {
    const session = await open();
    let recalcRuns = 0;
    const recalculate = session.recalculate.bind(session);
    session.recalculate = async () => {
      recalcRuns += 1;
      return recalculate();
    };
    session.toggleSheetExplorerCollapsed("sheet-params");
    await Promise.resolve();
    expect(recalcRuns).toBe(0);
  });

});


