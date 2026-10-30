/** @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { projectTable, selectionForProjectedCell } from "../grid/sheetProjection.js";
import { layoutWorkbook } from "../model/layout.js";
import { type WorkbookSnapshot } from "../model/types.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { CustomSheetCanvas } from "./CustomSheetCanvas.js";
import { installGridDom, pressTableKey, renderWorkbookCanvas } from "./canvasTest.js";
import { WorkbookProvider } from "./WorkbookProvider.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function wideNavWorkbook(horizontalScroll?: "table" | "sheet"): WorkbookSnapshot {
  return {
    id: "wb-viewport",
    name: "Viewport",
    calendar: { startMonth: "2025-01", monthCount: 1 },
    sheets: [
      {
        id: "sheet-vp",
        name: "VP",
        tableIds: ["tbl-wide"],
        ...(horizontalScroll ? { horizontalScroll } : {}),
      },
    ],
    tables: [
      {
        id: "tbl-wide",
        name: "Wide",
        yearColumns: [],
        attributeColumns: [
          { id: "c1", name: "A" },
          { id: "c2", name: "B" },
          { id: "c3", name: "C" },
          { id: "c4", name: "D" },
          { id: "c5", name: "E" },
        ],
        rows: [{ id: "r1", key: "1", cells: {} }],
      },
    ],
    scenarios: [],
    activeScenarioId: null,
  };
}

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("sheet viewport horizontal scroll", () => {
  it("keeps per-table horizontal scroll unclipped under the grid collapse wrapper", async () => {
    const { session } = await renderWorkbookCanvas({
      snapshot: wideNavWorkbook("table"),
    });
    await act(async () => {
      session.setSelection(
        selectionForProjectedCell(projectTable(layoutWorkbook(session.getSnapshot()), "tbl-wide")!, layoutWorkbook(session.getSnapshot()), 1, 1),
      );
    });
    await waitFor(() => {
      expect(
        document.querySelector('[data-table-id="tbl-wide"] [data-table-grid-wrap][data-expanded="true"]'),
      ).toBeTruthy();
    });
    const inner = document.querySelector(
      '[data-table-id="tbl-wide"] [data-table-grid-wrap][data-expanded="true"] .wk-table-grid-collapse-inner',
    ) as HTMLElement;
    expect(inner).toBeTruthy();
    expect(getComputedStyle(inner).overflowX).not.toBe("hidden");
    expect(document.querySelector(".wk-canvas.is-table-scroll-x")).toBeTruthy();
    expect(document.querySelector('[data-table-id="tbl-wide"] .dvn-scroller')).toBeTruthy();
  });

  it("scrolls the table scroller when arrowing to a cell outside the viewport (per-table scroll)", async () => {
    const snapshot = wideNavWorkbook("table");
    const session = new WorkbookSession(snapshot, new HyperFormulaEngine());
    await session.recalculate();
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-wide")!;
    await act(async () => {
      session.setSelection(selectionForProjectedCell(projection, layout, 1, 1));
    });
    await act(async () => {
      render(
        <WorkbookProvider session={session}>
          <CustomSheetCanvas />
        </WorkbookProvider>,
      );
    });

    const scroller = document.querySelector('[data-table-id="tbl-wide"] .dvn-scroller') as HTMLElement;
    expect(scroller).toBeTruthy();
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 120 });
    Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 600 });
    let scrollLeft = 0;
    Object.defineProperty(scroller, "scrollLeft", {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
      },
    });

    await pressTableKey("tbl-wide", "ArrowRight", { ctrl: true });
    await pressTableKey("tbl-wide", "ArrowRight", { ctrl: true });
    expect(scrollLeft).toBeGreaterThan(0);
  });

  it("scrolls the sheet canvas when arrowing with sheet horizontal scroll", async () => {
    const snapshot = wideNavWorkbook("sheet");
    const { session } = await renderWorkbookCanvas({ snapshot });
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-wide")!;
    await act(async () => {
      session.setSelection(selectionForProjectedCell(projection, layout, 1, 1));
    });

    const canvas = document.querySelector(".wk-canvas.is-sheet-scroll-x") as HTMLElement;
    expect(canvas).toBeTruthy();
    canvas.style.padding = "16px";
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 200 });
    Object.defineProperty(canvas, "scrollWidth", { configurable: true, value: 2000 });
    let scrollLeft = 0;
    Object.defineProperty(canvas, "scrollLeft", {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
      },
    });

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
    const card = document.querySelector('[data-table-id="tbl-wide"]') as HTMLElement;
    const sheet = document.querySelector('[data-table-id="tbl-wide"] .wk-table-spreadsheet') as HTMLElement;
    card.getBoundingClientRect = () => box(16, 16, 480, 200);
    sheet.getBoundingClientRect = () => box(16, 40, 480, 160);
    Object.defineProperty(sheet, "offsetWidth", { configurable: true, value: 480 });

    await pressTableKey("tbl-wide", "ArrowRight", { ctrl: true });
    await pressTableKey("tbl-wide", "ArrowRight", { ctrl: true });
    expect(scrollLeft).toBeGreaterThan(0);
  });
});
