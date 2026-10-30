import { useEffect, useState, type DragEvent, type ReactNode, type TransitionEvent } from "react";
import { selectedTableId } from "../model/types.js";
import { selectedYearColumn } from "../model/yearColumns.js";
import { canDragTable, writeExplorerDragData, type ExplorerDragPayload } from "./explorerDrag.js";
import { useExplorerDrag } from "./useExplorerDrag.js";
import { useSnapshot, useWorkbook } from "./WorkbookProvider.js";
import "./workbook.css";

function ExplorerDropMarker({ active }: { active: boolean }) {
  return <div className="wk-explorer-drop-marker" data-active={active ? "true" : "false"} role="presentation" />;
}

const EXPLORER_TABLES_MS = 220;

function ExplorerSheetTables({ showTables, children }: { showTables: boolean; children: ReactNode }) {
  const [expanded, setExpanded] = useState(showTables);
  const [a11yHidden, setA11yHidden] = useState(!showTables);

  useEffect(() => {
    if (showTables) {
      setA11yHidden(false);
      setExpanded(false);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setExpanded(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setExpanded(false);
  }, [showTables]);

  useEffect(() => {
    if (showTables || expanded) return;
    const timer = window.setTimeout(() => setA11yHidden(true), EXPLORER_TABLES_MS + 40);
    return () => clearTimeout(timer);
  }, [showTables, expanded]);

  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== "grid-template-rows" || showTables || expanded) return;
    setA11yHidden(true);
  };

  return (
    <div
      className={expanded ? "wk-explorer-tables-wrap is-expanded" : "wk-explorer-tables-wrap"}
      aria-hidden={a11yHidden ? true : undefined}
      onTransitionEnd={onTransitionEnd}
    >
      {children}
    </div>
  );
}

export { PropertiesPanel } from "./PropertiesPanel.js";

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

function ExplorerDragSource({
  payload,
  onBegin,
  onActivate,
  onDragOverTarget,
  children,
  className,
}: {
  payload: ExplorerDragPayload;
  onBegin: (payload: ExplorerDragPayload) => void;
  onActivate: () => void;
  onDragOverTarget?: (event: DragEvent) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={className}
      draggable
      onDragStart={(event) => {
        writeExplorerDragData(event.dataTransfer, payload);
        onBegin(payload);
      }}
      onDragOver={onDragOverTarget}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
    >
      {children}
    </div>
  );
}

function ExplorerFolderIcon() {
  return (
    <svg className="wk-explorer-folder-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 4.5 A1 1 0 0 1 3 3.5 H6.2 L7.4 5 H13 A1 1 0 0 1 14 6 V12.5 A1 1 0 0 1 13 13.5 H3 A1 1 0 0 1 2 12.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExplorerChevron() {
  return (
    <svg className="wk-explorer-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path
        d="M4 2.5 8 6 4 9.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Explorer({ workbookFolderIcon = false }: { workbookFolderIcon?: boolean }) {
  const {
    session,
    activeSheetId,
    setActiveSheetId,
    toggleSheetCollapsed,
  } = useWorkbook();
  const snapshot = useSnapshot();
  const lastSheetId = snapshot.sheets.at(-1)?.id;
  const {
    dropHint,
    beginDrag,
    commitExplorerDrop,
    endDragAfterRelease,
    onNavDragOverCapture,
    onNavDragOver,
    onTableListDragOver,
    onSheetAppendDragOver,
    allowExplorerDrop,
  } = useExplorerDrag(session, lastSheetId, tryCall);

  return (
    <nav
      className="wk-explorer"
      aria-label="Sheets"
      onDragOverCapture={onNavDragOverCapture}
      onDragOver={onNavDragOver}
      onDropCapture={commitExplorerDrop}
      onDragEnd={endDragAfterRelease}
    >
      <button
        type="button"
        className="wk-explorer-group-btn wk-explorer-workbook"
        onClick={() => session.setSelection({ kind: "workbook" })}
      >
        {workbookFolderIcon ? <ExplorerFolderIcon /> : null}
        <span>{snapshot.name}</span>
      </button>
      {snapshot.sheets.map((sheet) => {
        const isActiveSheet = sheet.id === activeSheetId;
        const isCollapsed = sheet.explorerCollapsed === true;
        const showTables = !isCollapsed || isActiveSheet;
        return (
        <div
          key={sheet.id}
          className="wk-explorer-group"
          data-explorer-sheet-id={sheet.id}
          onDrop={commitExplorerDrop}
        >
          <ExplorerDropMarker
            active={dropHint?.placement === "before-sheet" && dropHint.sheetId === sheet.id}
          />
          <div className="wk-explorer-sheet-row">
            <ExplorerDragSource
              payload={{ kind: "sheet", id: sheet.id }}
              onBegin={beginDrag}
              className={isActiveSheet ? "wk-explorer-group-btn is-active" : "wk-explorer-group-btn"}
              onDragOverTarget={allowExplorerDrop}
              onActivate={() => {
                setActiveSheetId(sheet.id);
                const firstTableId = sheet.tableIds[0];
                if (firstTableId) session.focusFirstDataCell(firstTableId);
                else session.setSelection({ kind: "sheet", sheetId: sheet.id });
              }}
            >
              {sheet.name}
            </ExplorerDragSource>
            <button
              type="button"
              className="wk-explorer-chevron-btn"
              aria-label={isCollapsed ? `Expand ${sheet.name}` : `Collapse ${sheet.name}`}
              aria-expanded={!isCollapsed}
              onClick={() => toggleSheetCollapsed(sheet.id)}
              onDragOver={allowExplorerDrop}
            >
              <ExplorerChevron />
            </button>
          </div>
          <ExplorerSheetTables showTables={showTables}>
          <ul className="wk-explorer-tables" onDragOver={(event) => onTableListDragOver(event, sheet.id)}>
            {sheet.tableIds.map((tableId) => {
              const table = snapshot.tables.find((t) => t.id === tableId);
              if (!table) return null;
              const isSelected = selectedTableId(session.selection) === table.id;
              const tableClass = isSelected ? "wk-explorer-table is-selected" : "wk-explorer-table";
              return (
                <li key={table.id} data-explorer-table-id={table.id}>
                  <ExplorerDropMarker
                    active={
                      dropHint?.placement === "before-table" &&
                      dropHint.sheetId === sheet.id &&
                      dropHint.tableId === table.id
                    }
                  />
                  {canDragTable(session, table.id) ? (
                    <ExplorerDragSource
                      payload={{ kind: "table", id: table.id }}
                      onBegin={beginDrag}
                      className={tableClass}
                      onDragOverTarget={(event) => {
                        allowExplorerDrop(event);
                      }}
                      onActivate={() => {
                        setActiveSheetId(sheet.id);
                        session.focusFirstDataCell(table.id);
                      }}
                    >
                      {table.name}
                    </ExplorerDragSource>
                  ) : (
                    <button
                      type="button"
                      className={tableClass}
                      onDragOver={allowExplorerDrop}
                      onClick={() => {
                        setActiveSheetId(sheet.id);
                        session.focusFirstDataCell(table.id);
                      }}
                    >
                      {table.name}
                    </button>
                  )}
                </li>
              );
            })}
            {showTables ? (
              <li className="wk-explorer-table-append-marker" onDragOver={allowExplorerDrop}>
                <ExplorerDropMarker
                  active={dropHint?.placement === "append-tables" && dropHint.sheetId === sheet.id}
                />
              </li>
            ) : null}
            <li>
              <button
                type="button"
                className="wk-explorer-table wk-explorer-new"
                aria-label="New table"
                onClick={() =>
                  tryCall(() => {
                    const table = session.addTable(sheet.id);
                    setActiveSheetId(sheet.id);
                    session.revealTable(table.id);
                  })
                }
              >
                <span className="wk-explorer-new-glyph" aria-hidden="true">
                  +
                </span>
                New table
              </button>
            </li>
          </ul>
          </ExplorerSheetTables>
        </div>
      );
      })}
      {lastSheetId ? (
        <div
          className="wk-explorer-sheet-append-target"
          onDragOver={onSheetAppendDragOver}
          onDrop={commitExplorerDrop}
        >
          <ExplorerDropMarker active={dropHint?.placement === "after-sheet"} />
        </div>
      ) : null}
      <div className="wk-explorer-group">
        <button
          type="button"
          className="wk-explorer-group-btn wk-explorer-new-sheet"
          aria-label="New sheet"
          onClick={() => tryCall(() => session.addSheet())}
        >
          <span className="wk-explorer-new-glyph" aria-hidden="true">
            +
          </span>
          New sheet
        </button>
      </div>
    </nav>
  );
}

export { ScenarioBar } from "./ScenarioBar.js";

export function FormulaBar() {
  return null;
}

export function FormulaEditPlacementSwitch() {
  const { formulaEditPlacement, setFormulaEditPlacement } = useWorkbook();
  return (
    <div className="wk-grain" role="group" aria-label="Formula-edit placement">
      <button
        type="button"
        className={formulaEditPlacement === "popup" ? "is-active" : ""}
        onClick={() => setFormulaEditPlacement("popup")}
      >
        Popup
      </button>
      <button
        type="button"
        className={formulaEditPlacement === "inline" ? "is-active" : ""}
        onClick={() => setFormulaEditPlacement("inline")}
      >
        Inline
      </button>
    </div>
  );
}

export function TimeGrainSwitch() {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const selected = selectedYearColumn(snapshot, session.selection);
  if (!selected) return null;
  return (
    <div className="wk-grain">
      {(["month", "quarter", "year"] as const).map((g) => (
        <button
          key={g}
          type="button"
          className={selected.yearColumn.grain === g ? "is-active" : ""}
          onClick={() => tryCall(() => session.setYearColumnGrain(selected.tableId, selected.yearColumn.id, g))}
        >
          {g === "month" ? "Month" : g === "quarter" ? "Quarter" : "Year"}
        </button>
      ))}
    </div>
  );
}

