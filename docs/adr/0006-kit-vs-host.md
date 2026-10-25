# Library and host

tabular-workbook-kit is a workbook library: tables, sheets, formulas, `locked`, `promoteRowKeys`, `assertGlobalName`, properties inspectors.

A host is any application that opens a Workbook. The library does not name a product, does not create a parameters table, and does not require a table with promoted row keys. A host may lock sheets, promote row keys, and seed its own workbook.

The session constructor must not inject a parameters table. A host may have zero `promoteRowKeys` tables.
