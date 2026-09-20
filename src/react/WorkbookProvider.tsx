import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkbookSession } from "../session/WorkbookSession.js";
import type { TimeGrain } from "../model/types.js";

interface WorkbookContextValue {
  session: WorkbookSession;
  version: number;
  activeSheetId: string;
  setActiveSheetId: (id: string) => void;
  timeGrain: TimeGrain;
  setTimeGrain: (grain: TimeGrain) => void;
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
  const [timeGrain, setTimeGrain] = useState<TimeGrain>("month");

  useEffect(() => session.subscribe(() => setVersion((v) => v + 1)), [session]);
  useEffect(() => {
    void session.recalculate();
  }, [session]);

  const value = useMemo(
    () => ({ session, version, activeSheetId, setActiveSheetId, timeGrain, setTimeGrain }),
    [session, version, activeSheetId, timeGrain],
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
  return useMemo(() => {
    void version;
    return session.getSnapshot();
  }, [session, version]);
}
