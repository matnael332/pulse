// The change since the previous run. The server names the run a run is compared with (the
// previous month of the same kind, `results.previous`), so the figures and the list of changes
// count from the same one. A rise in risk is bad; the number of accounts has no good direction.
import type { RunSummary } from "../api";

export type Figure = "accounts" | "high" | "elevated" | "revenue_at_risk";

export interface Delta {
  change: number;
  bad: boolean;
}

/** A date to show: a day of data (YYYY-MM-DD) is that day wherever the reader is, not UTC's. */
export function day(iso: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00` : iso);
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
