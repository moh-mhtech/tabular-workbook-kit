# tabular-workbook-kit

Sheets-style workbook library that enforces tables. A host application mounts the custom canvas and HyperFormula. This repository is the library, not an application. Glossary: [CONTEXT.md](./CONTEXT.md). Host policy, such as Parametre and Params, lives in the host glossary, not in this library. Licensed under GPL-3.0.

## Mount

```tsx
import { WorkbookSession } from "tabular-workbook-kit";
import {
  WorkbookProvider,
  CustomSheetCanvas,
  Explorer,
  PropertiesPanel,
  ScenarioBar,
} from "tabular-workbook-kit/react";

const session = new WorkbookSession(snapshot);

<WorkbookProvider session={session}>
  <ScenarioBar />
  <Explorer />
  <CustomSheetCanvas />
  <PropertiesPanel />
</WorkbookProvider>
```

Headless (no canvas): `session.getTable("Salg")`, `session.getCell("Params", "Årssalg", "Value")`, `session.activateScenario("scn-vaekst")`.

Authoring language is column-first structured refs (`Table[Col][Row]`, `[Col]`, `@` / `@±n`). Named rows compile to engine ranges or direct cells. Tables with `promoteRowKeys` register row keys as workbook names (`Vat`). `locked` tables/sheets cannot be deleted. New tables default to editable column identifiers `A`, `B`, … and row identifiers `1`, `2`, ….

`new WorkbookSession(snapshot)` calculates with HyperFormula. A commercial host must pass `new HyperFormulaEngine({ licenseKey })`; standalone HyperFormula requires GPLv3-compatible use or a commercial key.

Session APIs: `renameTable`, `renameRow`, `renameColumn`, `addRow` / `deleteRow`, `addColumn` / `deleteColumn`, `addTable` / `deleteTable`, `addSheet` / `deleteSheet`, `addYearColumn` / `removeYearColumn` / `setYearColumnGrain`, `addScenario` / `renameScenario` / `deleteScenario` / `duplicateScenario`, `setPromoteRowKeys`, `setColumnFormat` / `setCellFormat`. Formulas that use old names are rewritten.
