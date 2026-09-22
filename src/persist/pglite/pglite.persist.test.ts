import { describe, expect, it } from "vitest";
import { createPlaygroundWorkbook } from "../../sample/playgroundWorkbook.js";
import { WorkbookSession } from "../../session/WorkbookSession.js";
import { createPglitePersistence } from "./index.js";

describe("PglitePersistence", () => {
  it("load is empty until save restores Stored values", async () => {
    const persist = await createPglitePersistence("playground");
    expect(await persist.load()).toBeNull();

    await persist.save(createPlaygroundWorkbook());
    const loaded = await persist.load();
    expect(loaded).not.toBeNull();
    const session = new WorkbookSession(loaded!);
    await session.recalculate();
    expect(session.getCell("Params", "Vat", "Value").input).toBe(0.25);

    await persist.clear();
    expect(await persist.load()).toBeNull();
  });

  it("uses a host-served FS bundle instead of resolving pglite.data from the module URL", async () => {
    const fsBundle = new Blob([new Uint8Array(573)]);
    await expect(createPglitePersistence("playground", { fsBundle })).rejects.toThrow(
      /Invalid FS bundle size: 573/,
    );
  });

  it("keeps the latest Stored Input when two saves overlap", async () => {
    const persist = await createPglitePersistence("playground-overlap");
    const first = createPlaygroundWorkbook();
    const session = new WorkbookSession(createPlaygroundWorkbook());
    session.setInput("Params", "Vækst", "Value", "test");
    const second = session.toSnapshot();

    await Promise.all([persist.save(first), persist.save(second)]);

    const loaded = await persist.load();
    expect(loaded).not.toBeNull();
    const restored = new WorkbookSession(loaded!);
    await restored.recalculate();
    expect(restored.getCell("Params", "Vækst", "Value").input).toBe("test");
  });

  it("round-trips a snapshot including scenario overlays", async () => {
    const persist = await createPglitePersistence("playground");
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
  });
});

