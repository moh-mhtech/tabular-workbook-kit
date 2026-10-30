/** @vitest-environment jsdom */
import { useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { CustomSheetCanvas } from "./CustomSheetCanvas.js";
import { installGridDom, selectProjectedCell } from "./canvasTest.js";
import { WorkbookProvider, useWorkbook } from "./WorkbookProvider.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function ActivateSheet({ sheetId }: { sheetId: string }) {
  const { setActiveSheetId } = useWorkbook();
  useLayoutEffect(() => {
    setActiveSheetId(sheetId);
  }, [setActiveSheetId, sheetId]);
  return null;
}

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function gridCanvas(tableId: string) {
  const canvas = document.querySelector<HTMLCanvasElement>(
    `[data-table-id="${tableId}"] [data-testid="data-grid-canvas"]`,
  );
  expect(canvas, `grid canvas for ${tableId}`).toBeTruthy();
  return canvas!;
}

async function typeOnGrid(tableId: string, key: string) {
  const canvas = gridCanvas(tableId);
  await act(async () => {
    canvas.focus();
    fireEvent.keyDown(canvas, { key, bubbles: true, cancelable: true });
  });
  await waitFor(() => {
    expect(screen.getByLabelText("Cell editor")).toBeTruthy();
  });
}

async function commitEditor(key: "Enter" | "Tab" = "Enter") {
  await act(async () => {
    fireEvent.keyDown(screen.getByLabelText("Cell editor"), { key });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function burstTypeEnter(
  tableId: string,
  values: readonly string[],
  delayMs: number,
) {
  for (const value of values) {
    if (delayMs > 0) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      });
    }
    await typeOnGrid(tableId, value);
    await commitEditor("Enter");
  }
}

async function renderNewEntryTable() {
  const seed = new WorkbookSession(createSampleWorkbook(), new HyperFormulaEngine());
  const table = seed.addTable("sheet-assumptions", { name: "Entry" });
  await seed.recalculate();
  const session = new WorkbookSession(seed.getSnapshot(), new HyperFormulaEngine());
  await session.recalculate();
  await act(async () => {
    render(
      <WorkbookProvider session={session}>
        <ActivateSheet sheetId="sheet-assumptions" />
        <CustomSheetCanvas />
      </WorkbookProvider>,
    );
  });
  await waitFor(() => {
    expect(document.querySelector(`[data-table-id="${table.id}"]`)).toBeTruthy();
  });
  return { session, tableId: table.id };
}

describe("fast type Enter entry", () => {
  it("commits 1 Enter 2 Enter 3 Enter on a new table without delay", async () => {
    const { session, tableId } = await renderNewEntryTable();
    await selectProjectedCell(session, tableId, 1, 1);
    await burstTypeEnter(tableId, ["1", "2", "3"], 0);

    const live = session.getSnapshot().tables.find((t) => t.id === tableId)!;
    const colId = live.attributeColumns[0]!.id;
    expect(live.rows.map((row) => row.cells[colId]?.value)).toEqual([1, 2, 3]);
  });

  it("commits 1 Enter 2 Enter 3 Enter with ~100ms between steps", async () => {
    const { session, tableId } = await renderNewEntryTable();
    await selectProjectedCell(session, tableId, 1, 1);
    await burstTypeEnter(tableId, ["1", "2", "3"], 100);

    const live = session.getSnapshot().tables.find((t) => t.id === tableId)!;
    const colId = live.attributeColumns[0]!.id;
    expect(live.rows.map((row) => row.cells[colId]?.value)).toEqual([1, 2, 3]);
  });
});
