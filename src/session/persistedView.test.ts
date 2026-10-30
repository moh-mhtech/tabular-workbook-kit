import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { MemoryPersistence } from "../persist/index.js";
import { WorkbookSession } from "./WorkbookSession.js";

describe("persisted view", () => {
  it("stores selection and active sheet on the snapshot", async () => {
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    session.setViewActiveSheet("sheet-assumptions");
    session.setSelection({ kind: "cell", tableId: "tbl-lines", rowId: "row-red", columnId: "2025-01" });

    expect(session.getSnapshot().view).toEqual({
      activeSheetId: "sheet-assumptions",
      selection: { kind: "cell", tableId: "tbl-lines", rowId: "row-red", columnId: "2025-01" },
    });

    const reloaded = new WorkbookSession(session.getSnapshot());
    expect(reloaded.getViewActiveSheetId()).toBe("sheet-assumptions");
    expect(reloaded.selection).toEqual({
      kind: "cell",
      tableId: "tbl-lines",
      rowId: "row-red",
      columnId: "2025-01",
    });
  });

  it("round-trips view through persistence", async () => {
    const persist = new MemoryPersistence();
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    session.setSelection({ kind: "cell", tableId: "tbl-params", rowId: "row-vat", columnId: "Value" });
    await persist.save(session.getSnapshot());
    const restored = new WorkbookSession((await persist.load())!);
    expect(restored.selection?.kind).toBe("cell");
    if (restored.selection?.kind === "cell") {
      expect(restored.selection.rowId).toBe("row-vat");
    }
  });
});
