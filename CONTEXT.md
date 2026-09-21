# Workbook kit

The calculation document a host (Playground, later BudgetTool) edits: named tables on sheets, a calendar, and scenarios. It is not an unstructured spreadsheet and not a financial statement. This package owns a generic table-first workbook with interchangeable canvas and calculation adapters. Product rules (locked Parametre, Project chrome) live in the host.

## Language

**Workbook**:
A named set of Tables, Sheets, a Calendar, and Scenarios that calculate together.
_Avoid_: Spreadsheet, workbook file, budget, model (when you mean this document)

**Sheet**:
A Univer worksheet and an explorer node. Tables are stacked as locked bands on a Sheet. A Sheet is not a data container; values live in Tables. Sheet name can qualify a table in a formula (`Kapacitet.Staff[…]`) but is not required when the table name is unique.
_Avoid_: Group, tab, folder, unstructured grid (when you mean this)

**Table**:
A named grid with row keys, attribute columns, and optional year-columns. Every value lives in a Table. There is one Table type. Optional flags: `locked` (cannot delete), `promoteRowKeys` (row keys of the single data column become workbook defined names; a key-value policy, not a third grid kind).
_Avoid_: Sheet, range, post list, dataset, parameter class (as a second grid kind)

**Row key**:
The identity of a row in a Table (for example Karol, Husleje). If the user has not named it, the row still has a stable id, not an Excel row number as identity.
_Avoid_: Row number, A1 row

**Attribute column**:
A non-time column (Position, Base salary, Comment, Value).
_Avoid_: Metadata column, property (when you mean this)

**Year column**:
A Table column that expands one calendar year into visible period slots. Grain is per year-column (`month` / `quarter` / `year`). Storage stays months (`2025-01`). A quarter/year number edit even-splits onto those months (last month absorbs rounding). Formulas written in Q/Y land on every month in the bucket. `Salg[Jan]`, `Salg[2025-Q1]`, `Salg[2025]`, and `Salg[2025-01]` all compile. Unqualified `Jan` is the first year-column that has that month.
_Avoid_: Time axis, table kind, date column, sheet months

**Calendar**:
The Workbook’s ordered monthly Periods (the shared time line tables join on).
_Avoid_: Timeline, date range, fiscal year (fiscal year is a BudgetTool concept)

**Period**:
One month on the Calendar. The join key between year-column tables.
_Avoid_: Column letter, month index, timestamp

**Cell**:
The value at Table + row key + attribute column or Period. Canonical address is not A1.
_Avoid_: A1, range address (as identity)

**Loose cell**:
A plain value typed on a Sheet grid outside every Table band, addressed by grid row and column. Loose cells exist so stray notes survive a re-render and so the grid extent can grow past the tables; they are not a second calculation surface and hold no Formula.
_Avoid_: Free cell, unstructured table, scratch table

**Input**:
A Cell whose value the user typed. Scenarios may overlay Inputs.
_Avoid_: Hardcoded, constant, data cell

**Formula**:
A Cell computed from an expression. Addresses are column-first chained brackets: `Sheet.Table[Column][Row]`, `Table[Column][Row]`, `[Column][Row]`. `@` is the current column or row on that axis; `@±n` is an offset. Omitting `[Row]` means this row. A1 is not the authoring language. Named rows compile to `INDEX/MATCH`; this-row columns stay Univer `[@Col]`.
_Avoid_: A1 (`=B12`), `Sheet!A1`, `[column, row]`

**Defined name**:
A workbook-scoped Univer name pointing at a cell. Tables with `promoteRowKeys` register each row key as the name of that row’s single data cell (`Vat`). `getCellName` returns that name when present, otherwise the structured ref. Names must pass `assertGlobalName` (unique vs other promoted keys, table names, sheet names, reserved functions, `@`).
_Avoid_: Name-as-formula (`=@-1`), P table

**Selection**:
The object the properties panel edits: workbook, sheet, table, column, row, or cell.
_Avoid_: A1 range, jspreadsheet highlight (when you mean this)

**Properties panel**:
Always-mounted right column. A sticky formula field plus one inspector module per Selection kind. Hosts may add extra sections.
_Avoid_: Host KPIs, property grid (as Excel VBA)

**Scenario**:
A named sparse overlay of Input values keyed by Table + row key + column/Period. Structure is shared with Base. A Scenario cannot add rows or override Formulas.
_Avoid_: Case, version, copy, what-if sheet

**Base**:
The Workbook Inputs with no Scenario overlay applied.
_Avoid_: Default scenario, original, master

**SheetCanvas**:
The kit-owned Univer editor for a Sheet: stacked Table bands, Loose cells, formula pointing. Every edit is cancelled in Univer and replayed through WorkbookSession. The grid extent is always the occupied extent plus exactly one row and one column, so an edit in the margin pushes it out and clearing the last occupied row or column pulls it back. Table bands floor it: a band always occupies its rows and columns.
_Avoid_: Unstructured workbook, TableGrid, jspreadsheet (when you mean this editor)

**CustomSheetCanvas**:
The kit-owned Glide editor for a Sheet. It renders the same stacked Table bands from the same Snapshot but permits data entry only in Tables and their direct expansion margin. Glide is a rendering and input primitive; WorkbookSession owns edits, expansion, selection, and undo. The Playground pairs this canvas with HyperFormula so it can be compared directly with SheetCanvas + Univer.
_Avoid_: Second workbook model, Glide-owned data, free-form sheet

**Formula engine**:
An adapter behind `FormulaEngine` that evaluates a Workbook Snapshot. UniverEngine and HyperFormulaEngine are alternative implementations; neither owns source data or undo. HyperFormula receives compiled range formulas because it does not understand the kit's structured references directly.
_Avoid_: Canvas, source of truth, command history

**Reconcile**:
Moving the mounted Univer unit onto the current Snapshot by diffing what the grid shows against what the Snapshot projects, then applying only the changed cells, extents, Table ranges, and Defined names. The unit is mounted once per Workbook and never rebuilt for an edit, so scroll and selection survive. Only a change to the set, order, or names of Sheets falls back to a rebuild.
_Avoid_: Re-render, refresh, remount (when you mean this)

**Auto-expansion**:
Excel's rule that typing directly beneath a Table's last row appends a Row, and typing directly right of its last column appends an attribute Column — only while every other cell adjacent in that direction is empty. Year-column and `promoteRowKeys` Tables never expand right (`promoteRowKeys` also hides the growth column). The value and the shape change are one undo step.
_Avoid_: Autofill, spill, dynamic array

**WorkbookSession**:
The live open Workbook: current Scenario, calculated values, commands, formula-edit/pointing. Hosts read values through it without mounting SheetCanvas.
_Avoid_: Store, engine, workbook instance (when you mean this façade)
