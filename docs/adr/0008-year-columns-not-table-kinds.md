# Year columns, not table kinds

There is one Table type. Time is a **year-column** on that table, not a second or third grid kind. Parameters is a **key-value policy** (`promoteRowKeys` + a single Value column): it hides the growth column so new parameters are added as rows, and it cannot grow a year-column.

Grain is per year-column (`month` / `quarter` / `year`). Storage stays months. Quarter and year views even-split number edits onto the stored months (the last month absorbs rounding) and write the same formula to every month in the bucket. The calendar is the workbook timeline; adding a year not on the calendar extends it, removing a year-column does not shrink it.

Rejected: a `TableKind` enum, a global workbook grain that only affected `getTable`, and keeping `timeAxis: boolean`.
