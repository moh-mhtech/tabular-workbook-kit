# Workbook kit

Tables-only calculation kernel. Playground mounts the custom canvas and HyperFormula. Glossary: [CONTEXT.md](./CONTEXT.md). Host policy (Parametre/Params): [apps/playground/CONTEXT.md](../../apps/playground/CONTEXT.md).

## Mount (copy from Playground)

```tsx
import { WorkbookSession } from "@budgettool/workbook";
import {
  WorkbookProvider,
  CustomSheetCanvas,
  Explorer,
  PropertiesPanel,
  ScenarioBar,
} from "@budgettool/workbook/react";

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
