import { TABLE_DATA_COLUMN_WIDTH } from "../grid/sheetProjection.js";

export const FORMULA_EDITOR_MIN_WIDTH = TABLE_DATA_COLUMN_WIDTH;
export const FORMULA_EDITOR_MAX_WIDTH = 400;
export const FORMULA_EDITOR_MAX_HEIGHT = 120;

export type FormulaEditorRect = { left: number; top: number; width: number; height: number };

export function formulaEditorRectsOverlap(a: FormulaEditorRect, b: FormulaEditorRect): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

export function placeFormulaEditor(
  cell: FormulaEditorRect,
  box: { width: number; height: number },
  canvas: FormulaEditorRect,
  options?: { avoid?: FormulaEditorRect; flipX?: boolean; flipY?: boolean },
): { left: number; top: number } {
  const right = cell.left + cell.width - box.width;
  const up = cell.top + cell.height - box.height;
  const order = options?.flipY
    ? options.flipX
      ? [
          { left: right, top: up },
          { left: cell.left, top: up },
          { left: right, top: cell.top },
          { left: cell.left, top: cell.top },
        ]
      : [
          { left: cell.left, top: up },
          { left: right, top: up },
          { left: cell.left, top: cell.top },
          { left: right, top: cell.top },
        ]
    : options?.flipX
      ? [
          { left: right, top: cell.top },
          { left: right, top: up },
          { left: cell.left, top: cell.top },
          { left: cell.left, top: up },
        ]
      : [
          { left: cell.left, top: cell.top },
          { left: right, top: cell.top },
          { left: cell.left, top: up },
          { left: right, top: up },
        ];
  const clamp = (left: number, top: number) => ({
    left: Math.min(Math.max(left, canvas.left), Math.max(canvas.left, canvas.left + canvas.width - box.width)),
    top: Math.min(Math.max(top, canvas.top), Math.max(canvas.top, canvas.top + canvas.height - box.height)),
  });
  for (const anchor of order) {
    const placed = clamp(anchor.left, anchor.top);
    const rect = { left: placed.left, top: placed.top, width: box.width, height: box.height };
    if (!options?.avoid || !formulaEditorRectsOverlap(rect, options.avoid)) return placed;
  }
  return clamp(order[0]!.left, order[0]!.top);
}

export function formulaEditorPopupSize(
  contentWidth: number,
  lineHeight: number,
  wrappedHeight: number,
): { width: number; height: number; overflow: "hidden" | "auto" } {
  if (contentWidth <= FORMULA_EDITOR_MAX_WIDTH) {
    return {
      width: Math.max(FORMULA_EDITOR_MIN_WIDTH, Math.ceil(contentWidth)),
      height: lineHeight,
      overflow: "hidden",
    };
  }
  const height = Math.min(FORMULA_EDITOR_MAX_HEIGHT, Math.max(lineHeight, Math.ceil(wrappedHeight)));
  return {
    width: FORMULA_EDITOR_MAX_WIDTH,
    height,
    overflow: height >= FORMULA_EDITOR_MAX_HEIGHT ? "auto" : "hidden",
  };
}

export function measureFormulaDraftSize(draft: string, lineHeight: number): { width: number; height: number; overflow: "hidden" | "auto" } {
  const contentWidth = measureDraftWidth(draft);
  const lines = Math.max(1, Math.ceil(contentWidth / FORMULA_EDITOR_MAX_WIDTH));
  return formulaEditorPopupSize(contentWidth, lineHeight, lines * lineHeight);
}

function measureDraftWidth(draft: string): number {
  return Math.max(1, draft.length) * 8 + 16;
}

const FORMULA_CHAR_WIDTH = 8;

export function inlineCaretScrollLeft(
  scrollLeft: number,
  caret: number,
  draftLength: number,
  viewWidth: number,
  scrollWidth = 0,
): number {
  const content = Math.max(scrollWidth, Math.max(draftLength, 1) * FORMULA_CHAR_WIDTH, viewWidth);
  const caretX = draftLength <= 0 ? 0 : (caret / draftLength) * content;
  const maxScroll = Math.max(0, content - viewWidth);
  if (caretX < scrollLeft) return Math.min(Math.max(0, caretX), maxScroll);
  if (caretX > scrollLeft + viewWidth) return Math.min(Math.max(0, caretX - viewWidth), maxScroll);
  return Math.min(Math.max(0, scrollLeft), maxScroll);
}
