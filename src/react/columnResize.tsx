import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export const DEFAULT_EXPLORER_WIDTH = 200;
export const DEFAULT_PROPERTIES_WIDTH = 260;
export const MIN_EXPLORER_WIDTH = 140;
export const MIN_PROPERTIES_WIDTH = 180;
export const MIN_CANVAS_WIDTH = 280;
export const COLUMN_RESIZER_WIDTH = 6;

export const COLUMN_RESIZE_BODY_CLASS = "wk-column-resize-active";

function setColumnResizeActive(active: boolean) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(COLUMN_RESIZE_BODY_CLASS, active);
}

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
  className,
  label,
  value,
  min,
  max,
  defaultValue,
  invert = false,
  onChange,
  onDragChange,
}: {
  className?: string;
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
  const detachWindowRef = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);

  const applyDelta = (deltaX: number, origin: number) => {
    const { invert: flipped, min: low, max: high, onChange: setWidth } = live.current;
    setWidth(clampColumnWidth(origin + (flipped ? -deltaX : deltaX), low, high));
  };

  const stopWindowDrag = () => {
    detachWindowRef.current?.();
    detachWindowRef.current = null;
  };

  const finishDrag = (target: HTMLDivElement, pointerId: number) => {
    try {
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {
      /* unsupported in some environments */
    }
    stopWindowDrag();
    drag.current = null;
    setDragging(false);
    setColumnResizeActive(false);
    live.current.onDragChange?.(false);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.button ?? 0) !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      /* unsupported in some environments */
    }
    const startX = typeof event.clientX === "number" && Number.isFinite(event.clientX) ? event.clientX : 0;
    drag.current = { x: startX, width: value };
    setDragging(true);
    setColumnResizeActive(true);
    onDragChange?.(true);

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      if (!drag.current) return;
      const x = typeof moveEvent.clientX === "number" && Number.isFinite(moveEvent.clientX) ? moveEvent.clientX : drag.current.x;
      applyDelta(x - drag.current.x, drag.current.width);
    };
    const onUp = (upEvent: globalThis.PointerEvent) => {
      upEvent.preventDefault();
      finishDrag(target, upEvent.pointerId);
    };

    stopWindowDrag();
    const moveOpts = { passive: false } as const;
    window.addEventListener("pointermove", onMove, moveOpts);
    window.addEventListener("pointerup", onUp, moveOpts);
    window.addEventListener("pointercancel", onUp, moveOpts);
    detachWindowRef.current = () => {
      window.removeEventListener("pointermove", onMove, moveOpts);
      window.removeEventListener("pointerup", onUp, moveOpts);
      window.removeEventListener("pointercancel", onUp, moveOpts);
    };
  };

  useEffect(() => {
    return () => {
      stopWindowDrag();
      setColumnResizeActive(false);
    };
  }, []);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const x = typeof event.clientX === "number" && Number.isFinite(event.clientX) ? event.clientX : drag.current.x;
    applyDelta(x - drag.current.x, drag.current.width);
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
      className={
        dragging
          ? `wk-col-resizer is-active${className ? ` ${className}` : ""}`
          : `wk-col-resizer${className ? ` ${className}` : ""}`
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishDrag(event.currentTarget, event.pointerId)}
      onPointerCancel={(event) => finishDrag(event.currentTarget, event.pointerId)}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={onKeyDown}
    />
  );
}
