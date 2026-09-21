import { MixedTextInput } from "../MixedTextInput.js";
import { OutlinedField } from "../OutlinedField.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";
import { invalidRowKey } from "../../model/names.js";

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
      <OutlinedField label="Key">
        <MixedTextInput
          values={[row.key]}
          validate={(value) => invalidRowKey(snapshot, table.id, row.id, value)}
          onCommit={(value) => tryCall(() => session.renameRow(table.id, row.id, value))}
        />
      </OutlinedField>
      <button type="button" onClick={() => tryCall(() => session.deleteRow(table.id, row.id))}>
        Delete row
      </button>
    </section>
  );
}
