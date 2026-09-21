import { blurOnEnter } from "../blurOnEnter.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function TableInspector({ tableId }: { tableId: string }) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const table = snapshot.tables.find((t) => t.id === tableId);
  if (!table) return null;
  return (
    <section>
      <label>
        Name
        <input
          defaultValue={table.name}
          onBlur={(e) => tryCall(() => session.renameTable(table.id, e.target.value))}
          onKeyDown={blurOnEnter}
        />
      </label>
      {table.promoteRowKeys ? (
        <p className="wk-muted">Row keys are workbook names. Single data column.</p>
      ) : (
        <label>
          <input
            type="checkbox"
            checked={table.timeAxis}
            onChange={(e) => tryCall(() => session.setTimeAxis(table.id, e.target.checked))}
          />
          Months
        </label>
      )}
      {table.locked ? null : (
        <button type="button" onClick={() => tryCall(() => session.deleteTable(table.id))}>
          Delete table
        </button>
      )}
    </section>
  );
}
