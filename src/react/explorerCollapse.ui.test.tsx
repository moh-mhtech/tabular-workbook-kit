/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

describe("Explorer sheet collapse", () => {
  it("collapses a sheet from the chevron and hides its tables until that sheet is viewed", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    });
    const parameters = sheetGroup("Parameters");
    expect(within(parameters).getByRole("button", { name: "Params" })).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(parameters).getByRole("button", { name: "Collapse Parameters" }));
    });
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-params")!.explorerCollapsed).toBe(true);
    await waitFor(() => {
      expect(within(parameters).queryByRole("button", { name: "Params" })).toBeNull();
    });
    expect(parameters.querySelector(".wk-explorer-tables-wrap.is-expanded")).toBeNull();

    await act(async () => {
      fireEvent.click(within(parameters).getByRole("button", { name: "Parameters" }));
    });
    await waitFor(() => {
      expect(within(parameters).getByRole("button", { name: "Params" })).toBeTruthy();
      expect(parameters.querySelector(".wk-explorer-tables-wrap.is-expanded")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    });
    await waitFor(() => {
      expect(within(parameters).queryByRole("button", { name: "Params" })).toBeNull();
    });
    expect(within(parameters).getByRole("button", { name: "Expand Parameters" })).toBeTruthy();
  });

});
