import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../../sample/createSampleWorkbook.js";
import { pgliteClient } from "../pglite/pgliteClient.js";
import { PostgresWorkbookStore } from "./store.js";

describe("PostgresWorkbookStore via SqlClient", () => {
  it("saves and queries Computed views without importing PGlite into the store", async () => {
    const store = new PostgresWorkbookStore(pgliteClient(new PGlite()), "hosted-shaped");
    await store.save(createSampleWorkbook());
    const vat = await store.sql<{ Value: unknown }>(
      `SELECT "Value" FROM "Parameters"."Params.c" WHERE row_key = 'Vat'`,
    );
    expect(vat.rows[0]?.Value).toBe(0.25);
  });
});
