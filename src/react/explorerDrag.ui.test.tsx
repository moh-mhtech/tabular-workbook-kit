/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGridDom, renderWorkbookCanvas } from "./canvasTest.js";
import { EXPLORER_TABLE_DRAG } from "./explorerDrag.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function dragData(tableId: string) {
  return {
    dataTransfer: {
      dropEffect: "none",
      effectAllowed: "none",
      types: [] as string[],
      files: [] as File[],
      items: [] as DataTransferItem[],
      getData(type: string) {
        return type === EXPLORER_TABLE_DRAG ? tableId : "";
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
      fireEvent.dragStart(linesButton, dragData("tbl-lines"));
      fireEvent.dragOver(notesButton, dragData("tbl-lines"));
    });
    expect(document.querySelector('.wk-explorer-drop-marker[data-active="true"]')).toBeTruthy();
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
      fireEvent.drop(notesButton, dragData("tbl-lines"));
    });
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")!.tableIds).toEqual([
      notesTable.id,
      "tbl-lines",
    ]);
  });
});
