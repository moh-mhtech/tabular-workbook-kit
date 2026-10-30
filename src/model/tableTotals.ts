import type { Primitive } from "./types.js";
import type { TableSnapshot } from "./types.js";

export const TOTAL_ROW_ID = "__wk-total-row__";
export const TOTAL_COLUMN_ID = "__wk-total-column__";

export function totalRowKey(table: TableSnapshot): string {
  return table.totalRowKey?.trim() || "Total";
}

export function totalColumnName(table: TableSnapshot): string {
  return table.totalColumnName?.trim() || "Total";
}

export function tableHasTotalsRow(table: TableSnapshot): boolean {
  return table.totalsRow === true && !table.promoteRowKeys;
}

export function tableHasTotalsColumn(table: TableSnapshot): boolean {
  return table.totalsColumn === true && !table.promoteRowKeys;
}

export function isTotalRowId(rowId: string): boolean {
  return rowId === TOTAL_ROW_ID;
}

export function isTotalColumnId(columnId: string): boolean {
  return columnId === TOTAL_COLUMN_ID;
}

export type TotalCellClass = "error" | "numeric" | "empty" | "non-numeric";

export function classifyTotalValue(computed: Primitive): TotalCellClass {
  if (computed === null || computed === undefined || computed === "") return "empty";
  if (typeof computed === "number") return Number.isFinite(computed) ? "numeric" : "error";
  if (typeof computed === "boolean") return "non-numeric";
  if (typeof computed === "string") {
    if (computed.startsWith("#")) return "error";
    const n = Number(computed);
    if (computed.trim() !== "" && Number.isFinite(n) && /^-?\d/.test(computed.trim())) return "numeric";
    return "non-numeric";
  }
  return "non-numeric";
}

/** Total aggregation — first match wins (see CONTEXT.md). */
/** Resolve a totals range against ordered index labels; blank means all (null). */
export function resolveTotalsRange(range: string | undefined, orderedLabels: readonly string[]): Set<string> | null {
  const trimmed = range?.trim();
  if (!trimmed) return null;
  const lower = orderedLabels.map((label) => label.toLowerCase());
  const resolveOne = (token: string) => {
    const i = lower.indexOf(token.trim().toLowerCase());
    if (i < 0) throw new Error(`Unknown index "${token.trim()}".`);
    return orderedLabels[i]!;
  };
  if (trimmed.includes(":")) {
    const [from, to] = trimmed.split(":");
    if (!from?.trim() || !to?.trim()) throw new Error("Totals range needs both sides of `:`.");
    const i0 = lower.indexOf(from.trim().toLowerCase());
    const i1 = lower.indexOf(to.trim().toLowerCase());
    if (i0 < 0) throw new Error(`Unknown index "${from.trim()}".`);
    if (i1 < 0) throw new Error(`Unknown index "${to.trim()}".`);
    const [start, end] = i0 <= i1 ? [i0, i1] : [i1, i0];
    return new Set(orderedLabels.slice(start, end + 1));
  }
  if (trimmed.includes(",")) {
    return new Set(trimmed.split(",").map((part) => resolveOne(part)));
  }
  return new Set([resolveOne(trimmed)]);
}

export function aggregateTotalValues(values: readonly Primitive[]): Primitive {
  const classes = values.map(classifyTotalValue);
  if (classes.some((c) => c === "error")) return "#VALUE!";
  if (classes.every((c) => c === "empty" || c === "non-numeric")) return null;
  if (classes.every((c) => c === "numeric" || c === "empty")) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      if (classes[i] === "numeric") sum += values[i] as number;
    }
    return sum;
  }
  return "#VALUE!";
}
