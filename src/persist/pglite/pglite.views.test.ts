import { describe, expect, it } from "vitest";
import { createPlaygroundWorkbook } from "../../sample/playgroundWorkbook.js";
import { WorkbookSession } from "../../session/WorkbookSession.js";
import { createPglitePersistence } from "./index.js";

describe("PglitePersistence SQL views", () => {
  it("exposes Stored Params as Parametre.Params", async () => {
    const persist = await createPglitePersistence("playground");
    await persist.save(createPlaygroundWorkbook());
    const vat = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parametre"."Params" WHERE row_key = 'Vat'`,
    );
    expect(vat.rows[0]?.Value).toBe(0.25);
    const aarsalg = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parametre"."Params" WHERE row_key = 'Årssalg'`,
    );
    expect(aarsalg.rows[0]?.Value).toBe(8_000_000);
  });

  it("exposes Computed Params as Parametre.Params.c", async () => {
    const persist = await createPglitePersistence("playground");
    await persist.save(createPlaygroundWorkbook());
    const vat = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parametre"."Params.c" WHERE row_key = 'Vat'`,
    );
    expect(vat.rows[0]?.Value).toBe(0.25);
  });

  it("merges Scenario Computed deltas onto Base", async () => {
    const persist = await createPglitePersistence("playground");
    await persist.save(createPlaygroundWorkbook());
    const baseAarsalg = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parametre"."Params.c" WHERE row_key = 'Årssalg'`,
    );
    const scenarioAarsalg = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parametre"."Params.Vækst.c" WHERE row_key = 'Årssalg'`,
    );
    const scenarioVat = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parametre"."Params.Vækst.c" WHERE row_key = 'Vat'`,
    );
    const baseCnc = await persist.sql<{ jan: unknown }>(
      `SELECT "2025-01" AS jan FROM "Forudsætninger"."Salg.c" WHERE row_key = 'CNC'`,
    );
    const scenarioCnc = await persist.sql<{ jan: unknown }>(
      `SELECT "2025-01" AS jan FROM "Forudsætninger"."Salg.Vækst.c" WHERE row_key = 'CNC'`,
    );
    expect(baseAarsalg.rows[0]?.Value).toBe(8_000_000);
    expect(scenarioAarsalg.rows[0]?.Value).toBe(10_000_000);
    expect(scenarioVat.rows[0]?.Value).toBe(0.25);
    expect(scenarioCnc.rows[0]?.jan).not.toBe(baseCnc.rows[0]?.jan);
  });

  it("replaces SQL views when a Table is renamed", async () => {
    const persist = await createPglitePersistence("playground");
    const session = new WorkbookSession(createPlaygroundWorkbook());
    await persist.save(session.getSnapshot());
    session.renameTable("Params", "Rates");
    await persist.save(session.getSnapshot());

    await expect(
      persist.sql(`SELECT "Value" FROM "Parametre"."Params" WHERE row_key = 'Vat'`),
    ).rejects.toThrow();
    const renamed = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parametre"."Rates" WHERE row_key = 'Vat'`,
    );
    expect(renamed.rows[0]?.Value).toBe(0.25);
  });
});



