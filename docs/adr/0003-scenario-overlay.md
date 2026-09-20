# Scenarios overlay Inputs, they do not copy the Workbook

A Scenario is a sparse map of Input overrides keyed by Table + row key + column/Period. Switching scenario merges onto Base and recalculates. We do not fork workbooks (diverging structure) and v1 cannot add rows per scenario. EasyPartz scenarios were switch cells (sales total, machine type, hire yes/no); extra rows belong in Base with flags/amounts overlaid. Formulas stay shared so staff and cash still fan out from those Inputs.
