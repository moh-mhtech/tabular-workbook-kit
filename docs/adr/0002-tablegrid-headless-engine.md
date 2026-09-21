# Univer is UI and calc

Status: superseded by [0010](./0010-custom-canvas-hyperformula.md) for the Playground host. The kit still compiles structured refs and never stores A1.

SheetCanvas is one Univer workbook. Each kit Table is a Univer Table band on a Sheet. Formula pointing, defined names, and calculation all use Univer.

We compile authoring refs (column-first structured, named rows) to engine table expressions and `INDEX/MATCH`, never to `B12` as the stored language. Insert/delete row/column goes through the session, then we relayout bands — native sheet insert must not shift other tables.

jspreadsheet-ce is removed. Hosts may skip the canvas and read calculated values from the session. HyperFormula is not removed; see ADR 0010.

