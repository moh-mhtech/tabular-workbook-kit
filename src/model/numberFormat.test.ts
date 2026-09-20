import { describe, expect, it } from "vitest";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { formatDisplayValue, rawEditValue, resolveCellFormat } from "./numberFormat.js";
import type { TableSnapshot } from "./types.js";

function table(partial: Partial<TableSnapshot> = {}): TableSnapshot {
  return {
    id: "tbl",
    name: "T",
    timeAxis: false,
    attributeColumns: [{ id: "Value", name: "Value" }],
    rows: [],
    ...partial,
  };
}

describe("resolveCellFormat", () => {
  it("prefers cell, then column, then table columnFormats", () => {
    const withCol = table({ attributeColumns: [{ id: "Value", name: "Value", format: "0.00" }] });
    expect(resolveCellFormat(withCol, "Value")).toBe("0.00");
    expect(resolveCellFormat(withCol, "Value", { format: "0%" })).toBe("0%");
    expect(resolveCellFormat(table({ columnFormats: { "2025-01": "#,##0" } }), "2025-01")).toBe("#,##0");
    expect(resolveCellFormat(table(), "Value")).toBeUndefined();
  });
});

describe("formatDisplayValue", () => {
  it("keeps raw editor text unformatted", () => {
    expect(rawEditValue(0.25)).toBe("0.25");
    expect(rawEditValue(8_000_000)).toBe("8000000");
    expect(rawEditValue(null)).toBe("");
  });

  it("uses a default number when no pattern is set", () => {
    expect(formatDisplayValue(null)).toBe("");
    expect(formatDisplayValue(true)).toBe("TRUE");
    expect(formatDisplayValue(0.25)).toBe(
      new Intl.NumberFormat(undefined, { maximumFractionDigits: 10 }).format(0.25),
    );
  });

  it("applies Excel number patterns used in the properties panel", () => {
    expect(formatDisplayValue(1, "0.00")).toBe(
      new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1),
    );
    expect(formatDisplayValue(8_000_000, "#,##0.00")).toBe(
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      }).format(8_000_000),
    );
    expect(formatDisplayValue(0.25, "0%")).toBe(
      `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(25)}%`,
    );
    expect(formatDisplayValue(0.25, "0.00%")).toBe(
      `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(25)}%`,
    );
  });

  it("formats a custom-grid cell after setCellFormat", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), { evaluate: () => ({}) });
    session.setCellFormat("tbl-params", "row-vat", "Value", "0%");
    const table = session.getSnapshot().tables.find((candidate) => candidate.id === "tbl-params")!;
    const row = table.rows.find((candidate) => candidate.id === "row-vat")!;
    const pattern = resolveCellFormat(table, "Value", row.cells.Value);
    expect(pattern).toBe("0%");
    expect(formatDisplayValue(0.25, pattern)).toBe(
      `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(25)}%`,
    );
    expect(rawEditValue(0.25)).toBe("0.25");
  });

  it("uses the negative and zero sections when present", () => {
    expect(formatDisplayValue(-1.2, "0.0;(0.0);zero")).toBe(
      `(${new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(1.2)})`,
    );
    expect(formatDisplayValue(0, "0.0;(0.0);zero")).toBe("zero");
  });
});
