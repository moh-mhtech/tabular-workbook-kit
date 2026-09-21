/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { projectTable, selectionForProjectedCell } from "../grid/sheetProjection.js";
import { layoutWorkbook } from "../model/layout.js";
import type { WorkbookSnapshot } from "../model/types.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { CustomSheetCanvas } from "./CustomSheetCanvas.js";
import { WorkbookProvider } from "./WorkbookProvider.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function installGridDom() {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: [] })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => []),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  })) as never;
}

/**
 * Wide: key + Alpha + Gamma + growth (cols 0..3), header + 3 data + growth (rows 0..4).
 * Narrow: key + Beta + growth (cols 0..2), header + 1 data + growth (rows 0..2).
 * Unused corners: wide (0,0)/(3,4); narrow (0,0)/(2,2).
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

  it("moves right from the last growth-row cell onto the first available cell of the next table", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-wide", 2, 4);
    await pressArrow("tbl-wide", "ArrowRight");
    focus.expectAt("tbl-narrow", 1, 0);
  });

  it("wraps left from a key cell onto the growth cell of the previous row", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-wide", 0, 2);
    await pressArrow("tbl-wide", "ArrowLeft");
    focus.expectAt("tbl-wide", 3, 1);
  });

  it("moves left from the first header cell onto the last available cell of the previous table", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-narrow", 1, 0);
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

  it("skips the unused top-left corner when moving down into the next table key column", async () => {
    const { session } = await renderNavSheet();
    const focus = trackFocus(session);
    await selectCell(session, "tbl-wide", 0, 4);
    await pressArrow("tbl-wide", "ArrowDown");
    focus.expectAt("tbl-narrow", 0, 1);
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
