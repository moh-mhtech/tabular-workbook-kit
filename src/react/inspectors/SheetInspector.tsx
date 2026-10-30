import { MixedTextInput } from "../MixedTextInput.js";
import { OutlinedField } from "../OutlinedField.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";
import { invalidGlobalName } from "../../model/names.js";
import { resolveSheetHorizontalScroll } from "../../model/types.js";

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function SheetInspector({ sheetId }: { sheetId: string }) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const sheet = snapshot.sheets.find((s) => s.id === sheetId);
  if (!sheet) return null;
  return (
    <section>
      <OutlinedField label="Name">
        <MixedTextInput
          values={[sheet.name]}
          validate={(value) => invalidGlobalName(snapshot, value, { sheetId: sheet.id })}
          onCommit={(value) => tryCall(() => session.renameSheet(sheet.id, value))}
        />
      </OutlinedField>
      <OutlinedField label="Horizontal scroll">
        <select
          value={resolveSheetHorizontalScroll(sheet.horizontalScroll)}
          onChange={(e) =>
            tryCall(() => session.setSheetHorizontalScroll(sheet.id, e.target.value === "sheet" ? "sheet" : "table"))
          }
        >
          <option value="table">Per table</option>
          <option value="sheet">Sheet</option>
        </select>
      </OutlinedField>
      {sheet.locked ? null : (
        <button type="button" onClick={() => tryCall(() => session.deleteSheet(sheet.id))}>
          Delete sheet
        </button>
      )}
    </section>
  );
}
