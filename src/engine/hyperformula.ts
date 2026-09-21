import { CellError, ErrorType, HyperFormula, type RawCellContent } from "hyperformula";
import { compileFormula } from "../formula/compile.js";
import {
  columnLetters,
  engineSheetSize,
  layoutWorkbook,
  type TableLayout,
  type WorkbookLayout,
} from "../model/layout.js";
import { canRegisterDefinedName, promotedNames } from "../model/names.js";
import { parseLooseCellKey, type Primitive, type WorkbookSnapshot } from "../model/types.js";
import { effectiveCell } from "./compileWorkbook.js";
import type { FormulaEngine, SheetGrid } from "./types.js";

export interface HyperFormulaEngineOptions {
  /**
   * HyperFormula commercial key, or `gpl-v3` while this prototype is used
   * under GPLv3. Defaults to HYPERFORMULA_LICENSE_KEY when available.
   */
  licenseKey?: string;
}

/**
 * Headless FormulaEngine backed by HyperFormula.
 *
 * The prototype defaults to HyperFormula's explicit GPLv3 license token.
 * Production/proprietary hosts must pass their commercial key in the
 * constructor or expose it as HYPERFORMULA_LICENSE_KEY.
 */
export class HyperFormulaEngine implements FormulaEngine {
  private readonly licenseKey: string;

  constructor(options: HyperFormulaEngineOptions = {}) {
    this.licenseKey = options.licenseKey ?? environmentLicenseKey() ?? "gpl-v3";
  }

  evaluate(snapshot: WorkbookSnapshot): Record<string, SheetGrid> {
    const layout = layoutWorkbook(snapshot);
    const sheets = buildSheets(snapshot, layout);
    const namedExpressions = buildNamedExpressions(layout);
    let engine: HyperFormula;
    try {
      engine = HyperFormula.buildFromSheets(
        sheets,
        {
          licenseKey: this.licenseKey,
          smartRounding: false,
        },
        namedExpressions,
      );
    } catch {
      engine = HyperFormula.buildFromSheets(sheets, {
        licenseKey: this.licenseKey,
        smartRounding: false,
      });
    }

    try {
      const values: Record<string, SheetGrid> = {};
      for (const view of layout.sheets) {
        const size = engineSheetSize(layout, view.sheetId);
        const sheetId = engine.getSheetId(view.sheetName);
        const grid: SheetGrid = Array.from({ length: size.rowCount }, () =>
          Array<string | number | boolean | null>(size.colCount).fill(null),
        );
        if (sheetId !== undefined) {
          for (let row = 0; row < size.rowCount; row++) {
            for (let col = 0; col < size.colCount; col++) {
              grid[row][col] = normalize(engine.getCellValue({ sheet: sheetId, row, col }));
            }
          }
        }
        values[view.sheetName] = grid;
      }
      return values;
    } finally {
      engine.destroy();
    }
  }
}

function buildSheets(snapshot: WorkbookSnapshot, layout: WorkbookLayout): Record<string, RawCellContent[][]> {
  const sheets: Record<string, RawCellContent[][]> = {};

  for (const view of layout.sheets) {
    const size = engineSheetSize(layout, view.sheetId);
    const grid: RawCellContent[][] = Array.from({ length: size.rowCount }, () =>
      Array<RawCellContent>(size.colCount).fill(null),
    );

    for (const band of view.bands) {
      const table = layout.tables.get(band.tableId);
      if (!table) continue;

      for (const col of table.columns) grid[band.headerRow][col.colIndex] = col.name;
      for (const row of table.rows) {
        grid[row.rowIndex][table.columns[0].colIndex] = row.key;
        for (const col of table.columns) {
          if (col.kind === "key") continue;
          const effective = effectiveCell(snapshot, table.table.id, row.id, col.id);
          grid[row.rowIndex][col.colIndex] =
            effective.kind === "formula" && effective.formula
              ? compileForHyperFormula(effective.formula, layout, table, row.rowIndex, col.id, col.periodId)
              : coerceInput(effective.value ?? null);
        }
      }
    }

    for (const [key, cell] of Object.entries(view.looseCells)) {
      const { row, col } = parseLooseCellKey(key);
      grid[row][col] =
        cell.kind === "formula" && cell.formula
          ? compileForHyperFormula(cell.formula, layout)
          : coerceInput(cell.value ?? null);
    }
    sheets[view.sheetName] = grid;
  }

  return sheets;
}

function compileForHyperFormula(
  formula: string,
  layout: WorkbookLayout,
  currentTable?: TableLayout,
  currentRowIndex?: number,
  currentColumnId?: string,
  currentPeriodId?: string,
): string {
  let compiled = compileFormula(formula, {
    layout,
    currentTable,
    currentRowIndex,
    currentColumnId,
    currentPeriodId,
    engine: "range",
    directKnownRows: true,
  });

  // HyperFormula requires boolean constants to use function syntax.
  compiled = transformOutsideStrings(compiled, (part) =>
    part.replace(/\b(TRUE|FALSE)\b(?!\s*\()/gi, "$1()"),
  );

  // HyperFormula named expressions are ASCII and cannot be A1-shaped (Param2).
  // Keep authoring names; compile unregistered uses to their cells.
  for (const item of promotedCellRefs(layout)) {
    if (canRegisterDefinedName(item.name)) continue;
    const escaped = item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const token = new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}_])${escaped}(?![\\p{L}\\p{N}\\p{M}_])`, "gu");
    compiled = transformOutsideStrings(compiled, (part) =>
      part.replace(token, (_match, prefix: string) => `${prefix}${item.expression.slice(1)}`),
    );
  }
  return compiled;
}

function transformOutsideStrings(source: string, transform: (part: string) => string): string {
  let output = "";
  let plainStart = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== '"') continue;
    output += transform(source.slice(plainStart, index));
    const stringStart = index;
    index++;
    while (index < source.length) {
      if (source[index] !== '"') {
        index++;
        continue;
      }
      if (source[index + 1] === '"') {
        index += 2;
        continue;
      }
      break;
    }
    output += source.slice(stringStart, Math.min(index + 1, source.length));
    plainStart = index + 1;
  }
  return output + transform(source.slice(plainStart));
}

function promotedCellRefs(layout: WorkbookLayout): { name: string; expression: string }[] {
  return promotedNames(layout.snapshot).flatMap((item) => {
    const table = layout.tables.get(item.tableId);
    const row = table?.rows.find((candidate) => candidate.id === item.rowId);
    const col = table?.columns.find((candidate) => candidate.id === item.columnId);
    if (!table || !row || !col) return [];
    const sheet = `'${table.sheetName.replace(/'/g, "''")}'`;
    return [{ name: item.name, expression: `=${sheet}!$${columnLetters(col.colIndex)}$${row.rowIndex + 1}` }];
  });
}

function buildNamedExpressions(layout: WorkbookLayout): { name: string; expression: string }[] {
  return promotedCellRefs(layout).filter((item) => canRegisterDefinedName(item.name));
}

function coerceInput(value: Primitive): RawCellContent {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const numeric = Number(trimmed.replace(",", "."));
  return Number.isFinite(numeric) && /^-?\d/.test(trimmed) ? numeric : trimmed;
}

function normalize(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof CellError) return errorText(value.type);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  return String(value);
}

function errorText(type: ErrorType): string {
  switch (type) {
    case ErrorType.DIV_BY_ZERO:
      return "#DIV/0!";
    case ErrorType.NAME:
      return "#NAME?";
    case ErrorType.VALUE:
      return "#VALUE!";
    case ErrorType.NUM:
      return "#NUM!";
    case ErrorType.NA:
      return "#N/A";
    case ErrorType.CYCLE:
      return "#CYCLE!";
    case ErrorType.REF:
      return "#REF!";
    case ErrorType.SPILL:
      return "#SPILL!";
    case ErrorType.LIC:
      return "#LIC!";
    case ErrorType.ERROR:
      return "#ERROR!";
  }
}

function environmentLicenseKey(): string | undefined {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.HYPERFORMULA_LICENSE_KEY;
}
