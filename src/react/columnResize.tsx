import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export const DEFAULT_EXPLORER_WIDTH = 200;
export const DEFAULT_PROPERTIES_WIDTH = 260;
export const MIN_EXPLORER_WIDTH = 140;
export const MIN_PROPERTIES_WIDTH = 180;
export const MIN_CANVAS_WIDTH = 280;
export const COLUMN_RESIZER_WIDTH = 6;

export function clampColumnWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(width)));
}

export function maxSideWidth(otherSideWidth: number, viewportWidth: number, min: number): number {
  const remaining = viewportWidth - otherSideWidth - COLUMN_RESIZER_WIDTH * 2 - MIN_CANVAS_WIDTH;
  return Math.max(min, remaining);
}

export function fitSideWidths(
  explorerWidth: number,
  propertiesWidth: number,
  viewportWidth: number,
): { explorerWidth: number; propertiesWidth: number } {
  let nextExplorer = clampColumnWidth(
    explorerWidth,
    MIN_EXPLORER_WIDTH,
    maxSideWidth(propertiesWidth, viewportWidth, MIN_EXPLORER_WIDTH),
  );
  let nextProperties = clampColumnWidth(
    propertiesWidth,
    MIN_PROPERTIES_WIDTH,
    maxSideWidth(nextExplorer, viewportWidth, MIN_PROPERTIES_WIDTH),
  );
  nextExplorer = clampColumnWidth(
    nextExplorer,
    MIN_EXPLORER_WIDTH,
    maxSideWidth(nextProperties, viewportWidth, MIN_EXPLORER_WIDTH),
  );
  return { explorerWidth: nextExplorer, propertiesWidth: nextProperties };
}

export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export function ColumnResizeHandle({
  label,
  value,
  min,
  max,
  defaultValue,
  invert = false,
  onChange,
  onDragChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  invert?: boolean;
  onChange: (width: number) => void;
  onDragChange?: (dragging: boolean) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const live = useRef({ invert, min, max, onChange, onDragChange });
  live.current = { invert, min, max, onChange, onDragChange };
  const [dragging, setDragging] = useState(false);

  const applyDelta = (deltaX: number, origin: number) => {
    const { invert: flipped, min: low, max: high, onChange: setWidth } = live.current;
    setWidth(clampColumnWidth(origin + (flipped ? -deltaX : deltaX), low, high));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: globalThis.PointerEvent) => {
      if (!drag.current) return;
      applyDelta(event.clientX - drag.current.x, drag.current.width);
    };
    const onUp = () => {
      drag.current = null;
      setDragging(false);
      live.current.onDragChange?.(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = { x: event.clientX, width: value };
    setDragging(true);
    onDragChange?.(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    applyDelta(event.clientX - drag.current.x, drag.current.width);
  };

  const endDrag = () => {
    if (!drag.current && !dragging) return;
    drag.current = null;
    setDragging(false);
    onDragChange?.(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 16;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applyDelta(-step, value);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      applyDelta(step, value);
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(min);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(max);
    }
  };

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
      className={dragging ? "wk-col-resizer is-active" : "wk-col-resizer"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={onKeyDown}
    />
  );
}
