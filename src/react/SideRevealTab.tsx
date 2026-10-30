import { WkSideRevealChevronIcon } from "./icons.js";

/** Edge tab shown while a side panel is unpinned (auto-hide). */
export function SideRevealTab({
  edge,
  label,
  onReveal,
}: {
  edge: "left" | "right";
  label: string;
  onReveal: () => void;
}) {
  return (
    <button
      type="button"
      className={edge === "left" ? "wk-side-reveal-tab wk-side-reveal-tab-left" : "wk-side-reveal-tab wk-side-reveal-tab-right"}
      aria-label={`Show ${label}`}
      title={`Show ${label}`}
      onMouseEnter={onReveal}
      onFocus={onReveal}
    >
      <span className="wk-side-reveal-tab-label">{label}</span>
      <WkSideRevealChevronIcon edge={edge} />
    </button>
  );
}
