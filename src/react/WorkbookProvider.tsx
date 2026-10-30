import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkbookSession } from "../session/WorkbookSession.js";

export type FormulaEditPlacement = "inline" | "popup";

interface WorkbookContextValue {
  session: WorkbookSession;
  /** Bumps when model or computed values change (post-recalc). */
  dataVersion: number;
  /** Bumps for view-only session state (selection, pins, scroll, table hidden). */
  viewVersion: number;
  /** Bumps for in-progress formula edit draft/caret/pointing. */
  formulaEditVersion: number;
  /** @deprecated Use dataVersion; kept for existing tests. */
  version: number;
  activeSheetId: string;
  setActiveSheetId: (id: string) => void;
  formulaEditPlacement: FormulaEditPlacement;
  setFormulaEditPlacement: (placement: FormulaEditPlacement) => void;
  toggleSheetCollapsed: (sheetId: string) => void;
}

const WorkbookContext = createContext<WorkbookContextValue | null>(null);

export function WorkbookProvider({
  session,
  children,
  formulaEditPlacement: initialPlacement = "popup",
}: {
  session: WorkbookSession;
  children: ReactNode;
  formulaEditPlacement?: FormulaEditPlacement;
}) {
  const [dataVersion, setDataVersion] = useState(0);
  const [viewVersion, setViewVersion] = useState(0);
  const [formulaEditVersion, setFormulaEditVersion] = useState(0);
  const [activeSheetId, setActiveSheetIdState] = useState(session.getViewActiveSheetId());
  const setActiveSheetId = (sheetId: string) => {
    setActiveSheetIdState(sheetId);
    session.setViewActiveSheet(sheetId);
  };
  const [formulaEditPlacement, setFormulaEditPlacement] = useState<FormulaEditPlacement>(initialPlacement);
  const toggleSheetCollapsed = (sheetId: string) => {
    session.toggleSheetExplorerCollapsed(sheetId);
  };
  useEffect(
    () =>
      session.subscribe((change) => {
        if (change?.viewOnly) setViewVersion((v) => v + 1);
        else if (change?.formulaEditOnly) setFormulaEditVersion((v) => v + 1);
        else setDataVersion((v) => v + 1);
      }),
    [session],
  );
  useEffect(() => {
    void session.recalculate();
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      dataVersion,
      viewVersion,
      formulaEditVersion,
      version: dataVersion,
      activeSheetId,
      setActiveSheetId,
      formulaEditPlacement,
      setFormulaEditPlacement,
      toggleSheetCollapsed,
    }),
    [session, dataVersion, viewVersion, formulaEditVersion, activeSheetId, formulaEditPlacement],
  );

  return <WorkbookContext.Provider value={value}>{children}</WorkbookContext.Provider>;
}

export function useWorkbook() {
  const ctx = useContext(WorkbookContext);
  if (!ctx) throw new Error("useWorkbook must be used inside WorkbookProvider");
  return ctx;
}

export function useSnapshot() {
  const { session, dataVersion, viewVersion } = useWorkbook();
  return useMemo(() => ({ ...session.getSnapshot() }), [session, dataVersion, viewVersion]);
}

export function useFormulaEdit() {
  const { session, formulaEditVersion } = useWorkbook();
  return useMemo(() => session.formulaEdit, [session, formulaEditVersion]);
}
