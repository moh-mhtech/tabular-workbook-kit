import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { overlayKey, type WorkbookSnapshot } from "../model/types.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { HyperFormulaEngine } from "./hyperformula.js";

describe("HyperFormulaEngine", () => {
  it("evaluates range-compiled formulas, promoted names, and non-ASCII identifiers", () => {
    const snapshot = createContractSnapshot();
    const values = new HyperFormulaEngine().evaluate(snapshot);

    expect(cell(values, snapshot, "Params", "Start", "Value")).toBeCloseTo(563_696.68, 1);
    expect(cell(values, snapshot, "Params", "NamedVat", "Value")).toBe(0.5);
    expect(cell(values, snapshot, "Salg", "Total", "2025-01")).toBeCloseTo(
      cell(values, snapshot, "Params", "Start", "Value") as number,
      6,
    );
    expect(cell(values, snapshot, "Staff", "RequiredFTE", "2025-01")).toBe(1);
    expect(cell(values, snapshot, "Resultat", "Resultat", "2025-01")).toBeCloseTo(518_696.68, 1);
    expect(cell(values, snapshot, "Resultat", "Opslag", "2025-01")).toBe(0.25);
    expect(cell(values, snapshot, "Resultat", "Navngivet Å", "2025-01")).toBe(8);
    expect(cell(values, snapshot, "Resultat", "Fejl Ø", "2025-01")).toBe("#DIV/0!");
    expect(Object.keys(values)).toContain("Résultat Ø");
  });

  it("uses active-scenario values without mutating the snapshot", () => {
    const snapshot = createContractSnapshot();
    snapshot.activeScenarioId = "scn-vaekst";

    const values = new HyperFormulaEngine({ licenseKey: "gpl-v3" }).evaluate(snapshot);

    expect(cell(values, snapshot, "Params", "Årssalg", "Value")).toBe(10_000_000);
    expect(cell(values, snapshot, "Params", "Start", "Value")).toBeCloseTo(704_620.85, 1);
    expect(snapshot.tables[0].rows[0].cells.Value.value).toBe(8_000_000);
    expect(snapshot.scenarios[0].overlays[overlayKey("tbl-params", "row-aarsalg", "Value")]).toBe(10_000_000);
  });

  it("returns a full primitive grid for every domain sheet", () => {
    const snapshot = createContractSnapshot();
    const layout = layoutWorkbook(snapshot);
    const values = new HyperFormulaEngine().evaluate(snapshot);

    for (const sheet of layout.sheets) {
      expect(values[sheet.sheetName]).toHaveLength(sheet.rowCount);
      expect(values[sheet.sheetName].every((row) => row.length === sheet.colCount)).toBe(true);
      expect(
        values[sheet.sheetName].flat().every(
          (value) =>
            value === null ||
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean",
        ),
      ).toBe(true);
    }
  });
});

function createContractSnapshot(): WorkbookSnapshot {
  const snapshot = createPlaygroundWorkbook();
  snapshot.sheets.find((sheet) => sheet.id === "sheet-res")!.name = "Résultat Ø";
  snapshot.tables.find((table) => table.name === "Params")!.rows.push({
    id: "row-named-vat",
    key: "NamedVat",
    cells: { Value: { kind: "formula", formula: "=Vat*2" } },
  });
  snapshot.tables.find((table) => table.name === "Resultat")!.rows.push({
    id: "row-lookup",
    key: "Opslag",
    cells: Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => {
        const period = `2025-${String(index + 1).padStart(2, "0")}`;
        return [
          period,
          {
            kind: "formula",
            formula: '=INDEX(Params[Value],MATCH("Vat",Params[key],0))',
          },
        ];
      }),
    ),
  });
  snapshot.tables.find((table) => table.name === "Resultat")!.rows.push({
    id: "row-non-ascii-name",
    key: "Navngivet Å",
    cells: Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => {
        const period = `2025-${String(index + 1).padStart(2, "0")}`;
        return [period, { kind: "formula", formula: "=Årssalg/1000000" }];
      }),
    ),
  });
  snapshot.tables.find((table) => table.name === "Resultat")!.rows.push({
    id: "row-error",
    key: "Fejl Ø",
    cells: Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => {
        const period = `2025-${String(index + 1).padStart(2, "0")}`;
        return [period, { kind: "formula", formula: "=1/0" }];
      }),
    ),
  });
  return snapshot;
}

function cell(
  values: Record<string, (string | number | boolean | null)[][]>,
  snapshot: WorkbookSnapshot,
  tableName: string,
  rowKey: string,
  columnId: string,
) {
  const layout = layoutWorkbook(snapshot);
  const table = layout.tablesByName.get(tableName.toLowerCase())!;
  const row = table.keyByLower.get(rowKey.toLowerCase())!;
  const col = table.columns.find((candidate) => candidate.id === columnId)!;
  return values[table.sheetName][row.rowIndex][col.colIndex];
}
