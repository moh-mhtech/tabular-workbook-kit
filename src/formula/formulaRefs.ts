import { IDENT_CONT, IDENTIFIER } from "../model/structure.js";

export type FormulaRefSpan = { start: number; end: number };

const ATOM_REF = `(?:(?:${IDENTIFIER}\\.)?${IDENTIFIER}\\[[^\\]]+\\](?:\\[[^\\]]+\\])?|\\[[^\\]]+\\](?:\\[[^\\]]+\\])?|${IDENTIFIER}(?![${IDENT_CONT}]|\\s*\\())`;
const FORMULA_REF = new RegExp(`(?:${ATOM_REF})(?::(?:${ATOM_REF}))?`, "gu");

export function formulaRefSpans(draft: string): FormulaRefSpan[] {
  FORMULA_REF.lastIndex = 0;
  return Array.from(draft.matchAll(FORMULA_REF), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}
