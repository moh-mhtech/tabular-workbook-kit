import { coloredFormulaSegments } from "../formula/formulaRefColors.js";

export function FormulaColoredText({ draft, active }: { draft: string; active: boolean }) {
  if (!active || !draft.trim().startsWith("=")) return null;
  return (
    <div className="wk-formula-color-mirror" aria-hidden="true">
      {coloredFormulaSegments(draft).map((segment, index) =>
        segment.color ? (
          <span key={index} className="wk-formula-ref" data-formula-ref={segment.text} style={{ color: segment.color }}>
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </div>
  );
}
