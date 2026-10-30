/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { leadTableIdInCanvas } from "./sheetScroll.js";

describe("leadTableIdInCanvas", () => {
  it("returns the table whose band top matches the canvas scroll position", () => {
    const canvas = document.createElement("main");
    canvas.style.paddingTop = "0";
    Object.defineProperty(canvas, "scrollTop", { value: 120, writable: true });
    Object.defineProperty(canvas, "clientHeight", { value: 400 });

    canvas.getBoundingClientRect = () => ({ top: 0, left: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });

    const first = document.createElement("section");
    first.dataset.tableId = "tbl-a";
    first.getBoundingClientRect = () => ({ top: -100, left: 0, width: 100, height: 80, right: 100, bottom: -20, x: 0, y: -100, toJSON: () => ({}) });
    Object.defineProperty(first, "offsetHeight", { value: 80 });

    const second = document.createElement("section");
    second.dataset.tableId = "tbl-b";
    second.getBoundingClientRect = () => ({ top: -10, left: 0, width: 100, height: 200, right: 100, bottom: 190, x: 0, y: -10, toJSON: () => ({}) });
    Object.defineProperty(second, "offsetHeight", { value: 200 });
    canvas.append(first, second);

    expect(leadTableIdInCanvas(canvas)).toBe("tbl-b");
  });
});
