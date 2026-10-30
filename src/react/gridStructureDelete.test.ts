import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { layoutWorkbook } from "../model/layout.js";
import { cellsInProjectedRange, projectTable } from "../grid/sheetProjection.js";
import { HEADER_ROW_ID, KEY_COLUMN_ID, type Selection } from "../model/types.js";
import { TOTAL_ROW_ID } from "../model/tableTotals.js";
import { structureDeleteCommands, structureDeleteCommandsForTableRange } from "./gridStructureDelete.js";

const snapshot = createSampleWorkbook();
const layout = layoutWorkbook(snapshot);

describe("structureDeleteCommands", () => {
  it("offers Delete row for a single row selection", () => {
    const selection: Selection = { kind: "row", tableId: "tbl-params", rowId: "row-vat" };
    expect(structureDeleteCommands(snapshot, selection)).toEqual({
      rows: { tableId: "tbl-params", rowIds: ["row-vat"], label: "Delete row" },
      columns: null,
    });
  });

  it("offers Delete rows for a multi-key cell range", () => {
    const selection: Selection = {
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-vat",
      columnId: KEY_COLUMN_ID,
      range: [
        { tableId: "tbl-params", rowId: "row-vat", columnId: KEY_COLUMN_ID },
        { tableId: "tbl-params", rowId: "row-top-share", columnId: KEY_COLUMN_ID },
      ],
    };
    const cmds = structureDeleteCommands(snapshot, selection);
    expect(cmds.rows?.label).toBe("Delete rows");
    expect(cmds.rows?.rowIds.sort()).toEqual(["row-top-share", "row-vat"].sort());
    expect(cmds.columns).toBeNull();
  });

  it("offers Delete row for Key cells in a range that also includes data cells", () => {
    const selection: Selection = {
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-vat",
      columnId: KEY_COLUMN_ID,
      range: [
        { tableId: "tbl-params", rowId: "row-vat", columnId: KEY_COLUMN_ID },
        { tableId: "tbl-params", rowId: "row-vat", columnId: "Value" },
      ],
    };
    const cmds = structureDeleteCommands(snapshot, selection);
    expect(cmds.rows?.label).toBe("Delete row");
    expect(cmds.rows?.rowIds).toEqual(["row-vat"]);
    expect(cmds.columns).toBeNull();
  });

  it("offers row and column delete from a corner-style range (keys, headers, and data)", () => {
    const selection: Selection = {
      kind: "cell",
      tableId: "tbl-teams",
      rowId: "row-karol",
      columnId: "Role",
      range: [
        { tableId: "tbl-teams", rowId: HEADER_ROW_ID, columnId: "Role" },
        { tableId: "tbl-teams", rowId: HEADER_ROW_ID, columnId: "BaseNumber" },
        { tableId: "tbl-teams", rowId: "row-karol", columnId: KEY_COLUMN_ID },
        { tableId: "tbl-teams", rowId: "row-required", columnId: KEY_COLUMN_ID },
        { tableId: "tbl-teams", rowId: "row-karol", columnId: "Role" },
        { tableId: "tbl-teams", rowId: "row-karol", columnId: "BaseNumber" },
      ],
    };
    const cmds = structureDeleteCommands(snapshot, selection);
    expect(cmds.rows).toBeNull();
    expect(cmds.columns?.label).toBe("Delete columns");
    expect(cmds.columns?.columnIds.sort()).toEqual(["BaseNumber", "Role"].sort());
  });

  it("ignores the Key column header in a corner-style range", () => {
    const selection: Selection = {
      kind: "cell",
      tableId: "tbl-teams",
      rowId: HEADER_ROW_ID,
      columnId: KEY_COLUMN_ID,
      range: [
        { tableId: "tbl-teams", rowId: HEADER_ROW_ID, columnId: KEY_COLUMN_ID },
        { tableId: "tbl-teams", rowId: HEADER_ROW_ID, columnId: "Role" },
        { tableId: "tbl-teams", rowId: "row-karol", columnId: KEY_COLUMN_ID },
      ],
    };
    const cmds = structureDeleteCommands(snapshot, selection);
    expect(cmds.rows?.rowIds).toEqual(["row-karol"]);
    expect(cmds.columns?.columnIds).toEqual(["Role"]);
  });

  it("offers Delete columns for a multi-header range on Teams", () => {
    const selection: Selection = {
      kind: "cell",
      tableId: "tbl-teams",
      rowId: HEADER_ROW_ID,
      columnId: "Role",
      range: [
        { tableId: "tbl-teams", rowId: HEADER_ROW_ID, columnId: "Role" },
        { tableId: "tbl-teams", rowId: HEADER_ROW_ID, columnId: "BaseNumber" },
      ],
    };
    const cmds = structureDeleteCommands(snapshot, selection);
    expect(cmds.columns?.label).toBe("Delete columns");
    expect(cmds.columns?.columnIds.sort()).toEqual(["BaseNumber", "Role"].sort());
    expect(cmds.rows).toBeNull();
  });

  it("offers no column delete for Params Value column selection", () => {
    const selection: Selection = { kind: "column", tableId: "tbl-params", columnId: "Value" };
    expect(structureDeleteCommands(snapshot, selection).columns).toBeNull();
  });

  it("offers no row delete for the total row", () => {
    const selection: Selection = { kind: "row", tableId: "tbl-lines", rowId: TOTAL_ROW_ID };
    expect(structureDeleteCommands(snapshot, selection).rows).toBeNull();
  });

  describe("Table corner range", () => {
    it("offers no row delete on a full Params table (every row would be removed)", () => {
      const projection = projectTable(layout, "tbl-params")!;
      const cmds = structureDeleteCommandsForTableRange(snapshot, projection, layout);
      expect(cmds.rows).toBeNull();
      expect(cmds.columns).toBeNull();
    });

    it("offers column delete but no row delete on a full Teams table", () => {
      const projection = projectTable(layout, "tbl-teams")!;
      const cmds = structureDeleteCommandsForTableRange(snapshot, projection, layout);
      expect(cmds.rows).toBeNull();
      expect(cmds.columns?.columnIds.sort()).toEqual(["BaseNumber", "Role"].sort());
    });

    it("offers no delete rows on a full Lines table", () => {
      const projection = projectTable(layout, "tbl-lines")!;
      const cmds = structureDeleteCommandsForTableRange(snapshot, projection, layout);
      expect(cmds.rows).toBeNull();
      expect(cmds.columns).toBeNull();
    });

    it("offers Delete row for a corner drag through [B][1] on Teams (one Key cell in range)", () => {
      const projection = projectTable(layout, "tbl-teams")!;
      const refs = cellsInProjectedRange(projection, layout, { x: 0, y: 0, width: 2, height: 2 });
      const primary = refs.find((ref) => ref.columnId !== KEY_COLUMN_ID && ref.rowId !== HEADER_ROW_ID)!;
      const cmds = structureDeleteCommands(snapshot, { kind: "cell", ...primary, range: refs });
      expect(cmds.rows?.label).toBe("Delete row");
      expect(cmds.rows?.rowIds).toEqual(["row-karol"]);
      expect(cmds.columns?.label).toBe("Delete column");
      expect(cmds.columns?.columnIds).toEqual(["Role"]);
    });
  });
});
