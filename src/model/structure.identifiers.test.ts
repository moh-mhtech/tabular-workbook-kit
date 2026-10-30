import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import {
  allocateColumnNameAt,
  allocateRowKeyAt,
  defaultColumnNameAt,
  defaultRowKeyAt,
} from "./structure.js";
import type { TableSnapshot } from "./types.js";

function table(partial: Partial<TableSnapshot> & Pick<TableSnapshot, "rows" | "attributeColumns">): TableSnapshot {
  return {
    id: "tbl-test",
    name: "Test",
    yearColumns: [],
    promoteRowKeys: partial.promoteRowKeys,
    ...partial,
  } as TableSnapshot;
}

describe("default row and column identifiers", () => {
  it("uses the row index for default keys, not the first free number", () => {
    const snapshot = createSampleWorkbook();
    const notes = table({
      promoteRowKeys: false,
      attributeColumns: [{ id: "col-a", name: "A" }],
      rows: [
        { id: "r1", key: "1", cells: {} },
        { id: "r2", key: "3", cells: {} },
      ],
    });
    expect(defaultRowKeyAt(notes, 2)).toBe("3");
    expect(allocateRowKeyAt(notes, snapshot, 2)).toBe("32");
  });

  it("uses the column index for default names, not the first free letter", () => {
    const snapshot = createSampleWorkbook();
    const notes = table({
      attributeColumns: [
        { id: "c1", name: "A" },
        { id: "c2", name: "C" },
      ],
      rows: [{ id: "r1", key: "1", cells: {} }],
    });
    expect(defaultColumnNameAt(1)).toBe("B");
    expect(allocateColumnNameAt(notes, 1)).toBe("B");
    expect(allocateColumnNameAt(notes, 2)).toBe("C2");
  });

  it("appends digits until a promotable row key is unique in the workbook", () => {
    const snapshot = createSampleWorkbook();
    const params = snapshot.tables.find((t) => t.id === "tbl-params")!;
    expect(allocateRowKeyAt(params, snapshot, 7)).toBe("Param8");
    params.rows.splice(7, 0, { id: "row-block", key: "Param8", cells: {} });
    expect(allocateRowKeyAt(params, snapshot, 7)).toBe("Param82");
  });

  it("keeps the current row when uniquifying a default key on rename", () => {
    const snapshot = createSampleWorkbook();
    const notes = table({
      attributeColumns: [{ id: "col-a", name: "A" }],
      rows: [
        { id: "r1", key: "1", cells: {} },
        { id: "r2", key: "2", cells: {} },
      ],
    });
    expect(allocateRowKeyAt(notes, snapshot, 0, "r1")).toBe("1");
    expect(allocateRowKeyAt(notes, snapshot, 1, "r2")).toBe("2");
  });
});
