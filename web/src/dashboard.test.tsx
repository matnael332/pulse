import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Advanced, Changes, Results, RunInfo, RunSummary } from "./api";
import { riskCsv } from "./dashboard/csv";
import { label } from "./labels";
import { en, he, me, renderAt, serve } from "./test-utils";

const ACTIVE = me("active", { status: "active", slug: "acme", name: "Acme" });
const LAZY = { timeout: 10_000 }; // the overview is its own bundle: the first load compiles it
const reason = {
  code: "payroll_exports",
  feature: "payroll_exported_delta_1m",
  value: -1,
  typical: 0,
  contribution: 0.2,
};
const SUMMARY: RunSummary = {
  accounts: 3,
  high: 1,
  elevated: 1,
  normal: 1,
  revenue_at_risk: 2400,
  revenue_total: 3100,
  snapshot_date: "2025-09-01",
};

const RESULTS: Results = {
  run: { id: "run1", demo: true, language: "en", mode: "deterministic", finished_at: null },
  summary: SUMMARY,
  currency: "ILS",
  accounts: [
    {
      id: "acc_000001",
      customer_id: "10001",
      name: "מאפיית הגליל",
      level: "high",
      probability: 0.91,
      rank: 1,
      mrr: 2400,
      reasons: [reason],
    },
    {
      id: "acc_000002",
      customer_id: "10002",
      name: "=HYPERLINK(evil)",
      level: "elevated",
      probability: 0.4,
      rank: 2,
      mrr: 700,
      reasons: [],
    },
    {
      id: "acc_000003",
      customer_id: "10003",
      name: "",
      level: "normal",
      probability: 0.05,
      rank: 3,
      mrr: null,
      reasons: [],
    },
  ],
  distribution: { levels: { high: 1, elevated: 1, normal: 1 }, histogram: [] },
  trend: [
    { month: "2025-05", rate: 0.1, rows: 3 },
    { month: "2025-06", rate: 0.05, rows: 3 },
    { month: "2025-07", rate: null, rows: 3 },
  ],
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

function run(id: string, extra: Partial<RunInfo> = {}): RunInfo {
  return {
    id,
    ingestion_id: "ing1",
    demo: true,
    status: "succeeded",
    language: "en",
    mode: null,
    stage: null,
    stages_done: 8,
    stages: 8,
    error: null,
    summary: SUMMARY,
    queue_position: 0,
    created_at: "2026-10-26T10:00:00Z",
    started_at: null,
    finished_at: "2026-10-26T10:04:00Z",
    ...extra,
  };
}

function routes(runs: RunInfo[] = [run("run1")]) {
  return {
    "GET /api/me": { body: ACTIVE },
    "GET /api/runs/run1": { body: run("run1") },
    "GET /api/runs/run1/results": { body: RESULTS },
    "GET /api/runs/run1/advanced": { body: ADVANCED },
    "GET /api/runs": { body: { runs } },
  };
}

const medium = (date: string) =>
  // a day of data, in the reader's own time zone
  new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(new Date(`${date}T00:00`));

const CHANGES: Changes = {
  base: {
    id: "older",
    snapshot_date: "2025-08-01",
    finished_at: "2026-09-26T10:04:00Z",
    created_at: "2026-09-26T10:00:00Z",
    summary: SUMMARY,
  },
  counts: { entered_high: 1, rose: 1, gone: 1 },
  entered_high: [
    {
      ...RESULTS.accounts[0],
      mrr: 2400,
      level_before: null,
      probability_before: null,
      rank_before: null,
      mrr_before: null,
    },
  ],
  rose: [
    {
      ...RESULTS.accounts[1],
      mrr: 700,
      level_before: "normal",
      probability_before: 0.1,
      rank_before: 3,
      mrr_before: 650,
    },
  ],
  gone: [
    {
      id: "acc_000009",
      customer_id: "10009",
      name: "מוסך הדרום",
      level: null,
      probability: null,
      rank: null,
      mrr: null,
      reasons: [],
      level_before: "high",
      probability_before: 0.7,
      rank_before: 2,
      mrr_before: 900,
    },
  ],
};

const shekels = (value: number, sign = false) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
    signDisplay: sign ? "exceptZero" : "auto",
  })
    .format(value)
    .replace(/\s+/g, " "); // as the queries read it

describe("the overview", () => {
  it("leads with the revenue at risk, the counts, and a dash with nothing to compare", async () => {
    serve(routes());
    renderAt("/dashboard/run1");
    expect(await screen.findByText(shekels(2400, false), { selector: "dd" }, LAZY)).toBeVisible();
    expect(screen.getByText(he("dashboard.of", { total: shekels(3100) }))).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      he("dashboard.title", { name: "Acme" }),
    );
    expect(screen.getByText(he("dashboard.lead", { high: "1", accounts: "3" }))).toBeVisible();
    // four figures compared with nothing: four dashes
    expect(screen.getAllByText(he("dashboard.noCompare"))).toHaveLength(4);
    // the newest month that has a rate (July has none yet)
    expect(screen.getByText(he("dashboard.rate", { month: "יוני 2025" }))).toBeInTheDocument();
    expect(screen.getByText("5.0%")).toBeInTheDocument();
  });

  it("shows the change since the run the server compares with, a rise in risk in red", async () => {
    const before: RunSummary = { ...SUMMARY, accounts: 4, high: 0, revenue_at_risk: 1000 };
    serve({
      ...routes(),
      "GET /api/runs/run1/results": {
        body: {
          ...RESULTS,
          previous: {
            id: "older",
            snapshot_date: "2025-08-01",
            finished_at: "2026-09-26T10:04:00Z",
            created_at: "2026-09-26T10:00:00Z",
            summary: before,
          },
        },
      },
    });
    renderAt("/dashboard/run1");
    const vs = he("dashboard.vs", { date: medium("2025-08-01") }); // the month of data, not the run
    expect((await screen.findAllByText(new RegExp(vs), {}, LAZY)).length).toBe(4);
    const signed = new Intl.NumberFormat("he-IL", { signDisplay: "exceptZero" });
    expect(screen.getByText(signed.format(1)).className).toMatch(/bad/); // more at high risk
    expect(screen.getByText(signed.format(-1)).className).not.toMatch(/bad/); // fewer accounts
    expect(screen.getByText(shekels(1400, true)).className).toMatch(/bad/);
    expect(screen.getByText("0").className).not.toMatch(/bad/); // elevated, unchanged
  });

  it("lists the accounts at risk with their revenue and reasons", async () => {
    serve(routes());
    renderAt("/dashboard/run1");
    const table = await screen.findByRole("table", {}, LAZY);
    expect(within(table).getByText("מאפיית הגליל")).toBeInTheDocument();
    expect(within(table).getByText("הפסיקו להפיק שכר")).toBeInTheDocument();
    expect(within(table).getByText(shekels(2400))).toBeInTheDocument();
    expect(screen.getByText(he("results.template"))).toBeInTheDocument();
    expect(screen.getByText(he("results.lowConfidence"))).toBeInTheDocument();
    expect(screen.getByText(he("results.groupsMissing", { groups: "משמרות" }))).toBeInTheDocument();
    expect(screen.queryByText("10003")).not.toBeInTheDocument(); // high risk is shown first
    await userEvent.click(screen.getByRole("radio", { name: he("results.all") }));
    expect(within(table).getByText("10003")).toBeInTheDocument();
    expect(within(table).getAllByText("—").length).toBeGreaterThan(0); // no revenue: a dash
    await userEvent.type(screen.getByRole("searchbox", { name: he("results.search") }), "10002");
    expect(within(table).queryByText("מאפיית הגליל")).not.toBeInTheDocument();
    expect(within(table).getByText("=HYPERLINK(evil)")).toBeInTheDocument();
  });

  it("counts the reasons of the accounts at high risk", async () => {
    serve(routes());
    renderAt("/dashboard/run1");
    const reasons = await screen.findByRole("heading", { name: he("dashboard.reasons") }, LAZY);
    const list = within(reasons.closest("section")!).getByRole("list");
    expect(within(list).getByText("הפסיקו להפיק שכר")).toBeInTheDocument();
    expect(within(list).getByText("1")).toBeInTheDocument();
  });

  it("writes a CSV Excel reads: a BOM, labels, the revenue, and no formulas", () => {
    const csv = riskCsv(RESULTS.accounts, "he", [
      "#",
      "number",
      "name",
      "level",
      "p",
      "mrr",
      "why",
    ]);
    expect(csv.startsWith("﻿#,number,name")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe("1,10001,מאפיית הגליל,סיכון גבוה,91.0,2400,הפסיקו להפיק שכר");
    expect(lines[2]).toContain(",'=HYPERLINK(evil),");
    expect(lines[3]).toBe("3,10003,,סיכון רגיל,5.0,,");
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
    renderAt("/dashboard/run1", "en");
    await userEvent.click(
      await screen.findByRole("button", { name: en("results.download") }, LAZY),
    );
    expect(created).toHaveLength(1);
    const text = await created[0].text();
    expect(text).toContain("Monthly revenue (ILS)");
    expect(text).toContain("High risk");
  });
});

describe("what changed", () => {
  it("counts the changes since the previous month, and opens the lists", async () => {
    serve({ ...routes(), "GET /api/runs/run1/changes": { body: CHANGES } });
    renderAt("/dashboard/run1");
    const title = await screen.findByRole("heading", { name: he("results.changes") }, LAZY);
    const panel = title.closest("section")!;
    expect(within(panel).getByText(he("changes.vs", { date: medium("2025-08-01") }))).toBeVisible();
    for (const key of ["changes.enteredHigh", "changes.rose", "changes.gone"] as const) {
      expect(within(panel).getByText(he(key)).nextElementSibling).toHaveTextContent("1");
    }
    await userEvent.click(within(panel).getByRole("link", { name: he("changes.all") }));
    const tab = await screen.findByRole("link", { name: he("results.changes") });
    expect(tab).toHaveAttribute("aria-current", "page");
    const entered = (
      await screen.findByRole("heading", { name: he("changes.enteredHigh") }, LAZY)
    ).closest("section")!;
    expect(within(entered).getByText("מאפיית הגליל")).toBeInTheDocument();
    expect(within(entered).getByText(he("changes.new"))).toBeInTheDocument();
    const rose = screen.getByRole("heading", { name: he("changes.rose") }).closest("section")!;
    expect(
      within(rose).getByText(he("changes.from", { value: label.risk("normal", "he") })),
    ).toBeInTheDocument();
    const gone = screen.getByRole("heading", { name: he("changes.gone") }).closest("section")!;
    expect(within(gone).getByText("מוסך הדרום")).toBeInTheDocument();
    expect(within(gone).getByText(he("changes.goneNote"))).toBeInTheDocument();
    expect(within(gone).getByText(shekels(900))).toBeInTheDocument(); // its last known revenue
  });

  it("has nothing to show without a month to compare with", async () => {
    const first = { ...CHANGES, base: null, counts: { entered_high: 0, rose: 0, gone: 0 } };
    serve({ ...routes(), "GET /api/runs/run1/changes": { body: first } });
    renderAt("/dashboard/run1");
    expect(await screen.findByRole("table", {}, LAZY)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: he("results.changes") })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: he("results.changes") }));
    expect(await screen.findByText(he("dashboard.noCompare"), {}, LAZY)).toBeVisible();
  });
});

describe("the model view", () => {
  it("shows the metrics, the report as markdown, the figures and the runs", async () => {
    const routesWithDoc = {
      ...routes([run("run1"), run("run0", { created_at: "2026-09-01T10:00:00Z" })]),
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
    renderAt("/dashboard/run1");
    await userEvent.click(await screen.findByRole("link", { name: he("results.advanced") }));
    expect((await screen.findAllByText("0.812", {}, LAZY)).length).toBe(2); // the strip and the table
    const report = await screen.findByTestId("report");
    await waitFor(() => expect(within(report).getByRole("table")).toBeInTheDocument());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1); // the report's steps down
    expect(screen.getByRole("img", { name: "roc_curves.png" })).toHaveAttribute(
      "src",
      "/api/runs/run1/figures/roc_curves.png",
    );
    const runs = screen.getByRole("heading", { name: he("advanced.history") }).closest("section")!;
    const links = within(runs).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/dashboard/run1",
      "/dashboard/run0",
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
  });
});
