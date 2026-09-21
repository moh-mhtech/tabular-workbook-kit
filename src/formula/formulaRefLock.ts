import { IDENTIFIER } from "../model/structure.js";

export type FormulaRefLockContext = {
  columnName: string;
  rowKey: string;
  sameColumn: boolean;
  sameRow: boolean;
};

const STRUCTURED = new RegExp(
  `^((?:(${IDENTIFIER})\\.)?(${IDENTIFIER}))?\\[([^\\]]+)\\](?:\\[([^\\]]+)\\])?$`,
  "u",
);

export function cycleFormulaRefLock(ref: string, context: FormulaRefLockContext | null): string {
  if (ref.includes(":")) {
    return ref
      .split(":")
      .map((part) => cycleFormulaRefLock(part, context))
      .join(":");
  }
  const match = ref.match(STRUCTURED);
  if (!match) return ref;
  const prefix = match[1] ?? "";
  const col = match[4]!;
  const row = match[5];
  if (!row) {
    const next = isLocked(col) ? relativeToken(context?.columnName ?? bareToken(col), context?.sameColumn ?? false) : lockToken(context?.columnName ?? bareToken(col));
    return `${prefix}[${next}]`;
  }
  const state = lockState(col, row);
  const next = (state + 1) % 4;
  const colName = context?.columnName ?? bareToken(col);
  const rowKey = context?.rowKey ?? bareToken(row);
  return `${prefix}[${axisToken(next, "col", colName, context?.sameColumn ?? false)}][${axisToken(next, "row", rowKey, context?.sameRow ?? false)}]`;
}

function lockState(col: string, row: string): 0 | 1 | 2 | 3 {
  const colAbs = isLocked(col);
  const rowAbs = isLocked(row);
  if (colAbs && rowAbs) return 1;
  if (!colAbs && rowAbs) return 2;
  if (colAbs && !rowAbs) return 3;
  return 0;
}

function axisToken(state: number, axis: "col" | "row", name: string, current: boolean): string {
  const abs = axis === "col" ? state === 1 || state === 3 : state === 1 || state === 2;
  return abs ? lockToken(name) : relativeToken(name, current);
}

function isLocked(token: string): boolean {
  return token.startsWith("$");
}

function bareToken(token: string): string {
  return token.startsWith("$") ? token.slice(1) : token;
}

function lockToken(name: string): string {
  if (name.startsWith("@")) return name;
  return `$${bareToken(name)}`;
}

function relativeToken(name: string, current: boolean): string {
  return current ? "@" : bareToken(name);
}

export function stripFormulaRefLock(token: string): string {
  return token.startsWith("$") ? token.slice(1) : token;
}

export function applyFormulaRefLockCycle(
  draft: string,
  span: { start: number; end: number } | null,
  context: FormulaRefLockContext | null,
): { draft: string; start: number; end: number } | null {
  if (!span) return null;
  const current = draft.slice(span.start, span.end);
  const next = cycleFormulaRefLock(current, context);
  if (next === current) return null;
  return {
    draft: draft.slice(0, span.start) + next + draft.slice(span.end),
    start: span.start,
    end: span.start + next.length,
  };
}
