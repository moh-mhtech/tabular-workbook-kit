import { useEffect } from "react";
import { structureDeleteCommands, type StructureDeleteCommands } from "./gridStructureDelete.js";
import { useSnapshot, useWorkbook } from "./WorkbookProvider.js";

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function GridContextMenu({
  x,
  y,
  commands: commandsOverride,
  onClose,
}: {
  x: number;
  y: number;
  commands?: StructureDeleteCommands;
  onClose: () => void;
}) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const commands = commandsOverride ?? structureDeleteCommands(snapshot, session.selection);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onMouse = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest(".wk-grid-context-menu")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouse);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouse);
    };
  }, [onClose]);

  if (!commands.rows && !commands.columns) return null;

  const run = (action: () => void) => {
    onClose();
    tryCall(action);
  };

  return (
    <ul
      className="wk-menu wk-grid-context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {commands.rows ? (
        <li role="none">
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              run(() => session.deleteRows(commands.rows!.tableId, commands.rows!.rowIds!))
            }
          >
            {commands.rows.label}
          </button>
        </li>
      ) : null}
      {commands.columns ? (
        <li role="none">
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              run(() => session.deleteColumns(commands.columns!.tableId, commands.columns!.columnIds!))
            }
          >
            {commands.columns.label}
          </button>
        </li>
      ) : null}
    </ul>
  );
}
