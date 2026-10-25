import { selectedYearColumn } from "../model/yearColumns.js";
import { useSnapshot, useWorkbook } from "./WorkbookProvider.js";
import "./workbook.css";

export { PropertiesPanel } from "./PropertiesPanel.js";

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
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

export function Explorer({ workbookFolderIcon = false }: { workbookFolderIcon?: boolean }) {
  const { session, activeSheetId, setActiveSheetId } = useWorkbook();
  const snapshot = useSnapshot();

  return (
    <nav className="wk-explorer" aria-label="Sheets">
      <button
        type="button"
        className="wk-explorer-group-btn wk-explorer-workbook"
        onClick={() => session.setSelection({ kind: "workbook" })}
      >
        {workbookFolderIcon ? <ExplorerFolderIcon /> : null}
        <span>{snapshot.name}</span>
      </button>
      {snapshot.sheets.map((sheet) => (
        <div key={sheet.id} className="wk-explorer-group">
          <button
            type="button"
            className={sheet.id === activeSheetId ? "wk-explorer-group-btn is-active" : "wk-explorer-group-btn"}
            onClick={() => {
              setActiveSheetId(sheet.id);
              session.setSelection({ kind: "sheet", sheetId: sheet.id });
            }}
          >
            {sheet.name}
          </button>
          <ul className="wk-explorer-tables">
            {sheet.tableIds.map((tableId) => {
              const table = snapshot.tables.find((t) => t.id === tableId);
              if (!table) return null;
              return (
                <li key={table.id}>
                  <button
                    type="button"
                    className="wk-explorer-table"
                    onClick={() => {
                      setActiveSheetId(sheet.id);
                      session.revealTable(table.id);
                    }}
                  >
                    {table.name}
                  </button>
                </li>
              );
            })}
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
        </div>
      ))}
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
          {g === "month" ? "Måned" : g === "quarter" ? "Kvartal" : "År"}
        </button>
      ))}
    </div>
  );
}

