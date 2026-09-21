import type { CellSnapshot, TableSnapshot, WorkbookSnapshot } from "../model/types.js";

/** Identifier start: Unicode letter or underscore. */
export const IDENT_START = String.raw`\p{L}_`;
/** Identifier continue: letters, combining marks, digits, underscore. */
export const IDENT_CONT = String.raw`\p{L}\p{N}\p{M}_`;
export const IDENTIFIER = `[${IDENT_START}][${IDENT_CONT}]*`;
export const TABLE_NAME_PATTERN = new RegExp(`^${IDENTIFIER}$`, "u");

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function requireTable(snapshot: WorkbookSnapshot, tableIdOrName: string): TableSnapshot {
  const table = snapshot.tables.find(
    (t) => t.id === tableIdOrName || t.name.toLowerCase() === tableIdOrName.toLowerCase(),
  );
  if (!table) throw new Error(`Unknown table "${tableIdOrName}"`);
  return table;
}

export function emptyCells(table: TableSnapshot): Record<string, CellSnapshot> {
  const cells: Record<string, CellSnapshot> = {};
  for (const col of table.attributeColumns) {
    cells[col.id] = { kind: "input", value: null };
  }
  return cells;
}

export function uniqueName(existing: string[], base: string): string {
  const lower = new Set(existing.map((n) => n.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  let i = 2;
  while (lower.has(`${base}${i}`.toLowerCase())) i++;
  return `${base}${i}`;
}

/** Excel-style default identifier for the next unnamed table column. */
export function nextColumnIdentifier(existing: string[]): string {
  const used = new Set(existing.map((name) => name.toUpperCase()));
  for (let index = 0; ; index++) {
    const candidate = columnIdentifier(index);
    if (!used.has(candidate)) return candidate;
  }
}

/** Excel-style default identifier for the next unnamed table row. */
export function nextRowIdentifier(existing: string[]): string {
  const used = new Set(existing);
  for (let index = 1; ; index++) {
    const candidate = String(index);
    if (!used.has(candidate)) return candidate;
  }
}

function columnIdentifier(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function rewriteFormulas(snapshot: WorkbookSnapshot, rewrite: (formula: string) => string) {
  for (const table of snapshot.tables) {
    for (const row of table.rows) {
      for (const cell of Object.values(row.cells)) {
        if (cell.kind === "formula" && cell.formula) {
          cell.formula = rewrite(cell.formula);
        }
      }
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteTableName(formula: string, from: string, to: string): string {
  return formula.replace(new RegExp(`\\b${escapeRegExp(from)}\\[`, "g"), `${to}[`);
}

export function rewriteRowKey(formula: string, tableName: string, from: string, to: string): string {
  const table = escapeRegExp(tableName);
  const src = escapeRegExp(from);
  return formula
    .replace(new RegExp(`(\\[[^\\]]+\\])\\[${src}\\]`, "g"), `$1[${to}]`)
    .replace(new RegExp(`\\b${table}\\[${src}\\](?!\\[)`, "g"), `${tableName}[${to}]`);
}

export function rewriteColumnName(formula: string, from: string, to: string): string {
  const src = escapeRegExp(from);
  return formula.replace(new RegExp(`\\[@?${src}\\]`, "g"), (full) =>
    full.startsWith("[@") ? `[@${to}]` : `[${to}]`,
  );
}

export function assertTableName(name: string, snapshot: WorkbookSnapshot, exceptId?: string) {
  const trimmed = name.trim();
  if (!TABLE_NAME_PATTERN.test(trimmed)) {
    throw new Error("Table name must start with a letter and contain only letters, digits, and underscore.");
  }
  const clash = snapshot.tables.find((t) => t.id !== exceptId && t.name.toLowerCase() === trimmed.toLowerCase());
  if (clash) throw new Error(`Table name "${trimmed}" is already used.`);
  return trimmed;
}
