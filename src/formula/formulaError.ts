import { compileFormula } from "./compile.js";
import { formulaRefSpans } from "./formulaRefs.js";
import type { WorkbookLayout } from "../model/layout.js";
import { promotedNames } from "../model/names.js";

const REASONS: Record<string, string> = {
  "#DIV/0!": "Divide by zero",
  "#NAME?": "Invalid name",
  "#REF!": "Invalid cell reference",
  "#VALUE!": "Wrong type of argument",
  "#NUM!": "Invalid number",
  "#N/A": "Value not available",
  "#CYCLE!": "Circular reference",
  "#NULL!": "Null intersection",
  "#SPILL!": "Spill range is not blank",
  "#ERROR!": "Error",
};

export function formulaErrorReason(
  token: string,
  formula?: string,
  layout?: WorkbookLayout,
): string {
  const reason = REASONS[token] ?? token;
  if (token !== "#NAME?" && token !== "#REF!") return reason;
  const ref = failingFormulaRef(token, formula, layout);
  return ref ? `${reason} ${ref}` : reason;
}

function failingFormulaRef(
  token: string,
  formula: string | undefined,
  layout: WorkbookLayout | undefined,
): string | undefined {
  if (!formula) return undefined;
  const known = new Set(
    layout ? promotedNames(layout.snapshot).map((item) => item.name.toLowerCase()) : [],
  );
  for (const span of formulaRefSpans(formula)) {
    const text = formula.slice(span.start, span.end);
    if (token === "#NAME?") {
      if (text.includes("[")) continue;
      if (known.has(text.toLowerCase())) continue;
      return text;
    }
    if (!layout) return text;
    const compiled = compileFormula(`=${text}`, { layout, engine: "range", directKnownRows: true });
    if (compiled.includes("#REF!")) return text;
  }
  return undefined;
}
