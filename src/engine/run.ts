import { definedNameRefs, snapshotToUniverData } from "./compileWorkbook.js";
import { canRegisterDefinedName } from "../model/names.js";
import type { SheetGrid } from "./types.js";
import type { WorkbookSnapshot } from "../model/types.js";
import type { WorkbookLayout } from "../model/layout.js";

export interface UniverApi {
  getActiveWorkbook(): UniverWorkbook | null | undefined;
  disposeUnit(id: string): boolean;
  createWorkbook(data: unknown): UniverWorkbook;
  getFormula(): { executeCalculation(): void };
}

export interface UniverWorkbook {
  getId(): string;
  dispose(): void;
  newDefinedNameBuilder(): {
    setName(name: string): { setRef(ref: string): { build(): unknown } };
  };
  insertDefinedNameBuilder(param: unknown): unknown;
  getSheetBySheetId(id: string): UniverSheet | null | undefined;
  getSheetByName(name: string): UniverSheet | null | undefined;
}

export interface UniverSheet {
  getRange(row: number, column: number): { getValue(): unknown } | null | undefined;
}

let queue: Promise<unknown> = Promise.resolve();

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function evaluateWithUniver(
  univerAPI: UniverApi,
  snapshot: WorkbookSnapshot,
): Promise<Record<string, SheetGrid>> {
  return exclusive(() => evaluateLocked(univerAPI, snapshot));
}

export function isEvalWorkbookId(id: string): boolean {
  return id.startsWith("eval-");
}

async function evaluateLocked(univerAPI: UniverApi, snapshot: WorkbookSnapshot): Promise<Record<string, SheetGrid>> {
  const { layout, data } = snapshotToUniverData(snapshot);
  data.id = `eval-${data.id}`;
  const existing = univerAPI.getActiveWorkbook();
  // Recalculation must never dispose a canvas workbook. Multiple createUniver
  // calls can share an active unit, which is what blanked the on-screen grids.
  if (existing && isEvalWorkbookId(existing.getId())) {
    try {
      existing.dispose();
    } catch {
      try {
        univerAPI.disposeUnit(existing.getId());
      } catch {
        /* next workbook uses a unique id */
      }
    }
  }
  const workbook = univerAPI.createWorkbook(data);
  for (const item of definedNameRefs(snapshot)) {
    if (!canRegisterDefinedName(item.name)) continue;
    try {
      const builder = workbook.newDefinedNameBuilder().setName(item.name).setRef(item.ref);
      workbook.insertDefinedNameBuilder(builder.build());
    } catch {
      /* structured refs still evaluate */
    }
  }

  univerAPI.getFormula().executeCalculation();
  await waitUntilSettled(workbook, layout, snapshot);

  const values: Record<string, SheetGrid> = {};
  for (const view of layout.sheets) {
    const sheet = workbook.getSheetBySheetId(view.sheetId) ?? workbook.getSheetByName(view.sheetName);
    const grid: SheetGrid = [];
    for (let r = 0; r < view.rowCount; r++) {
      grid[r] = [];
      for (let c = 0; c < view.colCount; c++) {
        grid[r][c] = normalize(sheet?.getRange(r, c)?.getValue());
      }
    }
    values[view.sheetName] = grid;
  }
  return values;
}

async function waitUntilSettled(workbook: UniverWorkbook, layout: WorkbookLayout, snapshot: WorkbookSnapshot) {
  const coords = formulaCoords(snapshot, layout);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const pending = coords.some((coord) => {
      const sheet = workbook.getSheetBySheetId(coord.sheetId) ?? workbook.getSheetByName(coord.sheetName);
      const value = sheet?.getRange(coord.row, coord.col)?.getValue();
      return value === undefined || value === null || value === "" || (typeof value === "string" && value.startsWith("="));
    });
    if (!pending) return;
    await delay(20);
  }
}

function formulaCoords(snapshot: WorkbookSnapshot, layout: WorkbookLayout) {
  const out: { sheetId: string; sheetName: string; row: number; col: number }[] = [];
  for (const table of snapshot.tables) {
    const laid = layout.tables.get(table.id);
    if (!laid) continue;
    for (const row of table.rows) {
      const laidRow = laid.rows.find((r) => r.id === row.id);
      if (!laidRow) continue;
      for (const col of laid.columns) {
        if (col.kind === "key") continue;
        if (row.cells[col.id]?.kind !== "formula") continue;
        out.push({
          sheetId: laid.sheetId,
          sheetName: laid.sheetName,
          row: laidRow.rowIndex,
          col: col.colIndex,
        });
      }
    }
  }
  return out;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function normalize(raw: unknown): string | number | boolean | null {
  if (raw === undefined || raw === "") return null;
  if (typeof raw === "number" || typeof raw === "boolean" || raw === null) return raw;
  if (typeof raw === "object" && raw !== null) return String(raw);
  return raw as string;
}
