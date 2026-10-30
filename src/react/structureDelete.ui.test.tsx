/** @vitest-environment jsdom */
import { useLayoutEffect } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { layoutWorkbook } from "../model/layout.js";
import { cellsInProjectedRange, projectTable } from "../grid/sheetProjection.js";
import { HEADER_ROW_ID, KEY_COLUMN_ID } from "../model/types.js";
import {
  installGridDom,
  openGridContextMenu,
  renderWorkbookCanvas,
  selectProjectedCell,
} from "./canvasTest.js";
import { useWorkbook } from "./WorkbookProvider.js";

function ActivateSheet({ sheetId }: { sheetId: string }) {
  const { setActiveSheetId } = useWorkbook();
  useLayoutEffect(() => {
    setActiveSheetId(sheetId);
  }, [setActiveSheetId, sheetId]);
  return null;
}

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("structure delete context menu", () => {
  it("deletes a row from a Key cell context menu", async () => {
    const { session } = await renderWorkbookCanvas();
    await selectProjectedCell(session, "tbl-params", 0, 3);
    await openGridContextMenu(session, "tbl-params", 0, 3);
    expect(await screen.findByRole("menuitem", { name: "Delete row" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete row" }));
    });
    expect(session.getSnapshot().tables.find((t) => t.id === "tbl-params")!.rows.some((r) => r.id === "row-vat")).toBe(
      false,
    );
  });

  it("deletes multiple rows when Key cells are selected", async () => {
    const { session } = await renderWorkbookCanvas();
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vat",
        columnId: KEY_COLUMN_ID,
        range: [
          { tableId: "tbl-params", rowId: "row-vat", columnId: KEY_COLUMN_ID },
          { tableId: "tbl-params", rowId: "row-top-share", columnId: KEY_COLUMN_ID },
        ],
      });
    });
    await waitFor(() => {
      expect(session.selection?.kind).toBe("cell");
      expect(session.selection && "range" in session.selection && session.selection.range?.length).toBe(2);
    });
    await openGridContextMenu(session, "tbl-params", 0, 4);
    expect(await screen.findByRole("menuitem", { name: "Delete rows" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete rows" }));
    });
    const rows = session.getSnapshot().tables.find((t) => t.id === "tbl-params")!.rows;
    expect(rows.some((r) => r.id === "row-vat" || r.id === "row-top-share")).toBe(false);
  });

  it("shows no row delete for a data-cell range", async () => {
    const { session } = await renderWorkbookCanvas();
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vat",
        columnId: "Value",
        range: [
          { tableId: "tbl-params", rowId: "row-vat", columnId: "Value" },
          { tableId: "tbl-params", rowId: "row-top-share", columnId: "Value" },
        ],
      });
    });
    await openGridContextMenu(session, "tbl-params", 1, 3);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^Delete row/ })).toBeNull();
  });

  it("right-clicking the Table corner opens the menu without selecting the whole table", async () => {
    const { session } = await renderWorkbookCanvas({ extra: <ActivateSheet sheetId="sheet-capacity" /> });
    await waitFor(() => {
      expect(document.querySelector('[data-table-id="tbl-teams"]')).toBeTruthy();
    });
    const before = session.selection;
    await openGridContextMenu(session, "tbl-teams", 0, 0);
    expect(session.selection).toEqual(before);
    expect(screen.queryByRole("menuitem", { name: /^Delete row/ })).toBeNull();
    expect(await screen.findByRole("menuitem", { name: "Delete columns" })).toBeTruthy();
  });

  it("deletes attribute columns from the Table corner menu on Teams", async () => {
    const { session } = await renderWorkbookCanvas({ extra: <ActivateSheet sheetId="sheet-capacity" /> });
    await waitFor(() => {
      expect(document.querySelector('[data-table-id="tbl-teams"]')).toBeTruthy();
    });
    await openGridContextMenu(session, "tbl-teams", 0, 0);
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete columns" }));
    });
    const cols = session.getSnapshot().tables.find((t) => t.id === "tbl-teams")!.attributeColumns;
    expect(cols.some((c) => c.name === "Role" || c.name === "BaseNumber")).toBe(false);
  });

  it("deletes one row from a corner drag through [B][1] without removing other rows", async () => {
    const { session } = await renderWorkbookCanvas({ extra: <ActivateSheet sheetId="sheet-capacity" /> });
    await waitFor(() => {
      expect(document.querySelector('[data-table-id="tbl-teams"]')).toBeTruthy();
    });
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-teams")!;
    const refs = cellsInProjectedRange(projection, layout, { x: 0, y: 0, width: 2, height: 2 });
    const primary = refs.find((ref) => ref.columnId !== KEY_COLUMN_ID && ref.rowId !== HEADER_ROW_ID)!;
    await act(async () => {
      session.setSelection({ kind: "cell", ...primary, range: refs });
    });
    const table = () => session.getSnapshot().tables.find((t) => t.id === "tbl-teams")!;
    expect(table().rows.map((r) => r.key)).toEqual(["Karol", "RequiredNum"]);
    await openGridContextMenu(session, "tbl-teams", 0, 0);
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete row" }));
    });
    expect(table().rows.map((r) => r.key)).toEqual(["RequiredNum"]);
  });

  it("deletes attribute columns from a Header context menu", async () => {
    const { session } = await renderWorkbookCanvas({ extra: <ActivateSheet sheetId="sheet-capacity" /> });
    await waitFor(() => {
      expect(document.querySelector('[data-table-id="tbl-teams"]')).toBeTruthy();
    });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-teams",
        rowId: HEADER_ROW_ID,
        columnId: "Role",
        range: [
          { tableId: "tbl-teams", rowId: HEADER_ROW_ID, columnId: "Role" },
          { tableId: "tbl-teams", rowId: HEADER_ROW_ID, columnId: "BaseNumber" },
        ],
      });
    });
    await openGridContextMenu(session, "tbl-teams", 1, 0);
    expect(await screen.findByRole("menuitem", { name: "Delete columns" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete columns" }));
    });
    const cols = session.getSnapshot().tables.find((t) => t.id === "tbl-teams")!.attributeColumns;
    expect(cols.some((c) => c.name === "Role" || c.name === "BaseNumber")).toBe(false);
  });
});
