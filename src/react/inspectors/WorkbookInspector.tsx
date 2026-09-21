import { MixedTextInput } from "../MixedTextInput.js";
import { OutlinedField } from "../OutlinedField.js";
import { useWorkbook, useSnapshot } from "../WorkbookProvider.js";

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function WorkbookInspector({ label }: { label: string }) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  return (
    <section>
      <h3>{label}</h3>
      <OutlinedField label="Name">
        <MixedTextInput values={[snapshot.name]} onCommit={(value) => tryCall(() => session.renameWorkbook(value))} />
      </OutlinedField>
      <OutlinedField label="Start month">
        <MixedTextInput
          values={[snapshot.calendar.startMonth]}
          onCommit={(value) => tryCall(() => session.setCalendar({ ...snapshot.calendar, startMonth: value }))}
        />
      </OutlinedField>
      <OutlinedField label="Months">
        <MixedTextInput
          type="number"
          values={[String(snapshot.calendar.monthCount)]}
          onCommit={(value) =>
            tryCall(() =>
              session.setCalendar({
                ...snapshot.calendar,
                monthCount: Number(value) || snapshot.calendar.monthCount,
              }),
            )
          }
        />
      </OutlinedField>
    </section>
  );
}
