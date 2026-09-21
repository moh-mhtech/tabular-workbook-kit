# Column-first structured refs; named rows compile to INDEX/MATCH

Authoring is `Sheet.Table[Column][Row]`, `Table[Column][Row]`, `[Column][Row]`. One slot is always a column; the second is a row. `@` / `@±n` is current/offset on that axis. Omitting `[Row]` means this row.

Excel tables are named-column. This-row column refs compile to `[@Col]` for engines that understand structured tables; HyperFormula receives compiled ranges (ADR 0010). A named row is not Excel, so `Salg[Jan][CNC]` compiles to a cell or `INDEX/MATCH` range. F2 still shows the structured form, never A1 and never INDEX/MATCH.

Do not use `[column, row]` tuples (collides with Excel specifier lists).
