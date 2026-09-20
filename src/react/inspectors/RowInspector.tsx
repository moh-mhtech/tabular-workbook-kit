import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function RowInspector({ tableId, rowId }: { tableId: string; rowId: string }) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const table = snapshot.tables.find((t) => t.id === tableId);
  const row = table?.rows.find((r) => r.id === rowId);
  if (!table || !row) return null;
  return (
    <section>
      <h3>Row</h3>
      <label>
        Key
        <input defaultValue={row.key} onBlur={(e) => tryCall(() => session.renameRow(table.id, row.id, e.target.value))} />
      </label>
      <button type="button" onClick={() => tryCall(() => session.deleteRow(table.id, row.id))}>
        Delete row
      </button>
    </section>
  );
}
