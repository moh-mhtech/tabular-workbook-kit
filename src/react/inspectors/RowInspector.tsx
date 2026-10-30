import { MixedTextInput } from "../MixedTextInput.js";
import { OutlinedField } from "../OutlinedField.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";
import { invalidRowKey } from "../../model/names.js";
import { isTotalRowId, totalRowKey, TOTAL_ROW_ID } from "../../model/tableTotals.js";
import { bandCellKey, KEY_COLUMN_ID } from "../../model/types.js";
import { StyleField } from "./StyleField.js";

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
  const dataRow = table?.rows.find((r) => r.id === rowId);
  const isTotal = Boolean(table && isTotalRowId(rowId));
  if (!table || (!dataRow && !isTotal)) return null;
  const key = isTotal ? totalRowKey(table) : dataRow!.key;
  const keyStyle = table.bandCellStyles?.[bandCellKey(rowId, KEY_COLUMN_ID)];
  return (
    <section>
      <OutlinedField label="Key">
        <MixedTextInput
          values={[key]}
          validate={(value) =>
            isTotal ? null : invalidRowKey(snapshot, table.id, dataRow!.id, value)
          }
          onCommit={(value) =>
            tryCall(() => session.renameRow(table.id, isTotal ? TOTAL_ROW_ID : dataRow!.id, value))
          }
        />
      </OutlinedField>
      <StyleField
        values={[keyStyle ?? {}]}
        onCommit={(style) => {
          tryCall(() => session.setCellStyle(table.id, rowId, KEY_COLUMN_ID, style));
        }}
      />
      {isTotal ? null : (
        <button type="button" onClick={() => tryCall(() => session.deleteRow(table.id, rowId))}>
          Delete row
        </button>
      )}
    </section>
  );
}
