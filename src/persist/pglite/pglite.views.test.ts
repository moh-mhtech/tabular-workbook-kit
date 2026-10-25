import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "../../session/WorkbookSession.js";
import { createPglitePersistence } from "./index.js";

describe("PglitePersistence SQL views", () => {
  it("exposes Stored Params as Parameters.Params", async () => {
    const persist = await createPglitePersistence("workbook");
    await persist.save(createSampleWorkbook());
    const vat = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params" WHERE row_key = 'Mix'`,
    );
    expect(vat.rows[0]?.Value).toBe(0.25);
    const aarlines = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params" WHERE row_key = 'AnnualUnits'`,
    );
    expect(aarlines.rows[0]?.Value).toBe(8_000_000);
  });

  it("exposes Computed Params as Parameters.Params.c", async () => {
    const persist = await createPglitePersistence("workbook");
    await persist.save(createSampleWorkbook());
    const vat = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params.c" WHERE row_key = 'Mix'`,
    );
    expect(vat.rows[0]?.Value).toBe(0.25);
  });

  it("merges Scenario Computed deltas onto Base", async () => {
    const persist = await createPglitePersistence("workbook");
    await persist.save(createSampleWorkbook());
    const baseAarlines = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params.c" WHERE row_key = 'AnnualUnits'`,
    );
    const scenarioAarlines = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params.Growth.c" WHERE row_key = 'AnnualUnits'`,
    );
    const scenarioMix = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params.Growth.c" WHERE row_key = 'Mix'`,
    );
    const baseCnc = await persist.sql<{ jan: unknown }>(
      `SELECT "2025-01" AS jan FROM "Assumptions"."Lines.c" WHERE row_key = 'Red'`,
    );
    const scenarioCnc = await persist.sql<{ jan: unknown }>(
      `SELECT "2025-01" AS jan FROM "Assumptions"."Lines.Growth.c" WHERE row_key = 'Red'`,
    );
    expect(baseAarlines.rows[0]?.Value).toBe(8_000_000);
    expect(scenarioAarlines.rows[0]?.Value).toBe(10_000_000);
    expect(scenarioMix.rows[0]?.Value).toBe(0.25);
    expect(scenarioCnc.rows[0]?.jan).not.toBe(baseCnc.rows[0]?.jan);
  });

  it("replaces SQL views when a Table is renamed", async () => {
    const persist = await createPglitePersistence("workbook");
    const session = new WorkbookSession(createSampleWorkbook());
    await persist.save(session.getSnapshot());
    session.renameTable("Params", "Rates");
    await persist.save(session.getSnapshot());

    await expect(
      persist.sql(`SELECT "Value" FROM "Parameters"."Params" WHERE row_key = 'Mix'`),
    ).rejects.toThrow();
    const renamed = await persist.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Rates" WHERE row_key = 'Mix'`,
    );
    expect(renamed.rows[0]?.Value).toBe(0.25);
  });
});



