import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SIDE_REVEAL_TAB_WIDTH } from "../model/sidePanelPin.js";
import {
  DEFAULT_EXPLORER_WIDTH,
  DEFAULT_PROPERTIES_WIDTH,
  MIN_EXPLORER_WIDTH,
  MIN_PROPERTIES_WIDTH,
  fitSideWidthsOnViewport,
} from "./shellLayout.js";
import { shellGridTemplateColumns } from "./shellGridTemplate.js";
import { SidePanelColumn } from "./SidePanelColumn.js";
import { useViewportWidth } from "./useViewportWidth.js";
import { CustomSheetCanvas } from "./CustomSheetCanvas.js";
import { Explorer } from "./components.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { SidePanelLayoutProvider, useSidePanelLayout } from "./SidePanelLayout.js";
import { useWorkbook } from "./WorkbookProvider.js";

function WorkbookShellBody({
  top,
  explorerWorkbookFolderIcon,
  propertiesExtra,
}: {
  top?: ReactNode;
  explorerWorkbookFolderIcon?: boolean;
  propertiesExtra?: ReactNode;
}) {
  const { session, version } = useWorkbook();
  void version;
  const { explorerRevealed, setExplorerRevealed, propertiesRevealed, setPropertiesRevealed } = useSidePanelLayout();
  const viewportWidth = useViewportWidth();
  const [explorerWidth, setExplorerWidth] = useState(DEFAULT_EXPLORER_WIDTH);
  const [propertiesWidth, setPropertiesWidth] = useState(DEFAULT_PROPERTIES_WIDTH);
  const [resizing, setResizing] = useState(false);
  const sideWidthsRef = useRef({ explorerWidth, propertiesWidth });
  sideWidthsRef.current = { explorerWidth, propertiesWidth };
  const explorerPinned = session.isExplorerPinned();
  const propertiesPinned = session.isPropertiesPinned();

  /** Rebalance only when the viewport changes — not when one panel is dragged (canvas flex absorbs). */
  useEffect(() => {
    const { explorerWidth: ew, propertiesWidth: pw } = sideWidthsRef.current;
    const fitted = fitSideWidthsOnViewport(ew, pw, viewportWidth);
    if (fitted.explorerWidth !== ew) setExplorerWidth(fitted.explorerWidth);
    if (fitted.propertiesWidth !== pw) setPropertiesWidth(fitted.propertiesWidth);
  }, [viewportWidth]);

  useEffect(() => {
    if (explorerPinned) setExplorerRevealed(false);
  }, [explorerPinned, setExplorerRevealed]);

  useEffect(() => {
    if (propertiesPinned) setPropertiesRevealed(false);
  }, [propertiesPinned, setPropertiesRevealed]);

  const shellClass = [
    "wk-shell",
    resizing ? "is-resizing" : "",
    explorerPinned ? "" : "is-explorer-autohide",
    !explorerPinned && explorerRevealed ? "is-explorer-reveal" : "",
    propertiesPinned ? "" : "is-properties-autohide",
    !propertiesPinned && propertiesRevealed ? "is-properties-reveal" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const shellStyle = {
    "--wk-explorer-width": `${explorerWidth}px`,
    "--wk-properties-width": `${propertiesWidth}px`,
    "--wk-explorer-overlay-width": `${explorerWidth}px`,
    "--wk-properties-overlay-width": `${propertiesWidth}px`,
    "--wk-side-tab-width": `${SIDE_REVEAL_TAB_WIDTH}px`,
  } as CSSProperties;

  const workspaceStyle = {
    gridTemplateColumns: shellGridTemplateColumns(
      explorerPinned,
      propertiesPinned,
      explorerWidth,
      propertiesWidth,
      explorerRevealed,
      propertiesRevealed,
    ),
  } as CSSProperties;

  return (
    <div className={shellClass} style={shellStyle}>
      {top ? <div className="wk-shell-top">{top}</div> : null}
      <div className="wk-shell-workspace" style={workspaceStyle}>
        <SidePanelColumn
          edge="left"
          revealLabel="Navigation"
          resizeLabel="Resize explorer"
          pinned={explorerPinned}
          revealed={explorerRevealed}
          onRevealed={setExplorerRevealed}
          width={explorerWidth}
          onWidthChange={setExplorerWidth}
          minWidth={MIN_EXPLORER_WIDTH}
          defaultWidth={DEFAULT_EXPLORER_WIDTH}
          viewportWidth={viewportWidth}
          otherSideWidth={propertiesWidth}
          onDraggingChange={setResizing}
        >
          <Explorer workbookFolderIcon={explorerWorkbookFolderIcon} />
        </SidePanelColumn>
        <CustomSheetCanvas />
        <SidePanelColumn
          edge="right"
          revealLabel="Properties"
          resizeLabel="Resize properties"
          pinned={propertiesPinned}
          revealed={propertiesRevealed}
          onRevealed={setPropertiesRevealed}
          width={propertiesWidth}
          onWidthChange={setPropertiesWidth}
          minWidth={MIN_PROPERTIES_WIDTH}
          defaultWidth={DEFAULT_PROPERTIES_WIDTH}
          viewportWidth={viewportWidth}
          otherSideWidth={explorerWidth}
          onDraggingChange={setResizing}
        >
          <PropertiesPanel />
          {propertiesExtra}
        </SidePanelColumn>
      </div>
    </div>
  );
}

export function WorkbookShell({
  top,
  explorerWorkbookFolderIcon,
  propertiesExtra,
  initialExplorerRevealed,
  initialPropertiesRevealed,
}: {
  top?: ReactNode;
  explorerWorkbookFolderIcon?: boolean;
  propertiesExtra?: ReactNode;
  initialExplorerRevealed?: boolean;
  initialPropertiesRevealed?: boolean;
}) {
  return (
    <SidePanelLayoutProvider
      initialExplorerRevealed={initialExplorerRevealed}
      initialPropertiesRevealed={initialPropertiesRevealed}
    >
      <WorkbookShellBody
        top={top}
        explorerWorkbookFolderIcon={explorerWorkbookFolderIcon}
        propertiesExtra={propertiesExtra}
      />
    </SidePanelLayoutProvider>
  );
}
