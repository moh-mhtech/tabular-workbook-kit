/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { CustomSheetCanvas } from "./CustomSheetCanvas.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
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

async function renderPlayground() {
  const session = new WorkbookSession(createPlaygroundWorkbook(), new HyperFormulaEngine());
  await session.recalculate();
  session.setSelection({
    kind: "cell",
    tableId: "tbl-params",
    rowId: "row-vat",
    columnId: "Value",
  });
  await act(async () => {
    render(
      <WorkbookProvider session={session}>
        <CustomSheetCanvas />
        <PropertiesPanel />
      </WorkbookProvider>,
    );
  });
  return { session };
}

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("canvas sheet selection", () => {
  it("selects the sheet when clicking the canvas outside any table", async () => {
    const { session } = await renderPlayground();
    const canvas = document.querySelector(".wk-canvas");
    expect(canvas).toBeTruthy();
    await act(async () => {
      fireEvent.click(canvas!);
    });
    expect(session.selection).toEqual({ kind: "sheet", sheetId: "sheet-params" });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Sheet");
    expect(screen.getByDisplayValue("Parametre")).toBeTruthy();
  });

  it("keeps the table selected when clicking a table title", async () => {
    const { session } = await renderPlayground();
    const title = document.querySelector('[data-table-id="tbl-params"] .wk-table-viewport-title');
    expect(title).toBeTruthy();
    await act(async () => {
      fireEvent.click(title!);
    });
    expect(session.selection).toEqual({ kind: "table", tableId: "tbl-params" });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Table");
  });
});
