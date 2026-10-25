/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { CustomSheetCanvas } from "./CustomSheetCanvas.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { WorkbookProvider } from "./WorkbookProvider.js";
import { installGridDom } from "./playgroundCanvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderPlayground() {
  const session = new WorkbookSession(createSampleWorkbook(), new HyperFormulaEngine());
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
    expect(screen.getByDisplayValue("Parameters")).toBeTruthy();
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
