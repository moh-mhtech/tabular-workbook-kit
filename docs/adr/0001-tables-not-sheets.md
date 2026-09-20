# Tables are the only modeling surface

We rejected unstructured Excel sheets. A Workbook is a set of named Tables (optional time axis, attribute columns, row keys). EasyPartz “sheets” were already stacked mini-tables with mixed schemas; giving each table identity (`Salg[Jan][CNC]`) is what hosts need, and “new sheet for staff from sales” is a new Table. Unstructured cells and A1 identity would recreate the current Excel pain.

Sheets (ADR 0004) are canvases that hold table bands. They are not a second place to put values.
