import { describe, expect, it } from "vitest";
import {
  COLUMN_GUTTER,
  MIN_CANVAS_WIDTH,
  MIN_EXPLORER_WIDTH,
  MIN_PROPERTIES_WIDTH,
  clampWidth,
  fitSideWidthsOnViewport,
  maxWidthForSide,
} from "./shellLayout.js";

describe("shell layout", () => {
  it("clamps a column to the requested bounds", () => {
    expect(clampWidth(80, 140, 400)).toBe(140);
    expect(clampWidth(520, 140, 400)).toBe(400);
    expect(clampWidth(221.6, 140, 400)).toBe(222);
  });

  it("keeps enough room for the canvas when computing a side max", () => {
    expect(maxWidthForSide(1000, 260, MIN_EXPLORER_WIDTH)).toBe(
      1000 - 260 - COLUMN_GUTTER * 2 - MIN_CANVAS_WIDTH,
    );
    expect(maxWidthForSide(400, 260, MIN_EXPLORER_WIDTH)).toBe(MIN_EXPLORER_WIDTH);
  });

  it("shrinks both side columns when the viewport is too narrow", () => {
    const fitted = fitSideWidthsOnViewport(400, 400, 500);
    expect(fitted.explorerWidth).toBe(MIN_EXPLORER_WIDTH);
    expect(fitted.propertiesWidth).toBe(MIN_PROPERTIES_WIDTH);
    expect(fitted.explorerWidth + fitted.propertiesWidth + COLUMN_GUTTER * 2).toBeLessThanOrEqual(500);
  });
});
