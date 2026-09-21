import { KEY_COLUMN_ID, type TimeGrain } from "../../model/types.js";
import { selectedYearColumn } from "../../model/yearColumns.js";
import { MixedTextInput } from "../MixedTextInput.js";
import { OutlinedField } from "../OutlinedField.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";
import { NumberFormatField } from "./NumberFormatField.js";
import { StyleField } from "./StyleField.js";

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
  const yearCol = selectedYearColumn(snapshot, { kind: "column", tableId, columnId });
  return (
    <section>
      {col ? (
        <OutlinedField label="Name">
          <MixedTextInput
            values={[col.name]}
            onCommit={(value) => tryCall(() => session.renameColumn(table.id, col.id, value))}
          />
        </OutlinedField>
      ) : (
        <p>{period ? `Period ${columnId}` : "Key"}</p>
      )}
      {columnId !== KEY_COLUMN_ID ? (
        <>
          <NumberFormatField values={[format]} onCommit={(value) => session.setColumnFormat(table.id, columnId, value)} />
          <StyleField
            values={[col?.style ?? table.columnStyles?.[columnId]]}
            onCommit={(style) => session.setColumnStyle(table.id, columnId, style)}
          />
        </>
      ) : null}
      {yearCol && period ? (
        <OutlinedField label="Grain">
          <select
            value={yearCol.yearColumn.grain}
            onChange={(e) =>
              tryCall(() => session.setYearColumnGrain(table.id, yearCol.yearColumn.id, e.target.value as TimeGrain))
            }
          >
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </OutlinedField>
      ) : null}
    </section>
  );
}
