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
}: {
  values: string[];
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  const first = values[0] ?? "";
  const idle = sharedOrStar(values);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [idle, first]);

  return (
    <input
      type={type}
      value={draft ?? idle}
      placeholder={placeholder ?? " "}
      onFocus={() => setDraft(first)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft ?? idle;
        setDraft(null);
        if (next === idle) return;
        tryCall(() => onCommit(next));
      }}
      onKeyDown={blurOnEnter}
    />
  );
}
