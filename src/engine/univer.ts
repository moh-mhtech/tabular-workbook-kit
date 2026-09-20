import type { FormulaEngine, SheetGrid } from "./types.js";
import type { WorkbookSnapshot } from "../model/types.js";

export class UniverEngine implements FormulaEngine {
  private inner: FormulaEngine | undefined;

  async evaluate(snapshot: WorkbookSnapshot): Promise<Record<string, SheetGrid>> {
    if (!this.inner) this.inner = await loadPlatformEngine();
    return this.inner.evaluate(snapshot);
  }
}

async function loadPlatformEngine(): Promise<FormulaEngine> {
  if (typeof window === "undefined") {
    const { UniverEngine } = await import("./univer-node.js");
    return new UniverEngine();
  }
  const { UniverEngine } = await import("./univer-browser.js");
  return new UniverEngine();
}
