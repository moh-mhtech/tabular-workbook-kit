import { createContext, useContext, type ReactNode } from "react";
import type { WorkbookLayout } from "../model/layout.js";
import type { SheetGridProjection } from "../grid/sheetProjection.js";
import type { PendingCellDisplay } from "./commitProjectedCellEdit.js";

export type GridCommitApi = {
  pendingDisplay: PendingCellDisplay;
  commitAt: (location: readonly [number, number], raw: string) => void;
  /** Session + controlled grid selection, before Glide finish-edit (type-to-edit on the next row). */
  syncNavigateAfterCommit: (
    from: readonly [number, number],
    movement: readonly [number, number],
  ) => readonly [number, number] | undefined;
  queueTypedChar: (char: string) => void;
  takeQueuedChars: (location: readonly [number, number]) => string;
  noteCommitInFlight: () => void;
  clearCommitInFlight: () => void;
  commitInFlight: () => boolean;
};

const GridCommitContext = createContext<GridCommitApi | null>(null);

export function GridCommitProvider({
  value,
  children,
}: {
  value: GridCommitApi;
  children: ReactNode;
}) {
  return <GridCommitContext.Provider value={value}>{children}</GridCommitContext.Provider>;
}

export function useGridCommit(): GridCommitApi | null {
  return useContext(GridCommitContext);
}

export type GridCommitHostRefs = {
  projection: SheetGridProjection | null;
  layout: WorkbookLayout | null;
  tableId: string;
};
