/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formulaBar, installGridDom, renderPlaygroundCanvas } from "./playgroundCanvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("formula suggestion UI", () => {
  it("suggests SUM and inserts it with Tab without committing the cell", async () => {
    const { session } = await renderPlaygroundCanvas();
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vat",
        columnId: "Value",
      });
    });
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=Su" } });
    });
    expect(screen.getByRole("option", { name: /SUM/ }).textContent).toContain("SUM");
    await act(async () => {
      fireEvent.keyDown(bar, { key: "Tab" });
    });
    expect(bar.value).toBe("=SUM(");
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value).toEqual({ kind: "input", value: 0.25 });
  });

  it("closes the list on Escape and cancels the edit on a second Escape", async () => {
    const { session } = await renderPlaygroundCanvas();
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vat",
        columnId: "Value",
      });
    });
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=Su" } });
    });
    await act(async () => {
      fireEvent.keyDown(bar, { key: "Escape" });
    });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(session.formulaEdit?.draft).toBe("=Su");
    await act(async () => {
      fireEvent.keyDown(bar, { key: "Escape" });
    });
    expect(session.formulaEdit).toBeNull();
  });
});
