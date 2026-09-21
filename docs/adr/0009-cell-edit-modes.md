# Excel-like cell edit modes (Ready, Enter, Edit, Point)

In-cell overlay and the Value formula bar share one `formulaEdit` machine. Modes match Excel; addresses stay BudgetTool names (`Vat`, `Salg[Jan][CNC]`), never A1.

**Ready** — no `formulaEdit`. Arrows move selection. Typing starts Enter (replaces). F2, double-click, or formula-bar focus starts Edit.

**Enter** — started by typing. Literal: arrows/click commit and move. Formula (`=`): arrows/click enter Point.

**Edit** — F2, double-click, or formula bar. Arrows move the caret. Formula click points only at a valid insert point (after `=`, operator, comma, or on an existing ref); otherwise click commits and selects. F2 toggles Enter ↔ Edit.

**Point** — inserting a ref. Click/arrow updates the active ref; editor stays open. Operator returns to Enter. F2 returns to Edit. Click-drag or Shift+Arrow inserts `start:end` in the same table.

Autocomplete lists functions, defined names, and table names only after a non-empty prefix. Bare `=` and operators show no list. `[` still completes columns. Tab/Enter insert from the list; they do not commit.
