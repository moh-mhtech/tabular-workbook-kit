# Excel-like cell edit modes (Ready, Enter, Edit, Point)

In-cell overlay and the Value formula bar share one `formulaEdit` machine. Modes match Excel; addresses stay BudgetTool names (`Vat`, `Salg[Jan][CNC]`), never A1.

**Ready** — no `formulaEdit`. Arrows move selection. Typing starts Enter (replaces). F2, double-click, or formula-bar focus starts Edit.

**Enter** — started by typing, or by an operator typed while Pointing. Literal: arrows/click commit and move. Formula (`=`): arrows/click enter Point. A click that places the caret in formula text switches to Edit.

**Edit** — F2, double-click, formula bar, or a click that places the caret in formula text (in-cell editor or formula bar). Arrows move the caret. A grid click points only at a valid insert point (after `=`, operator, comma, or on an existing ref); otherwise click commits and selects. F2 toggles Enter ↔ Edit.

**Point** — inserting a ref from a grid click or arrow. Operator typed while still Pointing (no click in formula text) returns to Enter, so the next arrow/click continues Point. F2, or a click that places the caret in formula text (in-cell editor or formula bar), returns to Edit without cancelling — including after a mouse Formula range. Not a special case for `)`. Click-drag or Shift+Arrow inserts `start:end` in the same table.

Autocomplete lists functions, defined names, and table names only after a non-empty prefix. Bare `=` and operators show no list. `[` still completes columns. Tab/Enter insert from the list; they do not commit.
