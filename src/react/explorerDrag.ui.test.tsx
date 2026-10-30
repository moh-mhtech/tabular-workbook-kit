/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGridDom, renderWorkbookCanvas } from "./canvasTest.js";
import { EXPLORER_SHEET_DRAG, EXPLORER_TABLE_DRAG } from "./explorerDrag.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function dragData(kind: "table", id: string): { dataTransfer: DataTransfer };
function dragData(kind: "sheet", id: string): { dataTransfer: DataTransfer };
function dragData(kind: "table" | "sheet", id: string) {
  return {
    dataTransfer: {
      dropEffect: "none",
      effectAllowed: "none",
      types: [] as string[],
      files: [] as File[],
      items: [] as DataTransferItem[],
      getData(type: string) {
        if (kind === "table" && type === EXPLORER_TABLE_DRAG) return id;
        if (kind === "sheet" && type === EXPLORER_SHEET_DRAG) return id;
        return "";
      },
      setData: vi.fn(),
      clearData: vi.fn(),
      setDragImage: vi.fn(),
    },
  };
}

describe("Explorer drag and drop", () => {
  it("shows a drop marker while dragging over a table", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      session.addTable("sheet-assumptions", { name: "Notes", yearColumns: false });
    });
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    const notesButton = within(nav).getByRole("button", { name: "Notes" });
    const linesButton = within(nav).getByRole("button", { name: "Lines" });
    await act(async () => {
      fireEvent.dragStart(linesButton, dragData("table", "tbl-lines"));
      fireEvent.dragOver(notesButton, dragData("table", "tbl-lines"));
    });
    expect(document.querySelector('.wk-explorer-drop-marker[data-active="true"]')).toBeTruthy();
    expect(document.body.classList.contains("wk-explorer-dragging")).toBe(true);
  });

  it("moves a table before another table when dropped on it", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    let notesTable!: { id: string };
    await act(async () => {
      notesTable = session.addTable("sheet-assumptions", { name: "Notes", yearColumns: false });
    });
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    const notesButton = within(nav).getByRole("button", { name: "Notes" });
    await act(async () => {
      fireEvent.drop(notesButton, dragData("table", "tbl-lines"));
    });
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")!.tableIds).toEqual([
      notesTable.id,
      "tbl-lines",
    ]);
  });

  it("moves a table to the end of a sheet when dropped on the append target", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    let notesTable!: { id: string };
    await act(async () => {
      notesTable = session.addTable("sheet-assumptions", { name: "Notes", yearColumns: false });
    });
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    const assumptionsButton = within(nav).getByRole("button", { name: "Assumptions" });
    await act(async () => {
      fireEvent.click(assumptionsButton);
    });
    const linesButton = within(nav).getByRole("button", { name: "Lines" });
    const appendTarget = assumptionsButton.closest(".wk-explorer-group")?.querySelector(".wk-explorer-table-append-marker");
    expect(appendTarget).toBeTruthy();
    await act(async () => {
      fireEvent.dragStart(linesButton, dragData("table", "tbl-lines"));
      fireEvent.dragOver(appendTarget!, dragData("table", "tbl-lines"));
    });
    expect(document.querySelector('.wk-explorer-drop-marker[data-active="true"]')).toBeTruthy();
    await act(async () => {
      fireEvent.drop(appendTarget!, dragData("table", "tbl-lines"));
    });
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")!.tableIds).toEqual([
      notesTable.id,
      "tbl-lines",
    ]);
  });

  it("moves a sheet after the last sheet when dropped on the trailing target", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    const assumptionsButton = within(nav).getByRole("button", { name: "Assumptions" });
    const trailingTarget = nav.querySelector(".wk-explorer-sheet-append-target");
    expect(trailingTarget).toBeTruthy();
    await act(async () => {
      fireEvent.dragStart(assumptionsButton, dragData("sheet", "sheet-assumptions"));
      fireEvent.dragOver(trailingTarget!, dragData("sheet", "sheet-assumptions"));
    });
    expect(document.querySelector('.wk-explorer-drop-marker[data-active="true"]')).toBeTruthy();
    await act(async () => {
      fireEvent.drop(trailingTarget!, dragData("sheet", "sheet-assumptions"));
    });
    expect(session.getSnapshot().sheets.map((sheet) => sheet.id)).toEqual([
      "sheet-params",
      "sheet-capacity",
      "sheet-res",
      "sheet-assumptions",
    ]);
  });
});
