import type { SqlClient } from "./sqlClient.js";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workbooks (
  id text PRIMARY KEY,
  name text NOT NULL,
  calendar jsonb NOT NULL,
  sheets jsonb NOT NULL,
  scenario_list jsonb NOT NULL,
  active_scenario_id text,
  stored_epoch bigint NOT NULL DEFAULT 0,
  computed_epoch bigint NOT NULL DEFAULT 0,
  structure_version integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tables (
  workbook_id text NOT NULL REFERENCES workbooks(id) ON DELETE CASCADE,
  table_id text NOT NULL,
  sheet_id text NOT NULL,
  name text NOT NULL,
  stored jsonb NOT NULL,
  PRIMARY KEY (workbook_id, table_id)
);

CREATE TABLE IF NOT EXISTS overlays (
  workbook_id text NOT NULL,
  table_id text NOT NULL,
  scenario_id text NOT NULL,
  cells jsonb NOT NULL,
  PRIMARY KEY (workbook_id, table_id, scenario_id),
  FOREIGN KEY (workbook_id, table_id) REFERENCES tables(workbook_id, table_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS computed (
  workbook_id text NOT NULL,
  table_id text NOT NULL,
  scenario_id text NOT NULL,
  cells jsonb NOT NULL,
  PRIMARY KEY (workbook_id, table_id, scenario_id),
  FOREIGN KEY (workbook_id, table_id) REFERENCES tables(workbook_id, table_id) ON DELETE CASCADE
);
`;

export async function ensureSchema(db: SqlClient): Promise<void> {
  await db.exec(SCHEMA_SQL);
}
