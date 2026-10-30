import { useEffect, useRef, useState, type ReactNode, type TransitionEvent } from "react";

export const TABLE_GRID_COLLAPSE_MS = 220;

/** Collapse/expand table grid chrome (hide/show table) with the same motion as Explorer sheet tables. */
export function TableGridCollapse({
  open,
  children,
  onCollapsed,
}: {
  open: boolean;
  children: ReactNode;
  /** Fired after collapse animation and grid unmount (hidden chrome can apply). */
  onCollapsed?: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const collapseFinishedRef = useRef(false);

  useEffect(() => {
    if (open) {
      collapseFinishedRef.current = false;
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

  const finishCollapse = () => {
    if (collapseFinishedRef.current) return;
    collapseFinishedRef.current = true;
    setMounted(false);
    onCollapsed?.();
  };

  useEffect(() => {
    if (open || expanded) return;
    const timer = window.setTimeout(() => finishCollapse(), TABLE_GRID_COLLAPSE_MS + 40);
    return () => clearTimeout(timer);
  }, [open, expanded, onCollapsed]);

  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== "grid-template-rows" || open || expanded) return;
    finishCollapse();
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
