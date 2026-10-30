# Workbook responsiveness

Engineering guide (not glossary). Pair with [CONTEXT.md](../CONTEXT.md) for domain terms.

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
6. **Regressions** — Run `npm test -w tabular-workbook-kit` (includes `src/perf/workbookPerf.test.ts`) and `npm run ui:perf -w @budgettool/playground` when touching hot paths.

## When recalc is required

Any change to inputs, formulas, scenarios, or cell addresses that formulas depend on.

## When recalc is not required

View state, formula draft, format/style metadata, table hidden, explorer collapse — use `viewOnly`, `formulaEditOnly`, or `emit({ recalculate: false })`.

## Measurement

- **In-process:** [perf/baseline.json](../perf/baseline.json) and `workbookPerf.test.ts`.
- **Browser (session probes on budget):** `npm run ui:perf -w @budgettool/playground` → `apps/playground/ui-capture/output/perf-cell-edit-budget.json`.
- **Chrome Performance** (manual): profile typing + Enter; map long tasks to recalc, maintain, persist, React.
