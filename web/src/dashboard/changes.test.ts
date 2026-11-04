import { describe, expect, it } from "vitest";

import type { AccountChange } from "../api";
import { shown } from "./changes";

function account(id: string, extra: Partial<AccountChange> = {}): AccountChange {
  return {
    id,
    customer_id: id.slice(-2),
    name: `name ${id}`,
    level: "high",
    probability: 0.8,
    rank: 1,
    mrr: 500,
    reasons: [],
    level_before: "normal",
    probability_before: 0.1,
    rank_before: 30,
    mrr_before: 450,
    ...extra,
  };
}

describe("an account that changed", () => {
  it("shows its figures now", () => {
    expect(shown(account("acc_a"), "entered_high")).toEqual({
      level: "high",
      probability: 0.8,
      mrr: 500,
    });
  });

  it("shows its last known figures once gone from the data", () => {
    const gone = account("acc_c", { level: null, probability: null, mrr: null });
    expect(shown(gone, "gone")).toEqual({ level: "normal", probability: 0.1, mrr: 450 });
  });
});
