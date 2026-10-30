export const DEFAULT_EXPLORER_WIDTH = 200;
export const DEFAULT_PROPERTIES_WIDTH = 260;
export const MIN_EXPLORER_WIDTH = 140;
export const MIN_PROPERTIES_WIDTH = 180;
export const MIN_CANVAS_WIDTH = 280;
/** Width of the draggable gutter between a pinned side panel and the canvas. */
export const COLUMN_GUTTER = 6;

/** @deprecated Use COLUMN_GUTTER — kept for grid/CSS call sites during rename. */
export const COLUMN_RESIZER_WIDTH = COLUMN_GUTTER;

export function clampWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(width)));
}

/** @deprecated Use clampWidth */
export const clampColumnWidth = clampWidth;

export function maxWidthForSide(viewportWidth: number, otherSideWidth: number, minSide: number): number {
  const remaining = viewportWidth - otherSideWidth - COLUMN_GUTTER * 2 - MIN_CANVAS_WIDTH;
  return Math.max(minSide, remaining);
}

/** @deprecated Use maxWidthForSide */
export const maxSideWidth = maxWidthForSide;

export function fitSideWidthsOnViewport(
  explorerWidth: number,
  propertiesWidth: number,
  viewportWidth: number,
): { explorerWidth: number; propertiesWidth: number } {
  let nextExplorer = clampWidth(
    explorerWidth,
    MIN_EXPLORER_WIDTH,
    maxWidthForSide(viewportWidth, propertiesWidth, MIN_EXPLORER_WIDTH),
  );
  let nextProperties = clampWidth(
    propertiesWidth,
    MIN_PROPERTIES_WIDTH,
    maxWidthForSide(viewportWidth, nextExplorer, MIN_PROPERTIES_WIDTH),
  );
  nextExplorer = clampWidth(
    nextExplorer,
    MIN_EXPLORER_WIDTH,
    maxWidthForSide(viewportWidth, nextProperties, MIN_EXPLORER_WIDTH),
  );
  return { explorerWidth: nextExplorer, propertiesWidth: nextProperties };
}

/** @deprecated Use fitSideWidthsOnViewport */
export const fitSideWidths = fitSideWidthsOnViewport;
