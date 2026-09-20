import { describe, expect, it } from "vitest";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { MemoryPersistence } from "../persist/index.js";
import { WorkbookSession } from "./WorkbookSession.js";

describe("persistence", () => {
  it("round-trips a snapshot including scenario overlays", async () => {
    const persist = new MemoryPersistence();
    const session = new WorkbookSession(createPlaygroundWorkbook());
    await session.recalculate();
    session.activateScenario("scn-vaekst");
    session.setInput("Params", "Vækst", "Value", 0.04);
    await persist.save(session.toSnapshot());
    const loaded = await persist.load();
    expect(loaded).not.toBeNull();
    const restored = new WorkbookSession(loaded!);
    await restored.recalculate();
    expect(restored.activeScenarioId).toBe("scn-vaekst");
    expect(restored.getCell("Params", "Årssalg", "Value").computed).toBe(10_000_000);
    expect(restored.getCell("Params", "Vækst", "Value").computed).toBe(0.04);
    expect(restored.getCell("Params", "Vækst", "Value").overlay).toBe(true);
  }, 60_000);
});
