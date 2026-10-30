# ADR 0006: Incremental HyperFormula evaluation

## Status

Accepted

## Context

Every model change triggered a full `HyperFormula.buildFromSheets`, grid read, and `destroy`. On the budget playground this dominated commit latency and RAM churn.

## Decision

`HyperFormulaEngine` keeps a long-lived engine instance and patches cells when **structure** is unchanged:

- **Structure fingerprint** — sheet dimensions, band geometry, loose cell keys, and promoted defined-name set.
- **Patch path** — rebuild sheet content in memory, `setCellContents` only where raw content changed.
- **Rebuild path** — destroy and `buildFromSheets` when the fingerprint changes (new row/table, band move, new promoted name, etc.).

Session recalc coalesces in-flight work and notifies listeners once after the latest generation completes.

## Consequences

- Single-cell commits on large workbooks avoid rebuilding the entire engine.
- Promoted-name or layout changes still pay a full rebuild (correctness over micro-optimizations).
- Hosts must not assume synchronous computed values; UI may show stale computed cells until recalc finishes (inputs still read from model immediately).
