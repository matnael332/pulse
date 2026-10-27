// The change since the previous run. A run is compared with the previous successful run of the same
// kind (demo with demo, real with real) that has a summary. A rise in risk is bad; the number of
// accounts has no good direction.
import type { RunInfo, RunSummary } from "../api";

export type Figure = "accounts" | "high" | "elevated" | "revenue_at_risk";

export interface Delta {
  change: number;
  bad: boolean;
}

/** The run this one is compared with, or null. `runs` newest first, as /api/runs lists them. */
export function previousRun(runs: RunInfo[], current: { id: string; demo: boolean }) {
  const index = runs.findIndex((run) => run.id === current.id);
  if (index === -1) return null;
  return (
    runs
      .slice(index + 1)
      .find((run) => run.status === "succeeded" && run.summary && run.demo === current.demo) ?? null
  );
}

/** One figure's change, or null when either side is unknown. */
export function delta(figure: Figure, now: RunSummary, before: RunSummary | null): Delta | null {
  const value = now[figure];
  const previous = before?.[figure];
  if (value === null || value === undefined || previous === null || previous === undefined) {
    return null;
  }
  const change = value - previous;
  return { change, bad: figure !== "accounts" && change > 0 };
}
