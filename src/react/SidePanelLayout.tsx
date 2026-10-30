import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type SidePanelLayoutValue = {
  explorerRevealed: boolean;
  setExplorerRevealed: (revealed: boolean) => void;
  propertiesRevealed: boolean;
  setPropertiesRevealed: (revealed: boolean) => void;
};

const SidePanelLayoutContext = createContext<SidePanelLayoutValue | null>(null);

export function SidePanelLayoutProvider({
  children,
  initialExplorerRevealed = false,
  initialPropertiesRevealed = false,
}: {
  children: ReactNode;
  initialExplorerRevealed?: boolean;
  initialPropertiesRevealed?: boolean;
}) {
  const [explorerRevealed, setExplorerRevealed] = useState(initialExplorerRevealed);
  const [propertiesRevealed, setPropertiesRevealed] = useState(initialPropertiesRevealed);
  const value = useMemo(
    () => ({ explorerRevealed, setExplorerRevealed, propertiesRevealed, setPropertiesRevealed }),
    [explorerRevealed, propertiesRevealed],
  );
  return <SidePanelLayoutContext.Provider value={value}>{children}</SidePanelLayoutContext.Provider>;
}

export function useSidePanelLayout() {
  const ctx = useContext(SidePanelLayoutContext);
  if (!ctx) throw new Error("useSidePanelLayout must be used inside SidePanelLayoutProvider");
  return ctx;
}
