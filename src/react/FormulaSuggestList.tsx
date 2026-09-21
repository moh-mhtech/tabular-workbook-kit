import type { FormulaSuggestion } from "../formula/formulaSuggest.js";

export function FormulaSuggestList({
  items,
  active,
  onPick,
}: {
  items: FormulaSuggestion[];
  active: number;
  onPick: (item: FormulaSuggestion) => void;
}) {
  if (!items.length) return null;
  return (
    <ul className="wk-formula-suggest" role="listbox">
      {items.map((item, index) => (
        <li key={`${item.kind}:${item.label}`}>
          <button
            type="button"
            role="option"
            aria-selected={index === active}
            className={index === active ? "is-active" : ""}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(item);
            }}
          >
            {item.label}
            <span className="wk-muted"> {item.kind}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
