import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Advanced, Results } from "./api";
import { riskCsv } from "./results/csv";
import { en, he, me, renderAt, serve } from "./test-utils";

const ACTIVE = me("active", { status: "active", slug: "acme" });
const LAZY = { timeout: 10_000 }; // the results screen is its own bundle: the first load compiles it
const reason = {
  code: "payroll_exports",
  feature: "payroll_exported_delta_1m",
  value: -1,
  typical: 0,
  contribution: 0.2,
};

const RESULTS: Results = {
  run: { id: "run1", demo: true, language: "en", mode: "deterministic", finished_at: null },
  summary: { accounts: 3, high: 1, elevated: 1, normal: 1, snapshot_date: "2025-09-01" },
  accounts: [
    {
      id: "acc_000001",
      customer_id: "10001",
      name: "מאפיית הגליל",
      level: "high",
      probability: 0.91,
      rank: 1,
      reasons: [reason],
    },
    {
      id: "acc_000002",
      customer_id: "10002",
      name: "=HYPERLINK(evil)",
      level: "elevated",
      probability: 0.4,
      rank: 2,
      reasons: [],
    },
    {
      id: "acc_000003",
      customer_id: "10003",
      name: "",
      level: "normal",
      probability: 0.05,
      rank: 3,
      reasons: [],
    },
  ],
  distribution: { levels: { high: 1, elevated: 1, normal: 1 }, histogram: [] },
  trend: [{ month: "2025-01", rate: 0.1, rows: 3 }],
  key_numbers: [],
  insights: {
    headline: "Two accounts need a call.",
    key_findings: [{ title: "Payroll", evidence: "1 stopped", business_meaning: "a sign" }],
    recommendations: ["Call them"],
    source: "template",
    language: "en",
  },
  groups: { missing: ["shifts"] },
  data: { low_confidence: true, cancellations: { train: 12, test: 6 } },
};

const ADVANCED: Advanced = {
  selected_model: "logistic_regression",
  selection: {},
  split: {},
  threshold: 0.33,
  candidates: {
    logistic_regression: {
      description: "LR",
      test: { roc_auc: 0.81234, pr_auc: 0.4, precision_at_top10pct: 0.5, brier: 0.07 },
      cv: {},
    },
  },
  importance: [{ feature: "overtime_share", importance_mean: 0.05, description: "" }],
  figures: ["roc_curves.png"],
  docs: ["model_card"],
};

function routes() {
  return {
    "GET /api/me": { body: ACTIVE },
    "GET /api/runs/run1": {
      body: {
        id: "run1",
        ingestion_id: "ing1",
        demo: true,
        status: "succeeded",
        language: "en",
        mode: null,
        stage: null,
        stages_done: 8,
        stages: 8,
        error: null,
        summary: RESULTS.summary,
        queue_position: 0,
        created_at: "2026-10-26T10:00:00Z",
        started_at: null,
        finished_at: null,
      },
    },
    "GET /api/runs/run1/results": { body: RESULTS },
    "GET /api/runs/run1/advanced": { body: ADVANCED },
    "GET /api/runs": { body: { runs: [] } },
  };
}

describe("the business tab", () => {
  it("lists the accounts at risk with their names and reasons", async () => {
    serve(routes());
    renderAt("/runs/run1");
    expect(await screen.findByText("מאפיית הגליל", {}, LAZY)).toBeInTheDocument();
    expect(screen.getByText("הפסיקו להפיק שכר")).toBeInTheDocument();
    expect(screen.getByText(he("results.template"))).toBeInTheDocument();
    expect(screen.getByText(he("results.lowConfidence"))).toBeInTheDocument();
    expect(screen.getByText(he("results.groupsMissing", { groups: "משמרות" }))).toBeInTheDocument();
    expect(screen.queryByText("10003")).not.toBeInTheDocument(); // high risk is shown first
    await userEvent.click(screen.getByRole("radio", { name: he("results.all") }));
    expect(screen.getByText("10003")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: he("results.search") }), "10002");
    const table = screen.getByRole("table");
    expect(within(table).queryByText("מאפיית הגליל")).not.toBeInTheDocument();
    expect(within(table).getByText("=HYPERLINK(evil)")).toBeInTheDocument();
  });

  it("writes a CSV Excel reads: a BOM, labels, and no formulas", () => {
    const csv = riskCsv(RESULTS.accounts, "he", ["#", "number", "name", "level", "p", "why"]);
    expect(csv.startsWith("﻿#,number,name")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe("1,10001,מאפיית הגליל,סיכון גבוה,91.0,הפסיקו להפיק שכר");
    expect(lines[2]).toContain(",'=HYPERLINK(evil),");
  });

  it("downloads the filtered list", async () => {
    const created: Blob[] = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return "blob:x";
      },
      revokeObjectURL: () => {},
    });
    serve(routes());
    renderAt("/runs/run1", "en");
    await userEvent.click(
      await screen.findByRole("button", { name: en("results.download") }, LAZY),
    );
    expect(created).toHaveLength(1);
    const text = await created[0].text();
    expect(text).toContain("High risk");
  });
});

describe("the advanced tab", () => {
  it("shows the metrics, the report as markdown and the figures", async () => {
    const routesWithDoc = {
      ...routes(),
      "GET /api/runs/run1/docs/model_card": { body: "# Card\n\n| a | b |\n|---|---|\n| 1 | 2 |" },
    };
    // getDoc reads text: answer the markdown as is
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${url}`;
        const route = (routesWithDoc as Record<string, { body: unknown }>)[key];
        if (!route) return new Response("{}", { status: 404 });
        const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body);
        return new Response(body, { status: 200 });
      }),
    );
    renderAt("/runs/run1");
    await userEvent.click(await screen.findByRole("tab", { name: he("results.advanced") }, LAZY));
    expect((await screen.findAllByText("0.812")).length).toBe(2); // the card and the table
    const report = await screen.findByTestId("report");
    await waitFor(() => expect(within(report).getByRole("table")).toBeInTheDocument());
    expect(screen.getByRole("img", { name: "roc_curves.png" })).toHaveAttribute(
      "src",
      "/api/runs/run1/figures/roc_curves.png",
    );
  });
});
