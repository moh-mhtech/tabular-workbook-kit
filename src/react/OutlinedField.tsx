import type { ReactNode } from "react";

export function OutlinedField({
  label,
  endLabel,
  className,
  trailing,
  children,
}: {
  label: string;
  endLabel?: string;
  className?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className={["wk-outlined", className].filter(Boolean).join(" ")}>
      {children}
      <span className="wk-outlined-label">{label}</span>
      {endLabel ? (
        <span className="wk-outlined-end" title={endLabel} aria-hidden="true">
          {endLabel}
        </span>
      ) : null}
      {trailing ? <span className="wk-outlined-trailing">{trailing}</span> : null}
    </label>
  );
}
