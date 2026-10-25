# Tables are the only modeling surface

We rejected unstructured Excel sheets. A Workbook is a set of named Tables (optional year-columns, attribute columns, row keys). EasyPartz “sheets” were already stacked mini-tables with mixed schemas; giving each table identity (`Lines[Jan][Red]`) is what hosts need, and another list is a new Table. Unstructured cells and A1 identity would recreate the current Excel pain.

Sheets (ADR 0004) are canvases that hold table bands. They are not a second place to put values.
