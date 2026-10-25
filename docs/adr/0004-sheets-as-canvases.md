# Sheets are canvases for tables

Groups became Sheets: a sheet canvas plus an explorer node. Tables on a sheet are stacked locked bands (`sheetView` / `hitTest`). No data outside tables.

Snapshot field is `sheets`. There is no `groups` alias and no snapshot migrator (prototype: change the current model, reset local data).

Sheet name may qualify a table when names collide across sheets (`Capacity.Staff[BaseSalary][Karol]`). The sheet is still not a formula data container.
