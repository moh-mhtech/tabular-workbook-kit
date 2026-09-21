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

export function Explorer({ workbookLabel = "Workbook" }: { workbookLabel?: string }) {
  const { session, activeSheetId, setActiveSheetId } = useWorkbook();
  const snapshot = useSnapshot();

  return (
    <nav className="wk-explorer" aria-label="Sheets">
      <button type="button" className="wk-explorer-group-btn" onClick={() => session.setSelection({ kind: "workbook" })}>
        {workbookLabel}
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
          className="wk-explorer-group-btn wk-explorer-new"
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

export function ScenarioBar() {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const activeId = snapshot.activeScenarioId;

  return (
    <div className="wk-scenario-bar">
      <span className="wk-label">Scenario</span>
      <select
        value={activeId ?? ""}
        onChange={(e) => session.activateScenario(e.target.value || null)}
      >
        <option value="">Base</option>
        {snapshot.scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => tryCall(() => session.addScenario())}>
        Add
      </button>
      <button
        type="button"
        disabled={!activeId}
        onClick={() =>
          tryCall(() => {
            if (!activeId) return;
            const current = snapshot.scenarios.find((s) => s.id === activeId);
            const next = window.prompt("Rename scenario", current?.name ?? "");
            if (next != null) session.renameScenario(activeId, next);
          })
        }
      >
        Rename
      </button>
      <button type="button" disabled={!activeId} onClick={() => tryCall(() => activeId && session.duplicateScenario(activeId))}>
        Duplicate
      </button>
      <button type="button" disabled={!activeId} onClick={() => tryCall(() => activeId && session.deleteScenario(activeId))}>
        Delete
      </button>
    </div>
  );
}

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

