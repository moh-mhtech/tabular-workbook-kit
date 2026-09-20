import { describe, expect, it } from "vitest";
import { MemoryPersistence } from "../persist/index.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { handleGridClearCommand } from "./gridCommands.js";

describe("handleGridClearCommand", () => {
  it("persists deletion of a loose cell made with Delete or Backspace", async () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), { evaluate: () => ({}) });
    const sheetId = "sheet-params";
    const persistence = new MemoryPersistence();
    session.subscribe(() => void persistence.save(session.getSnapshot()));
    session.writeGridCell(sheetId, 1, 2, "900");

    const handled = handleGridClearCommand(session, {
      id: "sheet.command.clear-selection-content",
      params: {
        subUnitId: sheetId,
        ranges: [{ startRow: 1, endRow: 1, startColumn: 2, endColumn: 2 }],
      },
    });

    expect(handled).toBe(true);
    const reloaded = await persistence.load();
    expect(reloaded?.sheets.find((sheet) => sheet.id === sheetId)?.looseCells).toBeUndefined();
  });

  it("ignores commands other than clearing cell contents", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), { evaluate: () => ({}) });

    expect(handleGridClearCommand(session, { id: "sheet.command.copy", params: {} })).toBe(false);
  });
});
