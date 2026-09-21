/** Shared jsdom harness for CustomSheetCanvas + HyperFormula UI tests. */
import { act, fireEvent, render, waitFor, type ReactNode } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, vi } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { fitProjectedColumnWidths, fitProjectedRowHeights } from "../grid/columnFit.js";
import { projectTable, selectionForProjectedCell } from "../grid/sheetProjection.js";
import { layoutWorkbook } from "../model/layout.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import type { WorkbookSnapshot } from "../model/types.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { Explorer, FormulaEditPlacementSwitch, ScenarioBar, TimeGrainSwitch } from "./components.js";
import { CustomSheetCanvas, evaluatedCells } from "./CustomSheetCanvas.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { WorkbookProvider, type FormulaEditPlacement } from "./WorkbookProvider.js";

function boxSize(element: HTMLElement, axis: "width" | "height"): number {
  const styled = Number.parseFloat(axis === "width" ? element.style.width : element.style.height);
  if (Number.isFinite(styled) && styled > 0) return styled;
  const rect = element.getBoundingClientRect();
  return axis === "width" ? rect.width : rect.height;
}

export function installGridDom() {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return boxSize(this, "width");
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return boxSize(this, "height");
    },
  });
  HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
    return new Proxy(
      { canvas: this },
      {
        get(target, prop) {
          if (prop in target) return target[prop as keyof typeof target];
          if (prop === "measureText") return () => ({ width: 0 });
          if (prop === "getImageData") return () => ({ data: [] });
          return vi.fn();
        },
      },
    );
  }) as never;
}

export async function renderPlaygroundCanvas(
  options: {
    snapshot?: WorkbookSnapshot;
    extra?: ReactNode;
    chrome?: boolean;
    formulaEditPlacement?: FormulaEditPlacement;
  } = {},
) {
  const session = new WorkbookSession(
    options.snapshot ?? createPlaygroundWorkbook(),
    new HyperFormulaEngine(),
  );
  await session.recalculate();
  await act(async () => {
    render(
      <WorkbookProvider session={session} formulaEditPlacement={options.formulaEditPlacement}>
        <div className="wk-shell">
          {options.chrome ? (
            <>
              <Explorer />
              <ScenarioBar />
              <TimeGrainSwitch />
              <FormulaEditPlacementSwitch />
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

function projectedCellPointer(session: WorkbookSession, tableId: string, col: number, row: number) {
  const host = document.querySelector(`[data-table-id="${tableId}"] .wk-table-spreadsheet`);
  expect(host).toBeInstanceOf(HTMLElement);
  const sheet = host as HTMLElement;
  const snapshot = session.getSnapshot();
  const layout = layoutWorkbook(snapshot);
  const projection = projectTable(layout, tableId)!;
  const widths = fitProjectedColumnWidths(projection, layout, evaluatedCells(session, snapshot)).map(
    (column) => column.width,
  );
  const heights = fitProjectedRowHeights(projection, layout);
  const width = widths.reduce((sum, value) => sum + value, 0);
  const height = heights.reduce((sum, value) => sum + value, 0);
  vi.spyOn(sheet, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width,
    height,
    right: width,
    bottom: height,
    toJSON() {
      return {};
    },
  } as DOMRect);
  let x = 0;
  for (let i = 0; i < col; i++) x += widths[i]!;
  let y = 0;
  for (let i = 0; i < row; i++) y += heights[i]!;
  let surface = sheet.querySelector<HTMLCanvasElement>("[data-testid='data-grid-canvas']") ?? sheet.querySelector("canvas");
  if (!surface) {
    surface = document.createElement("canvas");
    sheet.appendChild(surface);
  }
  return {
    surface,
    clientX: x + (widths[col] ?? 0) / 2,
    clientY: y + (heights[row] ?? 0) / 2,
  };
}

function dispatchGridPointer(element: Element, type: "pointerdown" | "pointermove", clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperties(event, {
    clientX: { get: () => clientX },
    clientY: { get: () => clientY },
    buttons: { get: () => 1 },
    pointerId: { get: () => 1 },
    pointerType: { get: () => "mouse" },
  });
  element.dispatchEvent(event);
}

/** Glide canvas stopPropagation: the host only sees this click in the capture phase. */
async function pointerOnProjectedCell(
  session: WorkbookSession,
  tableId: string,
  col: number,
  row: number,
  type: "pointerdown" | "pointermove",
) {
  const { surface, clientX, clientY } = projectedCellPointer(session, tableId, col, row);
  const stop = (event: Event) => event.stopPropagation();
  surface.addEventListener("pointerdown", stop);
  surface.addEventListener("pointermove", stop);
  try {
    await act(async () => {
      dispatchGridPointer(surface, type, clientX, clientY);
    });
  } finally {
    surface.removeEventListener("pointerdown", stop);
    surface.removeEventListener("pointermove", stop);
  }
}

export async function typeEqualsOnProjectedCell(
  session: WorkbookSession,
  tableId: string,
  col: number,
  row: number,
) {
  await selectProjectedCell(session, tableId, col, row);
  const canvas = document.querySelector<HTMLCanvasElement>(
    `[data-table-id="${tableId}"] [data-testid="data-grid-canvas"]`,
  );
  expect(canvas, "grid canvas").toBeTruthy();
  projectedCellPointer(session, tableId, col, row);
  const width = 800;
  const height = 400;
  vi.spyOn(canvas!, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width,
    height,
    right: width,
    bottom: height,
    toJSON() {
      return {};
    },
  } as DOMRect);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    canvas!.focus();
    fireEvent.keyDown(canvas!, { key: "=", bubbles: true, cancelable: true });
  });
  await waitFor(() => {
    expect(
      document.querySelector(".wk-overlay-editor"),
      "typing = on a cell must open the in-cell editor",
    ).toBeTruthy();
  });
}

export async function clickProjectedCell(session: WorkbookSession, tableId: string, col: number, row: number) {
  await pointerOnProjectedCell(session, tableId, col, row, "pointerdown");
}

export async function dragProjectedCell(session: WorkbookSession, tableId: string, col: number, row: number) {
  await pointerOnProjectedCell(session, tableId, col, row, "pointermove");
}

export async function blurFormulaBar() {
  const bar = formulaBar();
  if (!bar) return;
  await act(async () => {
    fireEvent.blur(bar);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export function formulaTextField() {
  return document.querySelector<HTMLTextAreaElement>(".wk-overlay-editor") ?? formulaBar();
}

export async function clickFormulaText(caretAt: number) {
  const field = formulaTextField();
  expect(field, "Formula text field").toBeTruthy();
  await act(async () => {
    fireEvent.pointerDown(field!);
    field!.focus();
    fireEvent.mouseDown(field!);
    fireEvent.mouseUp(field!);
    fireEvent.click(field!);
  });
  expect(document.body.contains(field), "click must not unmount Formula text").toBe(true);
  expect(document.activeElement, "click must focus Formula text").toBe(field);
  field!.setSelectionRange(caretAt, caretAt);
  fireEvent.select(field!);
  expect(field!.selectionStart).toBe(caretAt);
  expect(field!.selectionEnd).toBe(caretAt);
  return field!;
}

export async function pressCaretKey(key: "ArrowLeft" | "ArrowRight") {
  const field = document.activeElement;
  expect(field, "Formula text must be focused").toBeInstanceOf(HTMLTextAreaElement);
  const input = field as HTMLTextAreaElement;
  const draft = input.value;
  const from = input.selectionStart ?? 0;
  expect(input.selectionEnd, "Caret must be a collapsed insertion point").toBe(from);
  const expected = key === "ArrowLeft" ? Math.max(0, from - 1) : Math.min(draft.length, from + 1);
  expect(from, `${key} would not move the Caret from this position`).not.toBe(expected);
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await user.keyboard(key === "ArrowLeft" ? "{ArrowLeft}" : "{ArrowRight}");
  expect(document.activeElement, "Formula text must keep focus").toBe(input);
  expect(input.value, `${key} must not replace Formula text`).toBe(draft);
  expect(input.selectionStart, `${key} must move the Caret`).toBe(expected);
  expect(input.selectionEnd).toBe(expected);
}
