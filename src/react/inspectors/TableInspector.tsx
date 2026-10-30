import { MixedTextInput } from "../MixedTextInput.js";
import { OutlinedField } from "../OutlinedField.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";
import { hasTimeColumns } from "../../model/yearColumns.js";
import { invalidTableName } from "../../model/names.js";

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
    <section className="wk-inspector-section">
      <OutlinedField label="Name">
        <MixedTextInput
          values={[table.name]}
          validate={(value) => invalidTableName(snapshot, value, table.id)}
          onCommit={(value) => tryCall(() => session.renameTable(table.id, value))}
        />
      </OutlinedField>
      {table.promoteRowKeys ? (
        <p className="wk-muted wk-inspector-note">Row keys are workbook names. Single data column.</p>
      ) : (
        <>
          <fieldset className="wk-inspector-group wk-inspector-card">
            <legend className="wk-inspector-group-title">Time</legend>
            <label className="wk-check-row">
              <input
                type="checkbox"
                checked={hasTimeColumns(table)}
                aria-label="Year columns"
                onChange={(e) =>
                  tryCall(() =>
                    e.target.checked ? session.addYearColumn(table.id) : session.clearYearColumns(table.id),
                  )
                }
              />
              <span>Year columns</span>
            </label>
            {hasTimeColumns(table) ? (
              <button
                type="button"
                className="wk-inspector-btn wk-inspector-btn-secondary"
                onClick={() => tryCall(() => session.addYearColumn(table.id))}
              >
                Add year
              </button>
            ) : null}
          </fieldset>
          <fieldset className="wk-inspector-group wk-inspector-card">
            <legend className="wk-inspector-group-title">Totals</legend>
            <label className="wk-check-row">
              <input
                type="checkbox"
                checked={table.totalsRow === true}
                aria-label="Total row"
                onChange={(e) => tryCall(() => session.setTableTotalsRow(table.id, e.target.checked))}
              />
              <span>Total row</span>
            </label>
            {table.totalsRow ? (
              <div className="wk-inspector-subfield">
                <OutlinedField label="Row range">
                  <MixedTextInput
                    values={[table.totalsRowRange ?? ""]}
                    validate={() => null}
                    placeholder="All rows if empty"
                    onCommit={(value) => tryCall(() => session.setTableTotalsRowRange(table.id, value))}
                  />
                </OutlinedField>
                <p className="wk-inspector-hint">Row keys, comma list, or Red:Channel</p>
              </div>
            ) : null}
            <label className="wk-check-row">
              <input
                type="checkbox"
                checked={table.totalsColumn === true}
                aria-label="Total column"
                onChange={(e) => tryCall(() => session.setTableTotalsColumn(table.id, e.target.checked))}
              />
              <span>Total column</span>
            </label>
            {table.totalsColumn ? (
              <div className="wk-inspector-subfield">
                <OutlinedField label="Column range">
                  <MixedTextInput
                    values={[table.totalsColumnRange ?? ""]}
                    validate={() => null}
                    placeholder="All columns if empty"
                    onCommit={(value) => tryCall(() => session.setTableTotalsColumnRange(table.id, value))}
                  />
                </OutlinedField>
                <p className="wk-inspector-hint">Column headers in table order</p>
              </div>
            ) : null}
          </fieldset>
        </>
      )}
      {table.locked ? null : (
        <div className="wk-inspector-actions wk-inspector-actions-divider">
          <button
            type="button"
            className="wk-inspector-btn wk-inspector-btn-danger"
            onClick={() => tryCall(() => session.deleteTable(table.id))}
          >
            Delete table
          </button>
        </div>
      )}
    </section>
  );
}
