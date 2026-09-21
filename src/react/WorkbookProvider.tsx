import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkbookSession } from "../session/WorkbookSession.js";

export type FormulaEditPlacement = "inline" | "popup";

interface WorkbookContextValue {
  session: WorkbookSession;
  version: number;
  activeSheetId: string;
  setActiveSheetId: (id: string) => void;
  formulaEditPlacement: FormulaEditPlacement;
  setFormulaEditPlacement: (placement: FormulaEditPlacement) => void;
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
  const [version, setVersion] = useState(0);
  const snapshot = session.getSnapshot();
  const [activeSheetId, setActiveSheetId] = useState(snapshot.sheets[0]?.id ?? "");
  const [formulaEditPlacement, setFormulaEditPlacement] = useState<FormulaEditPlacement>(initialPlacement);
  useEffect(() => session.subscribe(() => setVersion((v) => v + 1)), [session]);
  useEffect(() => {
    void session.recalculate();
  }, [session]);

  const value = useMemo(
    () => ({ session, version, activeSheetId, setActiveSheetId, formulaEditPlacement, setFormulaEditPlacement }),
    [session, version, activeSheetId, formulaEditPlacement],
  );

  return <WorkbookContext.Provider value={value}>{children}</WorkbookContext.Provider>;
}

export function useWorkbook() {
  const ctx = useContext(WorkbookContext);
  if (!ctx) throw new Error("useWorkbook must be used inside WorkbookProvider");
  return ctx;
}

export function useSnapshot() {
  const { session, version } = useWorkbook();
  return useMemo(() => ({ ...session.getSnapshot() }), [session, version]);
}
