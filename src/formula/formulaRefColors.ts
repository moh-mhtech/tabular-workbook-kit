import { formulaRefSpans } from "../formula/formulaRefs.js";
import { projectedCell, projectedLocationForRef, type SheetGridProjection } from "../grid/sheetProjection.js";
import type { WorkbookLayout } from "../model/layout.js";
import { getCellName, promotedNames } from "../model/names.js";
import { HEADER_ROW_ID, KEY_COLUMN_ID } from "../model/types.js";

export type FormulaRefMarkOrigin = { tableId: string; col: number; row: number };

export const FORMULA_REF_COLORS = [
  "#0000FF",
  "#FF0000",
  "#00B050",
  "#FFC000",
  "#7030A0",
  "#00B0F0",
  "#C00000",
] as const;

export type ColoredFormulaRef = {
  text: string;
  color: string;
  start: number;
  end: number;
};

export function colorFormulaRefs(draft: string): ColoredFormulaRef[] {
  const seen = new Map<string, string>();
  let next = 0;
  return formulaRefSpans(draft).map((span) => {
    const text = draft.slice(span.start, span.end);
    let color = seen.get(text);
    if (!color) {
      color = FORMULA_REF_COLORS[next % FORMULA_REF_COLORS.length]!;
      seen.set(text, color);
      next += 1;
    }
    return { text, color, start: span.start, end: span.end };
  });
}

export function coloredFormulaSegments(draft: string): { text: string; color?: string }[] {
  const refs = colorFormulaRefs(draft);
  const segments: { text: string; color?: string }[] = [];
  let cursor = 0;
  for (const ref of refs) {
    if (ref.start > cursor) segments.push({ text: draft.slice(cursor, ref.start) });
    segments.push({ text: ref.text, color: ref.color });
    cursor = ref.end;
  }
  if (cursor < draft.length) segments.push({ text: draft.slice(cursor) });
  return segments;
}

export type FormulaRefGridMark = {
  text: string;
  color: string;
  range: { x: number; y: number; width: number; height: number };
};

export function formulaRefGridMarks(
  draft: string,
  layout: WorkbookLayout,
  projection: SheetGridProjection,
  origin?: FormulaRefMarkOrigin,
): FormulaRefGridMark[] {
  if (!projection.tableId) return [];
  const marks: FormulaRefGridMark[] = [];
  for (const ref of colorFormulaRefs(draft)) {
    const range = rangeForFormulaRef(ref.text, layout, projection, origin);
    if (!range) continue;
    marks.push({ text: ref.text, color: ref.color, range });
  }
  return marks;
}

function rangeForFormulaRef(
  text: string,
  layout: WorkbookLayout,
  projection: SheetGridProjection,
  origin?: FormulaRefMarkOrigin,
): { x: number; y: number; width: number; height: number } | undefined {
  const atoms = text.split(":");
  const locations = atoms
    .map((atom) => locationForAtom(atom.trim(), layout, projection, origin))
    .filter((item): item is readonly [number, number] => Boolean(item));
  if (!locations.length) return undefined;
  const xs = locations.map((item) => item[0]);
  const ys = locations.map((item) => item[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x + 1,
    height: Math.max(...ys) - y + 1,
  };
}

function unlockRefToken(token: string): string {
  return token.startsWith("$") ? token.slice(1) : token;
}

function thisLineOffset(token: string): number | undefined {
  const match = unlockRefToken(token).match(/^@([+-]\d+)?$/);
  if (!match) return undefined;
  return match[1] ? Number(match[1]) : 0;
}

function rowForToken(
  table: { id: string; rows: { id: string; key: string }[] },
  token: string,
  layout: WorkbookLayout,
  projection: SheetGridProjection,
  origin?: FormulaRefMarkOrigin,
) {
  const offset = thisLineOffset(token);
  if (offset !== undefined && origin?.tableId === table.id) {
    const hit = projectedCell(projection, layout, origin.col, origin.row + offset);
    if (hit.kind === "table" && (hit.hit.kind === "cell" || hit.hit.kind === "key")) {
      return table.rows.find((item) => item.id === hit.hit.rowId);
    }
    return undefined;
  }
  const key = unlockRefToken(token);
  return table.rows.find((item) => item.key === key);
}

function columnIdForToken(
  table: { id: string; attributeColumns: { id: string; name: string }[] },
  token: string,
  layout: WorkbookLayout,
  projection: SheetGridProjection,
  origin?: FormulaRefMarkOrigin,
): string | undefined {
  const offset = thisLineOffset(token);
  if (offset !== undefined && origin?.tableId === table.id) {
    const hit = projectedCell(projection, layout, origin.col + offset, origin.row);
    if (hit.kind === "table" && (hit.hit.kind === "cell" || hit.hit.kind === "header")) {
      return hit.hit.columnId;
    }
    return undefined;
  }
  const name = unlockRefToken(token);
  const col = table.attributeColumns.find((item) => item.name === name);
  const period = layout.periods.find((item) => item.label === name || item.id === name);
  return col?.id ?? period?.id ?? name;
}

function locationForAtom(
  atom: string,
  layout: WorkbookLayout,
  projection: SheetGridProjection,
  origin?: FormulaRefMarkOrigin,
): readonly [number, number] | undefined {
  const tableId = projection.tableId;
  if (!tableId) return undefined;
  const promoted = promotedNames(layout.snapshot).find(
    (item) => item.name.toLowerCase() === atom.toLowerCase() && item.tableId === tableId,
  );
  if (promoted) return projectedLocationForRef(projection, layout, promoted);

  const local = atom.match(/^\[([^\]]+)\](?:\[([^\]]+)\])?$/);
  if (local) {
    const first = local[1]!;
    const second = local[2];
    const table = layout.snapshot.tables.find((item) => item.id === tableId);
    if (!table) return undefined;
    if (second) {
      const row = rowForToken(table, second, layout, projection, origin);
      const columnId = columnIdForToken(table, first, layout, projection, origin);
      if (!row || !columnId) return undefined;
      return projectedLocationForRef(projection, layout, {
        tableId: table.id,
        rowId: row.id,
        columnId,
      });
    }
    const col = table.attributeColumns.find((item) => item.name === unlockRefToken(first));
    if (col) {
      return projectedLocationForRef(projection, layout, {
        tableId: table.id,
        rowId: HEADER_ROW_ID,
        columnId: col.id,
      });
    }
    const row = table.rows.find((item) => item.key === unlockRefToken(first));
    if (row) {
      return projectedLocationForRef(projection, layout, {
        tableId: table.id,
        rowId: row.id,
        columnId: KEY_COLUMN_ID,
      });
    }
  }

  const structured = atom.match(/^(?:([^.]+)\.)?([^[]+)\[([^\]]+)\](?:\[([^\]]+)\])?$/);
  if (structured) {
    const tableName = structured[2]!;
    const first = structured[3]!;
    const second = structured[4];
    const table = layout.snapshot.tables.find((item) => item.name === tableName);
    if (!table || table.id !== tableId) return undefined;
    if (second) {
      const row = rowForToken(table, second, layout, projection, origin);
      const columnId = columnIdForToken(table, first, layout, projection, origin);
      if (!row || !columnId) return undefined;
      return projectedLocationForRef(projection, layout, {
        tableId: table.id,
        rowId: row.id,
        columnId,
      });
    }
    const col = table.attributeColumns.find((item) => item.name === unlockRefToken(first));
    if (col) return projectedLocationForRef(projection, layout, {
      tableId: table.id,
      rowId: HEADER_ROW_ID,
      columnId: col.id,
    });
    const row = table.rows.find((item) => item.key === unlockRefToken(first));
    if (row) return projectedLocationForRef(projection, layout, {
      tableId: table.id,
      rowId: row.id,
      columnId: KEY_COLUMN_ID,
    });
  }

  const table = layout.tables.get(tableId);
  if (!table) return undefined;
  for (const row of table.rows) {
    for (const column of table.columns) {
      try {
        const named = getCellName(layout, tableId, row.id, column.id);
        if (named.defined === atom || named.structured === atom) {
          return projectedLocationForRef(projection, layout, {
            tableId,
            rowId: row.id,
            columnId: column.id,
          });
        }
      } catch {
        /* skip unnamed slots */
      }
    }
  }
  return undefined;
}
