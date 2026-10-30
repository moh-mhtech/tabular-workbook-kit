import { useEffect, useState, type ReactNode, type TransitionEvent } from "react";

export const TABLE_GRID_COLLAPSE_MS = 220;

/** Collapse/expand table grid chrome (hide/show table) with the same motion as Explorer sheet tables. */
export function TableGridCollapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExpanded(false);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setExpanded(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (open || expanded) return;
    const timer = window.setTimeout(() => setMounted(false), TABLE_GRID_COLLAPSE_MS + 40);
    return () => clearTimeout(timer);
  }, [open, expanded]);

  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== "grid-template-rows" || open || expanded) return;
    setMounted(false);
  };

  if (!mounted) return null;

  return (
    <div
      className={expanded ? "wk-table-grid-collapse is-expanded" : "wk-table-grid-collapse"}
      data-table-grid-wrap
      data-expanded={expanded ? "true" : "false"}
      aria-hidden={!open && !expanded ? true : undefined}
      onTransitionEnd={onTransitionEnd}
    >
      <div className="wk-table-grid-collapse-inner">{children}</div>
    </div>
  );
}
