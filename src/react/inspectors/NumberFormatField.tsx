import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDisplayValue } from "../../model/numberFormat.js";
import { KEY_COLUMN_ID, type Selection, type WorkbookSnapshot } from "../../model/types.js";
import type { WorkbookSession } from "../../session/WorkbookSession.js";
import { MixedTextInput } from "../MixedTextInput.js";
import { OutlinedField } from "../OutlinedField.js";
import { useWorkbook } from "../WorkbookProvider.js";

const FORMAT_EXAMPLES: Array<{ pattern: string; note: string }> = [
  { pattern: "G3", note: "3 significant digits" },
  { pattern: "#,##G3", note: "with thousand separators" },
  { pattern: "G3A", note: "auto K/M/B/T from 1,000" },
  { pattern: "G3K", note: "fixed thousands" },
  { pattern: "G3M", note: "fixed millions" },
  { pattern: "G3B", note: "fixed billions" },
  { pattern: "USD G3A", note: "prefix + compact" },
  { pattern: 'G3A" kr"', note: "quoted suffix" },
  { pattern: "0.00", note: "2 decimal places" },
  { pattern: "0%", note: "percent" },
];

const FALLBACK_EXAMPLE = 8_000_000;

export function firstSelectedCell(
  snapshot: WorkbookSnapshot,
  selection: Selection | null,
): { tableId: string; rowId: string; columnId: string } | null {
  if (!selection) return null;
  if (selection.kind === "cell") return selection.range?.[0] ?? selection;
  if (selection.kind === "column") {
    const table = snapshot.tables.find((candidate) => candidate.id === selection.tableId);
    const row = table?.rows[0];
    return table && row ? { tableId: table.id, rowId: row.id, columnId: selection.columnId } : null;
  }
  if (selection.kind === "row" || selection.kind === "table") {
    const table = snapshot.tables.find((candidate) => candidate.id === selection.tableId);
    if (!table) return null;
    const row = selection.kind === "row" ? table.rows.find((candidate) => candidate.id === selection.rowId) : table.rows[0];
    const columnId =
      table.attributeColumns[0]?.id ??
      Object.keys(row?.cells ?? {}).find((id) => id !== KEY_COLUMN_ID);
    return row && columnId ? { tableId: table.id, rowId: row.id, columnId } : null;
  }
  return null;
}

export function exampleNumberFromSelection(session: WorkbookSession): number | undefined {
  const snapshot = session.getSnapshot();
  const target = firstSelectedCell(snapshot, session.selection);
  if (!target) return undefined;
  const table = snapshot.tables.find((candidate) => candidate.id === target.tableId);
  const row = table?.rows.find((candidate) => candidate.id === target.rowId);
  if (!table || !row) return undefined;
  try {
    const computed = session.getCell(table.name, row.key, target.columnId).computed;
    if (typeof computed === "number" && Number.isFinite(computed)) return computed;
  } catch {
    /* workbook may not be calculated yet */
  }
  const raw = row.cells[target.columnId]?.value;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function NumberFormatField({
  values,
  onCommit,
}: {
  values: string[];
  onCommit: (value: string) => void;
}) {
  return (
    <OutlinedField label="Format" trailing={<NumberFormatHelp />}>
      <MixedTextInput values={values} placeholder="G3, #,##G3, G3A, G3K" onCommit={onCommit} />
    </OutlinedField>
  );
}

function NumberFormatHelp() {
  const { session } = useWorkbook();
  const iconRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const sample = exampleNumberFromSelection(session) ?? FALLBACK_EXAMPLE;

  const show = () => {
    const rect = iconRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 360;
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
    setOpen(true);
  };

  return (
    <span className="wk-help" onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        ref={iconRef}
        type="button"
        className="wk-help-icon"
        aria-label="Number format examples"
        onClick={(event) => event.preventDefault()}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open
        ? createPortal(
            <div className="wk-help-pop" role="tooltip" style={{ top: pos.top, left: pos.left }}>
              <p className="wk-help-pop-title">Examples using {formatDisplayValue(sample)}</p>
              <ul>
                {FORMAT_EXAMPLES.map((example) => (
                  <li key={example.pattern}>
                    <code>{example.pattern}</code>
                    <span>{formatDisplayValue(sample, example.pattern)}</span>
                    <em>{example.note}</em>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
