/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGridDom, renderWorkbookCanvas } from "./canvasTest.js";
import {
  createExplorerDataTransfer,
  dragPointerAt,
  layoutExplorerForDragTests,
  performExplorerDragDrop,
} from "./explorerDragHarness.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Explorer drag and drop", () => {
  it("starts drag from a draggable sheet control (not a nested label inside a button)", async () => {
    await renderWorkbookCanvas({ chrome: true });
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    const capacity = within(nav).getByRole("button", { name: "Capacity" });
    expect(capacity.getAttribute("draggable")).toBe("true");
    expect(capacity.tagName).toBe("DIV");
    expect(capacity.querySelector("button")).toBeNull();

    const transfer = createExplorerDataTransfer();
    await act(async () => {
      fireEvent.dragStart(capacity, transfer.asPayload());
    });
    expect(document.body.classList.contains("wk-explorer-dragging")).toBe(true);
  });

  it("shows a drop marker after dragOver before drop", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      session.addTable("sheet-assumptions", { name: "Notes", yearColumns: false });
    });
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    const notesButton = within(nav).getByRole("button", { name: "Notes" });
    const linesButton = within(nav).getByRole("button", { name: "Lines" });
    const transfer = createExplorerDataTransfer();
    await act(async () => {
      fireEvent.dragStart(linesButton, transfer.asPayload());
    });
    layoutExplorerForDragTests(nav);
    await act(async () => {
      fireEvent.dragOver(notesButton, dragPointerAt(notesButton, transfer));
    });

    expect(document.querySelector('.wk-explorer-drop-marker[data-active="true"]')).toBeTruthy();
    expect(document.body.classList.contains("wk-explorer-dragging")).toBe(true);
  });

  it("shows a sheet drop marker when dragging over another sheet's tables", async () => {
    await renderWorkbookCanvas({ chrome: true });
    const navigation = screen.getByRole("navigation", { name: "Sheets" });
    const assumptionsButton = within(navigation).getByRole("button", { name: "Assumptions" });
    const paramsTable = within(navigation).getByRole("button", { name: "Params" });
    const transfer = createExplorerDataTransfer();
    await act(async () => {
      fireEvent.dragStart(assumptionsButton, transfer.asPayload());
    });
    layoutExplorerForDragTests(navigation);
    await act(async () => {
      fireEvent.dragOver(paramsTable, dragPointerAt(paramsTable, transfer));
    });
    expect(document.querySelector('.wk-explorer-drop-marker[data-active="true"]')).toBeTruthy();
  });

  it("moves a sheet when dropped on another sheet name", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    await performExplorerDragDrop({
      source: within(nav).getByRole("button", { name: "Capacity" }),
      over: within(nav).getByRole("button", { name: "Assumptions" }),
      payload: { kind: "sheet", id: "sheet-capacity" },
    });
    expect(session.getSnapshot().sheets.map((sheet) => sheet.id)).toEqual([
      "sheet-params",
      "sheet-capacity",
      "sheet-assumptions",
      "sheet-res",
    ]);
  });

  it("moves a sheet when dropped on another sheet's table list", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    await performExplorerDragDrop({
      source: within(nav).getByRole("button", { name: "Capacity" }),
      over: within(nav).getByRole("button", { name: "Params" }),
      payload: { kind: "sheet", id: "sheet-capacity" },
    });
    expect(session.getSnapshot().sheets.map((sheet) => sheet.id)).toEqual([
      "sheet-capacity",
      "sheet-params",
      "sheet-assumptions",
      "sheet-res",
    ]);
  });

  it("moves a sheet after dragEnd when the browser clears drag data early", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    const capacityButton = within(nav).getByRole("button", { name: "Capacity" });
    const assumptionsButton = within(nav).getByRole("button", { name: "Assumptions" });
    const transfer = createExplorerDataTransfer();
    await act(async () => {
      fireEvent.dragStart(capacityButton, transfer.asPayload());
    });
    layoutExplorerForDragTests(nav);
    await act(async () => {
      fireEvent.dragOver(assumptionsButton, dragPointerAt(assumptionsButton, transfer));
      fireEvent.dragEnd(nav);
      fireEvent.drop(assumptionsButton, transfer.asEmptyDrop());
    });
    expect(session.getSnapshot().sheets.map((sheet) => sheet.id)).toEqual([
      "sheet-params",
      "sheet-capacity",
      "sheet-assumptions",
      "sheet-res",
    ]);
  });

  it("moves a table before another table when dropped between rows", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    await act(async () => {
      session.addTable("sheet-assumptions", { name: "Notes", yearColumns: false });
    });
    const notesId = session.getSnapshot().tables.find((t) => t.name === "Notes")!.id;
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    await performExplorerDragDrop({
      source: within(nav).getByRole("button", { name: "Lines" }),
      over: within(nav).getByRole("button", { name: "Notes" }),
      payload: { kind: "table", id: "tbl-lines" },
      pointerFractionY: 0.2,
    });
    expect(session.getSnapshot().sheets.find((sheet) => sheet.id === "sheet-assumptions")!.tableIds).toEqual([
      notesId,
      "tbl-lines",
    ]);
  });

  it("moves a sheet after the last sheet when dropped on the trailing target", async () => {
    const { session } = await renderWorkbookCanvas({ chrome: true });
    const nav = screen.getByRole("navigation", { name: "Sheets" });
    const assumptionsButton = within(nav).getByRole("button", { name: "Assumptions" });
    const trailingTarget = nav.querySelector(".wk-explorer-sheet-append-target");
    expect(trailingTarget).toBeTruthy();

    await performExplorerDragDrop({
      source: assumptionsButton,
      over: trailingTarget as HTMLElement,
      payload: { kind: "sheet", id: "sheet-assumptions" },
    });

    expect(session.getSnapshot().sheets.map((sheet) => sheet.id)).toEqual([
      "sheet-params",
      "sheet-capacity",
      "sheet-res",
      "sheet-assumptions",
    ]);
  });
});
