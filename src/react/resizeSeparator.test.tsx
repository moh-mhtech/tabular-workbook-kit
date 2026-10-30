/** @vitest-environment jsdom */
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResizeSeparator } from "./ResizeSeparator.js";

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

function Host({ edge = "left" as const }: { edge?: "left" | "right" }) {
  const [width, setWidth] = useState(200);
  return (
    <>
      <div data-testid="width">{width}</div>
      <ResizeSeparator
        edge={edge}
        label="Resize explorer"
        value={width}
        min={140}
        max={400}
        defaultWidth={200}
        onWidthChange={setWidth}
      />
    </>
  );
}

describe("ResizeSeparator", () => {
  it("widens the left column with the keyboard", () => {
    render(<Host edge="left" />);
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize explorer" }), { key: "ArrowRight" });
    expect(screen.getByTestId("width").textContent).toBe("216");
  });

  it("widens a right column when the handle moves left", () => {
    render(<Host edge="right" />);
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
