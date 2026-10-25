import { describe, expect, it } from "vitest";
import { formatValue } from "../model/calendar.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import { WorkbookSession } from "../session/WorkbookSession.js";

async function open() {
  const session = new WorkbookSession(createSampleWorkbook(), new HyperFormulaEngine());
  await session.recalculate();
  return session;
}

function num(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`expected finite number, got ${String(value)}`);
  }
  return value;
}

describe("headless engine", () => {
  it("evaluates IFS, growth, and cross-table refs", async () => {
    const session = await open();
    const params = session.getTable("Params");
    const aarsalg = params.rows.find((r) => r.key === "AnnualSales")!.cells.Value.computed;
    expect(aarsalg).toBe(8_000_000);

    const salg = session.getTable("Sales");
    const janTotal = num(salg.rows.find((r) => r.key === "Total")!.cells["2025-01"].computed);
    const decTotal = num(salg.rows.find((r) => r.key === "Total")!.cells["2025-12"].computed);
    expect(formatValue(janTotal)).toMatch(/563/);
    expect(janTotal).toBeGreaterThan(500_000);
    expect(decTotal).toBeGreaterThan(janTotal);

    const staff = session.getTable("Staff");
    expect(staff.rows.find((r) => r.key === "Karol")!.cells["2025-01"].computed).toBe(45000);
    const fte = staff.rows.find((r) => r.key === "RequiredFTE")!.cells["2025-01"].computed;
    expect(fte === 1 || fte === 2).toBe(true);

    const resultat = session.getTable("Result");
    const oms = num(resultat.rows.find((r) => r.key === "Revenue")!.cells["2025-01"].computed);
    expect(oms).toBeCloseTo(janTotal, 4);
  }, 60_000);
});

describe("scenarios", () => {
  it("overlays inputs only and does not rewrite formulas", async () => {
    const snapshot = createSampleWorkbook();
    const baseFormula = snapshot.tables
      .find((t) => t.name === "Sales")!
      .rows.find((r) => r.key === "CNC")!.cells["2025-01"].formula;
    const session = new WorkbookSession(snapshot, new HyperFormulaEngine());
    await session.recalculate();

    const baseJan = num(session.getTable("Sales").rows.find((r) => r.key === "Total")!.cells["2025-01"].computed);
    session.activateScenario("scn-growth");
    await session.recalculate();
    expect(session.getCell("Params", "AnnualSales", "Value").overlay).toBe(true);
    expect(session.getCell("Params", "AnnualSales", "Value").computed).toBe(10_000_000);

    const after = session.toSnapshot();
    const still = after.tables.find((t) => t.name === "Sales")!.rows.find((r) => r.key === "CNC")!.cells["2025-01"].formula;
    expect(still).toBe(baseFormula);

    const vaekstJan = num(session.getTable("Sales").rows.find((r) => r.key === "Total")!.cells["2025-01"].computed);
    expect(vaekstJan).toBeGreaterThan(baseJan);
    expect(vaekstJan / baseJan).toBeCloseTo(10 / 8, 5);
  }, 60_000);
});

describe("time grain views", () => {
  it("aggregates months into quarters and year without changing storage", async () => {
    const session = await open();
    const month = session.getTable("Sales", { timeGrain: "month" });
    const quarter = session.getTable("Sales", { timeGrain: "quarter" });
    const year = session.getTable("Sales", { timeGrain: "year" });

    const jan = num(month.rows.find((r) => r.key === "Total")!.cells["2025-01"].computed);
    const feb = num(month.rows.find((r) => r.key === "Total")!.cells["2025-02"].computed);
    const mar = num(month.rows.find((r) => r.key === "Total")!.cells["2025-03"].computed);
    expect(num(quarter.rows.find((r) => r.key === "Total")!.cells["2025-Q1"].computed)).toBeCloseTo(
      jan + feb + mar,
      4,
    );

    const yearSum = month.rows.find((r) => r.key === "Total")!.cells;
    const storedYear = Object.entries(yearSum)
      .filter(([id]) => id.startsWith("2025-"))
      .reduce((acc, [, cell]) => acc + num(cell.computed), 0);
    expect(num(year.rows.find((r) => r.key === "Total")!.cells["2025"].computed)).toBeCloseTo(storedYear, 4);
  }, 60_000);
});
