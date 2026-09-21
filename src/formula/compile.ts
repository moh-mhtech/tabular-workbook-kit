import { a1, columnLetters, findColumn, valueColumn, type LaidOutColumn, type TableLayout, type WorkbookLayout } from "../model/layout.js";
import { canRegisterDefinedName, getCellName, promotedNames } from "../model/names.js";
import { resolveTimeToken } from "../model/yearColumns.js";

export interface CompileContext {
  layout: WorkbookLayout;
  currentTable?: TableLayout;
  currentRowIndex?: number;
  currentPeriodId?: string;
  currentColumnId?: string;
  engine?: "table" | "range";
  /** Avoid conservative full-column cycles in engines that track INDEX ranges statically. */
  directKnownRows?: boolean;
}

const QUALIFIED =
  /(?:([A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*)\.)?([A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*)\[([^\]]+)\](?:\[([^\]]+)\])?/g;
const LOCAL_PAIR = /(?<![A-Za-z0-9_ÆØÅæøå.])\[([^\]]+)\](?:\[([^\]]+)\])?/g;
const AT = /^@([+-]\d+)?$/;
const ATOM_REF =
  "(?:(?:[A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*\\.)?[A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*\\[[^\\]]+\\](?:\\[[^\\]]+\\])?|\\[[^\\]]+\\](?:\\[[^\\]]+\\])?|[A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*(?![A-Za-z0-9ÆØÅæøå_]|\\s*\\())";
const RANGE_REF = new RegExp(`(${ATOM_REF}):(${ATOM_REF})`, "g");

export function compileFormula(formula: string, ctx: CompileContext): string {
  const source = formula.trim().startsWith("=") ? formula.trim().slice(1) : formula.trim();

  RANGE_REF.lastIndex = 0;
  let out = source.replace(RANGE_REF, (full, left: string, right: string) => {
    try {
      const compiled = compileRefRange(left, right, ctx);
      if (!compiled) throw new Error(`range ${left} ${right}`);
      return compiled;
    } catch {
      return "#REF!";
    }
  });

  out = out.replace(QUALIFIED, (full, _sheet: string | undefined, tableName: string, first: string, second?: string) => {
    const table = ctx.layout.tablesByName.get(String(tableName).toLowerCase());
    if (!table) return full;
    try {
      return compileRef(table, first.trim(), second?.trim(), ctx, false);
    } catch {
      return "#REF!";
    }
  });

  out = out.replace(LOCAL_PAIR, (full, first: string, second?: string) => {
    if (!ctx.currentTable) return full;
    try {
      return compileRef(ctx.currentTable, first.trim(), second?.trim(), ctx, true);
    } catch {
      return "#REF!";
    }
  });

  return `=${out}`;
}

function compileRefRange(left: string, right: string, ctx: CompileContext): string {
  const start = resolveAuthoringCell(left, ctx);
  const end = resolveAuthoringCell(right, ctx);
  if (!start || !end || start.table.table.id !== end.table.table.id) throw new Error("range");
  const table = start.table;
  const rowIds = table.rows.map((row) => row.id);
  const colIds = table.columns.filter((col) => col.kind !== "key").map((col) => col.id);
  const rowA = rowIds.indexOf(start.rowId);
  const rowB = rowIds.indexOf(end.rowId);
  const colA = colIds.indexOf(start.columnId);
  const colB = colIds.indexOf(end.columnId);
  if (rowA < 0 || rowB < 0 || colA < 0 || colB < 0) throw new Error("range");
  const parts: string[] = [];
  for (let row = Math.min(rowA, rowB); row <= Math.max(rowA, rowB); row++) {
    for (let col = Math.min(colA, colB); col <= Math.max(colA, colB); col++) {
      const rowId = rowIds[row]!;
      const columnId = colIds[col]!;
      const named = getCellName(ctx.layout, table.table.id, rowId, columnId);
      if (named.defined && canRegisterDefinedName(named.defined)) {
        parts.push(named.defined);
        continue;
      }
      const laidCol = table.columns.find((candidate) => candidate.id === columnId);
      const laidRow = table.rows.find((candidate) => candidate.id === rowId);
      if (!laidCol || !laidRow) continue;
      parts.push(compileRef(table, laidCol.name, laidRow.key, ctx, false));
    }
  }
  if (!parts.length) throw new Error("range");
  return parts.length === 1 ? parts[0]! : `SUM(${parts.join(",")})`;
}

function resolveAuthoringCell(
  text: string,
  ctx: CompileContext,
): { table: TableLayout; rowId: string; columnId: string } | undefined {
  const qualified = text.match(
    /^(?:([A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*)\.)?([A-Za-zÆØÅæøå_][A-Za-z0-9ÆØÅæøå_]*)\[([^\]]+)\](?:\[([^\]]+)\])?$/,
  );
  if (qualified) {
    const table = ctx.layout.tablesByName.get(qualified[2]!.toLowerCase());
    if (!table) return undefined;
    return cellFromTokens(table, qualified[3]!.trim(), qualified[4]?.trim(), ctx);
  }
  const local = text.match(/^\[([^\]]+)\](?:\[([^\]]+)\])?$/);
  if (local && ctx.currentTable) {
    return cellFromTokens(ctx.currentTable, local[1]!.trim(), local[2]?.trim(), ctx);
  }
  const promoted = promotedNames(ctx.layout.snapshot).find(
    (item) => item.name.toLowerCase() === text.toLowerCase(),
  );
  if (!promoted) return undefined;
  const table = ctx.layout.tables.get(promoted.tableId);
  if (!table) return undefined;
  return { table, rowId: promoted.rowId, columnId: promoted.columnId };
}

function cellFromTokens(
  table: TableLayout,
  first: string,
  second: string | undefined,
  ctx: CompileContext,
): { table: TableLayout; rowId: string; columnId: string } | undefined {
  const colToken = resolveAt(first, table, ctx, "column");
  const asColumn = tryColumn(table, colToken, ctx);
  if (second !== undefined) {
    const rowToken = resolveAt(second, table, ctx, "row");
    const row = isThisRow(rowToken, table, ctx)
      ? table.rows.find((candidate) => candidate.rowIndex === ctx.currentRowIndex)
      : table.rows.find((candidate) => candidate.key.toLowerCase() === rowToken.toLowerCase());
    if (!asColumn || asColumn.kind === "key" || !row) return undefined;
    return { table, rowId: row.id, columnId: asColumn.id };
  }
  if (asColumn && asColumn.kind !== "key") {
    const row = table.rows.find((candidate) => candidate.rowIndex === ctx.currentRowIndex) ?? table.rows[0];
    if (!row) return undefined;
    return { table, rowId: row.id, columnId: asColumn.id };
  }
  const asRow = table.keyByLower.get(colToken.toLowerCase());
  const value = valueColumn(table);
  if (asRow && value) return { table, rowId: asRow.id, columnId: value.id };
  return undefined;
}

function compileRef(
  table: TableLayout,
  first: string,
  second: string | undefined,
  ctx: CompileContext,
  local: boolean,
): string {
  const name = table.table.name;
  const colToken = resolveAt(first, table, ctx, "column");
  const rowToken = second !== undefined ? resolveAt(second, table, ctx, "row") : undefined;

  const timeCols = timeColumns(table, colToken, ctx);

  if (rowToken !== undefined) {
    const cols = timeCols.length ? timeCols : [requireColumn(table, colToken, ctx)];
    const parts = cols.map((col) => {
      if (isThisRow(rowToken, table, ctx)) {
        if (ctx.engine === "range") return cellAddr(table, col, ctx.currentRowIndex!);
        return local || table.table.id === ctx.currentTable?.table.id ? `[@${col.name}]` : `${name}[@${col.name}]`;
      }
      const row = table.keyByLower.get(rowToken.toLowerCase());
      if (!row) throw new Error(`Unknown row "${rowToken}"`);
      if (ctx.engine === "range") {
        if (ctx.directKnownRows) return cellAddr(table, col, row.rowIndex);
        return `INDEX(${colRange(table, col)},MATCH("${row.key}",${colRange(table, keyColumn(table))},0))`;
      }
      return `INDEX(${name}[${col.name}],MATCH("${row.key}",${name}[key],0))`;
    });
    return parts.length === 1 ? parts[0]! : `SUM(${parts.join(",")})`;
  }

  if (timeCols.length > 1) {
    const parts = timeCols.map((col) => {
      if (ctx.engine === "range") {
        if (local && ctx.currentRowIndex !== undefined) return cellAddr(table, col, ctx.currentRowIndex);
        return colRange(table, col);
      }
      if (local && table.table.id === ctx.currentTable?.table.id) return `[@${col.name}]`;
      return `${name}[${col.name}]`;
    });
    return `SUM(${parts.join(",")})`;
  }

  const asColumn = tryColumn(table, colToken, ctx);
  if (asColumn) {
    if (ctx.engine === "range") {
      if (local && ctx.currentRowIndex !== undefined) return cellAddr(table, asColumn, ctx.currentRowIndex);
      return colRange(table, asColumn);
    }
    if (local && table.table.id === ctx.currentTable?.table.id) return `[@${asColumn.name}]`;
    return `${name}[${asColumn.name}]`;
  }

  const asRow = table.keyByLower.get(colToken.toLowerCase());
  const value = valueColumn(table);
  if (asRow && value) {
    if (ctx.engine === "range") {
      if (ctx.directKnownRows) return cellAddr(table, value, asRow.rowIndex);
      return `INDEX(${colRange(table, value)},MATCH("${asRow.key}",${colRange(table, keyColumn(table))},0))`;
    }
    return `INDEX(${name}[${value.name}],MATCH("${asRow.key}",${name}[key],0))`;
  }

  throw new Error(`Unknown ref "${first}"`);
}

function isThisRow(token: string, table: TableLayout, ctx: CompileContext): boolean {
  if (token === "@") return true;
  if (ctx.currentTable?.table.id !== table.table.id || ctx.currentRowIndex === undefined) return false;
  const row = table.rows.find((r) => r.rowIndex === ctx.currentRowIndex);
  return row?.key.toLowerCase() === token.toLowerCase();
}

function resolveAt(token: string, table: TableLayout, ctx: CompileContext, axis: "column" | "row"): string {
  const match = AT.exec(token);
  if (!match) return token;
  const offset = match[1] ? Number(match[1]) : 0;
  if (axis === "row") {
    if (!ctx.currentTable || ctx.currentRowIndex === undefined) throw new Error("@ row without current row");
    if (ctx.currentTable.table.id !== table.table.id && offset !== 0) throw new Error("@ row offset on other table");
    const rows = (ctx.currentTable.table.id === table.table.id ? ctx.currentTable : table).rows;
    const index = rows.findIndex((r) => r.rowIndex === ctx.currentRowIndex);
    const target = rows[index + offset];
    if (!target) throw new Error("@ row out of range");
    return target.key;
  }
  const current = currentColumn(table, ctx);
  if (!current) throw new Error("@ column without current column");
  if (offset === 0) return current.name;
  const axisCols =
    current.kind === "period"
      ? table.columns.filter((c) => c.kind === "period")
      : table.columns.filter((c) => c.kind === "attribute");
  const i = axisCols.findIndex((c) => c.id === current.id);
  const target = axisCols[i + offset];
  if (!target) throw new Error("@ column out of range");
  return target.name;
}

function currentColumn(table: TableLayout, ctx: CompileContext): LaidOutColumn | undefined {
  if (ctx.currentColumnId) {
    const col = table.columns.find((c) => c.id === ctx.currentColumnId || c.name === ctx.currentColumnId);
    if (col) return col;
  }
  if (ctx.currentPeriodId) {
    return table.columns.find((c) => c.periodId === ctx.currentPeriodId);
  }
  return table.columns.find((c) => c.kind === "attribute");
}

function tryColumn(table: TableLayout, token: string, ctx: CompileContext): LaidOutColumn | undefined {
  return findColumn(table, token, ctx.layout.periods);
}

function timeColumns(table: TableLayout, token: string, ctx: CompileContext): LaidOutColumn[] {
  const periods = resolveTimeToken(token, ctx.layout.periods);
  if (periods.length <= 1) return [];
  return periods
    .map((period) => table.columns.find((col) => col.periodId === period.id))
    .filter((col): col is LaidOutColumn => Boolean(col));
}

function requireColumn(table: TableLayout, token: string, ctx: CompileContext): LaidOutColumn {
  const col = tryColumn(table, token, ctx);
  if (!col || col.kind === "key") throw new Error(`Unknown column "${token}"`);
  return col;
}

function keyColumn(table: TableLayout): LaidOutColumn {
  return table.columns.find((c) => c.kind === "key")!;
}

function quotedSheet(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  return `'${name.replace(/'/g, "''")}'`;
}

function colRange(table: TableLayout, col: LaidOutColumn): string {
  const first = table.rows[0]?.rowIndex ?? table.band.headerRow + 1;
  const last = table.rows[table.rows.length - 1]?.rowIndex ?? first;
  const letter = columnLetters(col.colIndex);
  return `${quotedSheet(table.sheetName)}!$${letter}$${first + 1}:$${letter}$${last + 1}`;
}

function cellAddr(table: TableLayout, col: LaidOutColumn, rowIndex: number): string {
  return `${quotedSheet(table.sheetName)}!${a1(col.colIndex, rowIndex)}`;
}

export function looksLikeFormula(raw: string): boolean {
  return raw.trim().startsWith("=");
}
