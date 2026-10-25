/** @vitest-environment jsdom */
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCustomGridClear, applyCustomGridPaste } from "./customGridInteractions.js";
import { layoutWorkbook } from "../model/layout.js";
import { HEADER_ROW_ID, KEY_COLUMN_ID, selectedCellRefs } from "../model/types.js";
import { projectTable } from "../grid/sheetProjection.js";
import { evaluatedCells, gridCell } from "./CustomSheetCanvas.js";
import {
  clickProjectedCell,
  installGridDom,
  renderWorkbookCanvas,
  selectProjectedCell,
} from "./canvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Table corner", () => {
  it("selects Key cells, Header cells, and data when the Table corner is clicked", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await clickProjectedCell(session, "tbl-params", 0, 0);
    expect(session.selection?.kind).toBe("cell");
    expect(selectedCellRefs(session.selection)).toEqual([
      { tableId: "tbl-params", rowId: HEADER_ROW_ID, columnId: "Value" },
      { tableId: "tbl-params", rowId: "row-annual", columnId: KEY_COLUMN_ID },
      { tableId: "tbl-params", rowId: "row-annual", columnId: "Value" },
      { tableId: "tbl-params", rowId: "row-growth", columnId: KEY_COLUMN_ID },
      { tableId: "tbl-params", rowId: "row-growth", columnId: "Value" },
      { tableId: "tbl-params", rowId: "row-vat", columnId: KEY_COLUMN_ID },
      { tableId: "tbl-params", rowId: "row-vat", columnId: "Value" },
      { tableId: "tbl-params", rowId: "row-top-share", columnId: KEY_COLUMN_ID },
      { tableId: "tbl-params", rowId: "row-top-share", columnId: "Value" },
      { tableId: "tbl-params", rowId: "row-alt-share", columnId: KEY_COLUMN_ID },
      { tableId: "tbl-params", rowId: "row-alt-share", columnId: "Value" },
      { tableId: "tbl-params", rowId: "row-last-share", columnId: KEY_COLUMN_ID },
      { tableId: "tbl-params", rowId: "row-last-share", columnId: "Value" },
      { tableId: "tbl-params", rowId: "row-start", columnId: KEY_COLUMN_ID },
      { tableId: "tbl-params", rowId: "row-start", columnId: "Value" },
    ]);
  });

  it("uses the button pointer cursor on the Table corner", async () => {
    const { session } = await renderWorkbookCanvas();
    const snapshot = session.getSnapshot();
    const layout = layoutWorkbook(snapshot);
    const projection = projectTable(layout, "tbl-params")!;
    expect(gridCell(projection, layout, evaluatedCells(session, snapshot), [0, 0]).cursor).toBe("pointer");
  });

  it("shows no object in the Properties panel for a 1×1 Table corner", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await selectProjectedCell(session, "tbl-params", 0, 0);
    expect(session.selection).toEqual({ kind: "corner", tableId: "tbl-params" });
    expect(screen.queryByLabelText("Value")).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete table" })).toBeNull();
  });

  it("resets a Key cell to the Table default on Clear and skips an illegal paste", async () => {
    const { session } = await renderWorkbookCanvas();
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    await act(async () => {
      expect(
        applyCustomGridClear(session, projection, layout, { x: 0, y: 3, width: 1, height: 1 }),
      ).toBe(1);
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.key).toBe("Param3");

    await act(async () => {
      session.renameRow("tbl-params", "row-vat", "Mix");
      applyCustomGridPaste(session, projection, [0, 3], [["SUM"]]);
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.key).toBe("Mix");
  });
});
