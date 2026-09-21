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

describe("cell style UI", () => {
  it("toggles bold italic and strikethrough from shortcuts", async () => {
    const { session } = await renderPlaygroundCanvas();
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-vat",
        columnId: "Value",
      });
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: "b", ctrlKey: true });
      fireEvent.keyDown(window, { key: "i", ctrlKey: true });
      fireEvent.keyDown(window, { key: "5", ctrlKey: true });
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style).toEqual({
      bold: true,
      italic: true,
      strikethrough: true,
    });
  });

  it("does not steal shortcuts while the formula bar is focused", async () => {
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
      bar.focus();
      fireEvent.keyDown(bar, { key: "b", ctrlKey: true });
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style).toBeUndefined();
  });

  it("toggles bold from the inspector and keeps a scenario overlay", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      session.activateScenario("scn-vaekst");
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-aarsalg",
        columnId: "Value",
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Bold"));
    });
    expect(screen.getByLabelText("Bold").tagName).toBe("BUTTON");
    expect(screen.getByLabelText("Bold").querySelector("svg")).not.toBeNull();
    expect(screen.getByLabelText("Italic").querySelector("svg")).not.toBeNull();
    expect(screen.getByLabelText("Strikethrough").querySelector("svg")).not.toBeNull();
    expect(screen.getByLabelText("Text color").tagName).toBe("BUTTON");
    expect(screen.getByLabelText("Fill color").tagName).toBe("BUTTON");
    expect(screen.getByLabelText("Clear formatting").tagName).toBe("BUTTON");
    expect(screen.getByLabelText("Font size")).toHaveProperty("type", "number");
    expect(screen.getByLabelText("Increase font size").tagName).toBe("BUTTON");
    expect(screen.getByLabelText("Decrease font size").tagName).toBe("BUTTON");
    expect(session.getSnapshot().tables[0]!.rows[0]!.cells.Value!.style).toEqual({ bold: true });
    expect(session.getCell("Params", "Årssalg", "Value").overlay).toBe(true);
  });
});
