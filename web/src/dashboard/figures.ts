// The dashboard's figures, from a run's results: the newest month's cancellation rate, the reasons
// most common among the accounts at high risk, and the accounts per tenth of probability.
import type { Results, ScoredAccount } from "../api";

export const BINS = 10; // as the server's histogram

/** The newest month that has a rate (the newest months may have none yet), or null. */
export function latestRate(trend: Results["trend"]): { month: string; rate: number } | null {
  for (let i = trend.length - 1; i >= 0; i--) {
    const { month, rate } = trend[i];
    if (rate !== null && rate !== undefined) return { month, rate };
  }
  return null;
}

/** How many accounts at high risk carry each reason, the most common first. */
export function topReasons(accounts: ScoredAccount[], limit = 6) {
  const counts = new Map<string, number>();
  for (const account of accounts) {
    if (account.level !== "high") continue;
    for (const code of new Set(account.reasons.map((r) => r.code))) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, limit);
}

/** Accounts per tenth of probability, the ones at high risk apart from the others. */
export function histogram(accounts: ScoredAccount[]) {
  const bins = Array.from({ length: BINS }, (_, i) => ({
    from: i / BINS,
    to: (i + 1) / BINS,
    high: 0,
    others: 0,
  }));
  for (const account of accounts) {
    const bin = bins[Math.min(Math.floor(account.probability * BINS), BINS - 1)];
    if (account.level === "high") bin.high += 1;
    else bin.others += 1;
  }
  return bins;
}
