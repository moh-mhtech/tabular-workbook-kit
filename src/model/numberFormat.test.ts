import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { formatDisplayValue, rawEditValue, resolveCellFormat } from "./numberFormat.js";
import type { TableSnapshot } from "./types.js";

function present(canonical: string, grouping: boolean): string {
  const decimal = new Intl.NumberFormat(undefined).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  const group = new Intl.NumberFormat(undefined).formatToParts(1000).find((part) => part.type === "group")?.value ?? ",";
  const negative = canonical.startsWith("-");
  const abs = negative ? canonical.slice(1) : canonical;
  const [intPart, frac] = abs.split(".");
  const int = grouping ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group) : intPart;
  const body = frac !== undefined ? `${int}${decimal}${frac}` : int;
  return negative ? `-${body}` : body;
}

function table(partial: Partial<TableSnapshot> = {}): TableSnapshot {
  return {
    id: "tbl",
    name: "T",
    yearColumns: [],
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
    expect(formatDisplayValue(0.25)).toBe(present("0.25", true));
  });

  it("defaults numeric cells to three significant digits with grouping", () => {
    const cases: Array<[number, string]> = [
      [0.123, "0.123"],
      [0.1234, "0.123"],
      [1, "1"],
      [12.3, "12.3"],
      [12.34, "12.3"],
      [1.23, "1.23"],
      [1.2345, "1.23"],
      [12.345, "12.3"],
      [123.45, "123"],
      [1234.5, "1234"],
      [12345, "12345"],
    ];
    for (const [value, canonical] of cases) {
      expect(formatDisplayValue(value), String(value)).toBe(present(canonical, true));
    }
  });

  it("lets G3 combine with grouping and currency text", () => {
    expect(formatDisplayValue(1234.5, "G3")).toBe(present("1234", false));
    expect(formatDisplayValue(1234.5, "#,##G3")).toBe(present("1234", true));
    expect(formatDisplayValue(1234.5, 'G3" kr"')).toBe(`${present("1234", false)} kr`);
    expect(formatDisplayValue(1234.5, '#,##G3" kr"')).toBe(`${present("1234", true)} kr`);
    expect(formatDisplayValue(1234.5, "G3 dkk")).toBe(`${present("1234", false)} dkk`);
    expect(formatDisplayValue(8_000_000, "G3 dkk")).toBe(`${present("8000000", false)} dkk`);
    expect(formatDisplayValue(1234.5, "USD #,##G3")).toBe(`USD ${present("1234", true)}`);
    expect(formatDisplayValue(0.1234, "G3")).toBe(present("0.123", false));
    expect(formatDisplayValue(0.2534, "G3%")).toBe(`${present("25.3", false)}%`);
    expect(formatDisplayValue(1.23456, "G4")).toBe(present("1.235", false));
  });

  it("abbreviates thousands and above with K/M/B/T", () => {
    expect(formatDisplayValue(0.25, "G3A")).toBe(present("0.25", false));
    expect(formatDisplayValue(999, "A")).toBe(present("999", false));
    expect(formatDisplayValue(1000, "G3A")).toBe(`${present("1", false)}K`);
    expect(formatDisplayValue(45_000, "G3A")).toBe(`${present("45", false)}K`);
    expect(formatDisplayValue(667_000, "G3A")).toBe(`${present("667", false)}K`);
    expect(formatDisplayValue(8_000_000, "G3A")).toBe(`${present("8", false)}M`);
    expect(formatDisplayValue(8_234_567, "G3A")).toBe(`${present("8.23", false)}M`);
    expect(formatDisplayValue(1_500_000_000, "G3A")).toBe(`${present("1.5", false)}B`);
    expect(formatDisplayValue(2.3e12, "G3A")).toBe(`${present("2.3", false)}T`);
    expect(formatDisplayValue(-8_000_000, "G3A")).toBe(`-${present("8", false)}M`);
    expect(formatDisplayValue(999_500, "G3A")).toBe(`${present("1", false)}M`);
    expect(formatDisplayValue(8_000_000, "USD G3A")).toBe(`USD ${present("8", false)}M`);
    expect(formatDisplayValue(8_000_000, 'G3A" kr"')).toBe(`${present("8", false)}M kr`);
  });

  it("uses a fixed K/M/B/T scale when the mask asks for one", () => {
    expect(formatDisplayValue(8_000_000, "G3K")).toBe(`${present("8000", false)}K`);
    expect(formatDisplayValue(8_000_000, "#,##G3K")).toBe(`${present("8000", true)}K`);
    expect(formatDisplayValue(8_000_000, "G3M")).toBe(`${present("8", false)}M`);
    expect(formatDisplayValue(45_000, "G3M")).toBe(`${present("0.045", false)}M`);
    expect(formatDisplayValue(25, "G3K")).toBe(`${present("0.025", false)}K`);
    expect(formatDisplayValue(1_500_000_000, "G3B")).toBe(`${present("1.5", false)}B`);
    expect(formatDisplayValue(2.3e12, "G3T")).toBe(`${present("2.3", false)}T`);
    expect(formatDisplayValue(8_000_000, "USD G3M")).toBe(`USD ${present("8", false)}M`);
    expect(formatDisplayValue(0, "G3K")).toBe(`${present("0", false)}K`);
    expect(formatDisplayValue(8_000_000, "K")).toBe(`${present("8000", false)}K`);
  });

  it("keeps compact format display-only so edits and formulas see the original number", () => {
    const session = new WorkbookSession(createSampleWorkbook(), { evaluate: () => ({}) });
    session.setCellFormat("tbl-params", "row-annual", "Value", "USD G3A");
    const table = session.getSnapshot().tables.find((candidate) => candidate.id === "tbl-params")!;
    const row = table.rows.find((candidate) => candidate.id === "row-annual")!;
    const source = row.cells.Value;
    const pattern = resolveCellFormat(table, "Value", source);
    expect(pattern).toBe("USD G3A");
    expect(source.value).toBe(8_000_000);
    expect(rawEditValue(source.value ?? null)).toBe("8000000");
    expect(formatDisplayValue(source.value ?? null, pattern)).toBe(`USD ${present("8", false)}M`);
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
    const session = new WorkbookSession(createSampleWorkbook(), { evaluate: () => ({}) });
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
