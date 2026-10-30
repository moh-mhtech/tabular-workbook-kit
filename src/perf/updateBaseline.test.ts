import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBudgetPerfWorkbook } from "../../sample/loadBudgetPerfFixture.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { evaluatedCells, evaluatedCellsForTable } from "../react/CustomSheetCanvas.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { buildPeriods } from "../model/calendar.js";
import { baselineJsonPath, readBaselineFile } from "./readBaseline.js";
import { medianMs, medianMsAsync, waitForDataNotification } from "./perfMeasure.js";

const update = process.env.PERF_UPDATE_BASELINE === "1";

/** Room for CI / full-suite noise; strict mode uses raw medians via PERF_STRICT on probes. */
function ceilingFromMedian(ms: number, factor = 2): number {
  return Math.max(1, Math.ceil(ms * factor));
}

describe.skipIf(!update)("perf baseline update (PERF_UPDATE_BASELINE=1)", () => {
  it("writes perf/baseline.json from current medians", async () => {
    const existing = readBaselineFile();

    const sampleSession = new WorkbookSession(createSampleWorkbook());
    await sampleSession.recalculate();
    const sample = {
      getSnapshotMs: ceilingFromMedian(medianMs(() => sampleSession.getSnapshot(), 30)),
      recalculateMs: ceilingFromMedian(
        await medianMsAsync(async () => {
          sampleSession.drainPerfSpans();
          await sampleSession.recalculate();
        }, 5),
      ),
      evaluatedCellsAllMs: ceilingFromMedian(
        medianMs(() => evaluatedCells(sampleSession, sampleSession.getSnapshot()), 10),
      ),
      evaluatedCellsOneTableMs: ceilingFromMedian(
        medianMs(() => evaluatedCellsForTable(sampleSession, "tbl-lines", "Lines"), 20),
      ),
      cellCommitRecalcMs: ceilingFromMedian(
        await medianMsAsync(async () => {
          sampleSession.drainPerfSpans();
          const wait = waitForDataNotification(sampleSession);
          sampleSession.writeCell("Params", "AnnualUnits", "Value", "9000000");
          await wait;
        }, 3),
      ),
    };

    const budgetSession = new WorkbookSession(loadBudgetPerfWorkbook());
    await budgetSession.recalculate();
    const budgetSnap = budgetSession.getSnapshot();
    const omsTable = budgetSnap.tables.find((t) => t.name === "Omsætning")!;
    const sheet = budgetSnap.sheets.find((s) => s.tableIds.includes(omsTable.id))!;
    const tableCountOnSheet = sheet.tableIds.length;
    const row = omsTable.rows[0]!;
    const periodId = buildPeriods(budgetSnap.calendar)[0]!.id;

    await medianMsAsync(async () => {
      const wait = waitForDataNotification(budgetSession);
      budgetSession.writeCell("Omsætning", row.key, periodId, "99");
      await wait;
    }, 2);

    const firstCommitRecalcMs = Math.ceil(
      await medianMsAsync(async () => {
        budgetSession.drainPerfSpans();
        const wait = waitForDataNotification(budgetSession);
        budgetSession.writeCell("Omsætning", row.key, periodId, "100");
        await wait;
      }, 3),
    );

    const secondCommitRecalcMs = Math.ceil(
      await medianMsAsync(async () => {
        budgetSession.drainPerfSpans();
        const wait = waitForDataNotification(budgetSession);
        budgetSession.writeCell("Omsætning", row.key, periodId, "101");
        await wait;
      }, 3),
    );

    const allOnce = medianMs(() => evaluatedCells(budgetSession, budgetSession.getSnapshot()), 5);
    const oneOnce = medianMs(() => evaluatedCellsForTable(budgetSession, omsTable.id, "Omsætning"), 10);
    const measuredRatio = (oneOnce * tableCountOnSheet) / Math.max(allOnce, 0.001);

    const budget = {
      ...existing.budget,
      getSnapshotMs: ceilingFromMedian(medianMs(() => budgetSession.getSnapshot(), 20)),
      recalculateMs: ceilingFromMedian(
        await medianMsAsync(async () => {
          budgetSession.drainPerfSpans();
          await budgetSession.recalculate();
        }, 3),
      ),
      evaluatedCellsAllMs: ceilingFromMedian(
        medianMs(() => evaluatedCells(budgetSession, budgetSession.getSnapshot()), 5),
      ),
      evaluatedCellsOneTableMs: ceilingFromMedian(
        medianMs(() => evaluatedCellsForTable(budgetSession, omsTable.id, "Omsætning"), 10),
      ),
      cellCommitEmitMs: ceilingFromMedian(firstCommitRecalcMs, 2.5),
      firstCommitRecalcMs: ceilingFromMedian(firstCommitRecalcMs, 2.5),
      secondCommitRecalcMs: ceilingFromMedian(secondCommitRecalcMs, 2.5),
      evalScalingRatioMax: Number(Math.min(0.95, measuredRatio + 0.12).toFixed(2)),
    };

    const next = {
      baselineVersion: existing.baselineVersion ?? 1,
      sample,
      budget,
      ui: existing.ui ?? {
        budget: {
          formulaEditCursorMs: 16,
          commitRecalcMs: 3000,
          keystrokeToPaintMs: 32,
          enterToDisplayMs: 500,
        },
      },
    };

    writeFileSync(baselineJsonPath, `${JSON.stringify(next, null, 2)}\n`);
    expect(next.budget.recalculateMs).toBeGreaterThan(0);
  });
});
