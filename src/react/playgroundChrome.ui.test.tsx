/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { projectTable } from "../grid/sheetProjection.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { formulaBar, installGridDom, renderPlaygroundCanvas, selectProjectedCell, trackFocus } from "./playgroundCanvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("playground chrome UI", () => {
  it("selects a sheet from the explorer and paints that sheet's tables", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Forudsætninger" }));
    });
    expect(session.selection).toEqual({ kind: "sheet", sheetId: "sheet-forud" });
    expect(document.querySelector('[data-table-id="tbl-salg"]')).toBeTruthy();
    expect(document.querySelector('[data-table-id="tbl-params"]')).toBeFalsy();
  });

  it("reveals a table on another sheet from the explorer", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salg" }));
    });
    expect(session.selection).toEqual({ kind: "table", tableId: "tbl-salg" });
    expect(document.querySelector('[data-table-id="tbl-salg"] .wk-table-viewport-title')?.textContent).toBe("Salg");
  });

  it("keeps the locked Parametre sheet selectable and blocks deleting Params", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    const alerts: string[] = [];
    vi.spyOn(window, "alert").mockImplementation((message) => {
      alerts.push(String(message));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Parametre" }));
    });
    expect(session.selection).toEqual({ kind: "sheet", sheetId: "sheet-params" });
    expect(screen.queryByRole("button", { name: "Delete sheet" })).toBeNull();
    await act(async () => {
      session.revealTable("tbl-params");
    });
    expect(screen.queryByRole("button", { name: "Delete table" })).toBeNull();
    expect(() => session.deleteTable("tbl-params")).toThrow();
    expect(() => session.deleteSheet("sheet-params")).toThrow();
  });

  it("selects the sheet when an empty-bands canvas is clicked", async () => {
    const snapshot = createPlaygroundWorkbook();
    snapshot.sheets.push({ id: "sheet-empty", name: "Tom", tableIds: [] });
    const { session } = await renderPlaygroundCanvas({ snapshot, chrome: true });
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
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Forudsætninger" }));
    });
    const name = screen.getByDisplayValue("Forudsætninger") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(name, { target: { value: "Forecast" } });
      fireEvent.blur(name);
    });
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-forud")?.name).toBe("Forecast");
    const scroll = screen.getByDisplayValue("Per table") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(scroll, { target: { value: "sheet" } });
    });
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-forud")?.horizontalScroll).toBe("sheet");
  });

  it("renames the workbook and shrinking the calendar leaves orphan December cells", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Workbook" }));
    });
    const name = screen.getByDisplayValue("Playground 2025") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(name, { target: { value: "Budget 2025" } });
      fireEvent.blur(name);
    });
    expect(session.getSnapshot().name).toBe("Budget 2025");
    const months = screen.getByDisplayValue("12") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(months, { target: { value: "6" } });
      fireEvent.blur(months);
    });
    expect(session.getSnapshot().calendar.monthCount).toBe(6);
    expect(layoutWorkbook(session.getSnapshot()).periods).toHaveLength(6);
    expect(
      session.getSnapshot().tables.find((table) => table.id === "tbl-salg")!.rows[0]!.cells["2025-12"]?.formula,
    ).toBeTruthy();
  });

  it("adds a sheet and a table from the explorer", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
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
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salg" }));
    });
    const name = screen.getByDisplayValue("Salg") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(name, { target: { value: "Sales" } });
      fireEvent.blur(name);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-salg")?.name).toBe("Sales");
    expect(document.querySelector('[data-table-id="tbl-salg"] .wk-table-viewport-title')?.textContent).toBe("Sales");
  });

  it("toggles year columns from the table inspector", async () => {
    const snapshot = createPlaygroundWorkbook();
    snapshot.tables.push({
      id: "tbl-notes",
      name: "Notes",
      yearColumns: [],
      attributeColumns: [{ id: "Note", name: "Note" }],
      rows: [{ id: "rn-1", key: "A", cells: { Note: { kind: "input", value: "x" } } }],
    });
    snapshot.sheets[1]!.tableIds.push("tbl-notes");
    const { session } = await renderPlaygroundCanvas({ snapshot, chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Notes" }));
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
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-aarsalg",
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
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vat",
        columnId: "Value",
      });
    });
    const name = screen.getByDisplayValue("Vat") as HTMLInputElement;
    const alerts: string[] = [];
    vi.spyOn(window, "alert").mockImplementation((message) => {
      alerts.push(String(message));
    });
    await act(async () => {
      fireEvent.change(name, { target: { value: "SUM" } });
      fireEvent.blur(name);
    });
    expect(alerts.length).toBeGreaterThan(0);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.key).toBe("Vat");
    await act(async () => {
      fireEvent.change(name, { target: { value: "Moms" } });
      fireEvent.blur(name);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.key).toBe("Moms");
  });

  it("refreshes name and value when the selected cell changes", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-andel-out",
        columnId: "Value",
      });
    });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("AndelOutsource");
    expect((screen.getByLabelText("Value") as HTMLTextAreaElement).value).toBe("0.12");
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-andel-plade",
        columnId: "Value",
      });
    });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("AndelPladebuk");
    expect((screen.getByLabelText("Value") as HTMLTextAreaElement).value).toBe("0.08");
  });

  it("switches scenarios from the bar and restores Base without rewriting formulas", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    const formula = session.getSnapshot().tables.find((table) => table.id === "tbl-salg")!.rows[0]!.cells["2025-01"]!.formula;
    const base = session.getCell("Salg", "Total", "2025-01").computed as number;
    const select = screen.getByDisplayValue("Base") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "scn-vaekst" } });
    });
    await act(async () => {
      await session.recalculate();
    });
    expect(session.getCell("Params", "Årssalg", "Value").computed).toBe(10_000_000);
    expect(session.getCell("Params", "Årssalg", "Value").overlay).toBe(true);
    expect(session.getCell("Salg", "Total", "2025-01").computed as number).toBeGreaterThan(base);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-salg")!.rows[0]!.cells["2025-01"]!.formula).toBe(
      formula,
    );
    await act(async () => {
      fireEvent.change(select, { target: { value: "" } });
    });
    await act(async () => {
      await session.recalculate();
    });
    expect(session.getCell("Params", "Årssalg", "Value").computed).toBe(8_000_000);
    expect(session.getCell("Params", "Årssalg", "Value").overlay).toBe(false);
  });

  it("writes an overlay for inputs but keeps formula edits on Base while a scenario is active", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      session.activateScenario("scn-vaekst");
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
    expect(session.getCell("Params", "Vat", "Value").computed).toBe(0.4);
    await act(async () => {
      session.writeCell("Salg", "CNC", "2025-01", "=1");
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-salg")!.rows[0]!.cells["2025-01"]).toEqual({
      kind: "formula",
      formula: "=1",
    });
    expect(() => session.writeCell("Salg", "CNC", "2025-01", "9")).toThrow(/Base/);
  });

  it("changes only the selected year-column grain from the time grain switch", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salg" }));
    });
    expect(projectTable(layoutWorkbook(session.getSnapshot()), "tbl-salg")!.colCount).toBe(14);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kvartal" }));
    });
    const salg = projectTable(layoutWorkbook(session.getSnapshot()), "tbl-salg")!;
    expect(salg.colCount).toBe(6);
    expect(salg.columns.map((column) => column.title)).toEqual(["", "2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4", ""]);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-salg")!.rows[0]!.cells["2025-01"]).toBeTruthy();
  });

  it("keeps Salg selected when arrowing onto its locked growth column", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salg" }));
    });
    const salg = projectTable(layoutWorkbook(session.getSnapshot()), "tbl-salg")!;
    const focus = trackFocus(session);
    await selectProjectedCell(session, "tbl-salg", salg.colCount - 2, 1);
    const host = document.querySelector('[data-table-id="tbl-salg"] .wk-table-spreadsheet');
    await act(async () => {
      fireEvent.keyDown(host!, { key: "ArrowRight" });
    });
    expect(session.selection).toEqual({ kind: "table", tableId: "tbl-salg" });
    focus.expectAt("tbl-salg", salg.colCount - 1, 1);
  });

  it("deletes a row from the inspector", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
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
