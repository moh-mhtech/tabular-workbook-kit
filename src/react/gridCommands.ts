import type { WorkbookSession } from "../session/WorkbookSession.js";

const CLEAR_COMMANDS = new Set([
  "sheet.command.clear-selection-content",
  "sheet.command.clear-selection-all",
]);

export interface GridRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface GridCommand {
  id: string;
  params?: {
    subUnitId?: string;
    ranges?: GridRange[];
  };
}

/**
 * Routes Univer's Delete/Backspace command through the workbook session.
 * Returning true tells the caller to cancel Univer's own transient mutation.
 */
export function handleGridClearCommand(
  session: WorkbookSession,
  command: GridCommand,
  fallback?: { sheetId: string; range: GridRange | null },
): boolean {
  if (!CLEAR_COMMANDS.has(command.id)) return false;
  const sheetId = command.params?.subUnitId ?? fallback?.sheetId;
  const ranges = command.params?.ranges ?? (fallback?.range ? [fallback.range] : []);
  if (!sheetId || !ranges.length) return false;

  session.transact(() => {
    for (const range of ranges) {
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        for (let column = range.startColumn; column <= range.endColumn; column += 1) {
          session.writeGridCell(sheetId, row, column, "");
        }
      }
    }
  });
  return true;
}
