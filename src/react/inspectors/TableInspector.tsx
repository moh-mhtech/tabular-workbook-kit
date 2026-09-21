import { MixedTextInput } from "../MixedTextInput.js";
import { OutlinedField } from "../OutlinedField.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";
import { hasTimeColumns } from "../../model/yearColumns.js";

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
      <OutlinedField label="Name">
        <MixedTextInput
          values={[table.name]}
          onCommit={(value) => tryCall(() => session.renameTable(table.id, value))}
        />
      </OutlinedField>
      {table.promoteRowKeys ? (
        <p className="wk-muted">Row keys are workbook names. Single data column.</p>
      ) : (
        <>
          <label>
            <input
              type="checkbox"
              checked={hasTimeColumns(table)}
              onChange={(e) =>
                tryCall(() => (e.target.checked ? session.addYearColumn(table.id) : session.clearYearColumns(table.id)))
              }
            />
            Year columns
          </label>
          {hasTimeColumns(table) ? (
            <button type="button" onClick={() => tryCall(() => session.addYearColumn(table.id))}>
              Add year
            </button>
          ) : null}
        </>
      )}
      {table.locked ? null : (
        <button type="button" onClick={() => tryCall(() => session.deleteTable(table.id))}>
          Delete table
        </button>
      )}
    </section>
  );
}
