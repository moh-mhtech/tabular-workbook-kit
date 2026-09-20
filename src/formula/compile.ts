import { a1, columnLetters, findColumn, valueColumn, type LaidOutColumn, type TableLayout, type WorkbookLayout } from "../model/layout.js";

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

export function compileFormula(formula: string, ctx: CompileContext): string {
  const source = formula.trim().startsWith("=") ? formula.trim().slice(1) : formula.trim();

  let out = source.replace(QUALIFIED, (full, _sheet: string | undefined, tableName: string, first: string, second?: string) => {
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

  if (rowToken !== undefined) {
    const col = requireColumn(table, colToken, ctx);
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
