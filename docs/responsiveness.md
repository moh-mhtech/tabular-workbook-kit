# Workbook responsiveness

Engineering guide (not glossary). Pair with [CONTEXT.md](../CONTEXT.md) for domain terms.

## Responsiveness contracts (prototype SLOs)

| ID | User experience | Primary probes |
|----|-----------------|----------------|
| **C1** | Formula draft / overlay keystrokes stay snappy; no recalc on draft | `sessionEmit.contract.test.ts` (formula edit); Playwright grid type → overlay (`ui.budget.keystrokeToPaintMs`); `measureUiPerfScenario` (`ui.budget.formulaEditCursorMs`) |
| **C2** | One input commit → one coalesced recalc → dependents update | `workbookPerf.test.ts` commit via `writeCell` + data notification; Playwright Enter after edit (`ui.budget.enterToDisplayMs`, `commitRecalcMs`) |
| **C3** | Budget-sized workbook, not sample-only | `loadBudgetPerfWorkbook` + `baseline.json` → `budget.*` in `workbookPerf.test.ts` |
| **C4** | Host maintain scoped per edit burst | `apps/playground/src/budgetMaintain.perf.test.ts` (`budget.maintainScopedMs` / `maintainFullMs`) |
| **C5** | View / formula chrome without data churn | `sessionEmit.contract.test.ts` (view-only, formula-only notifications) |

Technical obligations **T1–T2** (notification taxonomy, one recalc per emit) are covered by `sessionEmit.contract.test.ts`. **T3–T4** (incremental HF, scoped eval) by budget probes `secondCommitRecalcMs` and `evalScalingRatioMax` in `workbookPerf.test.ts`.

## Notification taxonomy

| User action | Model | Recalc | Undo | `SessionChange` | Host persist / maintain |
|-------------|-------|--------|------|-----------------|-------------------------|
| Selection, scroll, pin, explorer collapse, table hidden | view | no | no | `viewOnly` | optional debounced view |
| Formula draft / caret / point mode | formulaEdit only | no | no | `formulaEditOnly` | no |
| Cell commit, paste, delete | yes | yes (coalesced) | yes | data (+ `affectedTableNames`) | debounced |
| Format / style only | yes | no | yes | data, `recalculate: false` | debounced |
| Structure, scenario | yes | yes | yes | data | debounced |

React subscriptions: `dataVersion`, `viewVersion`, `formulaEditVersion` in `WorkbookProvider`. Canvas and computed values use `dataVersion`; formula chrome uses `formulaEditVersion`.

## Principles

1. **Local-first editing** — Grid overlay and formula bar own draft text until commit; do not call `writeCell` per keystroke.
2. **One recalc per gesture** — Batch with `transact`; coalesce async recalc; avoid maintain → emit → maintain chains.
3. **Narrow subscriptions** — Do not bump `dataVersion` for formula-only or view-only updates.
4. **Clone at boundaries** — `getSnapshot()` / `toSnapshot()` for persist and undo; render may use version counters without cloning every keystroke.
5. **Host policy in the host** — Budget shadow tables stay in playground; use `affectedTableNames` to scope `maintainBudget`.
6. **Regressions** — Run `npm test -w tabular-workbook-kit` (includes perf + contract tests) and `npm run ui:perf -w @budgettool/playground` when touching hot paths.

## When recalc is required

Any change to inputs, formulas, scenarios, or cell addresses that formulas depend on.

## When recalc is not required

View state, formula draft, format/style metadata, table hidden, explorer collapse — use `viewOnly`, `formulaEditOnly`, or `emit({ recalculate: false })`.

## Measurement

- **Baseline (single source of truth):** [perf/baseline.json](../perf/baseline.json). Ceilings read via `readBaseline.ts` (`profileCeiling` / `perfCeiling`).
- **Update medians locally:** `npm run perf:baseline:update -w tabular-workbook-kit` (kit probes). Playground maintain ceilings: tune `budget.maintainScopedMs` / `maintainFullMs` after `budgetMaintain.perf.test.ts` on your machine.
- **CI tolerance:** Default **1.5×** baseline unless `PERF_STRICT=1`. Override multiplier with `PERF_CI_MULTIPLIER`.
- **In-process:** `workbookPerf.test.ts`, `sessionEmit.contract.test.ts`.
- **Browser:** `npm run ui:perf -w @budgettool/playground` → `apps/playground/ui-capture/output/perf-cell-edit-budget.json` and `perf-grid-type-enter-budget.json`.
- **Chrome Performance** (manual): profile typing + Enter; map long tasks to recalc, maintain, persist, React.
