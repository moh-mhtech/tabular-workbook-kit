import { blurOnEnter } from "../blurOnEnter.js";
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
      <label>
        Name
        <input
          defaultValue={snapshot.name}
          onBlur={(e) => tryCall(() => session.renameWorkbook(e.target.value))}
          onKeyDown={blurOnEnter}
        />
      </label>
      <label>
        Start month
        <input
          defaultValue={snapshot.calendar.startMonth}
          onBlur={(e) =>
            tryCall(() => session.setCalendar({ ...snapshot.calendar, startMonth: e.target.value }))
          }
          onKeyDown={blurOnEnter}
        />
      </label>
      <label>
        Months
        <input
          type="number"
          defaultValue={snapshot.calendar.monthCount}
          onBlur={(e) =>
            tryCall(() =>
              session.setCalendar({
                ...snapshot.calendar,
                monthCount: Number(e.target.value) || snapshot.calendar.monthCount,
              }),
            )
          }
          onKeyDown={blurOnEnter}
        />
      </label>
    </section>
  );
}
