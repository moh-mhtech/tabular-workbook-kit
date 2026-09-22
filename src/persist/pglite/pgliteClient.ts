import type { PGlite } from "@electric-sql/pglite";
import type { SqlClient } from "../postgres/sqlClient.js";

export function pgliteClient(db: PGlite): SqlClient {
  return {
    query: (sql, params) => db.query(sql, params),
    exec: async (sql) => {
      await db.exec(sql);
    },
  };
}
