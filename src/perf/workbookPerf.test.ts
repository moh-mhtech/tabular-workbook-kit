import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { evaluatedCells, evaluatedCellsForTable } from "../react/CustomSheetCanvas.js";
import { WorkbookSession } from "../session/WorkbookSession.js";

const here = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(here, "..", "..", "perf", "baseline.json");

type Baseline = {
  sample: Record<string, number>;
  budget?: Record<string, number>;
};

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline;
}

function medianMs(run: () => void | Promise<void>, iterations: number): number {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = run();
    if (result instanceof Promise) throw new Error("Use medianMsAsync for async probes");
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

async function medianMsAsync(run: () => Promise<void>, iterations: number): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

function assertWithinBudget(label: string, ms: number, budgetMs: number) {
  expect(ms, `${label} took ${ms.toFixed(1)}ms (budget ${budgetMs}ms)`).toBeLessThan(budgetMs);
}

describe("workbook performance probes", () => {
  it("sample workbook stays within baseline budgets", async () => {
    const baseline = readBaseline().sample;
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();

    const getSnapshotMs = medianMs(() => session.getSnapshot(), 30);
    assertWithinBudget("getSnapshot", getSnapshotMs, baseline.getSnapshotMs);

    const recalcMs = await medianMsAsync(async () => {
      session.drainPerfSpans();
      await session.recalculate();
    }, 5);
    assertWithinBudget("recalculate", recalcMs, baseline.recalculateMs);

    const snapshot = session.getSnapshot();
    const allTablesMs = medianMs(() => evaluatedCells(session, snapshot), 10);
    assertWithinBudget("evaluatedCellsAll", allTablesMs, baseline.evaluatedCellsAllMs);

    const singleTableMs = medianMs(() => evaluatedCellsForTable(session, "tbl-lines", "Lines"), 20);
    assertWithinBudget("evaluatedCellsOneTable", singleTableMs, baseline.evaluatedCellsOneTableMs);
  });

  it("single cell commit recalc stays within budget", async () => {
    const baseline = readBaseline().sample;
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    const table = session.getSnapshot().tables.find((t) => t.name === "Params")!;
    const row = table.rows.find((r) => r.key === "AnnualUnits")!;

    const commitMs = await medianMsAsync(async () => {
      session.drainPerfSpans();
      session.writeCell("Params", row.key, "Value", "9000000");
      await session.recalculate();
    }, 3);
    assertWithinBudget("cellCommitRecalc", commitMs, baseline.cellCommitRecalcMs);
  });
});
