import type { ICellData, IWorkbookData } from "@univerjs/core";
import { LocaleType } from "@univerjs/core";
import { compileFormula } from "../formula/compile.js";
import { columnLetters, engineSheetSize, layoutWorkbook, type WorkbookLayout } from "../model/layout.js";
import { promotedNames } from "../model/names.js";
import { resolveCellFormat } from "../model/numberFormat.js";
import { overlayKey, parseLooseCellKey, type Primitive, type WorkbookSnapshot } from "../model/types.js";
import type { FormulaEngine } from "./types.js";

export function effectiveCell(
  snapshot: WorkbookSnapshot,
  tableId: string,
  rowId: string,
  columnId: string,
): { kind: "input" | "formula"; value?: Primitive; formula?: string; overlay: boolean } {
  const table = snapshot.tables.find((t) => t.id === tableId);
  const row = table?.rows.find((r) => r.id === rowId);
  const base = row?.cells[columnId];
  if (base?.kind === "formula") {
    return { kind: "formula", formula: base.formula, overlay: false };
  }
  const scenario = snapshot.scenarios.find((s) => s.id === snapshot.activeScenarioId);
  const key = overlayKey(tableId, rowId, columnId);
  if (scenario && Object.prototype.hasOwnProperty.call(scenario.overlays, key)) {
    return { kind: "input", value: scenario.overlays[key], overlay: true };
  }
  return { kind: "input", value: base?.value ?? null, overlay: false };
}

export function snapshotToUniverData(snapshot: WorkbookSnapshot, engineLayout?: WorkbookLayout): {
  layout: WorkbookLayout;
  data: IWorkbookData;
} {
  const layout = engineLayout ?? layoutWorkbook(snapshot);
  const sheets: IWorkbookData["sheets"] = {};
  for (const view of layout.sheets) {
    const cellData: Record<number, Record<number, ICellData>> = {};
    const setCell = (r: number, c: number, cell: ICellData) => {
      cellData[r] ??= {};
      cellData[r][c] = cell;
    };
    for (const band of view.bands) {
      const tableLayout = layout.tables.get(band.tableId);
      if (!tableLayout) continue;
      for (const col of tableLayout.columns) {
        if (col.kind === "key") continue;
        setCell(band.headerRow, col.colIndex, { v: col.name });
      }
      for (const row of tableLayout.rows) {
        setCell(row.rowIndex, tableLayout.columns[0].colIndex, { v: row.key });
        const source = tableLayout.table.rows.find((r) => r.id === row.id);
        for (const col of tableLayout.columns) {
          if (col.kind === "key") continue;
          const cell = source?.cells[col.id];
          const effective = effectiveCell(snapshot, tableLayout.table.id, row.id, col.id);
          const format = resolveCellFormat(tableLayout.table, col.id, source?.cells[col.id]);
          const style = format ? { n: { pattern: format } } : undefined;
          if (effective.kind === "formula" && effective.formula) {
            setCell(row.rowIndex, col.colIndex, {
              f: compileFormula(effective.formula, {
                layout,
                currentTable: tableLayout,
                currentRowIndex: row.rowIndex,
                currentPeriodId: col.periodId,
                currentColumnId: col.id,
                engine: "range",
              }),
              ...(style ? { s: style } : {}),
            });
          } else {
            const value = coerceInput(effective.value ?? cell?.value ?? null);
            if (value !== null) {
              setCell(row.rowIndex, col.colIndex, {
                v: value as string | number | boolean,
                ...(style ? { s: style } : {}),
              });
            } else if (style) {
              setCell(row.rowIndex, col.colIndex, { s: style });
            }
          }
        }
      }
    }
    for (const [key, cell] of Object.entries(view.looseCells)) {
      const value = coerceInput(cell.value ?? null);
      if (value === null) continue;
      const { row, col } = parseLooseCellKey(key);
      setCell(row, col, { v: value });
    }
    const size = engineSheetSize(layout, view.sheetId);
    sheets[view.sheetId] = {
      id: view.sheetId,
      name: view.sheetName,
      cellData,
      rowCount: size.rowCount,
      columnCount: size.colCount,
    };
  }
  return {
    layout,
    data: {
      id: `${snapshot.id}-${Math.random().toString(36).slice(2, 9)}`,
      name: snapshot.name,
      appVersion: "0.25.1",
      locale: LocaleType.EN_US,
      styles: {},
      sheetOrder: layout.sheets.map((s) => s.sheetId),
      sheets,
    },
  };
}

function coerceInput(value: Primitive): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const num = Number(trimmed.replace(",", "."));
  if (Number.isFinite(num) && /^-?\d/.test(trimmed)) return num;
  return trimmed;
}

export function evaluateSnapshot(snapshot: WorkbookSnapshot, engine: FormulaEngine) {
  const { layout } = snapshotToUniverData(snapshot);
  const values = engine.evaluate(snapshot);
  return { layout, values };
}

export function readComputed(
  values: Record<string, (number | string | boolean | null)[][]>,
  sheetName: string,
  rowIndex: number,
  colIndex: number,
): Primitive {
  const raw: unknown = values[sheetName]?.[rowIndex]?.[colIndex];
  if (raw === undefined || raw === "") return null;
  if (typeof raw === "number" || typeof raw === "boolean" || raw === null) return raw;
  if (typeof raw === "object" && raw !== null) {
    const message = String(raw);
    return message.startsWith("#") ? message : String(raw);
  }
  if (typeof raw === "string" && raw.startsWith("#")) return raw;
  return raw as Primitive;
}

export function definedNameRefs(snapshot: WorkbookSnapshot): { name: string; ref: string }[] {
  const layout = layoutWorkbook(snapshot);
  return promotedNames(snapshot).flatMap((item) => {
    const table = layout.tables.get(item.tableId);
    const row = table?.rows.find((r) => r.id === item.rowId);
    const col = table?.columns.find((c) => c.id === item.columnId);
    if (!table || !row || !col) return [];
    const sheet = `'${table.sheetName.replace(/'/g, "''")}'`;
    return [{ name: item.name, ref: `${sheet}!$${columnLetters(col.colIndex)}$${row.rowIndex + 1}` }];
  });
}
