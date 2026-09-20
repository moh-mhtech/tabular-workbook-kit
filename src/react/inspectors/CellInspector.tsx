import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";

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
          <label>
            Number format
            <input
              defaultValue={row.cells[columnId]?.format ?? ""}
              placeholder="Override column"
              onBlur={(e) => tryCall(() => session.setCellFormat(table.id, row.id, columnId, e.target.value))}
            />
          </label>
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
  return (
    <label>
      Name
      <input defaultValue={row.key} onBlur={(e) => tryCall(() => session.renameRow(table.id, row.id, e.target.value))} />
    </label>
  );
}
