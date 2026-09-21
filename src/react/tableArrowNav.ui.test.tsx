/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { projectTable, selectionForProjectedCell } from "../grid/sheetProjection.js";
import { layoutWorkbook } from "../model/layout.js";
import { selectedCellRefs, type WorkbookSnapshot } from "../model/types.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { CustomSheetCanvas } from "./CustomSheetCanvas.js";
import { WorkbookProvider } from "./WorkbookProvider.js";
import { installGridDom, pressTableKey, renderPlaygroundCanvas, selectProjectedCell } from "./playgroundCanvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Wide: key + Alpha + Gamma + growth (cols 0..3), header + 3 data + growth (rows 0..4).
 * Narrow: key + Beta + growth (cols 0..2), header + 1 data + growth (rows 0..2).
 * Unused corner: wide (3,4); narrow (2,2). Table corner (0,0) is selectable.
 */
function navigationWorkbook(): WorkbookSnapshot {
  return {
    id: "wb-nav",
    name: "Nav",
    calendar: { startMonth: "2025-01", monthCount: 1 },
    sheets: [{ id: "sheet-nav", name: "Nav", tableIds: ["tbl-wide", "tbl-narrow"] }],
    tables: [
      {
        id: "tbl-wide",
        name: "Wide",
        yearColumns: [],
        attributeColumns: [
          { id: "col-alpha", name: "Alpha" },
          { id: "col-gamma", name: "Gamma" },
        ],
        rows: [
          { id: "rw-1", key: "1", cells: {} },
          { id: "rw-2", key: "2", cells: {} },
          { id: "rw-3", key: "3", cells: {} },
        ],
      },
      {
        id: "tbl-narrow",
        name: "Narrow",
        yearColumns: [],
        attributeColumns: [{ id: "col-beta", name: "Beta" }],
        rows: [{ id: "rn-1", key: "1", cells: {} }],
      },
    ],
    scenarios: [],
    activeScenarioId: null,
  };
}

async function renderNavSheet() {
  const snapshot = navigationWorkbook();
  const session = new WorkbookSession(snapshot, new HyperFormulaEngine());
  await session.recalculate();
  await act(async () => {
    render(
      <WorkbookProvider session={session}>
        <CustomSheetCanvas />
      </WorkbookProvider>,
    );
  });
  return { session, layout: layoutWorkbook(session.getSnapshot()) };
}

async function selectCell(session: WorkbookSession, tableId: string, col: number, row: number) {
  const layout = layoutWorkbook(session.getSnapshot());
  const projection = projectTable(layout, tableId)!;
  await act(async () => {
    session.setGridFocus({ tableId, col, row });
    session.setSelection(selectionForProjectedCell(projection, layout, col, row));
  });
}

async function pressArrow(tableId: string, key: "ArrowRight" | "ArrowLeft" | "ArrowUp" | "ArrowDown") {
  const host = document.querySelector(`[data-table-id="${tableId}"] .wk-table-spreadsheet`);
  expect(host).toBeTruthy();
  await act(async () => {
    fireEvent.keyDown(host!, { key });
  });
}

function trackFocus(session: WorkbookSession) {
  let current = session.gridFocus;
  session.subscribe(() => {
    if (session.gridFocus) current = session.gridFocus;
  });
  return {
    expectAt(tableId: string, col: number, row: number) {
      expect(current).toEqual({ tableId, col, row });
    },
  };
}

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("arrow navigation UI", () => {
  it("moves right to the next available cell, including the growth column", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-wide", 2, 1);
    await pressArrow("tbl-wide", "ArrowRight");
    focus.expectAt("tbl-wide", 3, 1);
  });

  it("wraps right from the last cell of a row onto the first available cell of the next row", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-wide", 3, 3);
    await pressArrow("tbl-wide", "ArrowRight");
    focus.expectAt("tbl-wide", 0, 4);
  });

  it("moves right from the last growth-row cell onto the Table corner of the next table", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-wide", 2, 4);
    await pressArrow("tbl-wide", "ArrowRight");
    focus.expectAt("tbl-narrow", 0, 0);
  });

  it("wraps left from a key cell onto the growth cell of the previous row", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-wide", 0, 2);
    await pressArrow("tbl-wide", "ArrowLeft");
    focus.expectAt("tbl-wide", 3, 1);
  });

  it("moves left from a Header cell onto the Table corner", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-narrow", 1, 0);
    await pressArrow("tbl-narrow", "ArrowLeft");
    focus.expectAt("tbl-narrow", 0, 0);
  });

  it("moves left from the Table corner onto the last available cell of the previous table", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-narrow", 0, 0);
    await pressArrow("tbl-narrow", "ArrowLeft");
    focus.expectAt("tbl-wide", 2, 4);
  });

  it("moves down to the next available cell in the same column, including the growth row", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-wide", 1, 3);
    await pressArrow("tbl-wide", "ArrowDown");
    focus.expectAt("tbl-wide", 1, 4);
  });

  it("moves down from the last cell of a column onto the same column in the next table", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-wide", 1, 4);
    await pressArrow("tbl-wide", "ArrowDown");
    focus.expectAt("tbl-narrow", 1, 0);
  });

  it("lands on the Table corner when moving down into the next table key column", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-wide", 0, 4);
    await pressArrow("tbl-wide", "ArrowDown");
    focus.expectAt("tbl-narrow", 0, 0);
  });

  it("moves up from the first header onto the same column in the previous table", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-narrow", 1, 0);
    await pressArrow("tbl-narrow", "ArrowUp");
    focus.expectAt("tbl-wide", 1, 4);
  });

  it("does not land on unused corners and stays put at the last table edge", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-narrow", 1, 2);
    focus.expectAt("tbl-narrow", 1, 2);
    await pressArrow("tbl-narrow", "ArrowRight");
    focus.expectAt("tbl-narrow", 1, 2);
    await pressArrow("tbl-narrow", "ArrowDown");
    focus.expectAt("tbl-narrow", 1, 2);
  });
});

function filledWorkbook(): WorkbookSnapshot {
  return {
    id: "wb-ctrl",
    name: "Ctrl",
    calendar: { startMonth: "2025-01", monthCount: 1 },
    sheets: [{ id: "sheet-ctrl", name: "Ctrl", tableIds: ["tbl-a", "tbl-b"] }],
    tables: [
      {
        id: "tbl-a",
        name: "A",
        yearColumns: [],
        attributeColumns: [
          { id: "ca", name: "CA" },
          { id: "cb", name: "CB" },
          { id: "cc", name: "CC" },
          { id: "cd", name: "CD" },
          { id: "ce", name: "CE" },
        ],
        rows: [
          {
            id: "ra1",
            key: "R1",
            cells: {
              ca: { kind: "input", value: 1 },
              cb: { kind: "input", value: 2 },
              cd: { kind: "input", value: 4 },
              ce: { kind: "input", value: 5 },
            },
          },
          {
            id: "ra2",
            key: "R2",
            cells: {
              ca: { kind: "input", value: 1 },
              cd: { kind: "input", value: 8 },
              ce: { kind: "input", value: 9 },
            },
          },
          { id: "ra3", key: "R3", cells: {} },
        ],
      },
      {
        id: "tbl-b",
        name: "B",
        yearColumns: [],
        attributeColumns: [
          { id: "ca", name: "CA" },
          { id: "cb", name: "CB" },
        ],
        rows: [{ id: "rb1", key: "S1", cells: { ca: { kind: "input", value: 9 } } }],
      },
    ],
    scenarios: [],
    activeScenarioId: null,
  };
}

async function renderFilledSheet() {
  const session = new WorkbookSession(filledWorkbook(), new HyperFormulaEngine());
  await session.recalculate();
  await act(async () => {
    render(
      <WorkbookProvider session={session}>
        <CustomSheetCanvas />
      </WorkbookProvider>,
    );
  });
  return { session };
}

async function pressCtrlArrow(tableId: string, key: "ArrowRight" | "ArrowLeft" | "ArrowUp" | "ArrowDown") {
  const host = document.querySelector(`[data-table-id="${tableId}"] .wk-table-spreadsheet`);
  expect(host).toBeTruthy();
  await act(async () => {
    fireEvent.keyDown(host!, { key, ctrlKey: true });
  });
}

describe("ctrl arrow navigation UI", () => {
  it("stops at each filled/blank phase change, then the end of the row", async () => {
    const { session } = await renderFilledSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-a", 1, 1);
    await pressCtrlArrow("tbl-a", "ArrowRight");
    focus.expectAt("tbl-a", 2, 1);
    await pressCtrlArrow("tbl-a", "ArrowRight");
    focus.expectAt("tbl-a", 4, 1);
    await pressCtrlArrow("tbl-a", "ArrowRight");
    focus.expectAt("tbl-a", 5, 1);
    await pressCtrlArrow("tbl-a", "ArrowRight");
    focus.expectAt("tbl-a", 6, 1);
    await pressCtrlArrow("tbl-a", "ArrowRight");
    focus.expectAt("tbl-a", 6, 1);
  });

  it("goes from the last filled data cell to the first cell of the next table", async () => {
    const { session } = await renderFilledSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-a", 1, 2);
    await pressCtrlArrow("tbl-a", "ArrowDown");
    focus.expectAt("tbl-b", 1, 0);
  });

  it("moves down the last table growth column to its last data row", async () => {
    const { session } = await renderFilledSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-b", 3, 0);
    await pressCtrlArrow("tbl-b", "ArrowDown");
    focus.expectAt("tbl-b", 3, 1);
  });

  it("moves left and up by phase without wrapping a row or landing on the growth row", async () => {
    const { session } = await renderFilledSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-a", 5, 1);
    await pressCtrlArrow("tbl-a", "ArrowLeft");
    focus.expectAt("tbl-a", 4, 1);
    await pressCtrlArrow("tbl-a", "ArrowLeft");
    focus.expectAt("tbl-a", 2, 1);
    await pressCtrlArrow("tbl-a", "ArrowLeft");
    focus.expectAt("tbl-a", 0, 1);
    await pressCtrlArrow("tbl-a", "ArrowLeft");
    focus.expectAt("tbl-a", 0, 1);
    await selectCell(session, "tbl-b", 1, 0);
    await pressCtrlArrow("tbl-b", "ArrowUp");
    focus.expectAt("tbl-a", 1, 3);
  });
});

function mockNarrowSheetViewport() {
  const canvas = document.querySelector(".wk-canvas") as HTMLElement;
  const sheet = document.querySelector('[data-table-id="tbl-a"] .wk-table-spreadsheet') as HTMLElement;
  expect(canvas).toBeTruthy();
  expect(sheet).toBeTruthy();
  canvas.style.padding = "16px";
  Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 200 });
  Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 400 });
  Object.defineProperty(canvas, "scrollWidth", { configurable: true, value: 2000 });
  Object.defineProperty(canvas, "scrollLeft", { configurable: true, writable: true, value: 0 });
  Object.defineProperty(canvas, "scrollTop", { configurable: true, writable: true, value: 0 });
  const box = (left: number, top: number, width: number, height: number) =>
    ({
      x: left,
      y: top,
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  canvas.getBoundingClientRect = () => box(0, 0, 200, 400);
  sheet.getBoundingClientRect = () => box(0, 16, 800, 200);
  for (const card of canvas.querySelectorAll<HTMLElement>("[data-table-id]")) {
    Object.defineProperty(card, "offsetHeight", { configurable: true, value: 200 });
    card.getBoundingClientRect = sheet.getBoundingClientRect;
  }
  return canvas;
}

describe("shift ctrl arrow cell range", () => {
  it("extends the Cell range to the next Phase change", async () => {
    const { session } = await renderPlaygroundCanvas({ snapshot: filledWorkbook() });
    await selectProjectedCell(session, "tbl-a", 1, 1);
    await pressTableKey("tbl-a", "ArrowRight", { ctrlKey: true, shiftKey: true });
    expect(session.selection).toMatchObject({
      kind: "cell",
      tableId: "tbl-a",
      rowId: "ra1",
      columnId: "ca",
    });
    expect(selectedCellRefs(session.selection)).toEqual([
      { tableId: "tbl-a", rowId: "ra1", columnId: "ca" },
      { tableId: "tbl-a", rowId: "ra1", columnId: "cb" },
    ]);
  });

  it("does not select Growth cells", async () => {
    const { session } = await renderPlaygroundCanvas({ snapshot: filledWorkbook() });
    await selectProjectedCell(session, "tbl-a", 1, 3);
    await pressTableKey("tbl-a", "ArrowRight", { ctrlKey: true, shiftKey: true });
    expect(session.selection).toMatchObject({
      kind: "cell",
      tableId: "tbl-a",
      rowId: "ra3",
      columnId: "ca",
    });
    expect(selectedCellRefs(session.selection)).toEqual([
      { tableId: "tbl-a", rowId: "ra3", columnId: "ca" },
      { tableId: "tbl-a", rowId: "ra3", columnId: "cb" },
      { tableId: "tbl-a", rowId: "ra3", columnId: "cc" },
      { tableId: "tbl-a", rowId: "ra3", columnId: "cd" },
      { tableId: "tbl-a", rowId: "ra3", columnId: "ce" },
    ]);
  });

  it("does not cross into another Table", async () => {
    const { session } = await renderPlaygroundCanvas({ snapshot: filledWorkbook() });
    await selectProjectedCell(session, "tbl-a", 1, 2);
    await pressTableKey("tbl-a", "ArrowDown", { ctrlKey: true, shiftKey: true });
    expect(session.selection).toMatchObject({
      kind: "cell",
      tableId: "tbl-a",
      rowId: "ra2",
      columnId: "ca",
    });
    expect(selectedCellRefs(session.selection)).toEqual([
      { tableId: "tbl-a", rowId: "ra2", columnId: "ca" },
    ]);
  });

  it("keeps the Cell range origin while jumping to the next Phase change", async () => {
    const { session } = await renderPlaygroundCanvas({ snapshot: filledWorkbook() });
    await selectProjectedCell(session, "tbl-a", 1, 1);
    await pressTableKey("tbl-a", "ArrowRight", { ctrlKey: true, shiftKey: true });
    await pressTableKey("tbl-a", "ArrowRight", { ctrlKey: true, shiftKey: true });
    expect(session.selection).toMatchObject({
      kind: "cell",
      tableId: "tbl-a",
      rowId: "ra1",
      columnId: "ca",
    });
    expect(selectedCellRefs(session.selection)).toEqual([
      { tableId: "tbl-a", rowId: "ra1", columnId: "ca" },
      { tableId: "tbl-a", rowId: "ra1", columnId: "cb" },
      { tableId: "tbl-a", rowId: "ra1", columnId: "cc" },
      { tableId: "tbl-a", rowId: "ra1", columnId: "cd" },
    ]);
  });

  it("Shift+Arrow extends the Cell range by one cell after Shift+Ctrl+arrow", async () => {
    const { session } = await renderPlaygroundCanvas({ snapshot: filledWorkbook() });
    await selectProjectedCell(session, "tbl-a", 1, 1);
    await pressTableKey("tbl-a", "ArrowRight", { ctrlKey: true, shiftKey: true });
    await pressTableKey("tbl-a", "ArrowRight", { shiftKey: true });
    expect(session.selection).toMatchObject({
      kind: "cell",
      tableId: "tbl-a",
      rowId: "ra1",
      columnId: "ca",
    });
    expect(selectedCellRefs(session.selection)).toEqual([
      { tableId: "tbl-a", rowId: "ra1", columnId: "ca" },
      { tableId: "tbl-a", rowId: "ra1", columnId: "cb" },
      { tableId: "tbl-a", rowId: "ra1", columnId: "cc" },
    ]);
  });

  it("Shift+Arrow extends a Cell range by one cell", async () => {
    const { session } = await renderPlaygroundCanvas({ snapshot: filledWorkbook() });
    await selectProjectedCell(session, "tbl-a", 1, 1);
    await pressTableKey("tbl-a", "ArrowDown", { shiftKey: true });
    expect(selectedCellRefs(session.selection)).toEqual([
      { tableId: "tbl-a", rowId: "ra1", columnId: "ca" },
      { tableId: "tbl-a", rowId: "ra2", columnId: "ca" },
    ]);
  });

  it("does not select Growth cells with Shift+Arrow", async () => {
    const { session } = await renderPlaygroundCanvas({ snapshot: filledWorkbook() });
    await selectProjectedCell(session, "tbl-a", 5, 1);
    await pressTableKey("tbl-a", "ArrowRight", { shiftKey: true });
    await pressTableKey("tbl-a", "ArrowLeft", { shiftKey: true });
    expect(selectedCellRefs(session.selection)).toEqual([
      { tableId: "tbl-a", rowId: "ra1", columnId: "cd" },
      { tableId: "tbl-a", rowId: "ra1", columnId: "ce" },
    ]);
  });

  it("scrolls the viewport to the moving Cell of a Shift+Ctrl+arrow range", async () => {
    const snapshot = filledWorkbook();
    snapshot.sheets[0]!.horizontalScroll = "sheet";
    const { session } = await renderPlaygroundCanvas({ snapshot });
    await selectProjectedCell(session, "tbl-a", 1, 3);
    const canvas = mockNarrowSheetViewport();
    await pressTableKey("tbl-a", "ArrowRight", { ctrlKey: true, shiftKey: true });
    // CE is column 5; columns floor at 48px, so 240–288. Viewport 200 with 16px insets → 104.
    expect(canvas.scrollLeft).toBe(104);
  });

  it("scrolls the viewport to the landing Cell of Ctrl+arrow", async () => {
    const snapshot = filledWorkbook();
    snapshot.sheets[0]!.horizontalScroll = "sheet";
    const { session } = await renderPlaygroundCanvas({ snapshot });
    await selectProjectedCell(session, "tbl-a", 1, 1);
    const canvas = mockNarrowSheetViewport();
    await pressTableKey("tbl-a", "ArrowRight", { ctrlKey: true });
    await pressTableKey("tbl-a", "ArrowRight", { ctrlKey: true });
    // CD is column 4; 192–240. Viewport 200 with 16px insets → 56.
    expect(canvas.scrollLeft).toBe(56);
  });
});
