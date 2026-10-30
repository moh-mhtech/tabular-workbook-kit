import type { ReactNode } from "react";
import { SideRevealTab } from "./SideRevealTab.js";
import { ResizeSeparator, type SidePanelEdge } from "./ResizeSeparator.js";
import { maxWidthForSide } from "./shellLayout.js";

function sideEdgeClass(edge: SidePanelEdge, pinned: boolean): string {
  const base = edge === "left" ? "wk-side-edge wk-side-edge-left" : "wk-side-edge wk-side-edge-right";
  return pinned ? base : `${base} is-autohide`;
}

function hostClass(edge: SidePanelEdge): string {
  return edge === "left" ? "wk-side-panel-host wk-side-panel-host-explorer" : "wk-side-panel-host wk-side-panel-host-properties";
}

function resizerClass(edge: SidePanelEdge): string {
  return edge === "left" ? "wk-col-resizer-explorer" : "wk-col-resizer-properties";
}

export function SidePanelColumn({
  edge,
  revealLabel,
  resizeLabel,
  pinned,
  revealed,
  onRevealed,
  width,
  onWidthChange,
  minWidth,
  defaultWidth,
  viewportWidth,
  otherSideWidth,
  onDraggingChange,
  children,
}: {
  edge: SidePanelEdge;
  revealLabel: string;
  resizeLabel: string;
  pinned: boolean;
  revealed: boolean;
  onRevealed: (revealed: boolean) => void;
  width: number;
  onWidthChange: (width: number) => void;
  minWidth: number;
  defaultWidth: number;
  viewportWidth: number;
  otherSideWidth: number;
  onDraggingChange?: (dragging: boolean) => void;
  children: ReactNode;
}) {
  const max = maxWidthForSide(viewportWidth, otherSideWidth, minWidth);

  const panel = (
    <div
      className={sideEdgeClass(edge, pinned)}
      onMouseEnter={() => {
        if (!pinned) onRevealed(true);
      }}
      onMouseLeave={() => {
        if (!pinned) onRevealed(false);
      }}
    >
      {!pinned ? <SideRevealTab edge={edge} label={revealLabel} onReveal={() => onRevealed(true)} /> : null}
      <div className={hostClass(edge)}>{children}</div>
    </div>
  );

  const gutter = pinned ? (
    <ResizeSeparator
      edge={edge}
      className={resizerClass(edge)}
      label={resizeLabel}
      value={width}
      min={minWidth}
      max={max}
      defaultWidth={defaultWidth}
      onWidthChange={onWidthChange}
      onDraggingChange={onDraggingChange}
    />
  ) : (
    <div className="wk-col-resizer wk-col-resizer-spacer" aria-hidden="true" />
  );

  if (edge === "left") {
    return (
      <>
        {panel}
        {gutter}
      </>
    );
  }
  return (
    <>
      {gutter}
      {panel}
    </>
  );
}
