import type { Primitive, WorkbookSnapshot } from "../../model/types.js";
import { WorkbookSession } from "../../session/WorkbookSession.js";

export const BASE_SCENARIO_ID = "";

export type ComputedCells = Record<string, Record<string, Primitive>>;

export function computedMapForSession(
  session: WorkbookSession,
  snapshot: WorkbookSnapshot,
): Record<string, ComputedCells> {
  const byTable: Record<string, ComputedCells> = {};
  for (const table of snapshot.tables) {
    const evaluated = session.getTable(table.name);
    const cells: ComputedCells = {};
    for (const row of evaluated.rows) {
      cells[row.id] = {};
      for (const column of evaluated.columns) {
        const cell = row.cells[column.id];
        if (cell) cells[row.id]![column.id] = cell.computed;
      }
    }
    byTable[table.id] = cells;
  }
  return byTable;
}

export function computedDelta(base: ComputedCells, next: ComputedCells): ComputedCells {
  const delta: ComputedCells = {};
  for (const [rowId, columns] of Object.entries(next)) {
    for (const [columnId, value] of Object.entries(columns)) {
      if (base[rowId]?.[columnId] === value) continue;
      delta[rowId] ??= {};
      delta[rowId]![columnId] = value;
    }
  }
  return delta;
}

export async function evaluateComputed(snapshot: WorkbookSnapshot): Promise<{
  base: Record<string, ComputedCells>;
  scenarios: Record<string, Record<string, ComputedCells>>;
}> {
  const baseSession = new WorkbookSession({ ...snapshot, activeScenarioId: null });
  await baseSession.recalculate();
  const base = computedMapForSession(baseSession, snapshot);

  const scenarios: Record<string, Record<string, ComputedCells>> = {};
  for (const scenario of snapshot.scenarios) {
    const session = new WorkbookSession({ ...snapshot, activeScenarioId: scenario.id });
    await session.recalculate();
    const full = computedMapForSession(session, snapshot);
    scenarios[scenario.id] = Object.fromEntries(
      snapshot.tables.map((table) => [table.id, computedDelta(base[table.id] ?? {}, full[table.id] ?? {})]),
    );
  }
  return { base, scenarios };
}
