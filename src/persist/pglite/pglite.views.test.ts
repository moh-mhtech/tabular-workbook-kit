import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "../../session/WorkbookSession.js";
import { createPglitePersistence } from "./index.js";

describe("PglitePersistence SQL views", () => {
  it("exposes Stored Params as Parameters.Params", async () => {
    const persist = await createPglitePersistence("playground");
    await persist.save(createSampleWorkbook());
    const vat = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params" WHERE row_key = 'Vat'`,
    );
    expect(vat.rows[0]?.Value).toBe(0.25);
    const aarsalg = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params" WHERE row_key = 'AnnualSales'`,
    );
    expect(aarsalg.rows[0]?.Value).toBe(8_000_000);
  });

  it("exposes Computed Params as Parameters.Params.c", async () => {
    const persist = await createPglitePersistence("playground");
    await persist.save(createSampleWorkbook());
    const vat = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params.c" WHERE row_key = 'Vat'`,
    );
    expect(vat.rows[0]?.Value).toBe(0.25);
  });

  it("merges Scenario Computed deltas onto Base", async () => {
    const persist = await createPglitePersistence("playground");
    await persist.save(createSampleWorkbook());
    const baseAarsalg = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params.c" WHERE row_key = 'AnnualSales'`,
    );
    const scenarioAarsalg = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params.Growth.c" WHERE row_key = 'AnnualSales'`,
    );
    const scenarioVat = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params.Growth.c" WHERE row_key = 'Vat'`,
    );
    const baseCnc = await persist.sql<{ jan: unknown }>(
      `SELECT "2025-01" AS jan FROM "Assumptions"."Sales.c" WHERE row_key = 'CNC'`,
    );
    const scenarioCnc = await persist.sql<{ jan: unknown }>(
      `SELECT "2025-01" AS jan FROM "Assumptions"."Sales.Growth.c" WHERE row_key = 'CNC'`,
    );
    expect(baseAarsalg.rows[0]?.Value).toBe(8_000_000);
    expect(scenarioAarsalg.rows[0]?.Value).toBe(10_000_000);
    expect(scenarioVat.rows[0]?.Value).toBe(0.25);
    expect(scenarioCnc.rows[0]?.jan).not.toBe(baseCnc.rows[0]?.jan);
  });

  it("replaces SQL views when a Table is renamed", async () => {
    const persist = await createPglitePersistence("playground");
    const session = new WorkbookSession(createSampleWorkbook());
    await persist.save(session.getSnapshot());
    session.renameTable("Params", "Rates");
    await persist.save(session.getSnapshot());

    await expect(
      persist.sql(`SELECT "Value" FROM "Parameters"."Params" WHERE row_key = 'Vat'`),
    ).rejects.toThrow();
    const renamed = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Rates" WHERE row_key = 'Vat'`,
    );
    expect(renamed.rows[0]?.Value).toBe(0.25);
  });
});



