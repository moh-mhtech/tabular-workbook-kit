# PGlite JSONB + SQL views as an optional PersistencePort

IndexedDB keeps one `WorkbookSnapshot` blob. Hosted pick #1 stores JSONB per Table and exposes `sheet.table[.scenario][.c]` views. The kit ships that layout as an optional sample on [PGlite](https://github.com/electric-sql/pglite), not as a required dependency.

`tabular-workbook-kit/pglite` implements `PersistencePort` (`load` / `save` / `clear`). JSON is truth (`workbooks` + `tables.stored` + overlays + computed deltas). HyperFormula runs on save to fill computed JSON. A host may stay on IndexedDB unless it opts into PGlite.

We do not import PGlite from the main kit entry. `tabular-workbook-kit/postgres` is the hosted seam: `SqlClient` + `PostgresWorkbookStore` + `SCHEMA_SQL`. PGlite is one `SqlClient`. Cloud SQL `pg` is another. Local-only: no `GRANT`, no cell last-write-wins. A hosted sample plan lives with the host, not in this library.
