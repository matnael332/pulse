import { describe, expect, it } from "vitest";

import type { RunInfo, RunSummary } from "../api";
import { delta, previousRun } from "./deltas";

const SUMMARY: RunSummary = {
  accounts: 10,
  high: 2,
  elevated: 3,
  normal: 5,
  revenue_at_risk: 500,
  revenue_total: 4000,
  snapshot_date: null,
};

function run(id: string, extra: Partial<RunInfo> = {}): RunInfo {
  return {
    id,
    ingestion_id: "i",
    demo: false,
    status: "succeeded",
    language: "he",
    mode: null,
    stage: null,
    stages_done: 8,
    stages: 8,
    error: null,
    summary: SUMMARY,
    queue_position: 0,
    created_at: "2026-10-26T10:00:00Z",
    started_at: null,
    finished_at: null,
    ...extra,
  };
}

describe("the previous run", () => {
  it("is the next older successful run of the same kind that has a summary", () => {
    const runs = [
      run("newer"),
      run("now"),
      run("demo", { demo: true }),
      run("failed", { status: "failed" }),
      run("bare", { summary: null }),
      run("before"),
      run("oldest"),
    ];
    expect(previousRun(runs, { id: "now", demo: false })?.id).toBe("before");
    expect(previousRun(runs, { id: "demo", demo: true })).toBeNull();
    expect(previousRun(runs, { id: "oldest", demo: false })).toBeNull();
    expect(previousRun(runs, { id: "missing", demo: false })).toBeNull();
  });
});

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
