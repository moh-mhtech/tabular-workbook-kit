# Workbook kit

The calculation document a host (Playground, later BudgetTool) edits: named tables on sheets, a calendar, and scenarios. It is not an unstructured spreadsheet and not a financial statement. Product rules (locked Parametre, Project chrome) live in the host.

## Language

### Document

**Workbook**:
A named set of Tables, Sheets, a Calendar, and Scenarios that calculate together.
_Avoid_: Spreadsheet, workbook file, budget, model (when you mean this document)

**Sheet**:
A named canvas that holds Tables stacked as bands. A Sheet is not a data container; values live in Tables. The Sheet name can qualify a Table in a Formula when names collide across Sheets.
_Avoid_: Group, tab, folder, unstructured grid

**Table**:
A named grid with row keys, attribute columns, and optional year-columns. Every calculated value lives in a Table. There is one Table type.
_Avoid_: Sheet, range, post list, dataset, table kind

**Calendar**:
The Workbook’s ordered monthly Periods, the shared time line year-columns join on.
_Avoid_: Timeline, date range, fiscal year (fiscal year is a BudgetTool concept)

**Period**:
One month on the Calendar. The join key between year-column tables.
_Avoid_: Column letter, month index, timestamp

**Scenario**:
A named sparse overlay of Input values keyed by Table + row key + column or Period. Structure and Formulas are shared with Base. A Scenario cannot add rows or override Formulas.
_Avoid_: Case, version, copy, what-if sheet

**Base**:
The Workbook Inputs with no Scenario overlay applied.
_Avoid_: Default scenario, original, master

### Tables

**Row key**:
The identity of a row in a Table (Karol, Vat). If the user has not named it, the row still has a stable id — not an Excel row number.
_Avoid_: Row number, A1 row

**Key cell**:
The leftmost cell of a data row, showing the Row key. Clicking it selects the row. Typing here renames the Row key. The Growth-row key is a Growth header, not a Key cell.
_Avoid_: Index cell, row header (when you mean this)

**Header cell**:
The top cell of a data column, showing the column name. Clicking it selects the column. Typing here renames an Attribute column. Year-column headers are Period labels. The Growth-column header is a Growth header.
_Avoid_: Column letter, A1 header

**Attribute column**:
A Table column that is not time (Value, Position, Comment).
_Avoid_: Metadata column, property (when you mean this)

**Year column**:
A Table column that is one calendar year of Periods. Storage is always months. Display Grain is month, quarter, or year.
_Avoid_: Time axis, table kind, date column, sheet months

**Grain**:
The display grouping of a Year column: month, quarter, or year.
_Avoid_: Workbook grain, table kind, zoom

**Key-value policy**:
A Table with one Value column whose row keys become Defined names. Not a second Table type. New parameters are rows; there is no growth column.
_Avoid_: Parameter class, Params type (as a kit table kind)

**Locked**:
A Sheet or Table that cannot be deleted.
_Avoid_: Read-only (cells on a locked Table can still be edited unless the host says otherwise)

**Growth**:
The empty Growth row and optional Growth column on a Table’s edge, used for Auto-expansion.
_Avoid_: Autofill handle, spill range

**Growth row**:
The empty row beneath a Table’s last data row. Typing here appends a row. The key cell is a Growth header (`+`). Ctrl+arrow does not treat it as a Table boundary.
_Avoid_: New row, spare row, extra row

**Growth column**:
The empty column right of a Table’s last data column. Typing here appends an attribute column. Hidden on key-value Tables; year-columns do not expand right.
_Avoid_: New column, spare column

**Growth header**:
The `+` affordance on the Growth-row key or Growth-column header. It is selectable; the Unused corners are not. Selecting a Growth cell selects the Table until Auto-expansion creates a Cell.
_Avoid_: Autofill handle, insert button

**Unused corner**:
The Table’s top-left key header and bottom-right Growth corner. Not a Cell, not Growth, not selectable.
_Avoid_: Corner cell, empty cell (when you mean these)

**Auto-expansion**:
Typing in Growth appends a row or an attribute column when that edge is otherwise empty. The value and the shape change are one undo step. Pasting a range that does not fit also grows the Table (**Paste-grow**).
_Avoid_: Autofill, spill, dynamic array

**Paste-grow**:
Pasting a Cell range that extends past the Table appends rows and/or columns so the paste fits.
_Avoid_: Spill, insert copied cells

**Fill**:
Repeating a Cell’s Input or Formula into adjacent Cells via the fill handle. Distinct from Auto-expansion, which adds rows or columns.
_Avoid_: Autofill (when you mean Growth), flash fill

### Cells

**Cell**:
The value at Table + row key + attribute column or Period. Canonical address is not A1.
_Avoid_: A1, range address (as identity)

**Input**:
A Cell whose value the user typed. Scenarios may overlay Inputs.
_Avoid_: Hardcoded, constant, data cell

**Formula**:
A Cell computed from a structured expression. Authoring is column-first: `Sheet.Table[Column][Row]`, `Table[Column][Row]`, `[Column][Row]`. `@` is this column or row; `@±n` is an offset. Omitting `[Row]` means this row. A1 is not the authoring language.
_Avoid_: A1 (`=B12`), `Sheet!A1`, `[column, row]`

**Overlay**:
One Scenario replacement for a single Input.
_Avoid_: Patch, delta, what-if cell

**Cell style**:
Appearance stored on a Cell or column: bold, italic, strikethrough, text color, fill color, and font size.
_Avoid_: Theme, conditional format, number format (when you mean appearance)

**Number format**:
How a numeric Cell is shown (significant digits, thousand separators, compact K/M/B/T, currency). It does not change the stored Input or the value Formulas use.
_Avoid_: Cell style, rounding the stored value

**Loose cell**:
A typed value on a Sheet outside every Table. It is not a Formula and not a modeling surface.
_Avoid_: Free cell, unstructured table, scratch table (as a place to model)

### Formulas

**Defined name**:
A Workbook-wide name for one Cell. A key-value Table registers each row key as the name of that row’s Value cell (`Vat`). Names must be unique against other promoted keys, Table names, Sheet names, and reserved functions.
_Avoid_: Name-as-formula (`=@-1`), P table

**Formula ref**:
One complete structured-ref or Defined name token in Formula text (`Vat`, `Salg[Jan][CNC]`, `Vat:AndelCNC`).
_Avoid_: A1 token, range address (as Excel `B12`)

**Formula range**:
A Formula ref of two same-Table names joined by `:` (`Vat:AndelCNC`), produced in Point by click-drag or Shift+Arrow.
_Avoid_: Cell range (that is Selection), A1 range

### Editing

**Formula edit**:
The session while a Cell is being typed, shared by the in-cell editor and the Formula bar. Absent in Ready; otherwise Enter, Edit mode, or Point.
_Avoid_: OverlayNavMode, overlay (when you mean this session, not a Scenario Overlay)

**Ready**:
No Formula edit is open. Arrows move Selection. Typing starts Enter and replaces the Cell. F2, double-click, or Formula bar focus starts Edit mode.
_Avoid_: Idle, browse, navigation mode

**Enter**:
Formula edit started by typing. A Literal: arrow or click Commits and moves Selection. A Formula (`=`): arrow or click starts Point.
_Avoid_: Typeover, replace mode (Excel’s name is Enter)

**Edit mode**:
Formula edit started by F2, double-click, or Formula bar. Arrows move the Caret. Click Points only at an Insert point; otherwise it Commits and selects. F2 toggles Enter ↔ Edit mode.
_Avoid_: Edit (the verb), F2 mode, in-cell edit (when you mean the mode)

**Point**:
Formula-edit mode that inserts a Formula ref. Click or arrow updates the Active formula ref; the editor stays open. An operator returns to Enter. F2 returns to Edit mode. Click-drag or Shift+Arrow writes a Formula range in the same Table.
_Avoid_: Navigate (when you mean inserting a ref)

**Edit cell**:
The Cell whose Formula or Input is open.
_Avoid_: Active cell (when you mean this vs Selection), source cell

**Formula text**:
The draft string in Formula edit.
_Avoid_: Overlay value, input value (when you mean the draft)

**Active formula ref**:
The Formula ref under the caret or selection, or none when inserting a new one.
_Avoid_: Selection (the Properties panel object), highlighted ref

**Target cell**:
The Cell currently chosen for the Active formula ref. The next Point arrow walk starts here; if there is none, it starts at the Edit cell.
_Avoid_: Selection, pointed cell (use this name)

**Caret**:
The insertion position in Formula text. In Edit mode, arrows move the Caret. In Enter and Point, arrows do not.
_Avoid_: Cursor, selection (the Properties panel object)

**Insert point**:
A Caret position in Formula text where a Formula ref may be inserted: after `=`, an operator, or a comma, or on an existing Formula ref.
_Avoid_: Caret (the Caret is not always an insert point)

**Literal**:
Formula text that is not a Formula — it does not start with `=`. In Enter, arrow or click Commits a Literal.
_Avoid_: Value edit, number mode

**Commit**:
Ending Formula edit and writing Formula text to the Cell. Enter moves Selection down (onto Growth if that is the next unused cell); Tab moves right. A Literal click onto another Cell also Commits and selects that Cell.
_Avoid_: Save, apply, blur (blur is one way to Commit)

**Cancel**:
Escape ends Formula edit without writing Formula text. If Formula AutoComplete is open, the first Escape hides the list; a second Escape Cancels.
_Avoid_: Undo (Cancel does not revert a prior Commit), close editor

**Formula AutoComplete**:
Suggestions of functions, Defined names, and Table names after a non-empty prefix in Formula text. Bare `=` and operators show none. `[` still completes columns. Tab or Enter inserts from the list and does not Commit.
_Avoid_: IntelliSense, formula wizard

### Navigation

**Arrow navigation**:
In Ready, an arrow moves Selection to the next selectable Cell — Growth included, Unused corners skipped. Right/left wrap to the next/previous row, then the next/previous Table. Up/down stay on the same column index, then that index in the adjacent Table.
_Avoid_: Caret movement (that is Edit mode), Point (that inserts a ref)

**Ctrl+arrow**:
In Ready, jump to the next Phase change along that axis, always landing on the filled side. Left/right never wrap to another row. The Growth row is not a stop and not a Table change; the next up/down press after the last data cell enters the adjacent Table.
_Avoid_: End key, Ctrl+End

**Phase change**:
A switch between filled and blank Cells on an axis, or a Table boundary, used by Ctrl+arrow.
_Avoid_: Block, region, current region (Excel’s name)

### Shell

**Explorer**:
The left column: Sheets and the Tables on each Sheet. Clicking a Table name Reveals that Table.
_Avoid_: Folder tree, sheet tabs (when you mean this list)

**Reveal**:
Selecting a Table from Explorer and scrolling the viewport to that Table’s start. Distinct from keeping the selected Cell in view while Arrow navigation or Commit moves it.
_Avoid_: Jump, scroll-into-view, follow selection

**Selection**:
The object the Properties panel edits: Workbook, Sheet, Table, column, row, or Cell (optionally a Cell range). Clicking empty canvas selects the Sheet. Clicking a Key cell selects the row; a Header cell, the column. Selection never sits on an Unused corner. Arrow navigation keeps the selected Cell in view without Reveal.
_Avoid_: A1 range (when you mean this), focus (when you mean Selection)

**Cell range**:
A multi-cell Selection, built in Ready by click-drag or Shift+Arrow. Shared inspector fields show one value or Mixed. Typing or a Formula-bar Commit writes to every Cell in the range.
_Avoid_: Formula range (that is in Formula text), A1 range

**Mixed**:
Inspector display (`*`) when the Cells in a Cell range do not share a value. Focusing the field fills it from the first Cell; Commit still writes to all.
_Avoid_: Indeterminate, various, empty (when values differ)

**Properties panel**:
The always-mounted right column. A Formula bar plus one inspector per Selection kind. Hosts may add extra sections.
_Avoid_: Host KPIs, property grid (as Excel VBA)

**Formula bar**:
The Value field for the selected Cell’s Input or Formula. It stays mounted while Pointing so a Sheet switch does not cancel Formula edit. It shares Enter / Edit mode / Point with the in-cell editor.
_Avoid_: Formula line, name box

**Horizontal scroll**:
Whether wide Tables on a Sheet scroll individually (default) or the whole Sheet scrolls together.
_Avoid_: Freeze panes, split view
