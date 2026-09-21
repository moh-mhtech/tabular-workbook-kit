import { useEffect, useState } from "react";
import { sharedOrStar } from "../model/types.js";
import { blurOnEnter } from "./blurOnEnter.js";

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

export function MixedTextInput({
  values,
  onCommit,
  placeholder,
  type,
  validate,
}: {
  values: string[];
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  validate?: (draft: string) => string | undefined;
}) {
  const first = values[0] ?? "";
  const idle = sharedOrStar(values);
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? idle;
  const error = idle === "*" && draft === null ? undefined : validate?.(shown);

  useEffect(() => {
    setDraft(null);
  }, [idle, first]);

  return (
    <input
      type={type}
      value={shown}
      placeholder={placeholder ?? " "}
      aria-invalid={error ? true : undefined}
      title={error}
      onFocus={() => setDraft(first)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft ?? idle;
        if (next === idle || validate?.(next)) {
          setDraft(null);
          return;
        }
        setDraft(null);
        tryCall(() => onCommit(next));
      }}
      onKeyDown={blurOnEnter}
    />
  );
}
