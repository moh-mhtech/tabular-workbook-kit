import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { SIDE_REVEAL_TAB_WIDTH } from "../model/sidePanelPin.js";
import { SideRevealTab } from "./SideRevealTab.js";
import {
  ColumnResizeHandle,
  DEFAULT_EXPLORER_WIDTH,
  DEFAULT_PROPERTIES_WIDTH,
  MIN_EXPLORER_WIDTH,
  MIN_PROPERTIES_WIDTH,
  COLUMN_RESIZER_WIDTH,
  fitSideWidths,
  maxSideWidth,
  useViewportWidth,
} from "./columnResize.js";
import { CustomSheetCanvas } from "./CustomSheetCanvas.js";
import { Explorer } from "./components.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { SidePanelLayoutProvider, useSidePanelLayout } from "./SidePanelLayout.js";
import { useWorkbook } from "./WorkbookProvider.js";

function shellGridTemplate(
  explorerPinned: boolean,
  propertiesPinned: boolean,
  explorerWidth: number,
  propertiesWidth: number,
  explorerRevealed: boolean,
  propertiesRevealed: boolean,
): string {
  const tabCol = `${SIDE_REVEAL_TAB_WIDTH}px`;
  const explorerCol = explorerPinned
    ? `${explorerWidth}px`
    : explorerRevealed
      ? `${SIDE_REVEAL_TAB_WIDTH + explorerWidth}px`
      : tabCol;
  const explorerGap = explorerPinned ? `${COLUMN_RESIZER_WIDTH}px` : "0px";
  const propertiesGap = propertiesPinned ? `${COLUMN_RESIZER_WIDTH}px` : "0px";
  const propertiesCol = propertiesPinned
    ? `${propertiesWidth}px`
    : propertiesRevealed
      ? `${SIDE_REVEAL_TAB_WIDTH + propertiesWidth}px`
      : tabCol;
  return `${explorerCol} ${explorerGap} 1fr ${propertiesGap} ${propertiesCol}`;
}

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
  const explorerPinned = session.isExplorerPinned();
  const propertiesPinned = session.isPropertiesPinned();
  const explorerMax = maxSideWidth(propertiesWidth, viewportWidth, MIN_EXPLORER_WIDTH);
  const propertiesMax = maxSideWidth(explorerWidth, viewportWidth, MIN_PROPERTIES_WIDTH);

  useEffect(() => {
    const fitted = fitSideWidths(explorerWidth, propertiesWidth, viewportWidth);
    if (fitted.explorerWidth !== explorerWidth) setExplorerWidth(fitted.explorerWidth);
    if (fitted.propertiesWidth !== propertiesWidth) setPropertiesWidth(fitted.propertiesWidth);
  }, [explorerWidth, propertiesWidth, viewportWidth]);

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
    gridTemplateColumns: shellGridTemplate(
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
      <div
        className={explorerPinned ? "wk-side-edge wk-side-edge-left" : "wk-side-edge wk-side-edge-left is-autohide"}
        onMouseEnter={() => {
          if (!explorerPinned) setExplorerRevealed(true);
        }}
        onMouseLeave={() => {
          if (!explorerPinned) setExplorerRevealed(false);
        }}
      >
        {!explorerPinned ? (
          <SideRevealTab edge="left" label="Navigation" onReveal={() => setExplorerRevealed(true)} />
        ) : null}
        <div className="wk-side-panel-host wk-side-panel-host-explorer">
          <Explorer workbookFolderIcon={explorerWorkbookFolderIcon} />
        </div>
      </div>
      {explorerPinned ? (
        <ColumnResizeHandle
          label="Resize explorer"
          value={explorerWidth}
          min={MIN_EXPLORER_WIDTH}
          max={explorerMax}
          defaultValue={DEFAULT_EXPLORER_WIDTH}
          onChange={setExplorerWidth}
          onDragChange={setResizing}
        />
      ) : (
        <div className="wk-col-resizer wk-col-resizer-spacer" aria-hidden="true" />
      )}
      <CustomSheetCanvas />
      {propertiesPinned ? (
        <ColumnResizeHandle
          label="Resize properties"
          value={propertiesWidth}
          min={MIN_PROPERTIES_WIDTH}
          max={propertiesMax}
          defaultValue={DEFAULT_PROPERTIES_WIDTH}
          invert
          onChange={setPropertiesWidth}
          onDragChange={setResizing}
        />
      ) : (
        <div className="wk-col-resizer wk-col-resizer-spacer" aria-hidden="true" />
      )}
      <div
        className={propertiesPinned ? "wk-side-edge wk-side-edge-right" : "wk-side-edge wk-side-edge-right is-autohide"}
        onMouseEnter={() => {
          if (!propertiesPinned) setPropertiesRevealed(true);
        }}
        onMouseLeave={() => {
          if (!propertiesPinned) setPropertiesRevealed(false);
        }}
      >
        {!propertiesPinned ? (
          <SideRevealTab edge="right" label="Properties" onReveal={() => setPropertiesRevealed(true)} />
        ) : null}
        <div className="wk-side-panel-host wk-side-panel-host-properties">
          <PropertiesPanel />
          {propertiesExtra}
        </div>
      </div>
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
