import { useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { clampWidth } from "./shellLayout.js";
import { startHorizontalResize } from "./startHorizontalResize.js";

export type SidePanelEdge = "left" | "right";

function horizontalSign(edge: SidePanelEdge): 1 | -1 {
  return edge === "right" ? -1 : 1;
}

function keyboardStep(edge: SidePanelEdge, key: string, shiftKey: boolean): number | null {
  const step = shiftKey ? 32 : 16;
  if (edge === "left") {
    if (key === "ArrowRight") return step;
    if (key === "ArrowLeft") return -step;
  } else {
    if (key === "ArrowLeft") return step;
    if (key === "ArrowRight") return -step;
  }
  return null;
}

export function ResizeSeparator({
  edge,
  className,
  label,
  value,
  min,
  max,
  defaultWidth,
  onWidthChange,
  onDraggingChange,
}: {
  edge: SidePanelEdge;
  className?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  defaultWidth: number;
  onWidthChange: (width: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const sign = horizontalSign(edge);

  const applyWidth = (next: number) => {
    onWidthChange(clampWidth(next, min, max));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = typeof event.clientX === "number" && Number.isFinite(event.clientX) ? event.clientX : 0;
    const startWidth = value;
    startHorizontalResize(event.nativeEvent, {
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      widthAtPointer: (clientX) => startWidth + sign * (clientX - startX),
      onWidth: applyWidth,
      onActive: (active) => {
        setDragging(active);
        onDraggingChange?.(active);
      },
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = keyboardStep(edge, event.key, event.shiftKey);
    if (step != null) {
      event.preventDefault();
      applyWidth(value + step);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      onWidthChange(min);
    } else if (event.key === "End") {
      event.preventDefault();
      onWidthChange(max);
    }
  };

  const resizerClass = `wk-col-resizer${dragging ? " is-active" : ""}${className ? ` ${className}` : ""}`;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize"
      className={resizerClass}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onWidthChange(defaultWidth)}
      onKeyDown={onKeyDown}
    />
  );
}
