import { bandCellKey, type CellStyle, type TableSnapshot } from "./types.js";

export function resolveCellStyle(
  table: TableSnapshot,
  columnId: string,
  cell?: { style?: CellStyle },
  rowId?: string,
): CellStyle | undefined {
  const attr = table.attributeColumns.find((column) => column.id === columnId);
  const column = attr?.style ?? table.columnStyles?.[columnId];
  const band = rowId ? table.bandCellStyles?.[bandCellKey(rowId, columnId)] : undefined;
  if (!cell?.style && !column && !band) return undefined;
  return { ...column, ...cell?.style, ...band };
}

export function toggleStyleFlag(style: CellStyle | undefined, flag: "bold" | "italic" | "strikethrough"): CellStyle {
  const next = { ...style, [flag]: !style?.[flag] };
  if (!next[flag]) delete next[flag];
  return next;
}

export const DEFAULT_CELL_FONT_SIZE = 13;

/** Patch that removes every style key (mergeStyle deletes false / empty / undefined). */
export const CLEARED_CELL_STYLE: CellStyle = {
  bold: false,
  italic: false,
  strikethrough: false,
  textColor: undefined,
  fillColor: undefined,
  fontSize: undefined,
};

export function styleFont(style?: CellStyle, fallbackSize = DEFAULT_CELL_FONT_SIZE): string | undefined {
  if (!style) return undefined;
  if (!style.italic && !style.bold && !style.fontSize) return undefined;
  const parts = [style.italic ? "italic" : "", style.bold ? "bold" : "", `${style.fontSize ?? fallbackSize}px`].filter(
    Boolean,
  );
  return parts.join(" ");
}

export function applyStrikethrough(text: string, style?: CellStyle): string {
  if (!style?.strikethrough || !text) return text;
  return [...text].map((char) => `${char}\u0336`).join("");
}
