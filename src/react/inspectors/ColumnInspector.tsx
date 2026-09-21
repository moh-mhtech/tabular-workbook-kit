import { KEY_COLUMN_ID } from "../../model/types.js";
import { blurOnEnter } from "../blurOnEnter.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";
import { NumberFormatField } from "./NumberFormatField.js";

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function ColumnInspector({ tableId, columnId }: { tableId: string; columnId: string }) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const table = snapshot.tables.find((t) => t.id === tableId);
  const col = table?.attributeColumns.find((c) => c.id === columnId);
  const period = columnId !== KEY_COLUMN_ID && !col;
  if (!table) return null;
  const format = col?.format ?? table.columnFormats?.[columnId] ?? "";
  return (
    <section>
      {col ? (
        <label>
          Name
          <input
            defaultValue={col.name}
            onBlur={(e) => tryCall(() => session.renameColumn(table.id, col.id, e.target.value))}
            onKeyDown={blurOnEnter}
          />
        </label>
      ) : (
        <p>{period ? `Period ${columnId}` : "Key"}</p>
      )}
      {columnId !== KEY_COLUMN_ID ? (
        <NumberFormatField values={[format]} onCommit={(value) => session.setColumnFormat(table.id, columnId, value)} />
      ) : null}
    </section>
  );
}
