function pointerClientX(event: { clientX?: number }, fallback: number): number {
  return typeof event.clientX === "number" && Number.isFinite(event.clientX) ? event.clientX : fallback;
}

export function startHorizontalResize(
  down: PointerEvent,
  opts: {
    pointerId: number;
    captureTarget: HTMLElement;
    widthAtPointer: (clientX: number) => number;
    onWidth: (width: number) => void;
    onActive?: (active: boolean) => void;
  },
): void {
  if ((down.button ?? 0) !== 0) return;
  down.preventDefault();
  down.stopPropagation();

  const { captureTarget, pointerId, widthAtPointer, onWidth, onActive } = opts;
  try {
    captureTarget.setPointerCapture(pointerId);
  } catch {
    /* unsupported in some environments */
  }

  onActive?.(true);
  const moveOpts = { passive: false } as const;

  const onMove = (moveEvent: globalThis.PointerEvent) => {
    moveEvent.preventDefault?.();
    onWidth(widthAtPointer(pointerClientX(moveEvent, pointerClientX(down, 0))));
  };

  const onEnd = (endEvent: globalThis.PointerEvent) => {
    endEvent.preventDefault?.();
    window.removeEventListener("pointermove", onMove, moveOpts);
    window.removeEventListener("pointerup", onEnd, moveOpts);
    window.removeEventListener("pointercancel", onEnd, moveOpts);
    try {
      if (captureTarget.hasPointerCapture(pointerId)) {
        captureTarget.releasePointerCapture(pointerId);
      }
    } catch {
      /* unsupported in some environments */
    }
    onActive?.(false);
  };

  window.addEventListener("pointermove", onMove, moveOpts);
  window.addEventListener("pointerup", onEnd, moveOpts);
  window.addEventListener("pointercancel", onEnd, moveOpts);
}
