/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { cellGridMetrics, scrollCanvasToKeepCellVisible } from "./sheetScroll.js";

describe("scrollCanvasToKeepCellVisible", () => {
  it("scrolls the table scroller horizontally in per-table scroll mode", () => {
    const canvas = document.createElement("main");
    canvas.className = "wk-canvas wk-table-canvases is-table-scroll-x";
    Object.defineProperty(canvas, "clientWidth", { value: 800 });
    Object.defineProperty(canvas, "clientHeight", { value: 600 });
    Object.defineProperty(canvas, "scrollWidth", { value: 800 });
    Object.defineProperty(canvas, "scrollTop", { value: 0, writable: true });
    Object.defineProperty(canvas, "scrollLeft", { value: 0, writable: true });

    const card = document.createElement("section");
    card.dataset.tableId = "tbl-a";
    const spreadsheet = document.createElement("div");
    spreadsheet.className = "wk-table-spreadsheet";
    const scroller = document.createElement("div");
    scroller.className = "dvn-scroller";
    Object.defineProperty(scroller, "clientWidth", { value: 120 });
    Object.defineProperty(scroller, "scrollWidth", { value: 640 });
    let scrollLeft = 0;
    Object.defineProperty(scroller, "scrollLeft", {
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
      },
    });
    spreadsheet.append(scroller);
    card.append(spreadsheet);
    canvas.append(card);
    document.body.append(canvas);

    const columnWidths = [48, 48, 48, 48, 48];
    const { x, width } = cellGridMetrics(columnWidths, 4, 1, 24);
    scrollCanvasToKeepCellVisible(canvas, "tbl-a", 4, 1, columnWidths, 24, "table");
    expect(scrollLeft).toBeGreaterThan(0);
    expect(x + width).toBeLessThanOrEqual(scrollLeft + scroller.clientWidth);
  });
});
