/** Shared jsdom harness for CustomSheetCanvas + HyperFormula UI tests. */
import { act, fireEvent, render, type ReactNode } from "@testing-library/react";
import { expect, vi } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { projectTable, selectionForProjectedCell } from "../grid/sheetProjection.js";
import { layoutWorkbook } from "../model/layout.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import type { WorkbookSnapshot } from "../model/types.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { Explorer, ScenarioBar, TimeGrainSwitch } from "./components.js";
import { CustomSheetCanvas } from "./CustomSheetCanvas.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { WorkbookProvider } from "./WorkbookProvider.js";

export function installGridDom() {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: [] })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => []),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  })) as never;
}

export async function renderPlaygroundCanvas(
  options: {
    snapshot?: WorkbookSnapshot;
    extra?: ReactNode;
    chrome?: boolean;
  } = {},
) {
  const session = new WorkbookSession(
    options.snapshot ?? createPlaygroundWorkbook(),
    new HyperFormulaEngine(),
  );
  await session.recalculate();
  await act(async () => {
    render(
      <WorkbookProvider session={session}>
        <div className="wk-shell">
          {options.chrome ? (
            <>
              <Explorer />
              <ScenarioBar />
              <TimeGrainSwitch />
            </>
          ) : null}
          <CustomSheetCanvas />
          <PropertiesPanel />
          {options.extra}
        </div>
      </WorkbookProvider>,
    );
  });
  return { session };
}

export async function selectProjectedCell(session: WorkbookSession, tableId: string, col: number, row: number) {
  const layout = layoutWorkbook(session.getSnapshot());
  const projection = projectTable(layout, tableId)!;
  await act(async () => {
    session.setGridFocus({ tableId, col, row });
    session.setSelection(selectionForProjectedCell(projection, layout, col, row));
  });
}

export async function pressTableKey(
  tableId: string,
  key: string,
  mods: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {},
) {
  const host = document.querySelector(`[data-table-id="${tableId}"] .wk-table-spreadsheet`);
  expect(host).toBeTruthy();
  await act(async () => {
    fireEvent.keyDown(host!, { key, ...mods });
  });
}

export function trackFocus(session: WorkbookSession) {
  let current = session.gridFocus;
  session.subscribe(() => {
    if (session.gridFocus) current = session.gridFocus;
  });
  return {
    expectAt(tableId: string, col: number, row: number) {
      expect(current).toEqual({ tableId, col, row });
    },
    get current() {
      return current;
    },
  };
}

export function formulaBar() {
  return document.querySelector(".wk-formula-bar textarea") as HTMLTextAreaElement | null;
}
