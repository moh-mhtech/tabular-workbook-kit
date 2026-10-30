import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const baselineJsonPath = join(here, "..", "..", "perf", "baseline.json");

export type PerfBaselineProfile = Record<string, number>;

export type PerfBaseline = {
  baselineVersion: number;
  sample: PerfBaselineProfile;
  budget: PerfBaselineProfile;
  ui: {
    budget: PerfBaselineProfile;
  };
  /** CI regression ceilings; when present, preferred over legacy `ui.budget` for Playwright probes. */
  regression?: {
    ui?: {
      budget?: PerfBaselineProfile;
    };
    budget?: PerfBaselineProfile;
  };
  /** Stretch targets logged separately; not used as default CI ceilings. */
  slo?: {
    ui?: {
      budget?: PerfBaselineProfile;
    };
  };
};

export function readBaselineFile(): PerfBaseline {
  return JSON.parse(readFileSync(baselineJsonPath, "utf8")) as PerfBaseline;
}

/** Prototype ceilings; CI runs relaxed unless PERF_STRICT=1. */
export function perfCeiling(ms: number): number {
  if (process.env.PERF_STRICT === "1") return ms;
  const multiplier = Number(process.env.PERF_CI_MULTIPLIER ?? "1.5");
  if (!Number.isFinite(multiplier) || multiplier <= 0) return ms * 1.5;
  return ms * multiplier;
}

export function profileCeiling(profile: PerfBaselineProfile, key: string): number {
  const raw = profile[key];
  if (raw === undefined) throw new Error(`perf baseline missing ${key}`);
  return perfCeiling(raw);
}

export function uiBudgetRegressionCeiling(key: string): number {
  const baseline = readBaselineFile();
  const regression = baseline.regression?.ui?.budget?.[key];
  if (regression !== undefined) return perfCeiling(regression);
  const legacy = baseline.ui.budget[key];
  if (legacy === undefined) throw new Error(`perf baseline missing ui.budget.${key}`);
  return perfCeiling(legacy);
}
