/** @vitest-environment jsdom */
import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCustomGridClear, applyCustomGridEdits, applyCustomGridFill, applyCustomGridPaste } from "./customGridInteractions.js";
import { layoutWorkbook } from "../model/layout.js";
import { projectTable } from "../grid/sheetProjection.js";
import { formulaBar, installGridDom, renderPlaygroundCanvas, selectProjectedCell } from "./playgroundCanvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("playground edit UI", () => {
  it("cancels the formula bar on Escape without writing", async () => {
    const { session } = await renderPlaygroundCanvas();
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
      fireEvent.change(bar, { target: { value: "0.9" } });
      fireEvent.keyDown(bar, { key: "Escape" });
    });
    expect(session.formulaEdit).toBeNull();
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.cells.Value).toEqual({
      kind: "input",
      value: 0.25,
    });
  });

  it("commits Tab and Shift+Tab from the formula bar", async () => {
    const { session } = await renderPlaygroundCanvas();
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-salg",
        rowId: "row-cnc",
        columnId: "2025-01",
      });
    });
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.keyDown(bar, { key: "Tab" });
    });
    expect(session.selection).toMatchObject({
      kind: "cell",
      tableId: "tbl-salg",
      columnId: "2025-02",
    });
    await act(async () => {
      fireEvent.keyDown(formulaBar()!, { key: "Tab", shiftKey: true });
    });
    expect(session.selection).toMatchObject({
      kind: "cell",
      tableId: "tbl-salg",
      columnId: "2025-01",
    });
  });

  it("evaluates =1+1 through HyperFormula after a formula-bar commit", async () => {
    const { session } = await renderPlaygroundCanvas();
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
      fireEvent.change(bar, { target: { value: "=1+1" } });
      fireEvent.keyDown(bar, { key: "Enter" });
    });
    await act(async () => {
      await session.recalculate();
    });
    expect(session.getCell("Params", "Vat", "Value").computed).toBe(2);
  });

  it("recalculates Salg when Params Vækst changes", async () => {
    const { session } = await renderPlaygroundCanvas();
    const before = session.getCell("Salg", "Total", "2025-12").computed as number;
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vaekst",
        columnId: "Value",
      });
    });
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "0.1" } });
      fireEvent.keyDown(bar, { key: "Enter" });
    });
    await act(async () => {
      await session.recalculate();
    });
    expect(session.getCell("Salg", "Total", "2025-12").computed as number).toBeGreaterThan(before);
  });

  it("adds a row when typing on the Params growth row", async () => {
    const { session } = await renderPlaygroundCanvas();
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    const growthRow = projection.rowCount - 1;
    await act(async () => {
      applyCustomGridEdits(session, projection, layout, [{ location: [0, growthRow], value: { data: "Extra" } }]);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows.some((row) => row.key === "Extra")).toBe(
      true,
    );
  });

  it("adds a column when typing on a growable table growth column, but not on Salg or Params", async () => {
    const { session } = await renderPlaygroundCanvas();
    const notesId = session.addTable("sheet-forud", { name: "Notes" }).id;
    await act(async () => {
      session.addRow(notesId);
    });
    let layout = layoutWorkbook(session.getSnapshot());
    let notes = projectTable(layout, notesId)!;
    await act(async () => {
      applyCustomGridEdits(session, notes, layout, [{ location: [notes.colCount - 1, 1], value: { data: "9" } }]);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === notesId)!.attributeColumns.length).toBeGreaterThan(1);

    layout = layoutWorkbook(session.getSnapshot());
    const salg = projectTable(layout, "tbl-salg")!;
    const salgCols = session.getSnapshot().tables.find((table) => table.id === "tbl-salg")!.attributeColumns.length;
    await act(async () => {
      applyCustomGridEdits(session, salg, layout, [{ location: [salg.colCount - 1, 1], value: { data: "9" } }]);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-salg")!.attributeColumns.length).toBe(salgCols);

    const params = projectTable(layout, "tbl-params")!;
    expect(params.growthColumn).toBe(false);
    expect(params.colCount).toBe(2);
    await act(async () => {
      applyCustomGridEdits(session, params, layout, [{ location: [params.colCount - 1, 1], value: { data: "9" } }]);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.attributeColumns).toHaveLength(1);
  });

  it("clears, fills, and pastes through the grid helpers after the canvas is mounted", async () => {
    const { session } = await renderPlaygroundCanvas();
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    await act(async () => {
      applyCustomGridClear(session, projection, layout, { x: 1, y: 3, width: 1, height: 1 });
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.cells.Value).toEqual({
      kind: "input",
      value: null,
    });
    await act(async () => {
      applyCustomGridFill(session, projection, layout, { x: 1, y: 2, width: 1, height: 1 }, { x: 1, y: 3, width: 1, height: 1 });
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.cells.Value?.value).toBe(0.03);
    const notes = session.addTable("sheet-params", { name: "Block" });
    await act(async () => {
      applyCustomGridPaste(session, projectTable(layoutWorkbook(session.getSnapshot()), notes.id)!, [1, 1], [["1"], ["2"]]);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === notes.id)!.rows).toHaveLength(2);
  });

  it("undoes a canvas edit with Ctrl+Z, including growth as one step", async () => {
    const { session } = await renderPlaygroundCanvas();
    const beforeRows = session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows.length;
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    await act(async () => {
      applyCustomGridEdits(session, projection, layout, [
        { location: [0, projection.rowCount - 1], value: { data: "Extra" } },
      ]);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows.length).toBe(beforeRows + 1);
    await act(async () => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows.length).toBe(beforeRows);
    await act(async () => {
      fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows.some((row) => row.key === "Extra")).toBe(
      true,
    );
  });

  it("commits a literal formula-bar edit when the empty canvas is clicked", async () => {
    const { session } = await renderPlaygroundCanvas();
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
    });
    const canvas = document.querySelector(".wk-canvas");
    await act(async () => {
      fireEvent.click(canvas!);
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.cells.Value).toEqual({
      kind: "input",
      value: 0.4,
    });
    expect(session.selection).toEqual({ kind: "sheet", sheetId: "sheet-params" });
  });

  it("shows * in the formula bar when a mixed-format range is selected", async () => {
    const { session } = await renderPlaygroundCanvas();
    await act(async () => {
      session.setCellFormat("tbl-params", "row-vat", "Value", "0.00");
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vat",
        columnId: "Value",
        range: [
          { tableId: "tbl-params", rowId: "row-vat", columnId: "Value" },
          { tableId: "tbl-params", rowId: "row-andel-cnc", columnId: "Value" },
        ],
      });
    });
    expect(formulaBar()?.value).toBe("*");
  });
});
