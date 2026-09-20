# Properties inspectors, one module per selection kind

The right column is an always-mounted Properties panel. Selection is a discriminated union (workbook, sheet, table, column, row, cell). Each kind has its own inspector file. A sticky formula field at the top of the panel stays mounted during formula pointing (sheet switches must not unmount it).

Hosts may pass extra sections (`hostInspectors`) without forking kit inspectors. Host KPI panels are not the kit pattern.
