/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  cellGridMetrics,
  clampCanvasScroll,
  scrollCanvasToKeepTableVisible,
  scrollCanvasToTable,
  scrollToKeepRangeInView,
  sheetScrollTopForTable,
} from "./sheetScroll.js";

function layout(element: HTMLElement, top: number, height: number) {
  Object.defineProperty(element, "offsetHeight", { configurable: true, value: height });
  element.getBoundingClientRect = () =>
    ({
      top,
      left: 0,
      bottom: top + height,
      right: 200,
      width: 200,
      height,
      x: 0,
      y: top,
      toJSON() {
        return {};
      },
    }) as DOMRect;
}

describe("keep selection in the canvas viewport", () => {
  it("does not scroll while the cell is inside the inset viewport", () => {
    expect(scrollToKeepRangeInView(100, 400, 180, 208, 16, 16, 2000)).toBe(100);
  });

  it("scrolls up when the cell crosses the top margin", () => {
    expect(scrollToKeepRangeInView(100, 400, 80, 108, 16, 16, 2000)).toBe(64);
  });

  it("scrolls down when the cell crosses the bottom margin", () => {
    expect(scrollToKeepRangeInView(0, 400, 360, 388, 16, 16, 2000)).toBe(4);
  });

  it("measures a cell from column widths and row height", () => {
    expect(cellGridMetrics([48, 110, 80], 2, 3, 28)).toEqual({
      x: 158,
      y: 84,
      width: 80,
      height: 28,
    });
    expect(cellGridMetrics([48, 110, 80], 2, 3, [28, 28, 28, 61])).toEqual({
      x: 158,
      y: 84,
      width: 80,
      height: 61,
    });
    expect(cellGridMetrics([48, 110], 1, 2, [28, 61, 28])).toEqual({
      x: 48,
      y: 89,
      width: 110,
      height: 28,
    });
  });

  it("does not jump when the clicked table title is already in view", () => {
    const canvas = document.createElement("main");
    const card = document.createElement("section");
    const title = document.createElement("button");
    card.dataset.tableId = "tbl-mid";
    title.className = "wk-table-viewport-title";
    card.append(title);
    canvas.append(card);
    document.body.append(canvas);
    canvas.style.paddingTop = "16px";
    canvas.style.paddingBottom = "16px";
    Object.defineProperty(canvas, "clientHeight", { value: 400 });
    Object.defineProperty(canvas, "scrollTop", { value: 80, writable: true });
    layout(canvas, 0, 400);
    Object.defineProperty(card, "offsetHeight", { configurable: true, value: 2000 });
    card.getBoundingClientRect = () =>
      ({
        top: 16 - canvas.scrollTop,
        left: 0,
        bottom: 2016 - canvas.scrollTop,
        right: 200,
        width: 200,
        height: 2000,
        x: 0,
        y: 16 - canvas.scrollTop,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    Object.defineProperty(title, "offsetHeight", { configurable: true, value: 20 });
    title.getBoundingClientRect = () =>
      ({
        top: 120,
        left: 0,
        bottom: 140,
        right: 200,
        width: 200,
        height: 20,
        x: 0,
        y: 120,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    scrollCanvasToKeepTableVisible(canvas, "tbl-mid");
    expect(canvas.scrollTop).toBe(80);
    canvas.remove();
  });
});

describe("sheet canvas scroll", () => {
  it("moves a table to the top of the viewport when there is room below", () => {
    expect(sheetScrollTopForTable(420, 500, 1200)).toBe(420);
  });

  it("keeps the canvas top margin when navigating to a table", () => {
    expect(sheetScrollTopForTable(16, 800, 2000, 16)).toBe(0);
    expect(sheetScrollTopForTable(420, 500, 1200, 16)).toBe(404);
  });

  it("clamps so the viewport bottom stays on the sheet", () => {
    expect(sheetScrollTopForTable(1800, 800, 2000)).toBe(1200);
  });

  it("stays at the start when the sheet is shorter than the viewport", () => {
    expect(sheetScrollTopForTable(400, 800, 600)).toBe(0);
    expect(sheetScrollTopForTable(0, 800, 600)).toBe(0);
  });

  it("scrolls the first table to the top of the page, keeping the canvas margin", () => {
    const canvas = document.createElement("main");
    const first = document.createElement("section");
    first.dataset.tableId = "tbl-first";
    canvas.append(first);
    document.body.append(canvas);
    canvas.style.paddingTop = "16px";
    canvas.style.paddingBottom = "16px";
    Object.defineProperty(canvas, "clientHeight", { value: 800 });
    Object.defineProperty(canvas, "scrollTop", { value: 40, writable: true });
    layout(canvas, 0, 800);
    Object.defineProperty(first, "offsetHeight", { configurable: true, value: 200 });
    first.getBoundingClientRect = () =>
      ({
        top: 16 - canvas.scrollTop,
        left: 0,
        bottom: 216 - canvas.scrollTop,
        right: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 16 - canvas.scrollTop,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    scrollCanvasToTable(canvas, "tbl-first");
    expect(canvas.scrollTop).toBe(0);
    canvas.remove();
  });

  it("leaves the canvas top margin above a later table when there is room below", () => {
    const canvas = document.createElement("main");
    const first = document.createElement("section");
    const mid = document.createElement("section");
    const last = document.createElement("section");
    first.dataset.tableId = "tbl-first";
    mid.dataset.tableId = "tbl-mid";
    last.dataset.tableId = "tbl-last";
    canvas.append(first, mid, last);
    document.body.append(canvas);
    canvas.style.paddingTop = "16px";
    canvas.style.paddingBottom = "16px";
    Object.defineProperty(canvas, "clientHeight", { value: 500 });
    Object.defineProperty(canvas, "scrollTop", { value: 0, writable: true });
    layout(canvas, 0, 500);
    Object.defineProperty(mid, "offsetHeight", { configurable: true, value: 200 });
    Object.defineProperty(last, "offsetHeight", { configurable: true, value: 200 });
    mid.getBoundingClientRect = () =>
      ({
        top: 420 - canvas.scrollTop,
        left: 0,
        bottom: 620 - canvas.scrollTop,
        right: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 420 - canvas.scrollTop,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    last.getBoundingClientRect = () =>
      ({
        top: 1000 - canvas.scrollTop,
        left: 0,
        bottom: 1200 - canvas.scrollTop,
        right: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 1000 - canvas.scrollTop,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    scrollCanvasToTable(canvas, "tbl-mid");
    expect(canvas.scrollTop).toBe(404);
    canvas.remove();
  });

  it("scrolls a later table to the start and clamps past the sheet bottom", () => {
    const canvas = document.createElement("main");
    const first = document.createElement("section");
    const last = document.createElement("section");
    first.dataset.tableId = "tbl-first";
    last.dataset.tableId = "tbl-last";
    canvas.append(first, last);
    document.body.append(canvas);
    Object.defineProperty(canvas, "clientHeight", { value: 800 });
    Object.defineProperty(canvas, "scrollTop", { value: 0, writable: true });
    layout(canvas, 0, 800);
    Object.defineProperty(last, "offsetHeight", { configurable: true, value: 200 });
    last.getBoundingClientRect = () =>
      ({
        top: 1800 - canvas.scrollTop,
        left: 0,
        bottom: 2000 - canvas.scrollTop,
        right: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 1800 - canvas.scrollTop,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    canvas.style.paddingTop = "16px";
    scrollCanvasToTable(canvas, "tbl-last");
    expect(canvas.scrollTop).toBe(1200);

    canvas.scrollTop = 1600;
    clampCanvasScroll(canvas);
    expect(canvas.scrollTop).toBe(1200);
    canvas.remove();
  });

  it("keeps the canvas bottom padding after the last table when clamping", () => {
    const canvas = document.createElement("main");
    const last = document.createElement("section");
    last.dataset.tableId = "tbl-last";
    canvas.append(last);
    canvas.style.paddingBottom = "16px";
    Object.defineProperty(canvas, "clientHeight", { value: 800 });
    Object.defineProperty(canvas, "scrollTop", { value: 1600, writable: true });
    layout(canvas, 0, 800);
    Object.defineProperty(last, "offsetHeight", { configurable: true, value: 200 });
    last.getBoundingClientRect = () =>
      ({
        top: 1800 - canvas.scrollTop,
        left: 0,
        bottom: 2000 - canvas.scrollTop,
        right: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 1800 - canvas.scrollTop,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    clampCanvasScroll(canvas);
    expect(canvas.scrollTop).toBe(1216);
  });
});
