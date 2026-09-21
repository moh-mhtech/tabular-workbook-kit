import { selectedCellRefs, type CellRef, type WorkbookSnapshot } from "../../model/types.js";
import { MixedTextInput } from "../MixedTextInput.js";
import { OutlinedField } from "../OutlinedField.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";
import { NumberFormatField } from "./NumberFormatField.js";
import { StyleField } from "./StyleField.js";

function cellStyle(snapshot: WorkbookSnapshot, ref: CellRef) {
  const table = snapshot.tables.find((candidate) => candidate.id === ref.tableId);
  const row = table?.rows.find((candidate) => candidate.id === ref.rowId);
  return row?.cells[ref.columnId]?.style;
}

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
  let overlay = false;
  try {
    overlay = Boolean(session.getCell(table.name, row.key, columnId)?.overlay);
  } catch {
    overlay = false;
  }
  return (
    <section>
      {overlay ? <p>Scenario overlay</p> : null}
      <NumberFormatField
        values={selectedCellRefs(session.selection).map((ref) => cellFormat(snapshot, ref))}
        onCommit={(value) => {
          const refs = selectedCellRefs(session.selection);
          session.transact(() => {
            for (const ref of refs) session.setCellFormat(ref.tableId, ref.rowId, ref.columnId, value);
          });
        }}
      />
      <StyleField
        values={selectedCellRefs(session.selection).map((ref) => cellStyle(snapshot, ref))}
        onCommit={(style) => {
          const refs = selectedCellRefs(session.selection);
          session.transact(() => {
            for (const ref of refs) session.setCellStyle(ref.tableId, ref.rowId, ref.columnId, style);
          });
        }}
      />
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
    <OutlinedField label="Name">
      <MixedTextInput
        values={[row.key]}
        onCommit={(value) => tryCall(() => session.renameRow(table.id, row.id, value))}
      />
    </OutlinedField>
  );
}
