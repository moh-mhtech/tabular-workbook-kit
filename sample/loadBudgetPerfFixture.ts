import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkbookSnapshot } from "../src/model/types.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "budget-perf.snapshot.json");

/** Frozen Danish budget workbook for headless perf probes (C3). */
export function loadBudgetPerfWorkbook(): WorkbookSnapshot {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as WorkbookSnapshot;
}
