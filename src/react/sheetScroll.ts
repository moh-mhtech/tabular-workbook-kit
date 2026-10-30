/** Scroll so a table sits on the canvas inset, but never leave empty space past the sheet bottom. */
export function sheetScrollTopForTable(
  tableTop: number,
  viewportHeight: number,
  sheetBottom: number,
  inset = 0,
): number {
  const maxScroll = Math.max(0, sheetBottom - viewportHeight);
  return Math.min(Math.max(0, tableTop - inset), maxScroll);
}

export function contentOffset(element: HTMLElement, container: HTMLElement): number {
  return element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}

export function sheetBottom(container: HTMLElement): number {
  const cards = container.querySelectorAll<HTMLElement>("[data-table-id]");
  const last = cards[cards.length - 1];
  if (!last) return 0;
  const paddingBottom = Number.parseFloat(getComputedStyle(container).paddingBottom) || 0;
  return contentOffset(last, container) + last.offsetHeight + paddingBottom;
}

export function tableCard(container: HTMLElement, tableId: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>("[data-table-id]")].find(
    (card) => card.dataset.tableId === tableId,
  );
}

export function canvasPaddingTop(container: HTMLElement): number {
  return canvasInsets(container).top;
}

export function canvasInsets(container: HTMLElement): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const style = getComputedStyle(container);
  const fallback = (value: string, inline: string) => Number.parseFloat(value) || Number.parseFloat(inline) || 0;
  return {
    top: fallback(style.paddingTop, container.style.paddingTop),
    right: fallback(style.paddingRight, container.style.paddingRight),
    bottom: fallback(style.paddingBottom, container.style.paddingBottom),
    left: fallback(style.paddingLeft, container.style.paddingLeft),
  };
}

export function contentOffsetX(element: HTMLElement, container: HTMLElement): number {
  return element.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft;
}

/** Keep [itemStart, itemEnd] inside the scrollport, inset from each edge. */
export function scrollToKeepRangeInView(
  scroll: number,
  viewport: number,
  itemStart: number,
  itemEnd: number,
  insetStart: number,
  insetEnd: number,
  maxScroll: number,
): number {
  const inner = viewport - insetStart - insetEnd;
  if (inner <= 0) return Math.min(Math.max(0, scroll), maxScroll);
  if (itemEnd - itemStart >= inner) {
    return Math.min(Math.max(0, itemStart - insetStart), maxScroll);
  }
  if (itemStart < scroll + insetStart) {
    return Math.min(Math.max(0, itemStart - insetStart), maxScroll);
  }
  if (itemEnd > scroll + viewport - insetEnd) {
    return Math.min(Math.max(0, itemEnd - (viewport - insetEnd)), maxScroll);
  }
  return Math.min(Math.max(0, scroll), maxScroll);
}

export function cellGridMetrics(
  columnWidths: readonly number[],
  col: number,
  row: number,
  rowHeight: number | readonly number[],
): { x: number; y: number; width: number; height: number } {
  let x = 0;
  for (let index = 0; index < col && index < columnWidths.length; index++) {
    x += columnWidths[index] ?? 0;
  }
  if (typeof rowHeight === "number") {
    return {
      x,
      y: row * rowHeight,
      width: columnWidths[col] ?? 0,
      height: rowHeight,
    };
  }
  let y = 0;
  for (let index = 0; index < row && index < rowHeight.length; index++) {
    y += rowHeight[index] ?? 0;
  }
  return {
    x,
    y,
    width: columnWidths[col] ?? 0,
    height: rowHeight[row] ?? 0,
  };
}

/** Scroll the canvas so an element stays inside the padded viewport. */
export function scrollCanvasToKeepElementVisible(
  canvas: HTMLElement,
  element: HTMLElement,
  horizontalScroll: "table" | "sheet" = "table",
) {
  const insets = canvasInsets(canvas);
  const top = contentOffset(element, canvas);
  canvas.scrollTop = scrollToKeepRangeInView(
    canvas.scrollTop,
    canvas.clientHeight,
    top,
    top + element.offsetHeight,
    insets.top,
    insets.bottom,
    Math.max(0, sheetBottom(canvas) - canvas.clientHeight),
  );
  if (horizontalScroll !== "sheet") return;
  const left = contentOffsetX(element, canvas);
  canvas.scrollLeft = scrollToKeepRangeInView(
    canvas.scrollLeft,
    canvas.clientWidth,
    left,
    left + element.offsetWidth,
    insets.left,
    insets.right,
    Math.max(0, canvas.scrollWidth - canvas.clientWidth),
  );
}

export function scrollCanvasToKeepTableVisible(
  canvas: HTMLElement,
  tableId: string,
  horizontalScroll: "table" | "sheet" = "table",
) {
  const card = tableCard(canvas, tableId);
  const title = card?.querySelector<HTMLElement>(".wk-table-viewport-title") ?? card;
  if (!title) return;
  scrollCanvasToKeepElementVisible(canvas, title, horizontalScroll);
}

/** Scroll the canvas (and sheet-x) so a cell stays inside the padded viewport. */
export function scrollCanvasToKeepCellVisible(
  canvas: HTMLElement,
  tableId: string,
  col: number,
  row: number,
  columnWidths: readonly number[],
  rowHeight: number | readonly number[],
  horizontalScroll: "table" | "sheet" = "table",
) {
  const card = tableCard(canvas, tableId);
  const spreadsheet = card?.querySelector<HTMLElement>(".wk-table-spreadsheet");
  if (!card || !spreadsheet) return;
  const { x, y, width, height } = cellGridMetrics(columnWidths, col, row, rowHeight);
  const insets = canvasInsets(canvas);

  const cellTop = contentOffset(spreadsheet, canvas) + y;
  canvas.scrollTop = scrollToKeepRangeInView(
    canvas.scrollTop,
    canvas.clientHeight,
    cellTop,
    cellTop + height,
    insets.top,
    insets.bottom,
    Math.max(0, sheetBottom(canvas) - canvas.clientHeight),
  );

  if (horizontalScroll !== "sheet") return;
  const cellLeft = contentOffsetX(spreadsheet, canvas) + x;
  canvas.scrollLeft = scrollToKeepRangeInView(
    canvas.scrollLeft,
    canvas.clientWidth,
    cellLeft,
    cellLeft + width,
    insets.left,
    insets.right,
    Math.max(0, canvas.scrollWidth - canvas.clientWidth),
  );
}

export function scrollCanvasToTable(container: HTMLElement, tableId: string) {
  const card = tableCard(container, tableId);
  if (!card) return;
  container.scrollTop = sheetScrollTopForTable(
    contentOffset(card, container),
    container.clientHeight,
    sheetBottom(container),
    canvasPaddingTop(container),
  );
}

export function clampCanvasScroll(container: HTMLElement) {
  const maxScroll = Math.max(0, sheetBottom(container) - container.clientHeight);
  if (container.scrollTop > maxScroll) container.scrollTop = maxScroll;
}

/** Table band at the top of the canvas scrollport (sticky section lead). */
export function leadTableIdInCanvas(canvas: HTMLElement): string | null {
  const cards = canvas.querySelectorAll<HTMLElement>("[data-table-id]");
  if (!cards.length) return null;
  const anchor = canvas.scrollTop + canvasPaddingTop(canvas) + 1;
  let leadId: string | null = null;
  let leadTop = -Infinity;
  for (const card of cards) {
    const top = contentOffset(card, canvas);
    if (top <= anchor && top > leadTop) {
      leadTop = top;
      leadId = card.dataset.tableId ?? null;
    }
  }
  if (leadId) return leadId;
  if (canvas.scrollTop <= canvasPaddingTop(canvas) + 1) {
    return cards[0]?.dataset.tableId ?? null;
  }
  return cards[cards.length - 1]?.dataset.tableId ?? null;
}
