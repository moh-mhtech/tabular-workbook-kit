# Workbook kit vs BudgetTool host

tabular-workbook-kit is a generic workbook library: tables, sheets, formulas, `locked`, `promoteRowKeys`, `assertGlobalName`, properties inspectors.

Playground (later BudgetTool) is the host. It creates Parameters + Params, sets `locked` and `promoteRowKeys`, seeds `Vat`, and labels the workbook inspector Project.

The session constructor must not inject a parameters table. A non-budget host may have zero `promoteRowKeys` tables.
