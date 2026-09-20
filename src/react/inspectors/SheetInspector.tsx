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
      <h3>Sheet</h3>
      <label>
        Name
        <input
          defaultValue={sheet.name}
          onBlur={(e) => tryCall(() => session.renameSheet(sheet.id, e.target.value))}
          onKeyDown={blurOnEnter}
        />
      </label>
      {sheet.locked ? null : (
        <button type="button" onClick={() => tryCall(() => session.deleteSheet(sheet.id))}>
          Delete sheet
        </button>
      )}
    </section>
  );
}
