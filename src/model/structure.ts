import { assertGlobalName } from "./names.js";
import type { CellSnapshot, TableSnapshot, WorkbookSnapshot } from "./types.js";

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

export function defaultRowKeyAt(table: { promoteRowKeys?: boolean }, index: number): string {
  if (table.promoteRowKeys) return index === 0 ? "Param" : `Param${index + 1}`;
  return String(index + 1);
}

export function defaultColumnNameAt(index: number): string {
  return columnIdentifier(index);
}

function uniquifyLocal(existing: readonly string[], base: string, except?: string): string {
  const lower = new Set(existing.filter((name) => name !== except).map((name) => name.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  let i = 2;
  while (lower.has(`${base}${i}`.toLowerCase())) i++;
  return `${base}${i}`;
}

/** Default row key at `index`, made unique in the table (and workbook when keys are promoted). */
export function allocateRowKeyAt(
  table: TableSnapshot,
  snapshot: WorkbookSnapshot,
  index: number,
  exceptRowId?: string,
): string {
  const base = defaultRowKeyAt(table, index);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    const localClash = table.rows.some(
      (row) => row.id !== exceptRowId && row.key.toLowerCase() === candidate.toLowerCase(),
    );
    if (localClash) continue;
    if (table.promoteRowKeys) {
      try {
        assertGlobalName(snapshot, candidate, { tableId: table.id, rowId: exceptRowId });
        return candidate;
      } catch {
        continue;
      }
    }
    return candidate;
  }
  throw new Error("Could not allocate a row key.");
}

/** Default column name at `index`, made unique among attribute columns on the table. */
export function allocateColumnNameAt(
  table: TableSnapshot,
  index: number,
  exceptColumnId?: string,
): string {
  const base = defaultColumnNameAt(index);
  const names = table.attributeColumns
    .filter((col) => col.id !== exceptColumnId)
    .map((col) => col.name);
  return uniquifyLocal(names, base);
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
  for (const sheet of snapshot.sheets) {
    if (!sheet.looseCells) continue;
    for (const cell of Object.values(sheet.looseCells)) {
      if (cell.kind === "formula" && cell.formula) {
        cell.formula = rewrite(cell.formula);
      }
    }
  }
}

const ATOM_REF = `(?:(?:${IDENTIFIER}\\.)?(${IDENTIFIER})\\[[^\\]]+\\](?:\\[[^\\]]+\\])?|\\[[^\\]]+\\](?:\\[[^\\]]+\\])?|${IDENTIFIER}(?![${IDENT_CONT}]|\\s*\\())`;
const FORMULA_REF = new RegExp(`(?:${ATOM_REF})(?::(?:${ATOM_REF}))?`, "gu");

function mapFormulaRefs(formula: string, rewriteToken: (token: string) => string): string {
  FORMULA_REF.lastIndex = 0;
  let output = "";
  let cursor = 0;
  for (const match of formula.matchAll(FORMULA_REF)) {
    const start = match.index;
    const token = match[0];
    output += formula.slice(cursor, start);
    output += rewriteToken(token);
    cursor = start + token.length;
  }
  return output + formula.slice(cursor);
}

function splitRangeAtoms(token: string): string[] {
  let depth = 0;
  for (let index = 0; index < token.length; index++) {
    if (token[index] === "[") depth += 1;
    else if (token[index] === "]") depth -= 1;
    else if (token[index] === ":" && depth === 0) {
      return [token.slice(0, index), token.slice(index + 1)];
    }
  }
  return [token];
}

function rewriteAtoms(token: string, rewriteAtom: (atom: string) => string): string {
  return splitRangeAtoms(token).map(rewriteAtom).join(":");
}

/** Updates Sheet.Table qualification when a table's home sheet changes. Unqualified table refs are unchanged. */
export function rewriteTableSheetQualification(
  formula: string,
  tableName: string,
  fromSheet: string,
  toSheet: string,
): string {
  if (fromSheet === toSheet) return formula;
  return mapFormulaRefs(formula, (token) =>
    rewriteAtoms(token, (atom) => {
      const sheeted = atom.match(new RegExp(`^(${IDENTIFIER})\\.(${IDENTIFIER})\\[`, "u"));
      if (sheeted?.[1] === fromSheet && sheeted[2] === tableName) {
        return `${toSheet}.${tableName}${atom.slice(sheeted[0].length - 1)}`;
      }
      return atom;
    }),
  );
}

export function rewriteTableName(formula: string, from: string, to: string): string {
  return mapFormulaRefs(formula, (token) =>
    rewriteAtoms(token, (atom) => {
      const qualified = atom.match(new RegExp(`^(${IDENTIFIER})\\[`, "u"));
      if (qualified?.[1] === from) return `${to}${atom.slice(from.length)}`;
      const sheeted = atom.match(new RegExp(`^(${IDENTIFIER})\\.(${IDENTIFIER})\\[`, "u"));
      if (sheeted?.[2] === from) return `${sheeted[1]}.${to}${atom.slice(sheeted[0].length - 1)}`;
      return atom;
    }),
  );
}

export function rewriteRowKey(
  formula: string,
  tableName: string,
  from: string,
  to: string,
  definedName = false,
): string {
  const qualified = new RegExp(
    `^(?:(${IDENTIFIER})\\.)?(${IDENTIFIER})\\[([^\\]]+)\\](?:\\[([^\\]]+)\\])?$`,
    "u",
  );
  return mapFormulaRefs(formula, (token) =>
    rewriteAtoms(token, (atom) => {
      if (definedName && atom === from) return to;
      const match = atom.match(qualified);
      if (match) {
        const sheet = match[1];
        const table = match[2]!;
        const first = match[3]!;
        const second = match[4];
        const prefix = sheet ? `${sheet}.` : "";
        if (second === from) return `${prefix}${table}[${first}][${to}]`;
        if (second === undefined && table === tableName && first === from) {
          return `${prefix}${table}[${to}]`;
        }
        return atom;
      }
      const local = atom.match(/^\[([^\]]+)\]\[([^\]]+)\]$/);
      if (local?.[2] === from) return `[${local[1]}][${to}]`;
      return atom;
    }),
  );
}

export function rewriteColumnName(formula: string, from: string, to: string): string {
  const qualified = new RegExp(
    `^(?:(${IDENTIFIER})\\.)?(${IDENTIFIER})\\[([^\\]]+)\\](?:\\[([^\\]]+)\\])?$`,
    "u",
  );
  return mapFormulaRefs(formula, (token) =>
    rewriteAtoms(token, (atom) => {
      const match = atom.match(qualified);
      if (match && match[3] === from) {
        const sheet = match[1];
        const table = match[2]!;
        const second = match[4];
        const prefix = sheet ? `${sheet}.` : "";
        return `${prefix}${table}[${to}]${second !== undefined ? `[${second}]` : ""}`;
      }
      const local = atom.match(/^\[(@)?([^\]]+)\](?:\[([^\]]+)\])?$/);
      if (local?.[2] === from) {
        return `[${local[1] ?? ""}${to}]${local[3] !== undefined ? `[${local[3]}]` : ""}`;
      }
      return atom;
    }),
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
