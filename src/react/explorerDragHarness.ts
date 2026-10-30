/**
 * Browser-like HTML5 drag contract for Explorer tests: one DataTransfer for the
 * whole gesture, setData on dragStart (via writeExplorerDragData), optional empty
 * getData on drop (Chrome), dragOver before drop.
 */
import { act, fireEvent } from "@testing-library/react";
import { EXPLORER_SHEET_DRAG, EXPLORER_TABLE_DRAG, writeExplorerDragData, type ExplorerDragPayload } from "./explorerDrag.js";

export function createExplorerDataTransfer(payload?: ExplorerDragPayload) {
  const store = new Map<string, string>();

  function dataTransferStub(emptyOnDrop = false): DataTransfer {
    return {
      dropEffect: "none",
      effectAllowed: "move",
      types: [...store.keys()],
      files: [] as File[],
      items: [] as DataTransferItem[],
      getData(_type: string) {
        if (emptyOnDrop) return "";
        return store.get(_type) ?? "";
      },
      setData(type: string, value: string) {
        store.set(type, value);
      },
      clearData: () => store.clear(),
      setDragImage: () => {},
    } as DataTransfer;
  }

  if (payload) writeExplorerDragData(dataTransferStub(), payload);

  return {
    asPayload: () => ({ dataTransfer: dataTransferStub() }),
    asEmptyDrop: () => ({ dataTransfer: dataTransferStub(true) }),
    seed(payload: ExplorerDragPayload) {
      store.clear();
      writeExplorerDragData(dataTransferStub(), payload);
    },
  };
}

function stubRect(el: HTMLElement, top: number, bottom: number) {
  const height = bottom - top;
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom,
      left: 0,
      right: 100,
      width: 100,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** jsdom has no layout; assign stable Y positions so closest-slot math matches the spec. */
export function layoutExplorerForDragTests(nav: Element, rowHeight = 24) {
  let sheetY = 0;
  for (const group of nav.querySelectorAll(":scope .wk-explorer-group[data-explorer-sheet-id]")) {
    const tableItems = group.querySelectorAll("li[data-explorer-table-id]");
    const appendPad = tableItems.length > 0 ? rowHeight : 0;
    const groupHeight = rowHeight + tableItems.length * rowHeight + appendPad;
    stubRect(group as HTMLElement, sheetY, sheetY + groupHeight);
    const sheetRow = group.querySelector(".wk-explorer-sheet-row");
    if (sheetRow) stubRect(sheetRow as HTMLElement, sheetY, sheetY + rowHeight);
    let tableY = sheetY + rowHeight;
    for (const li of tableItems) {
      stubRect(li as HTMLElement, tableY, tableY + rowHeight);
      for (const control of li.querySelectorAll<HTMLElement>(".wk-explorer-table, .wk-explorer-group-btn")) {
        stubRect(control, tableY, tableY + rowHeight);
      }
      tableY += rowHeight;
    }
    sheetY += groupHeight;
  }
  const trailing = nav.querySelector(".wk-explorer-sheet-append-target");
  if (trailing) stubRect(trailing as HTMLElement, sheetY, sheetY + rowHeight);
}

export function dragPointerAt(
  element: HTMLElement,
  transfer: ReturnType<typeof createExplorerDataTransfer>,
  fractionY = 0.5,
) {
  const anchor =
    element.closest("li[data-explorer-table-id]") ??
    element.closest(".wk-explorer-sheet-row") ??
    element;
  const rect = anchor.getBoundingClientRect();
  const height = Math.max(rect.height, 1);
  return {
    ...transfer.asPayload(),
    clientY: rect.top + height * fractionY,
    clientX: 50,
  };
}

export type ExplorerDragGesture = {
  source: HTMLElement;
  over: HTMLElement;
  drop?: HTMLElement;
  payload: ExplorerDragPayload;
  /** When true, drop uses a transfer whose getData always returns "" (Chrome drop). */
  emptyDataOnDrop?: boolean;
  /** 0 = top edge of the over target, 0.5 = center, 1 = bottom edge. */
  pointerFractionY?: number;
};

/** Full dragStart → dragOver → drop; returns whether body had the dragging chrome after start. */
export async function performExplorerDragDrop(gesture: ExplorerDragGesture) {
  const transfer = createExplorerDataTransfer();
  const { source, over, drop = over, emptyDataOnDrop = true, pointerFractionY = 0.5 } = gesture;
  const nav = source.closest("nav.wk-explorer") ?? over.closest("nav.wk-explorer");
  if (nav) layoutExplorerForDragTests(nav);

  let draggingAfterStart = false;
  await act(async () => {
    fireEvent.dragStart(source, transfer.asPayload());
    draggingAfterStart = document.body.classList.contains("wk-explorer-dragging");
  });
  if (nav) layoutExplorerForDragTests(nav);
  await act(async () => {
    const pointer = dragPointerAt(over, transfer, pointerFractionY);
    fireEvent.dragEnter(over, pointer);
    fireEvent.dragOver(over, pointer);
  });

  await act(async () => {
    fireEvent.drop(drop, emptyDataOnDrop ? transfer.asEmptyDrop() : transfer.asPayload());
  });

  return { draggingAfterStart, payload: gesture.payload };
}

export function explorerDragMime(payload: ExplorerDragPayload): string {
  return payload.kind === "sheet" ? EXPLORER_SHEET_DRAG : EXPLORER_TABLE_DRAG;
}
