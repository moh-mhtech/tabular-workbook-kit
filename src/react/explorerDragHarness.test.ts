import { describe, expect, it } from "vitest";
import { EXPLORER_SHEET_DRAG, writeExplorerDragData } from "./explorerDrag.js";
import { createExplorerDataTransfer } from "./explorerDragHarness.js";

describe("explorer drag harness", () => {
  it("keeps one DataTransfer in sync from dragStart through drop", () => {
    const transfer = createExplorerDataTransfer();
    const payload = { kind: "sheet" as const, id: "sheet-a" };
    writeExplorerDragData(transfer.asPayload().dataTransfer, payload);
    expect(transfer.asPayload().dataTransfer.getData(EXPLORER_SHEET_DRAG)).toBe("sheet-a");
    expect(transfer.asEmptyDrop().dataTransfer.getData(EXPLORER_SHEET_DRAG)).toBe("");
  });
});
