import { describe, expect, it } from "vitest";

import type { Reason, ScoredAccount } from "../api";
import { histogram, latestRate, topReasons } from "./figures";

const why = (code: string): Reason => ({
  code,
  feature: `${code}_feature`,
  value: 0,
  typical: 1,
  contribution: 0.1,
});

function account(
  id: string,
  level: ScoredAccount["level"],
  probability: number,
  codes: string[] = [],
): ScoredAccount {
  return {
    id,
    customer_id: id,
    name: "",
    level,
    probability,
    rank: 1,
    reasons: codes.map(why),
  };
}

describe("the latest rate", () => {
  it("is the newest month that has one", () => {
    const trend = [
      { month: "2025-04", rate: 0.1, rows: 3 },
      { month: "2025-05", rate: 0, rows: 3 },
      { month: "2025-06", rate: null, rows: 3 },
    ];
    expect(latestRate(trend)).toEqual({ month: "2025-05", rate: 0 });
    expect(latestRate([{ month: "2025-06", rate: null, rows: 1 }])).toBeNull();
    expect(latestRate([])).toBeNull();
  });
});

describe("the common reasons", () => {
  it("counts each reason once per account at high risk, the most common first", () => {
    const accounts = [
      account("a", "high", 0.9, ["support", "seats"]),
      account("b", "high", 0.8, ["seats", "seats"]),
      account("c", "high", 0.7, ["billing"]),
      account("d", "elevated", 0.4, ["support", "support"]),
    ];
    expect(topReasons(accounts)).toEqual([
      { code: "seats", count: 2 },
      { code: "billing", count: 1 },
      { code: "support", count: 1 },
    ]);
    expect(topReasons(accounts, 1)).toEqual([{ code: "seats", count: 2 }]);
    expect(topReasons([account("e", "normal", 0.1, ["seats"])])).toEqual([]);
  });
});

describe("the histogram", () => {
  it("puts each account in its tenth, the ones at high risk apart, every account once", () => {
    const accounts = [
      account("a", "normal", 0),
      account("b", "normal", 0.09),
      account("c", "elevated", 0.3),
      account("d", "high", 0.95),
      account("e", "high", 1),
    ];
    const bins = histogram(accounts);
    expect(bins).toHaveLength(10);
    expect(bins[0]).toEqual({ from: 0, to: 0.1, high: 0, others: 2 });
    expect(bins[3]).toMatchObject({ high: 0, others: 1 });
    expect(bins[9]).toMatchObject({ from: 0.9, to: 1, high: 2, others: 0 });
    expect(bins.reduce((sum, bin) => sum + bin.high + bin.others, 0)).toBe(accounts.length);
  });
});
