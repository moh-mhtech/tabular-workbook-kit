import { blurOnEnter } from "../blurOnEnter.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";

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
      <label>
        Name
        <input
          defaultValue={sheet.name}
          onBlur={(e) => tryCall(() => session.renameSheet(sheet.id, e.target.value))}
          onKeyDown={blurOnEnter}
        />
      </label>
      <label>
        Horizontal scroll
        <select
          value={sheet.horizontalScroll ?? "table"}
          onChange={(e) =>
            tryCall(() => session.setSheetHorizontalScroll(sheet.id, e.target.value === "sheet" ? "sheet" : "table"))
          }
        >
          <option value="table">Per table</option>
          <option value="sheet">Sheet</option>
        </select>
      </label>
      {sheet.locked ? null : (
        <button type="button" onClick={() => tryCall(() => session.deleteSheet(sheet.id))}>
          Delete sheet
        </button>
      )}
    </section>
  );
}
