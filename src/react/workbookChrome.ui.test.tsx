/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { projectTable } from "../grid/sheetProjection.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { formulaBar, installGridDom, renderWorkbookCanvas, selectProjectedCell, trackFocus, typeEqualsOnProjectedCell } from "./canvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("workbook chrome", () => {
  it("groups Scenario selection with a Scenario options menu", async () => {
    await renderWorkbookCanvas({ chrome: true });
    expect(screen.getByRole("group", { name: "Scenario" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Scenario" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scenario options" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Add" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scenario options" }));
    });
    expect(await screen.findByRole("menuitem", { name: "Add" })).toBeTruthy();
    expect((screen.getByRole("menuitem", { name: "Duplicate" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("menuitem", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the Workbook name with a folder icon in the explorer", async () => {
    await renderWorkbookCanvas({ chrome: true, explorerWorkbookFolderIcon: true });
    const project = screen.getByRole("button", { name: "Sample 2025" });
    expect(project.querySelector(".wk-explorer-folder-icon")).toBeTruthy();
  });

  it("styles New sheet as a sheet row action", async () => {
    await renderWorkbookCanvas({ chrome: true });
    const newSheet = screen.getByRole("button", { name: "New sheet" });
    expect(newSheet.classList.contains("wk-explorer-new-sheet")).toBe(true);
    expect(newSheet.classList.contains("wk-explorer-new")).toBe(false);
    expect(newSheet.closest(".wk-explorer-sheet-row")).toBeTruthy();
    expect(newSheet.closest(".wk-explorer-new-sheet-group")?.querySelector(".wk-explorer-drop-marker")).toBeTruthy();
    const referenceSheet = screen.getByRole("button", { name: "Assumptions" });
    const newRow = newSheet.closest(".wk-explorer-sheet-row")!;
    const refRow = referenceSheet.closest(".wk-explorer-sheet-row")!;
    expect(newRow.querySelector(".wk-explorer-sheet-row-spacer")).toBeTruthy();
    expect(newRow.getBoundingClientRect().height).toBe(refRow.getBoundingClientRect().height);

    const explorer = screen.getByRole("navigation", { name: "Sheets" });
    const sheetGroups = [...explorer.querySelectorAll<HTMLElement>("[data-explorer-sheet-id]")];
    if (sheetGroups.length >= 2) {
      const rowBottom = (group: HTMLElement) =>
        group.querySelector(".wk-explorer-sheet-row")!.getBoundingClientRect().bottom;
      const rowTop = (group: HTMLElement) =>
        group.querySelector(".wk-explorer-sheet-row")!.getBoundingClientRect().top;
      const referenceGap = rowTop(sheetGroups[1]!) - rowBottom(sheetGroups[0]!);
      const newSheetGroup = newSheet.closest(".wk-explorer-new-sheet-group")!;
      const gapBeforeNewSheet = rowTop(newSheetGroup) - rowBottom(sheetGroups.at(-1)!);
      expect(gapBeforeNewSheet).toBe(referenceGap);
    }
  });

  it("lists New table after sheet tables in the same explorer list", async () => {
    await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    });
    const explorer = screen.getByRole("navigation", { name: "Sheets" });
    const assumptionsGroup = explorer.querySelector('[data-explorer-sheet-id="sheet-assumptions"]') as HTMLElement;
    const list = assumptionsGroup.querySelector(".wk-explorer-tables")!;
    const linesLi = list.querySelector('[data-explorer-table-id="tbl-lines"]');
    const newTable = list.querySelector(".wk-explorer-new") as HTMLElement;
    const lines = list.querySelector('[data-explorer-table-id="tbl-lines"] .wk-explorer-table') as HTMLElement;
    expect(newTable).toBeTruthy();
    expect(newTable.classList.contains("wk-explorer-table")).toBe(true);
    expect(newTable.querySelector(".wk-explorer-table-label")?.textContent).toBe("New table");
    expect(linesLi?.nextElementSibling?.querySelector(".wk-explorer-new")).toBe(newTable);
    expect(newTable.querySelector(".wk-explorer-table-gutter")).toBeTruthy();
    expect(getComputedStyle(newTable).paddingTop).toBe(getComputedStyle(lines).paddingTop);
    expect(getComputedStyle(newTable).paddingBottom).toBe(getComputedStyle(lines).paddingBottom);
    expect(getComputedStyle(newTable).paddingRight).toBe(getComputedStyle(lines).paddingRight);
    expect(newTable.closest("li")?.querySelector(".wk-explorer-drop-marker")).toBeTruthy();

    const tableRows = [...list.querySelectorAll<HTMLElement>("[data-explorer-table-id]")];
    if (tableRows.length >= 2) {
      const gapBetweenTables = (row: HTMLElement, next: HTMLElement) => {
        const a = row.querySelector(".wk-explorer-table")!.getBoundingClientRect();
        const b = next.querySelector(".wk-explorer-table")!.getBoundingClientRect();
        return b.top - a.bottom;
      };
      const referenceGap = gapBetweenTables(tableRows.at(-2)!, tableRows.at(-1)!);
      const lastTableRow = tableRows.at(-1)!;
      const gapBeforeNewTable =
        newTable.getBoundingClientRect().top - lastTableRow.querySelector(".wk-explorer-table")!.getBoundingClientRect().bottom;
      expect(gapBeforeNewTable).toBe(referenceGap);
    }
  });

  it("aligns New sheet glyph with label", async () => {
    await renderWorkbookCanvas({ chrome: true });
    const newSheet = screen.getByRole("button", { name: "New sheet" });
    const glyph = newSheet.querySelector(".wk-explorer-new-glyph") as HTMLElement;
    const label = newSheet.querySelector(".wk-explorer-new-sheet-label") as HTMLElement;
    expect(label).toBeTruthy();
    expect(newSheet.querySelector(".wk-explorer-new-sheet-label")?.textContent).toBe("New sheet");
    const glyphMid = glyph.getBoundingClientRect().top + glyph.getBoundingClientRect().height / 2;
    const labelMid = label.getBoundingClientRect().top + label.getBoundingClientRect().height / 2;
    expect(Math.abs(glyphMid - labelMid)).toBeLessThan(2);
  });

  it("toggles Formula-edit placement between Popup and Inline", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    expect(screen.getByRole("group", { name: "Formula-edit placement" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Inline" }));
    });
    await typeEqualsOnProjectedCell(session, "tbl-params", 1, 3);
    expect(document.querySelector(".wk-overlay-editor-host")!.classList.contains("is-inline")).toBe(true);
  });

  it("selects a sheet from the explorer and paints that sheet's tables", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    });
    expect(session.selection).toEqual({
      kind: "cell",
      tableId: "tbl-lines",
      rowId: "row-red",
      columnId: "2025-01",
    });
    expect(document.querySelector('[data-table-id="tbl-lines"]')).toBeTruthy();
    expect(document.querySelector('[data-table-id="tbl-params"]')).toBeFalsy();
  });

  it("reveals a table on another sheet from the explorer", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lines" }));
    });
    expect(session.selection).toEqual({
      kind: "cell",
      tableId: "tbl-lines",
      rowId: "row-red",
      columnId: "2025-01",
    });
    expect(document.querySelector('[data-table-id="tbl-lines"] .wk-table-viewport-title')?.textContent).toBe("Lines");
  });

  it("keeps the locked Parameters sheet selectable and blocks deleting Params", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    const alerts: string[] = [];
    vi.spyOn(window, "alert").mockImplementation((message) => {
      alerts.push(String(message));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Parameters" }));
    });
    expect(session.selection).toEqual({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-annual",
      columnId: "Value",
    });
    expect(screen.queryByRole("button", { name: "Delete sheet" })).toBeNull();
    await act(async () => {
      session.revealTable("tbl-params");
    });
    expect(screen.queryByRole("button", { name: "Delete table" })).toBeNull();
    expect(() => session.deleteTable("tbl-params")).toThrow();
    expect(() => session.deleteSheet("sheet-params")).toThrow();
  });

  it("selects the sheet when an empty-bands canvas is clicked", async () => {
    const snapshot = createSampleWorkbook();
    snapshot.sheets.push({ id: "sheet-empty", name: "Tom", tableIds: [] });
    const { session } = await renderWorkbookCanvas({ snapshot, chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tom" }));
    });
    const canvas = document.querySelector(".wk-canvas");
    expect(canvas).toBeTruthy();
    await act(async () => {
      fireEvent.click(canvas!);
    });
    expect(session.selection).toEqual({ kind: "sheet", sheetId: "sheet-empty" });
  });

  it("renames a sheet and sets horizontal scroll from the inspector", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
      session.setSelection({ kind: "sheet", sheetId: "sheet-assumptions" });
    });
    const name = screen.getByDisplayValue("Assumptions") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(name, { target: { value: "Forecast" } });
      fireEvent.blur(name);
    });
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")?.name).toBe("Forecast");
    const scroll = screen.getByDisplayValue("Sheet") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(scroll, { target: { value: "table" } });
    });
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")?.horizontalScroll).toBe("table");
  });

  it("renames the workbook and shrinking the calendar leaves orphan December cells", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sample 2025" }));
    });
    const name = screen.getByDisplayValue("Sample 2025") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(name, { target: { value: "Plan 2025" } });
      fireEvent.blur(name);
    });
    expect(session.getSnapshot().name).toBe("Plan 2025");
    const months = screen.getByDisplayValue("12") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(months, { target: { value: "6" } });
      fireEvent.blur(months);
    });
    expect(session.getSnapshot().calendar.monthCount).toBe(6);
    expect(layoutWorkbook(session.getSnapshot()).periods).toHaveLength(6);
    expect(
      session.getSnapshot().tables.find((table) => table.id === "tbl-lines")!.rows[0]!.cells["2025-12"]?.formula,
    ).toBeTruthy();
  });

  it("opens the Sheet and Reveals a Table created from Explorer", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    const before = session.getSnapshot().tables.map((table) => table.id);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "New table" })[1]!);
    });
    const added = session.getSnapshot().tables.find((table) => !before.includes(table.id));
    expect(added).toBeTruthy();
    expect(session.selection).toEqual({ kind: "table", tableId: added!.id });
    expect(document.querySelector(`[data-table-id="${added!.id}"]`)).toBeTruthy();
    expect(document.querySelector('[data-table-id="tbl-params"]')).toBeFalsy();
  });

  it("adds a sheet and a table from the explorer", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    const beforeTables = session.getSnapshot().tables.length;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "New sheet" }));
    });
    const added = session.getSnapshot().sheets.at(-1);
    expect(added?.name).toMatch(/Sheet/i);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: added!.name }));
    });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "New table" }).at(-1)!);
    });
    expect(session.getSnapshot().tables.length).toBe(beforeTables + 1);
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === added!.id)!.tableIds.length).toBe(1);
  });

  it("renames a table from the inspector and updates the canvas title", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lines" }));
      session.setSelection({ kind: "table", tableId: "tbl-lines" });
    });
    const name = screen.getByDisplayValue("Lines") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(name, { target: { value: "Lines" } });
      fireEvent.blur(name);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-lines")?.name).toBe("Lines");
    expect(document.querySelector('[data-table-id="tbl-lines"] .wk-table-viewport-title')?.textContent).toBe("Lines");
  });

  it("toggles year columns from the table inspector", async () => {
    const snapshot = createSampleWorkbook();
    snapshot.tables.push({
      id: "tbl-notes",
      name: "Notes",
      yearColumns: [],
      attributeColumns: [{ id: "Note", name: "Note" }],
      rows: [{ id: "rn-1", key: "A", cells: { Note: { kind: "input", value: "x" } } }],
    });
    snapshot.sheets[1]!.tableIds.push("tbl-notes");
    const { session } = await renderWorkbookCanvas({ snapshot, chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Notes" }));
      session.setSelection({ kind: "table", tableId: "tbl-notes" });
    });
    const checkbox = screen.getByLabelText("Year columns") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    await act(async () => {
      fireEvent.click(checkbox);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-notes")?.yearColumns).toEqual([
      { id: "yc-2025", year: 2025, grain: "month" },
    ]);
  });

  it("applies a number format from the inspector without changing the stored input", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-annual",
        columnId: "Value",
      });
    });
    const format = screen.getByPlaceholderText("G3, #,##G3, G3A, G3K") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(format, { target: { value: "G3A" } });
      fireEvent.blur(format);
    });
    const row = session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[0]!;
    expect(row.cells.Value).toMatchObject({ kind: "input", value: 8_000_000, format: "G3A" });
  });

  it("renames a promoted key from the cell name field and rejects collisions", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vat",
        columnId: "Value",
      });
    });
    const name = screen.getByDisplayValue("Mix") as HTMLInputElement;
    await act(async () => {
      fireEvent.focus(name);
      fireEvent.change(name, { target: { value: "SUM" } });
    });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    await act(async () => {
      fireEvent.blur(name);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.key).toBe("Mix");
    await act(async () => {
      fireEvent.change(name, { target: { value: "Levy" } });
      fireEvent.blur(name);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.key).toBe("Levy");
  });

  it("marks an Invalid draft when a Defined name starts with a digit", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vat",
        columnId: "Value",
      });
    });
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    const alerts: string[] = [];
    vi.spyOn(window, "alert").mockImplementation((message) => {
      alerts.push(String(message));
    });
    await act(async () => {
      fireEvent.focus(name);
      fireEvent.change(name, { target: { value: "1" } });
    });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    await act(async () => {
      fireEvent.blur(name);
    });
    expect(alerts).toEqual([]);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.key).toBe("Mix");
    expect(name.value).toBe("Mix");
  });

  it("refreshes name and value when the selected cell changes", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-alt-share",
        columnId: "Value",
      });
    });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("AlternateShare");
    expect((screen.getByLabelText("Value") as HTMLTextAreaElement).value).toBe("0.12");
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-last-share",
        columnId: "Value",
      });
    });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("LastShare");
    expect((screen.getByLabelText("Value") as HTMLTextAreaElement).value).toBe("0.08");
  });

  it("switches scenarios from the bar and restores Base without rewriting formulas", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    const formula = session.getSnapshot().tables.find((table) => table.id === "tbl-lines")!.rows[0]!.cells["2025-01"]!.formula;
    const base = session.getCell("Lines", "Total", "2025-01").computed as number;
    const select = screen.getByDisplayValue("Base Scenario") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "scn-growth" } });
    });
    await act(async () => {
      await session.recalculate();
    });
    expect(session.getCell("Params", "AnnualUnits", "Value").computed).toBe(10_000_000);
    expect(session.getCell("Params", "AnnualUnits", "Value").overlay).toBe(true);
    expect(session.getCell("Lines", "Total", "2025-01").computed as number).toBeGreaterThan(base);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-lines")!.rows[0]!.cells["2025-01"]!.formula).toBe(
      formula,
    );
    await act(async () => {
      fireEvent.change(select, { target: { value: "" } });
    });
    await act(async () => {
      await session.recalculate();
    });
    expect(session.getCell("Params", "AnnualUnits", "Value").computed).toBe(8_000_000);
    expect(session.getCell("Params", "AnnualUnits", "Value").overlay).toBe(false);
  });

  it("writes an overlay for inputs but keeps formula edits on Base while a scenario is active", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      session.activateScenario("scn-growth");
    });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vat",
        columnId: "Value",
      });
    });
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "0.4" } });
      fireEvent.keyDown(bar, { key: "Enter" });
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.cells.Value).toEqual({
      kind: "input",
      value: 0.25,
    });
    expect(session.getCell("Params", "Mix", "Value").computed).toBe(0.4);
    await act(async () => {
      session.writeCell("Lines", "Red", "2025-01", "=1");
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-lines")!.rows[0]!.cells["2025-01"]).toEqual({
      kind: "formula",
      formula: "=1",
    });
    expect(() => session.writeCell("Lines", "Red", "2025-01", "9")).toThrow(/Base/);
  });

  it("changes only the selected year-column grain from the time grain switch", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lines" }));
    });
    expect(projectTable(layoutWorkbook(session.getSnapshot()), "tbl-lines")!.colCount).toBe(14);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Quarter" }));
    });
    const lines = projectTable(layoutWorkbook(session.getSnapshot()), "tbl-lines")!;
    expect(lines.colCount).toBe(6);
    expect(lines.columns.map((column) => column.title)).toEqual(["", "2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4", ""]);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-lines")!.rows[0]!.cells["2025-01"]).toBeTruthy();
  });

  it("keeps Lines selected when arrowing onto its locked growth column", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lines" }));
    });
    const lines = projectTable(layoutWorkbook(session.getSnapshot()), "tbl-lines")!;
    const focus = trackFocus(session);
    await selectProjectedCell(session, "tbl-lines", lines.colCount - 2, 1);
    const host = document.querySelector('[data-table-id="tbl-lines"] .wk-table-spreadsheet');
    await act(async () => {
      fireEvent.keyDown(host!, { key: "ArrowRight" });
    });
    expect(session.selection).toEqual({
      kind: "growth",
      tableId: "tbl-lines",
      col: lines.colCount - 1,
      row: 1,
    });
    focus.expectAt("tbl-lines", lines.colCount - 1, 1);
  });

  it("deletes a row from the inspector", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      session.setSelection({ kind: "row", tableId: "tbl-params", rowId: "row-vat" });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete row" }));
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows.some((row) => row.id === "row-vat")).toBe(
      false,
    );
  });
});
