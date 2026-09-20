# Univer is UI and calc

SheetCanvas is one Univer workbook. Each kit Table is a Univer Table band on a Sheet. Formula pointing, defined names, and calculation all use Univer.

We compile authoring refs (column-first structured, named rows) to Univer table expressions and `INDEX/MATCH`, never to `B12` as the stored language. Insert/delete row/column goes through WorkbookSession, then we relayout bands — native sheet insert must not shift other tables.

HyperFormula and jspreadsheet-ce are removed. Hosts may skip SheetCanvas and read `WorkbookSession`.
