import type { WorkbookLayout } from "../model/layout.js";
import { projectTable, projectedLocationForRef } from "../grid/sheetProjection.js";
import type { CellRef } from "../model/types.js";
import { formulaRefForProjectedCell } from "./customGridOverlay.js";

export type FormulaRefSegments =
  | { kind: "defined"; name: string }
  | { kind: "structured"; sheet?: string; table?: string; body: string };

export type CellReferenceDisplay = {
  workbookText: string;
  segments: FormulaRefSegments;
};

/** Splits a workbook-qualified Formula ref string into underline segments. */
export function parseFormulaRefSegments(text: string): FormulaRefSegments {
  if (!text.includes("[")) {
    return { kind: "defined", name: text };
  }
  const sheetQualified = text.match(/^([^.]+)\.([^[]+)(\[.+)$/);
  if (sheetQualified) {
    return {
      kind: "structured",
      sheet: sheetQualified[1],
      table: sheetQualified[2],
      body: sheetQualified[3]!,
    };
  }
  const tableQualified = text.match(/^([^[]+)(\[.+)$/);
  if (tableQualified) {
    return {
      kind: "structured",
      table: tableQualified[1],
      body: tableQualified[2]!,
    };
  }
  return { kind: "structured", body: text };
}

export function cellReferenceDisplay(layout: WorkbookLayout, ref: CellRef): CellReferenceDisplay | undefined {
  const projection = projectTable(layout, ref.tableId);
  if (!projection) return undefined;
  const location = projectedLocationForRef(projection, layout, ref);
  if (!location) return undefined;
  const [col, row] = location;
  let workbookText: string | undefined;
  try {
    workbookText = formulaRefForProjectedCell(projection, layout, col, row);
  } catch {
    return undefined;
  }
  if (!workbookText) return undefined;
  return {
    workbookText,
    segments: parseFormulaRefSegments(workbookText),
  };
}
