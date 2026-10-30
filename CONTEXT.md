# Workbook

The language of a tabular Workbook a host embeds: named tables on sheets, a calendar, and scenarios. It is not an unstructured spreadsheet and not an application. A host may use it for a plan, a budget, or any other tabular model. It does not require a parameters table, a reporting year, or a particular spoken language.

## Language

### Document

**Workbook**:
A named set of Tables, Sheets, a Calendar, and Scenarios that calculate together.
_Avoid_: Spreadsheet, workbook file, budget, account, financial statement, model (when you mean this document)

**Sheet**:
A named canvas that holds Tables stacked as bands. A Sheet is not a data container; values live in Tables. The Sheet name can qualify a Table in a Formula when names collide across Sheets.
_Avoid_: Group, tab, folder, unstructured grid

**Table**:
A named grid with row keys, attribute columns, and optional year-columns. Every calculated value lives in a Table. There is one Table type.
_Avoid_: Sheet, range, post list, dataset, table kind

**Calendar**:
The Workbook’s ordered monthly Periods, the shared time line year-columns join on.
_Avoid_: Timeline, date range, fiscal year

**Period**:
One month on the Calendar. The join key between year-column tables.
_Avoid_: Column letter, month index, timestamp

**Scenario**:
A named sparse overlay of Input values keyed by Table + row key + column or Period. Structure and Formulas are shared with Base. A Scenario cannot add rows or override Formulas.
_Avoid_: Case, version, copy, what-if sheet

**Base**:
The Workbook Inputs with no Scenario overlay applied.
_Avoid_: Default scenario, original, master

**Sample workbook**:
An English Workbook that shows Sheets, Tables, year-columns, Defined names, Formulas, and a Scenario. Names such as Parameters, Lines, Teams, and Result are examples of those features, not a required domain.
_Avoid_: Host seed, product template, required workbook, budget model, chart of accounts

### Tables

**Row key**:
The identity of a row in a Table (Karol, Mix). If the user has not named it, the row still has a stable id — not an Excel row number.
_Avoid_: Row number, A1 row

**Key cell**:
The leftmost cell of a data row, showing the Row key. Clicking it selects the row. Typing here renames the Row key in the cell — not Formula edit. The Growth-row key is a Growth header, not a Key cell.
_Avoid_: Index cell, row header (when you mean this)

**Header cell**:
The top cell of a data column, showing the column name. Clicking it selects the column. Typing here renames an Attribute column in the cell — not Formula edit. Year-column headers are Period labels. The Growth-column header is a Growth header.
_Avoid_: Column letter, A1 header

**Attribute column**:
A Table column that is not time (Value, Position, Comment).
_Avoid_: Metadata column, property (when you mean this)

**Year column**:
A Table column that is one calendar year of Periods. Storage is always months. Display Grain is month, quarter, or year.
_Avoid_: Time axis, table kind, date column, sheet months

**Grain**:
The display grouping of a Year column: month, quarter, or year. Storage is always months. Quarter and year views show a Grain total and write with Even-split.
_Avoid_: Workbook grain, table kind, zoom

**Key-value policy**:
A Table with one Value column whose row keys become Defined names. Not a second Table type. New names are new rows; there is no growth column.
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
The `+` affordance on the Growth-row key or Growth-column header. It is selectable; the Unused corner is not.
_Avoid_: Autofill handle, insert button

**Growth-cell**:
A 1×1 Selection on Growth — the Growth header or a data Growth cell. The Properties panel shows Growth cell (Value only). Typing still Auto-expands.
_Avoid_: Table inspector (when you mean Growth)

**Table corner**:
The top-left key×header intersection. Not a Cell. Selectable, not editable. A click selects the Table’s Key cells, Header cells, and data (not Growth); drag adjusts that Cell range. Without it, a Cell range cannot include keys and headers.
_Avoid_: Unused corner, corner cell (as a Cell)

**Unused corner**:
The bottom-right Growth unused corner. Not a Cell, not Growth, not selectable. Arrow navigation skips it.
_Avoid_: Table corner, empty cell (when you mean this)

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
A Cell whose Stored value the user typed. Scenarios may overlay Inputs. A typed number is stored as a number (comma or dot as decimal); other text stays text; `TRUE`/`FALSE` are booleans. An empty Input is Blank.
_Avoid_: Hardcoded, constant, data cell

**Formula**:
A Cell computed from a structured expression. Authoring is column-first: `Sheet.Table[Column][Row]`, `Table[Column][Row]`, `[Column][Row]`. `@` is this column or row; `@±n` is an offset. Omitting `[Row]` means this row. A1 is not the authoring language. The grid shows the Display value in blue unless Cell style sets a text color.
_Avoid_: A1 (`=B12`), `Sheet!A1`, `[column, row]`

**Overlay**:
One Scenario replacement for a single Input. Formulas are never overlaid. The grid shows an overlaid Input with a yellow fill unless Cell style sets a fill color.
_Avoid_: Patch, delta, what-if cell

**Error**:
A Formula whose evaluation failed. The grid shows the error token in red (`#DIV/0!`), never the Stored Formula. Number format is not applied. The Properties panel shows a short reason (`Divide by zero`, `Invalid name`, `Invalid cell reference`); for `#NAME?` and `#REF!` the reason names the Formula ref. An Error in any stored month makes that Grain total an Error.
_Avoid_: Invalid, NaN, crash (when you mean a Formula Error)

**Blank**:
A Cell with no Display value — empty Input, missing Cell, or empty Computed value. Ctrl+arrow treats Blank vs Filled as a Phase change. Distinct from Unused corner.
_Avoid_: Empty string (when you mean this), unused (that is Unused corner)

**Filled**:
A Cell with a Display value. Opposite of Blank for Arrow navigation and Ctrl+arrow.
_Avoid_: Occupied, non-empty (when you mean visible text)

**Cell style**:
Appearance stored on a Cell or column: bold, italic, strikethrough, text color, fill color, and font size. The Cell’s style wins over the column’s. Fill and text color replace the default Input / Formula / Overlay / Error colors. Distinct from Number format.
_Avoid_: Theme, conditional format, number format (when you mean appearance)

**Clear formatting**:
Removes Cell style from the Cell. Does not change Number format or Stored value.
_Avoid_: Clear (that clears Stored value), reset style

**Number format**:
How a numeric Display value is shown. The Cell’s pattern wins, then the column’s (**Column format**), then the default: three significant digits with grouping. Patterns include `G3`, `#,##G3`, `G3A` (auto K/M/B/T from 1,000), `G3K` / `G3M` / `G3B` / `G3T`, `0.00`, `0%`, and a prefix or quoted suffix (`PRE G3A`, `G3A" unit"`). It does not change Stored value or Computed value. Text and `TRUE`/`FALSE` are shown as-is.
_Avoid_: Cell style, rounding the stored value

**Column format**:
A Number format on an Attribute column or year-column Period, used when the Cell has none of its own.
_Avoid_: Table format, workbook format

**Loose cell**:
A typed value on a Sheet outside every Table. It is not a Formula and not a modeling surface.
_Avoid_: Free cell, unstructured table, scratch table (as a place to model)

### Evaluation

**Stored value**:
The Input or Formula text a Commit writes. Formula bar and Formula edit show this, not the Display value.
_Avoid_: Computed value, Display value, raw (as a user-facing name)

**Computed value**:
The result after evaluation. For an Input, the Stored value after Overlay. For a Formula, the evaluated result. Other Formulas use this value. Number format does not change it. After a Commit, a structure change, or a Scenario switch, Formulas are recalculated.
_Avoid_: Display value, cached value, engine result

**Display value**:
What the grid shows: the Computed value after Number format and Cell style. Blank when the Computed value is empty. Numbers align right; text aligns left.
_Avoid_: Formatted string (as identity), grid text (when you mean this)

**Even-split**:
Typing a number into a quarter or year Grain cell writes equal shares onto the stored months; the last month absorbs rounding. The same Formula is written to every month in that Grain cell. Changing Grain does not rewrite stored months.
_Avoid_: Distribute, allocate, average (when you mean this write)

**Grain total**:
The Display value of a quarter or year Grain cell: the sum of the stored monthly Computed values.
_Avoid_: Rollup, pivot, aggregate, bucket

### Formulas

**Defined name**:
A Workbook-wide name for one Cell. A key-value Table registers each row key as the name of that row’s Value cell (`Mix`, `AnnualUnits`, `Café`). Letters in any script, digits, and underscore; unique against other promoted keys, Table names, Sheet names, and reserved functions. New rows on a key-value Table get `Param`, `Param2`, … — not `1`, `2`, `3` (those are default Row keys on other Tables, and cannot be Defined names).
_Avoid_: Name-as-formula (`=@-1`), P table, ASCII-only names

**Formula ref**:
One complete structured-ref or Defined name token in Formula text (`Mix`, `[Jan][Red]`, `Lines[Jan][Red]`, `Mix:TopShare`). On the Edit cell’s Table the token is a Local Formula ref; on another Table it names that Table.
_Avoid_: A1 token, range address (as Excel `B12`)

**Local Formula ref**:
A Formula ref that omits the Table name because the Edit cell is on that Table (`[Jan][Red]`, `[Jan][@]`, `[@][Secondary]`, `[Value]`). A Defined name stays a Defined name (`Mix`).
_Avoid_: Unqualified ref, relative A1

**This-row**:
`@` in the row slot of a Formula ref (`[Jan][@]`). The target is the Edit cell’s row — the current line.
_Avoid_: Current line (say This-row), [@] as a Defined name

**This-column**:
`@` in the column slot of a Formula ref (`[@][Red]`, `[@-1][@]`). The target is the Edit cell’s column.
_Avoid_: Current column (say This-column)

**Relative**:
A Formula ref that uses This-row and/or This-column so the target moves with the Edit cell.
_Avoid_: Unlocked, floating ref

**Fixed**:
A Formula ref that names the column and/or row, with `$` when locked (`[$Jan][$Red]`). The target stays when the Formula is filled.
_Avoid_: Absolute (Excel A1 `$A$1`), locked name

**F4**:
Cycles the Active formula ref: Relative → Fixed both → Fixed row → Fixed column → Relative. Same order as Excel.
_Avoid_: Toggle lock, absolute shortcut

**Formula range**:
A Formula ref of two same-Table names joined by `:` (`Mix:TopShare`), produced in Point by click-drag or Shift+Arrow.
_Avoid_: Cell range (that is Selection), A1 range

### Editing

**Formula edit**:
The session while a Cell is being typed, shared by the in-cell editor and the Formula bar. Absent in Ready; otherwise Enter, Edit mode, or Point.
_Avoid_: OverlayNavMode, overlay (when you mean this session, not a Scenario Overlay)

**Ready**:
No Formula edit is open. Arrows move Selection. Typing starts Enter and replaces the Cell. F2, double-click, or Formula bar focus starts Edit mode.
_Avoid_: Idle, browse, navigation mode

**Enter**:
Formula edit started by typing, or by an operator typed while Pointing. A Literal: arrow or click Commits and moves Selection. A Formula (`=`): arrow or click starts Point.
_Avoid_: Typeover, replace mode (Excel’s name is Enter)

**Edit mode**:
Formula edit in which arrows move the Caret, started by F2, double-click, Formula bar, or a click that places the Caret in Formula text. A grid click Points only at an Insert point (otherwise it Commits and selects); F2 toggles Enter ↔ Edit mode.
_Avoid_: Edit (the verb), F2 mode, in-cell edit (when you mean the mode)

**Point**:
Formula-edit mode that inserts a Formula ref from a grid click or arrow; click-drag or Shift+Arrow writes a Formula range in the same Table. Pointing the Edit cell writes no Formula ref. An operator typed while Pointing returns to Enter; F2, or a click that places the Caret in Formula text (in-cell editor or Formula bar), returns to Edit mode without Cancel.
_Avoid_: Navigate (when you mean inserting a ref)

**Edit cell**:
The Cell whose Formula or Input is open.
_Avoid_: Active cell (when you mean this vs Selection), source cell

**Formula text**:
The draft string in Formula edit.
_Avoid_: Overlay value, input value (when you mean the draft)

**Inline**:
Formula-edit placement: Formula text is typed in the Edit cell, one line, same size and padding as the cell. Long text scrolls horizontally with the Caret; there is no scrollbar.
_Avoid_: In-cell edit (that phrase is for Edit mode), embedded editor, wrap

**Popup**:
Formula-edit placement: Formula text is typed in a floating box on the Edit cell. The box stays in the canvas (not Explorer or the Properties panel) and moves its anchor so it does not cover the Target cell.
_Avoid_: Overlay (when you mean this box, not a Scenario Overlay), dialog

**Invalid draft**:
A typed value that cannot Commit: an illegal identifier, a collision, a reserved function name, or an empty name. The field uses a light red fill while the draft is invalid and does not write. Distinct from a Formula Error (that is a stored Formula that failed to evaluate).
_Avoid_: Error (when you mean the draft), validation message box

**Active formula ref**:
The Formula ref under the caret or selection, or none when inserting a new one.
_Avoid_: Selection (the Properties panel object), highlighted ref

**Target cell**:
The Cell currently chosen for the Active formula ref. The next Point arrow walk starts here; if there is none, it starts at the Edit cell.
_Avoid_: Selection, pointed cell (use this name)

**Caret**:
The insertion position in Formula text. A click in Formula text (in-cell editor or Formula bar) places the Caret and is Edit mode, including after a Formula range from a mouse drag. In Edit mode arrows move it; in Enter and Point they do not.
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
In Ready, an arrow moves Selection to the next selectable Cell — Growth and the Table corner included, Unused corner skipped. Right/left wrap to the next/previous row, then the next/previous Table. Up/down stay on the same column index, then that index in the adjacent Table.
_Avoid_: Caret movement (that is Edit mode), Point (that inserts a ref)

**Ctrl+arrow**:
In Ready, jump to the next Phase change along that axis, always landing on the filled side. Left/right never wrap to another row. The Growth row is not a stop and not a Table change; the next up/down press after the last data cell enters the adjacent Table.
_Avoid_: End key, Ctrl+End

**Shift+arrow**:
In Ready, extend the Cell range by one cell along that axis, limited to this Table’s data cells. Growth is not included.
_Avoid_: Shift+Enter (that is Commit)

**Shift+Ctrl+arrow**:
In Ready, a Cell range extended by the same Phase-change jumps as Ctrl+arrow, limited to this Table’s data cells. Growth and other Tables are not included.
_Avoid_: Ctrl+Shift+End, current region

**Phase change**:
A switch between filled and blank Cells on an axis, or a Table boundary, used by Ctrl+arrow and Shift+Ctrl+arrow.
_Avoid_: Block, region, current region (Excel’s name)

### Shell

**Explorer**:
The left column: Sheets and the Tables on each Sheet. Clicking a Table name Reveals that Table. Creating a Table from New table switches to that Sheet and Reveals the Table.
_Avoid_: Folder tree, sheet tabs (when you mean this list)

**Explorer collapsed**:
Sheet metadata: when set, Explorer hides that Sheet’s table list until the Sheet is the one viewed on the canvas. Persisted on the Sheet in the Workbook snapshot.
_Avoid_: UI-only fold state, session-only collapse

**Reveal**:
Selecting a Table from Explorer and scrolling the viewport to that Table’s start. Distinct from keeping the moving Cell in view while Arrow navigation, Ctrl+arrow, Shift+arrow, or Shift+Ctrl+arrow extends a Cell range.
_Avoid_: Jump, scroll-into-view, follow selection

**Selection**:
The object the Properties panel edits: Workbook, Sheet, Table, column, row, Cell (optionally a Cell range), or Growth-cell. Clicking empty canvas selects the Sheet. Clicking a Key cell selects the row; a Header cell, the column. A 1×1 Table corner is not an object. A 1×1 data Growth cell is a Growth-cell. Selection never sits on an Unused corner. Arrow navigation, Ctrl+arrow, Shift+arrow, and Shift+Ctrl+arrow keep the moving Cell in view without Reveal.
_Avoid_: A1 range (when you mean this), focus (when you mean Selection)

**Cell range**:
A multi-cell Selection, built in Ready by click-drag, Shift+arrow, or Shift+Ctrl+arrow. Shared inspector fields show one value or Mixed. Typing or a Formula-bar Commit writes to every Cell in the range.
_Avoid_: Formula range (that is in Formula text), A1 range

**Mixed**:
Inspector display (`*`) when the Cells in a Cell range do not share a value. Focusing the field fills it from the first Cell; Commit still writes to all.
_Avoid_: Indeterminate, various, empty (when values differ)

**Properties panel**:
The always-mounted right column. A Formula bar plus one inspector per Selection kind. Hosts may add extra sections.
_Avoid_: Host KPIs, property grid (as Excel VBA)

**Formula bar**:
The Value field for the selected Cell’s Stored value (Input or Formula text). It stays mounted while Pointing so a Sheet switch does not cancel Formula edit. It shares Enter / Edit mode / Point with the in-cell editor. A click in it while Pointing is Edit mode, not Cancel. The grid still shows the Display value.
_Avoid_: Formula line, name box

**Horizontal scroll**:
Whether wide Tables on a Sheet scroll individually (default) or the whole Sheet scrolls together.
_Avoid_: Freeze panes, split view
