import { useMemo } from "react";
import { layoutWorkbook } from "../../model/layout.js";
import { selectedCellRefs, type CellRef } from "../../model/types.js";
import { cellReferenceDisplay } from "../cellReferenceDisplay.js";
import { useSnapshot, useWorkbook } from "../WorkbookProvider.js";

function displayForRefs(
  layout: ReturnType<typeof layoutWorkbook>,
  refs: readonly CellRef[],
): ReturnType<typeof cellReferenceDisplay> | "*" | undefined {
  if (!refs.length) return undefined;
  const displays = refs.map((ref) => cellReferenceDisplay(layout, ref)).filter(Boolean) as NonNullable<
    ReturnType<typeof cellReferenceDisplay>
  >[];
  if (!displays.length) return undefined;
  const first = displays[0]!.workbookText;
  if (displays.some((item) => item.workbookText !== first)) return "*";
  return displays[0];
}

export function CellReferenceField() {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const layout = useMemo(() => layoutWorkbook(snapshot), [snapshot]);
  const refs = selectedCellRefs(session.selection);
  const display = useMemo(() => displayForRefs(layout, refs), [layout, refs]);

  if (session.selection?.kind !== "cell" || !display) return null;

  return (
    <p className="wk-cell-reference" aria-label="Cell reference">
      {display === "*" ? "*" : display.workbookText}
    </p>
  );
}
