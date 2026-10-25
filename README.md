# tabular-workbook-kit

A sheets-style workbook **library** that hosts embed. Values live in named tables on sheet canvases. It is not an application and not a free cell grid.

Glossary: [CONTEXT.md](./CONTEXT.md). Licensed under GPL-3.0.

## Features

- Named tables stacked on sheets. A sheet is a canvas, not a second place to store values.
- Column-first structured formulas (`Table[Col][Row]`, `[Col]`, `@` / `@±n`). Names compile to engine ranges. Formulas are rewritten when a table, column, or row is renamed.
- Promoted row keys become workbook names (`Vat`) on a key-value table.
- Year columns with month, quarter, or year grain. Storage stays monthly.
- Scenarios overlay inputs on a base workbook.
- Locked tables and sheets cannot be deleted.
- A React canvas (Glide) with Explorer, a scenario bar, and a properties panel, or a headless `WorkbookSession`.
- Optional persistence: in-memory, IndexedDB, Postgres, or PGlite.

## Dependencies

| Package | Role |
| --- | --- |
| `hyperformula` | Calculation. GPLv3 unless the host passes a commercial license key. |
| `@glideapps/glide-data-grid` | Canvas drawing for the React UI. |
| `react` (peer, `>=18`) | Required only for `tabular-workbook-kit/react`. |
| `@electric-sql/pglite` (optional) | In-process Postgres for `tabular-workbook-kit/pglite`. |

`new WorkbookSession(snapshot)` calculates with HyperFormula. A commercial host must pass `new HyperFormulaEngine({ licenseKey })`. Use without that key requires GPLv3-compatible licensing.

## Persistence

| Option | Import | What it stores |
| --- | --- | --- |
| Memory | `MemoryPersistence` from `tabular-workbook-kit` | The snapshot in process memory. |
| IndexedDB | `IndexedDbPersistence` from `tabular-workbook-kit` | One snapshot blob in the browser. |
| Postgres | `PostgresWorkbookStore` from `tabular-workbook-kit/postgres` | JSONB per table plus SQL views, through a `SqlClient` the host supplies. |
| PGlite | `createPglitePersistence` from `tabular-workbook-kit/pglite` | The same Postgres layout in the browser or on Node. |

PGlite is not imported from the main entry. The `/postgres` entry is the hosted seam (`SqlClient`, `PostgresWorkbookStore`, `SCHEMA_SQL`).

## Getting started

Install the library and its peers from this repository (it is not published to npm). In a workspace, depend on `tabular-workbook-kit`.

Headless calculation, using the English sample workbook:

```tsx
import { WorkbookSession } from "tabular-workbook-kit";
import { createSampleWorkbook } from "tabular-workbook-kit/sample";

const session = new WorkbookSession(createSampleWorkbook());
await session.recalculate();
session.getTable("Sales");
session.getCell("Params", "AnnualSales", "Value");
session.activateScenario("scn-growth");
```

React canvas:

```tsx
import { WorkbookSession } from "tabular-workbook-kit";
import { createSampleWorkbook } from "tabular-workbook-kit/sample";
import {
  WorkbookProvider,
  CustomSheetCanvas,
  Explorer,
  PropertiesPanel,
  ScenarioBar,
} from "tabular-workbook-kit/react";

const session = new WorkbookSession(createSampleWorkbook());

<WorkbookProvider session={session}>
  <ScenarioBar />
  <Explorer />
  <CustomSheetCanvas />
  <PropertiesPanel />
</WorkbookProvider>
```

The sample (`sample/createSampleWorkbook.ts`, outside `src`) is a 2025 workbook that shows the library, not a product:

- **Parameters** is a locked key-value table. Row keys `AnnualSales`, `Growth`, and `Vat` are workbook names.
- **Assumptions / Sales** is a monthly year-column table. January is a formula from `Start` and the share names. Later months grow by `Growth`.
- **Capacity / Staff** adds attribute columns (`Role`, `BaseSalary`) and a formula that reads `Sales`.
- **Result** subtracts wages from revenue.
- The **Growth** scenario overlays `AnnualSales` with 10,000,000 and leaves the base at 8,000,000.

Host policy, such as a Danish budget seed, lives in the host. This library does not create it.

## Session API

`renameTable`, `renameRow`, `renameColumn`, `addRow` / `deleteRow`, `addColumn` / `deleteColumn`, `addTable` / `deleteTable`, `addSheet` / `deleteSheet`, `addYearColumn` / `removeYearColumn` / `setYearColumnGrain`, `addScenario` / `renameScenario` / `deleteScenario` / `duplicateScenario`, `setPromoteRowKeys`, `setColumnFormat` / `setCellFormat`.

New tables default to column identifiers `A`, `B`, … and row identifiers `1`, `2`, ….
