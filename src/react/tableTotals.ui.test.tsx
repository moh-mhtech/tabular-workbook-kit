/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installGridDom, renderWorkbookCanvas } from "./canvasTest.js";

describe("Table totals", () => {
  beforeEach(() => installGridDom());
  afterEach(() => cleanup());
  it("shows Total row values on the canvas and in Properties", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lines" }));
      session.setSelection({ kind: "table", tableId: "tbl-lines" });
    });
    expect((screen.getByRole("checkbox", { name: /Total row/i }) as HTMLInputElement).checked).toBe(true);
    const total = session.getCell("Lines", "Total", "2025-01").computed;
    expect(typeof total).toBe("number");
    expect(total).toBeGreaterThan(0);
  });
});
