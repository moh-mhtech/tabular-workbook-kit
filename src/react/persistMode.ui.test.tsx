/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersistModeSelect } from "../../../../apps/playground/src/PersistModeSelect.tsx";
import { installGridDom, renderPlaygroundCanvas } from "./playgroundCanvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Persist dropdown", () => {
  it("switches persist implementation from the header", async () => {
    const assigned: string[] = [];
    await renderPlaygroundCanvas({
      chrome: true,
      extra: <PersistModeSelect search="?persist=node" onAssign={(mode) => assigned.push(mode)} />,
    });
    const select = screen.getByRole("combobox", { name: "Persist" });
    expect((select as HTMLSelectElement).value).toBe("node");
    expect(screen.getByRole("option", { name: "IndexedDB" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "PGlite" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Node" })).toBeTruthy();
    await act(async () => {
      fireEvent.change(select, { target: { value: "pglite" } });
    });
    expect(assigned).toEqual(["pglite"]);
  });
});
