import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MyCompany, RunInfo } from "./api";
import { POLL } from "./poll";
import { en, he, me, renderAt, serve } from "./test-utils";

const ACTIVE = me("active", { status: "active", slug: "acme" });

function run(status: RunInfo["status"], extra: Partial<RunInfo> = {}): RunInfo {
  return {
    id: "run1",
    ingestion_id: "ing1",
    demo: true,
    status,
    language: "he",
    mode: "deterministic",
    stage: null,
    stages_done: 8,
    stages: 8,
    error: null,
    summary: null,
    queue_position: 0,
    created_at: "2026-10-26T10:00:00Z",
    started_at: null,
    finished_at: "2026-10-26T10:04:00Z",
    ...extra,
  };
}

function company(extra: Partial<MyCompany> = {}): MyCompany {
  return {
    ...ACTIVE.company!,
    has_model: false,
    has_real_data: false,
    current: null,
    latest_run: null,
    ...extra,
  };
}

beforeEach(() => {
  POLL.ms = 10;
});
afterEach(() => {
  POLL.ms = 2000;
});

describe("the data page", () => {
  it("marks where the company stands on the rail", async () => {
    serve({ "GET /api/me": { body: me("pending", { name: "Acme" }) } });
    renderAt("/data");
    const current = await screen.findByText(he("rail.approval"));
    expect(current.closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(he("status.pending.title"))).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: he("nav.dashboard") })).not.toBeInTheDocument();
  });

  it("shows the latest result's figures, the revenue in the company's currency", async () => {
    const summary = {
      accounts: 39,
      high: 2,
      elevated: 0,
      normal: 37,
      revenue_at_risk: 316,
      revenue_total: 16710,
      snapshot_date: "2025-09-01",
    };
    serve({
      "GET /api/me": { body: ACTIVE },
      "GET /api/company": { body: company({ latest_run: run("succeeded", { summary }) }) },
    });
    renderAt("/data", "en");
    const latest = (await screen.findByRole("heading", { name: en("home.latest") })).closest(
      "section",
    )!;
    expect(within(latest).getByText("39")).toBeInTheDocument();
    expect(within(latest).getByText("₪316")).toBeInTheDocument();
    expect(within(latest).getByRole("link", { name: en("data.dashboard") })).toHaveAttribute(
      "href",
      "/dashboard/run1",
    );
  });

  it("changes the currency of the revenue figures", async () => {
    const calls = serve({
      "GET /api/me": { body: ACTIVE },
      "GET /api/company": { body: company() },
      "PUT /api/company/currency": { body: { ...ACTIVE.company, currency: "USD" } },
    });
    renderAt("/data", "en");
    await userEvent.click(await screen.findByText(en("currency.USD")));
    await waitFor(() =>
      expect(calls.find((c) => c.key === "PUT /api/company/currency")?.body).toEqual({
        currency: "USD",
      }),
    );
  });

  it("moves a finished run on to the dashboard", async () => {
    serve({
      "GET /api/me": { body: ACTIVE },
      "GET /api/company": { body: company() },
      "GET /api/runs/run1": { body: run("succeeded") },
      "GET /api/runs/run1/results": { status: 404 },
    });
    renderAt("/data/runs/run1");
    expect(
      await screen.findByRole("heading", { level: 1, name: he("nav.dashboard") }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: he("nav.dashboard") })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("sends an active company home to where it stands", async () => {
    serve({
      "GET /api/me": { body: ACTIVE },
      "GET /api/company": {
        body: company({ current: { kind: "run", id: "run2", status: "running" } }),
      },
      "GET /api/runs/run2": {
        body: run("running", { id: "run2", stage: "run_modeling_phase", stages_done: 5 }),
      },
    });
    renderAt("/");
    // the session, the company, the redirect, then the run: give the chain time
    const current = await screen.findByText(he("rail.model"), {}, { timeout: 4000 });
    expect(current.closest("li")).toHaveAttribute("aria-current", "step");
    expect(await screen.findByText(he("run.title"))).toBeInTheDocument();
  });
});
