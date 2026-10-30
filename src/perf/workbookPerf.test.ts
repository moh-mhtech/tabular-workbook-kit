import { describe, expect, it } from "vitest";
import { loadBudgetPerfWorkbook } from "../../sample/loadBudgetPerfFixture.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { buildPeriods } from "../model/calendar.js";
import { layoutWorkbook } from "../model/layout.js";
import { evaluatedCells, evaluatedCellsForTable } from "../react/CustomSheetCanvas.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { medianMs, medianMsAsync, waitForDataNotification } from "./perfMeasure.js";
import { profileCeiling, readBaselineFile } from "./readBaseline.js";

function assertWithinBudget(label: string, ms: number, budgetMs: number) {
  expect(ms, `${label} took ${ms.toFixed(1)}ms (budget ${budgetMs}ms)`).toBeLessThan(budgetMs);
}

describe("workbook performance probes", () => {
  it("sample workbook stays within baseline budgets (C3 sample)", async () => {
    const baseline = readBaselineFile().sample;
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();
    await session.recalculate();

    const getSnapshotMs = medianMs(() => session.getSnapshot(), 30);
    assertWithinBudget("getSnapshot", getSnapshotMs, profileCeiling(baseline, "getSnapshotMs"));

    const recalcMs = await medianMsAsync(async () => {
      session.drainPerfSpans();
      await session.recalculate();
    }, 5);
    assertWithinBudget("recalculate", recalcMs, profileCeiling(baseline, "recalculateMs"));

    const snapshot = session.getSnapshot();
    const allTablesMs = medianMs(() => evaluatedCells(session, snapshot), 10);
    assertWithinBudget("evaluatedCellsAll", allTablesMs, profileCeiling(baseline, "evaluatedCellsAllMs"));

    const singleTableMs = medianMs(() => evaluatedCellsForTable(session, "tbl-lines", "Lines"), 20);
    assertWithinBudget(
      "evaluatedCellsOneTable",
      singleTableMs,
      profileCeiling(baseline, "evaluatedCellsOneTableMs"),
    );
  });

  it("single cell commit via emit stays within budget (C2 sample)", async () => {
    const baseline = readBaselineFile().sample;
    const session = new WorkbookSession(createSampleWorkbook());
    await session.recalculate();

    const commitMs = await medianMsAsync(async () => {
      session.drainPerfSpans();
      const wait = waitForDataNotification(session);
      session.writeCell("Params", "AnnualUnits", "Value", "9000000");
      await wait;
    }, 3);
    assertWithinBudget("cellCommitRecalc", commitMs, profileCeiling(baseline, "cellCommitRecalcMs"));
  });

  it("budget workbook stays within baseline budgets (C3)", async () => {
    const baseline = readBaselineFile().budget;
    const session = new WorkbookSession(loadBudgetPerfWorkbook());
    await session.recalculate();
    await session.recalculate();

    const getSnapshotMs = medianMs(() => session.getSnapshot(), 20);
    assertWithinBudget("budget getSnapshot", getSnapshotMs, profileCeiling(baseline, "getSnapshotMs"));

    const recalcMs = await medianMsAsync(async () => {
      session.drainPerfSpans();
      await session.recalculate();
    }, 3);
    assertWithinBudget("budget recalculate", recalcMs, profileCeiling(baseline, "recalculateMs"));

    const snapshot = session.getSnapshot();
    const oms = snapshot.tables.find((t) => t.name === "Omsætning")!;
    const allTablesMs = medianMs(() => evaluatedCells(session, snapshot), 5);
    assertWithinBudget("budget evaluatedCellsAll", allTablesMs, profileCeiling(baseline, "evaluatedCellsAllMs"));

    const singleTableMs = medianMs(() => evaluatedCellsForTable(session, oms.id, "Omsætning"), 10);
    assertWithinBudget(
      "budget evaluatedCellsOneTable",
      singleTableMs,
      profileCeiling(baseline, "evaluatedCellsOneTableMs"),
    );
  });

  it("budget cell commit via emit stays within budget (C2 C3)", async () => {
    const baseline = readBaselineFile().budget;
    const session = new WorkbookSession(loadBudgetPerfWorkbook());
    await session.recalculate();
    const table = session.getSnapshot().tables.find((t) => t.name === "Omsætning")!;
    const row = table.rows[0]!;
    const periodId = buildPeriods(session.getSnapshot().calendar)[0]!.id;
    {
      const warm = waitForDataNotification(session);
      session.writeCell("Omsætning", row.key, periodId, "1");
      await warm;
    }

    const commitMs = await medianMsAsync(async () => {
      session.drainPerfSpans();
      const wait = waitForDataNotification(session);
      session.writeCell("Omsætning", row.key, periodId, "42");
      await wait;
    }, 3);
    assertWithinBudget("budget cellCommitEmit", commitMs, profileCeiling(baseline, "cellCommitEmitMs"));
  });

  it("second budget commit is not slower than first (T3 incremental HF)", async () => {
    const baseline = readBaselineFile().budget;
    const session = new WorkbookSession(loadBudgetPerfWorkbook());
    await session.recalculate();
    const table = session.getSnapshot().tables.find((t) => t.name === "Omsætning")!;
    const row = table.rows[0]!;
    const periodId = buildPeriods(session.getSnapshot().calendar)[0]!.id;

    const firstMs = await medianMsAsync(async () => {
      session.drainPerfSpans();
      const wait = waitForDataNotification(session);
      session.writeCell("Omsætning", row.key, periodId, "1000");
      await wait;
    }, 3);

    const secondMs = await medianMsAsync(async () => {
      session.drainPerfSpans();
      const wait = waitForDataNotification(session);
      session.writeCell("Omsætning", row.key, periodId, "1001");
      await wait;
    }, 3);

    assertWithinBudget("budget secondCommitRecalc", secondMs, profileCeiling(baseline, "secondCommitRecalcMs"));
    expect(secondMs, "incremental engine should not regress vs first commit").toBeLessThanOrEqual(firstMs * 1.15);
  });

  it("budget recalc after multi-table commit stays within multi-sheet budget (C3)", async () => {
    const baseline = readBaselineFile();
    const regressionMs = baseline.regression?.budget?.recalculateMultiSheetMs;
    if (regressionMs === undefined) return;
    const session = new WorkbookSession(loadBudgetPerfWorkbook());
    await session.recalculate();
    const oms = session.getSnapshot().tables.find((t) => t.name === "Omsætning")!;
    const row = oms.rows[0]!;
    const periodId = buildPeriods(session.getSnapshot().calendar)[0]!.id;

    const recalcMs = await medianMsAsync(async () => {
      session.drainPerfSpans();
      const wait = waitForDataNotification(session);
      session.writeCell("Omsætning", row.key, periodId, "501");
      await wait;
      const spans = session.drainPerfSpans().filter((s) => s.name === "recalculate");
      return spans[0]?.ms ?? 0;
    }, 3);

    assertWithinBudget(
      "budget recalculateMultiSheet",
      recalcMs,
      profileCeiling(baseline.regression!.budget!, "recalculateMultiSheetMs"),
    );
  });

  it("scoped table eval scales vs all-table eval (T4)", () => {
    const baseline = readBaselineFile().budget;
    const session = new WorkbookSession(loadBudgetPerfWorkbook());
    const snapshot = session.getSnapshot();
    const layout = layoutWorkbook(snapshot);
    const oms = snapshot.tables.find((t) => t.name === "Omsætning")!;
    const sheet = snapshot.sheets.find((s) => s.tableIds.includes(oms.id))!;
    const tableCount = sheet.tableIds.filter((id) => layout.tables.has(id)).length;

    const allMs = medianMs(() => evaluatedCells(session, snapshot), 5);
    const oneMs = medianMs(() => evaluatedCellsForTable(session, oms.id, "Omsætning"), 10);
    const ratio = (oneMs * tableCount) / Math.max(allMs, 0.001);
    expect(ratio, `eval ratio ${ratio.toFixed(2)} for ${tableCount} tables`).toBeLessThan(
      baseline.evalScalingRatioMax,
    );
  });
});
