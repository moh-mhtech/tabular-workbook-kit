/** @vitest-environment jsdom */
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COLUMN_RESIZER_WIDTH,
  ColumnResizeHandle,
  MIN_CANVAS_WIDTH,
  MIN_EXPLORER_WIDTH,
  MIN_PROPERTIES_WIDTH,
  clampColumnWidth,
  fitSideWidths,
  maxSideWidth,
} from "./columnResize.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = function () {};
    HTMLElement.prototype.releasePointerCapture = function () {};
    HTMLElement.prototype.hasPointerCapture = function () {
      return false;
    };
  }
});

afterEach(() => cleanup());

function Host({ invert = false }: { invert?: boolean }) {
  const [width, setWidth] = useState(200);
  return (
    <>
      <div data-testid="width">{width}</div>
      <ColumnResizeHandle
        label="Resize explorer"
        value={width}
        min={140}
        max={400}
        defaultValue={200}
        invert={invert}
        onChange={setWidth}
      />
    </>
  );
}

describe("column resize", () => {
  it("clamps a column to the requested bounds", () => {
    expect(clampColumnWidth(80, 140, 400)).toBe(140);
    expect(clampColumnWidth(520, 140, 400)).toBe(400);
    expect(clampColumnWidth(221.6, 140, 400)).toBe(222);
  });

  it("keeps enough room for the canvas when computing a side max", () => {
    expect(maxSideWidth(260, 1000, MIN_EXPLORER_WIDTH)).toBe(
      1000 - 260 - COLUMN_RESIZER_WIDTH * 2 - MIN_CANVAS_WIDTH,
    );
    expect(maxSideWidth(260, 400, MIN_EXPLORER_WIDTH)).toBe(MIN_EXPLORER_WIDTH);
  });

  it("shrinks both side columns when the viewport is too narrow", () => {
    const fitted = fitSideWidths(400, 400, 500);
    expect(fitted.explorerWidth).toBe(MIN_EXPLORER_WIDTH);
    expect(fitted.propertiesWidth).toBe(MIN_PROPERTIES_WIDTH);
    expect(fitted.explorerWidth + fitted.propertiesWidth + COLUMN_RESIZER_WIDTH * 2).toBeLessThanOrEqual(500);
  });
});

describe("ColumnResizeHandle", () => {
  it("widens the left column with the keyboard", () => {
    render(<Host />);
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize explorer" }), { key: "ArrowRight" });
    expect(screen.getByTestId("width").textContent).toBe("216");
  });

  it("widens an inverted right column when the handle moves left", () => {
    render(<Host invert />);
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize explorer" }), { key: "ArrowLeft" });
    expect(screen.getByTestId("width").textContent).toBe("216");
  });

  it("resets to the default width on double-click", () => {
    render(<Host />);
    const handle = screen.getByRole("separator", { name: "Resize explorer" });
    fireEvent.keyDown(handle, { key: "End" });
    expect(screen.getByTestId("width").textContent).toBe("400");
    fireEvent.doubleClick(handle);
    expect(screen.getByTestId("width").textContent).toBe("200");
  });

  it("widens from the window pointermove listener attached on pointerdown", () => {
    render(<Host />);
    const handle = screen.getByRole("separator", { name: "Resize explorer" });
    const spy = vi.spyOn(window, "addEventListener");
    act(() => {
      const down = new Event("pointerdown", { bubbles: true }) as PointerEvent;
      Object.assign(down, { button: 0, clientX: 100, pointerId: 1 });
      handle.dispatchEvent(down);
    });
    const moveCall = spy.mock.calls.find((call) => call[0] === "pointermove");
    expect(moveCall).toBeTruthy();
    const onMove = moveCall![1] as (event: { clientX: number }) => void;
    act(() => {
      onMove({ clientX: 132 });
    });
    expect(screen.getByTestId("width").textContent).toBe("232");
    spy.mockRestore();
  });
});
