/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIDE_REVEAL_TAB_WIDTH } from "../model/sidePanelPin.js";
import { installGridDom, renderWorkbookCanvas } from "./canvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("side panel pin", () => {
  it("unpins Navigation so the sheet keeps full width until the edge is hovered", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true, shell: true });
    const shell = document.querySelector(".wk-shell")!;
    expect(shell.classList.contains("is-explorer-autohide")).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unpin Navigation" }));
    });
    expect(session.isExplorerPinned()).toBe(false);
    expect(shell.classList.contains("is-explorer-autohide")).toBe(true);
    const workspace = document.querySelector(".wk-shell-workspace")!;
    expect(getComputedStyle(workspace).gridTemplateColumns.split(" ")[0]).toBe(`${SIDE_REVEAL_TAB_WIDTH}px`);

    expect(screen.getByRole("button", { name: "Show Navigation" })).toBeTruthy();
    await act(async () => {
      fireEvent.mouseEnter(screen.getByRole("button", { name: "Show Navigation" }));
    });
    expect(shell.classList.contains("is-explorer-reveal")).toBe(true);
    expect(screen.getByRole("navigation", { name: "Sheets" })).toBeTruthy();
  });

  it("unpins Properties so the sheet widens and Properties opens on hover", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true, shell: true });
    const shell = document.querySelector(".wk-shell")!;
    const workspace = document.querySelector(".wk-shell-workspace")!;
    const columns = () => getComputedStyle(workspace).gridTemplateColumns.split(" ");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unpin Properties" }));
    });
    expect(session.isPropertiesPinned()).toBe(false);
    expect(shell.classList.contains("is-properties-autohide")).toBe(true);
    expect(columns().at(-1)).toBe(`${SIDE_REVEAL_TAB_WIDTH}px`);

    expect(screen.getByRole("button", { name: "Show Properties" })).toBeTruthy();
    await act(async () => {
      fireEvent.mouseEnter(screen.getByRole("button", { name: "Show Properties" }));
    });
    expect(shell.classList.contains("is-properties-reveal")).toBe(true);
    expect(screen.getByRole("complementary", { name: "Properties" })).toBeTruthy();
  });

  it("keeps the revealed Properties panel beside the edge tab, not under it", async () => {
    await renderWorkbookCanvas({ chrome: true, shell: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unpin Properties" }));
    });
    await act(async () => {
      fireEvent.mouseEnter(screen.getByRole("button", { name: "Show Properties" }));
    });
    const workspace = document.querySelector(".wk-shell-workspace")!;
    const host = document.querySelector(".wk-side-panel-host-properties") as HTMLElement;
    const tab = screen.getByRole("button", { name: "Show Properties" });
    const hostBox = host.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    expect(hostBox.right).toBeLessThanOrEqual(tabBox.left + 1);
    expect(getComputedStyle(workspace).gridTemplateColumns.split(" ").at(-1)).toBe(
      `${SIDE_REVEAL_TAB_WIDTH + 260}px`,
    );
  });
});
