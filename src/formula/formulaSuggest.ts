import type { WorkbookLayout } from "../model/layout.js";
import { tableYearColumns, visibleTimeSlots } from "../model/yearColumns.js";

export type FormulaSuggestionKind = "function" | "table" | "name" | "column";

export type FormulaSuggestion = {
  label: string;
  insert: string;
  kind: FormulaSuggestionKind;
};

const FUNCTIONS = [
  "SUM",
  "IF",
  "IFS",
  "INDEX",
  "MATCH",
  "AVERAGE",
  "MIN",
  "MAX",
  "ROUND",
  "ABS",
  "AND",
  "OR",
  "NOT",
];

export function formulaPrefix(
  draft: string,
  cursor: number,
): { start: number; text: string; bracket: boolean } | null {
  if (!draft.trimStart().startsWith("=")) return null;
  const before = draft.slice(0, cursor);
  const bracket = before.match(/\[([A-Za-z0-9ÆØÅæøå_-]*)$/);
  if (bracket?.index !== undefined) {
    return { start: bracket.index + 1, text: bracket[1]!, bracket: true };
  }
  const match = before.match(/([A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*)$/);
  if (match?.index === undefined) return null;
  return { start: match.index, text: match[1]!, bracket: false };
}

export function suggestFormula(
  draft: string,
  cursor: number,
  layout: WorkbookLayout,
): FormulaSuggestion[] {
  const prefix = formulaPrefix(draft, cursor);
  if (!prefix) return [];
  if (!prefix.bracket && !prefix.text) return [];
  const needle = prefix.text.toLowerCase();
  const items: FormulaSuggestion[] = [];
  const wantNames = !prefix.bracket;
  if (wantNames) {
    for (const name of FUNCTIONS) {
      if (name.toLowerCase().startsWith(needle)) {
        items.push({ label: name, insert: `${name}(`, kind: "function" });
      }
    }
  }
  for (const table of layout.tables.values()) {
    if (wantNames && table.table.name.toLowerCase().startsWith(needle)) {
      items.push({ label: table.table.name, insert: table.table.name, kind: "table" });
    }
    if (wantNames) {
      for (const row of table.table.rows) {
        if (row.key.toLowerCase().startsWith(needle)) {
          items.push({ label: row.key, insert: row.key, kind: "name" });
        }
      }
    }
    for (const column of table.columns) {
      if (column.kind === "key") continue;
      const nameHit = !needle || column.name.toLowerCase().startsWith(needle);
      const idHit = !needle || column.id.toLowerCase().startsWith(needle);
      if (column.kind === "period" && !nameHit) continue;
      if (!nameHit && !idHit) continue;
      items.push({ label: column.name || column.id, insert: column.kind === "period" ? column.name : column.id, kind: "column" });
    }
    for (const yearCol of tableYearColumns(table.table)) {
      const tokens = [
        String(yearCol.year),
        `${yearCol.year}-Q1`,
        `${yearCol.year}-Q2`,
        `${yearCol.year}-Q3`,
        `${yearCol.year}-Q4`,
      ];
      for (const token of tokens) {
        if (!needle || token.toLowerCase().startsWith(needle)) {
          items.push({ label: token, insert: token, kind: "column" });
        }
      }
    }
    for (const slot of visibleTimeSlots(table.table, layout.periods)) {
      if (!needle || slot.id.toLowerCase().startsWith(needle) || slot.name.toLowerCase().startsWith(needle)) {
        items.push({ label: slot.id, insert: slot.id, kind: "column" });
      }
    }
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.label.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

export function applySuggestion(draft: string, cursor: number, suggestion: FormulaSuggestion): { draft: string; caret: number } {
  const prefix = formulaPrefix(draft, cursor);
  const start = prefix?.start ?? cursor;
  const next = draft.slice(0, start) + suggestion.insert + draft.slice(cursor);
  return { draft: next, caret: start + suggestion.insert.length };
}
