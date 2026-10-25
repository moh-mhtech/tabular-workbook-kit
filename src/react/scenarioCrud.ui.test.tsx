/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { overlayKey } from "../model/types.js";
import { installGridDom, renderPlaygroundCanvas } from "./playgroundCanvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("scenario CRUD", () => {
  it("adds, renames, duplicates, and deletes from the scenario bar", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scenario options" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Add" }));
    });
    const added = session.getSnapshot().scenarios.find((scenario) => scenario.name === "Scenario")!;
    expect(added.overlays).toEqual({});
    await act(async () => {
      session.activateScenario(added.id);
    });
    vi.spyOn(window, "prompt").mockReturnValue("Fast");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scenario options" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    });
    expect(session.getSnapshot().scenarios.some((scenario) => scenario.name === "Fast")).toBe(true);
    await act(async () => {
      session.setInput("Params", "Vat", "Value", 0.4);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scenario options" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    });
    const copy = session.getSnapshot().scenarios.find((scenario) => scenario.name === "Fast2")!;
    expect(copy.overlays).toEqual({ [overlayKey("tbl-params", "row-vat", "Value")]: 0.4 });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.cells.Value).toEqual({
      kind: "input",
      value: 0.25,
    });
    await act(async () => {
      session.activateScenario(copy.id);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scenario options" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    });
    expect(session.getSnapshot().activeScenarioId).toBeNull();
    expect(session.getSnapshot().scenarios.some((scenario) => scenario.id === copy.id)).toBe(false);
  });

  it("rejects a rename collision and does not delete Base", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scenario options" }));
    });
    expect((screen.getByRole("menuitem", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      session.activateScenario("scn-growth");
    });
    expect(() => session.renameScenario("scn-growth", "Growth")).not.toThrow();
    let extraId = "";
    await act(async () => {
      extraId = session.addScenario("Copy").id;
    });
    expect(() => session.renameScenario(extraId, "Copy")).not.toThrow();
    expect(() => session.renameScenario(extraId, "Growth")).toThrow(/already used/);
  });

  it("keeps formula edits on Base and overlays only inputs, including undo", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    const formula = session.getSnapshot().tables.find((table) => table.id === "tbl-sales")!.rows[0]!.cells["2025-01"]!.formula;
    const selection = { kind: "sheet" as const, sheetId: "sheet-forud" };
    await act(async () => {
      session.setSelection(selection);
      session.activateScenario("scn-growth");
    });
    expect(session.selection).toEqual(selection);
    await act(async () => {
      session.setInput("Params", "Vat", "Value", 0.5);
    });
    expect(session.getCell("Params", "Vat", "Value").overlay).toBe(true);
    await act(async () => {
      session.writeCell("Sales", "CNC", "2025-01", "=2");
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-sales")!.rows[0]!.cells["2025-01"]).toEqual({
      kind: "formula",
      formula: "=2",
    });
    await act(async () => {
      session.undo();
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-sales")!.rows[0]!.cells["2025-01"]!.formula).toBe(
      formula,
    );
    expect(session.getSnapshot().scenarios[0]!.overlays[overlayKey("tbl-params", "row-vat", "Value")]).toBe(0.5);
  });
});
