import { selectedCellRefs, type CellRef, type WorkbookSnapshot } from "../../model/types.js";
import { blurOnEnter } from "../blurOnEnter.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";
import { NumberFormatField } from "./NumberFormatField.js";

function cellFormat(snapshot: WorkbookSnapshot, ref: CellRef): string {
  const table = snapshot.tables.find((candidate) => candidate.id === ref.tableId);
  const row = table?.rows.find((candidate) => candidate.id === ref.rowId);
  return row?.cells[ref.columnId]?.format ?? "";
}

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function CellInspector({
  tableId,
  rowId,
  columnId,
}: {
  tableId: string;
  rowId: string;
  columnId: string;
}) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const table = snapshot.tables.find((t) => t.id === tableId);
  const row = table?.rows.find((r) => r.id === rowId);
  if (!table || !row) return null;
  let cell;
  try {
    cell = session.getCell(table.name, row.key, columnId);
  } catch {
    cell = null;
  }
  return (
    <section>
      {cell ? (
        <>
          {cell.overlay ? <p>Scenario overlay</p> : null}
          <NumberFormatField
            values={selectedCellRefs(session.selection).map((ref) => cellFormat(snapshot, ref))}
            onCommit={(value) => {
              const refs = selectedCellRefs(session.selection);
              session.transact(() => {
                for (const ref of refs) session.setCellFormat(ref.tableId, ref.rowId, ref.columnId, value);
              });
            }}
          />
        </>
      ) : null}
    </section>
  );
}

export function CellNameField({
  tableId,
  rowId,
  columnId,
}: {
  tableId: string;
  rowId: string;
  columnId: string;
}) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const table = snapshot.tables.find((t) => t.id === tableId);
  const row = table?.rows.find((r) => r.id === rowId);
  if (!table || !row) return null;
  if (!table.promoteRowKeys || table.attributeColumns[0]?.id !== columnId) return null;
  if (selectedCellRefs(session.selection).length > 1) return null;
  return (
    <label>
      Name
      <input
        defaultValue={row.key}
        onBlur={(e) => tryCall(() => session.renameRow(table.id, row.id, e.target.value))}
        onKeyDown={blurOnEnter}
      />
    </label>
  );
}
