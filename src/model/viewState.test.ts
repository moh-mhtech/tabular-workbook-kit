import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { resolvePersistedView, sanitizeSelection } from "./viewState.js";

describe("persisted view", () => {
  it("restores a cell selection when ids still exist", () => {
    const snapshot = createSampleWorkbook();
    const view = resolvePersistedView(snapshot, {
      activeSheetId: "sheet-assumptions",
      selection: { kind: "cell", tableId: "tbl-params", rowId: "row-vat", columnId: "Value" },
    });
    expect(view.activeSheetId).toBe("sheet-assumptions");
    expect(view.selection).toEqual({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-vat",
      columnId: "Value",
    });
  });

  it("drops a selection that points at a missing table", () => {
    const snapshot = createSampleWorkbook();
    expect(
      sanitizeSelection(snapshot, { kind: "cell", tableId: "missing", rowId: "row-vat", columnId: "Value" }),
    ).toBeNull();
  });

  it("falls back to the first sheet when the saved active sheet is gone", () => {
    const snapshot = createSampleWorkbook();
    const view = resolvePersistedView(snapshot, { activeSheetId: "sheet-gone", selection: null });
    expect(view.activeSheetId).toBe(snapshot.sheets[0]!.id);
  });
});
