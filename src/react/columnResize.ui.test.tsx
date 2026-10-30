/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROPERTIES_WIDTH } from "./shellLayout.js";
import { installGridDom, renderWorkbookCanvas } from "./canvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function explorerResizeHandle() {
  return screen.getByRole("separator", { name: "Resize explorer" });
}

function shellRoot() {
  return document.querySelector(".wk-shell")!;
}

describe("Column resize in workbook shell", () => {
  it("blocks the canvas while resizing and widens Navigation from the keyboard", async () => {
    await renderWorkbookCanvas({ chrome: true, shell: true });
    const handle = explorerResizeHandle();
    const before = Number.parseInt(handle.getAttribute("aria-valuenow") ?? "0", 10);
    await act(async () => {
      fireEvent.pointerDown(handle, { clientX: 400, pointerId: 1, button: 0 });
    });
    expect(shellRoot().classList.contains("is-resizing")).toBe(true);
    await act(async () => {
      fireEvent.keyDown(handle, { key: "ArrowRight" });
      fireEvent.pointerUp(handle, { clientX: 400, pointerId: 1, button: 0 });
    });
    expect(Number.parseInt(handle.getAttribute("aria-valuenow") ?? "0", 10)).toBe(before + 16);
    expect(shellRoot().classList.contains("is-resizing")).toBe(false);
  });

  it("does not change Navigation width when widening Properties", async () => {
    await renderWorkbookCanvas({ chrome: true, shell: true });
    const explorer = explorerResizeHandle();
    const properties = screen.getByRole("separator", { name: "Resize properties" });
    const explorerBefore = Number.parseInt(explorer.getAttribute("aria-valuenow") ?? "0", 10);
    await act(async () => {
      fireEvent.pointerDown(properties, { clientX: 900, pointerId: 2, button: 0 });
      fireEvent.keyDown(properties, { key: "ArrowLeft" });
      fireEvent.keyDown(properties, { key: "ArrowLeft" });
      fireEvent.pointerUp(properties, { clientX: 860, pointerId: 2, button: 0 });
    });
    expect(Number.parseInt(explorer.getAttribute("aria-valuenow") ?? "0", 10)).toBe(explorerBefore);
    expect(Number.parseInt(properties.getAttribute("aria-valuenow") ?? "0", 10)).toBeGreaterThan(
      DEFAULT_PROPERTIES_WIDTH - 1,
    );
  });

  it("widens Properties when dragging the properties resizer left", async () => {
    await renderWorkbookCanvas({ chrome: true, shell: true });
    const handle = screen.getByRole("separator", { name: "Resize properties" });
    const before = Number.parseInt(handle.getAttribute("aria-valuenow") ?? "0", 10);
    await act(async () => {
      fireEvent.pointerDown(handle, { clientX: 900, pointerId: 2, button: 0 });
      fireEvent.keyDown(handle, { key: "ArrowLeft" });
    });
    expect(Number.parseInt(handle.getAttribute("aria-valuenow") ?? "0", 10)).toBe(before + 16);
    expect(shellRoot().classList.contains("is-resizing")).toBe(true);
    await act(async () => {
      fireEvent.pointerUp(handle, { clientX: 860, pointerId: 2, button: 0 });
    });
    expect(shellRoot().classList.contains("is-resizing")).toBe(false);
  });

  it("does not scroll the sheet canvas while dragging the explorer resizer", async () => {
    await renderWorkbookCanvas({ chrome: true, shell: true });
    const canvas = document.querySelector(".wk-canvas") as HTMLElement;
    let scrollLeft = 0;
    Object.defineProperty(canvas, "scrollLeft", {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
      },
    });
    const handle = explorerResizeHandle();
    await act(async () => {
      fireEvent.pointerDown(handle, { clientX: 300, pointerId: 1, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 360, pointerId: 1, buttons: 1 });
    });
    expect(scrollLeft).toBe(0);
    expect(shellRoot().classList.contains("is-resizing")).toBe(true);
  });
});
