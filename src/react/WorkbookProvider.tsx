import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkbookSession } from "../session/WorkbookSession.js";

interface WorkbookContextValue {
  session: WorkbookSession;
  version: number;
  activeSheetId: string;
  setActiveSheetId: (id: string) => void;
}

const WorkbookContext = createContext<WorkbookContextValue | null>(null);

export function WorkbookProvider({
  session,
  children,
}: {
  session: WorkbookSession;
  children: ReactNode;
}) {
  const [version, setVersion] = useState(0);
  const snapshot = session.getSnapshot();
  const [activeSheetId, setActiveSheetId] = useState(snapshot.sheets[0]?.id ?? "");
  useEffect(() => session.subscribe(() => setVersion((v) => v + 1)), [session]);
  useEffect(() => {
    void session.recalculate();
  }, [session]);

  const value = useMemo(
    () => ({ session, version, activeSheetId, setActiveSheetId }),
    [session, version, activeSheetId],
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
