/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGridDom, renderWorkbookCanvas } from "./canvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function sheetGroup(name: string) {
  const nav = screen.getByRole("navigation", { name: "Sheets" });
  const btn = within(nav).getByRole("button", { name });
  return btn.closest(".wk-explorer-group") as HTMLElement;
}

describe("Explorer navigation", () => {
  it("focuses the first data cell when a sheet is chosen", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    });
    expect(session.selection).toEqual({
      kind: "cell",
      tableId: "tbl-lines",
      rowId: "row-red",
      columnId: "2025-01",
    });
  });

  it("focuses the first data cell when a table is chosen", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(within(sheetGroup("Parameters")).getByRole("button", { name: "Params" }));
    });
    expect(session.selection).toEqual({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-annual",
      columnId: "Value",
    });
  });

  it("shows grey viewport-lead and blue selected highlights, with selected winning", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    });
    const lines = within(sheetGroup("Assumptions")).getByRole("button", { name: "Lines" });
    expect(lines.classList.contains("is-selected")).toBe(true);
    expect(lines.classList.contains("is-viewport-lead")).toBe(false);

    await act(async () => {
      session.setSelection({ kind: "sheet", sheetId: "sheet-assumptions" });
    });
    expect(lines.classList.contains("is-viewport-lead")).toBe(true);
    expect(lines.classList.contains("is-selected")).toBe(false);
  });
});
