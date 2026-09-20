import type { WorkbookSnapshot } from "../model/types.js";

export type SheetGrid = (string | number | boolean | null)[][];

export interface FormulaEngine {
  evaluate(snapshot: WorkbookSnapshot): Record<string, SheetGrid> | Promise<Record<string, SheetGrid>>;
}
