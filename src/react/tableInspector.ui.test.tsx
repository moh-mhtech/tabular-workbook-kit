/** @vitest-environment jsdom */
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGridDom, renderWorkbookCanvas } from "./canvasTest.js";

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Table inspector", () => {
  it("lines up checkboxes beside their labels in Time and Totals groups", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true, shell: true });
    await act(async () => {
      session.setSelection({ kind: "table", tableId: "tbl-lines" });
    });
    const yearRow = screen.getByLabelText("Year columns").closest(".wk-check-row");
    const totalRow = screen.getByLabelText("Total row").closest(".wk-check-row");
    expect(yearRow).toBeTruthy();
    expect(totalRow).toBeTruthy();
    expect(yearRow!.classList.contains("wk-check-row")).toBe(true);
    expect(totalRow!.classList.contains("wk-check-row")).toBe(true);
    expect(yearRow!.querySelector('input[type="checkbox"]')?.nextElementSibling?.tagName).toBe("SPAN");
    expect(document.querySelector(".wk-inspector-card")).toBeTruthy();
    expect(screen.getByText("Time")).toBeTruthy();
    expect(screen.getByText("Totals")).toBeTruthy();
  });
});
