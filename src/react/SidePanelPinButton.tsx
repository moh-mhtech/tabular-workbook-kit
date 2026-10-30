import { WkPinIcon } from "./icons.js";
import { useWorkbook } from "./WorkbookProvider.js";

export function SidePanelPinButton({ side, label }: { side: "explorer" | "properties"; label: string }) {
  const { session, version } = useWorkbook();
  void version;
  const pinned = side === "explorer" ? session.isExplorerPinned() : session.isPropertiesPinned();
  const action = pinned ? `Unpin ${label}` : `Pin ${label}`;

  return (
    <button
      type="button"
      className={pinned ? "wk-side-pin is-pinned" : "wk-side-pin"}
      aria-label={action}
      aria-pressed={pinned}
      title={action}
      onClick={() => (side === "explorer" ? session.setExplorerPinned(!pinned) : session.setPropertiesPinned(!pinned))}
    >
      <WkPinIcon pinned={pinned} />
    </button>
  );
}
