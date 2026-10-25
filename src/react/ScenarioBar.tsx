import { useEffect, useRef, useState } from "react";
import { useSnapshot, useWorkbook } from "./WorkbookProvider.js";

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function ScenarioBar() {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const activeId = snapshot.activeScenarioId;
  const [menuOpen, setMenuOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (comboRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    tryCall(action);
  };

  return (
    <div className="wk-scenario-bar" role="group" aria-label="Scenario">
      <label className="wk-label" htmlFor="wk-scenario">
        Scenario
      </label>
      <div className="wk-scenario-combo" ref={comboRef}>
        <select
          id="wk-scenario"
          aria-label="Scenario"
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
        <button
          type="button"
          className="wk-scenario-menu-btn"
          aria-label="Scenario options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="wk-scenario-menu-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        {menuOpen ? (
          <ul className="wk-scenario-menu" role="menu">
            <li role="none">
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => session.addScenario())}>
                Add
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                disabled={!activeId}
                onClick={() =>
                  runMenuAction(() => {
                    if (!activeId) return;
                    const current = snapshot.scenarios.find((s) => s.id === activeId);
                    const next = window.prompt("Rename scenario", current?.name ?? "");
                    if (next != null) session.renameScenario(activeId, next);
                  })
                }
              >
                Rename
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                disabled={!activeId}
                onClick={() => runMenuAction(() => activeId && session.duplicateScenario(activeId))}
              >
                Duplicate
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                disabled={!activeId}
                onClick={() => runMenuAction(() => activeId && session.deleteScenario(activeId))}
              >
                Delete
              </button>
            </li>
          </ul>
        ) : null}
      </div>
    </div>
  );
}
