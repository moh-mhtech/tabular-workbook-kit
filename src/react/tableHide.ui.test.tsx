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

describe("Table hidden", () => {
  it("hides a table from the canvas chrome and stores hidden on the Table", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
      fireEvent.click(screen.getByRole("button", { name: "Lines" }));
    });
    const table = session.getSnapshot().tables.find((item) => item.name === "Lines")!;
    const card = document.querySelector(`[data-table-id="${table.id}"]`) as HTMLElement;

    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: "Hide Lines" }));
    });
    expect(session.getSnapshot().tables.find((item) => item.id === table.id)!.hidden).toBe(true);
    await waitFor(() => {
      expect(document.querySelector(`[data-table-id="${table.id}"] .wk-table-spreadsheet`)).toBeNull();
    });
    expect(within(card).queryByRole("button", { name: "Hide Lines" })).toBeNull();
    expect(within(card).getByRole("button", { name: "Show Lines" })).toBeTruthy();
  });

  it("animates the table grid closed and open when toggling hidden", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
      fireEvent.click(screen.getByRole("button", { name: "Lines" }));
    });
    const table = session.getSnapshot().tables.find((item) => item.name === "Lines")!;
    const card = document.querySelector(`[data-table-id="${table.id}"]`) as HTMLElement;
    const wrap = () => card.querySelector("[data-table-grid-wrap]");

    expect(wrap()?.getAttribute("data-expanded")).toBe("true");

    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: "Hide Lines" }));
    });
    expect(card.classList.contains("is-table-hidden")).toBe(false);
    await waitFor(
      () => {
        expect(document.querySelector(`[data-table-id="${table.id}"] .wk-table-spreadsheet`)).toBeNull();
      },
      { timeout: 800 },
    );
    expect(wrap()).toBeNull();
    expect(card.classList.contains("is-table-hidden")).toBe(true);

    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: "Show Lines" }));
    });
    await waitFor(() => {
      expect(wrap()?.getAttribute("data-expanded")).toBe("true");
    });
    expect(document.querySelector(`[data-table-id="${table.id}"] .wk-table-spreadsheet`)).toBeTruthy();
  });

  it("temporarily shows a hidden table while a Cell is selected, then collapses again", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    const table = session.getSnapshot().tables.find((item) => item.name === "Lines")!;
    const card = () => document.querySelector(`[data-table-id="${table.id}"]`) as HTMLElement;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    });
    await act(async () => {
      fireEvent.click(within(card()).getByRole("button", { name: "Hide Lines" }));
    });
    expect(session.getSnapshot().tables.find((item) => item.id === table.id)!.hidden).toBe(true);
    await waitFor(
      () => {
        expect(document.querySelector(`[data-table-id="${table.id}"] .wk-table-spreadsheet`)).toBeNull();
      },
      { timeout: 800 },
    );

    const nav = screen.getByRole("navigation", { name: "Sheets" });
    await act(async () => {
      fireEvent.click(within(nav).getByRole("button", { name: "Lines" }));
    });
    await waitFor(() => {
      expect(document.querySelector(`[data-table-id="${table.id}"] .wk-table-spreadsheet`)).toBeTruthy();
    });
    expect(session.getSnapshot().tables.find((item) => item.id === table.id)!.hidden).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole("main", { name: "Assumptions tables" }));
    });
    await waitFor(() => {
      expect(document.querySelector(`[data-table-id="${table.id}"] .wk-table-spreadsheet`)).toBeNull();
    });
    expect(session.getSnapshot().tables.find((item) => item.id === table.id)!.hidden).toBe(true);
  });
});
