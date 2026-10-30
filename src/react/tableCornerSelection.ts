/** Ignore a 1×1 Table corner grid hit while the user is drag-selecting a range elsewhere. */
export function ignoreTableCornerDuringRangeDrag(args: {
  onTableCorner: boolean;
  unitSelection: boolean;
  cornerPointerDown: boolean;
  rangeSelectDrag: boolean;
  previousRange?: { width: number; height: number } | null;
}): boolean {
  if (!args.onTableCorner || !args.unitSelection || args.cornerPointerDown) return false;
  if (args.rangeSelectDrag) return true;
  const range = args.previousRange;
  if (range && (range.width > 1 || range.height > 1)) return true;
  return false;
}
