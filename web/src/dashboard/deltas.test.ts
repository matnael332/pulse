import { describe, expect, it } from "vitest";

import type { RunSummary } from "../api";
import { day, delta } from "./deltas";

const SUMMARY: RunSummary = {
  accounts: 10,
  high: 2,
  elevated: 3,
  normal: 5,
  revenue_at_risk: 500,
  revenue_total: 4000,
  snapshot_date: null,
};

describe("a change", () => {
  it("is bad when the risk rises, never for the number of accounts", () => {
    const before = { ...SUMMARY, accounts: 12, high: 1, elevated: 4, revenue_at_risk: 300 };
    expect(delta("high", SUMMARY, before)).toEqual({ change: 1, bad: true });
    expect(delta("elevated", SUMMARY, before)).toEqual({ change: -1, bad: false });
    expect(delta("revenue_at_risk", SUMMARY, before)).toEqual({ change: 200, bad: true });
    expect(delta("accounts", SUMMARY, before)).toEqual({ change: -2, bad: false });
    expect(delta("accounts", { ...SUMMARY, accounts: 20 }, before)).toEqual({
      change: 8,
      bad: false,
    });
    expect(delta("high", SUMMARY, SUMMARY)).toEqual({ change: 0, bad: false });
  });

  it("is unknown when either side is", () => {
    expect(delta("high", SUMMARY, null)).toBeNull();
    expect(delta("revenue_at_risk", SUMMARY, { ...SUMMARY, revenue_at_risk: null })).toBeNull();
    expect(
      delta("revenue_at_risk", { ...SUMMARY, revenue_at_risk: undefined }, SUMMARY),
    ).toBeNull();
  });
});

describe("a day of data", () => {
  it("is that day where the reader is; a moment stays a moment", () => {
    const shown = day("2025-08-01");
    expect([shown.getFullYear(), shown.getMonth(), shown.getDate()]).toEqual([2025, 7, 1]);
    expect(day("2026-09-26T10:04:00Z").toISOString()).toBe("2026-09-26T10:04:00.000Z");
  });
});
