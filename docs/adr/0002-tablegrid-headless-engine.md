# Univer is UI and calc

Status: superseded by [0010](./0010-custom-canvas-hyperformula.md). Univer is removed from the kit. Structured refs are still compiled and never stored as A1.

We compile authoring refs (column-first structured, named rows) to engine ranges, never to `B12` as the stored language. Insert/delete row/column goes through the session, then we relayout bands.

jspreadsheet-ce is removed. Hosts may skip the canvas and read calculated values from the session.
