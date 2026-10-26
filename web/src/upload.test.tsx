import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Ingestion, Review, RunInfo } from "./api";
import { POLL } from "./poll";
import { problemText } from "./problems";
import { en, he, me, renderAt, serve } from "./test-utils";

const ACTIVE = me("active", { status: "active", slug: "acme" });

function ingestion(status: Ingestion["status"], extra: Partial<Ingestion> = {}): Ingestion {
  return {
    id: "ing1",
    status,
    demo: false,
    filename: "export.zip",
    size_bytes: 10,
    language: "he",
    mapping_version: 1,
    auto_approved: false,
    error: null,
    queue_position: 0,
    run_id: null,
    created_at: "2026-10-26T10:00:00Z",
    ...extra,
  };
}

function run(status: RunInfo["status"], extra: Partial<RunInfo> = {}): RunInfo {
  return {
    id: "run1",
    ingestion_id: "ing1",
    demo: false,
    status,
    language: "he",
    mode: "deterministic",
    stage: null,
    stages_done: 0,
    stages: 8,
    error: null,
    summary: null,
    queue_position: 0,
    created_at: "2026-10-26T10:00:00Z",
    started_at: null,
    finished_at: null,
    ...extra,
  };
}

const REVIEW: Review = {
  version: 1,
  tables: [
    { target: "punches", group: "punches", sources: ["החתמות"], rows: 1200, mapped: 5, total: 7 },
  ],
  groups: { present: ["punches"], missing: ["shifts"], core: ["punches"] },
  ignored: { עובדים: ["שם עובד", "ת.ז."] },
  columns: [
    {
      table: "punches",
      column: "punched_at",
      reason: "uncertain",
      required: true,
      kind: "datetime",
      current: "תאריך",
      time_column: "שעה",
      origin: "heuristic",
      options: [
        { name: "תאריך", kind: "date" },
        { name: "מועד", kind: "datetime" },
      ],
    },
  ],
  values: [
    {
      table: "punches",
      column: "method",
      allowed: ["app", "nfc", "biometric", "web"],
      spellings: [{ spelling: "שעון חכם", value: null }],
    },
  ],
  notes: ["LLM mapping unavailable"],
  blocking: [],
};

beforeEach(() => {
  POLL.ms = 10;
});
afterEach(() => {
  POLL.ms = 2000;
});

describe("the review", () => {
  it("shows what was understood, fixes a flagged column and approves", async () => {
    let status: Ingestion["status"] = "proposed";
    const calls = serve({
      "GET /api/me": { body: ACTIVE },
      "GET /api/ingestions/ing1": () => ({
        body: ingestion(status, status === "applied" ? { run_id: "run1" } : {}),
      }),
      "GET /api/ingestions/ing1/review": { body: REVIEW },
      "PUT /api/ingestions/ing1/mapping": {
        body: { ...REVIEW, columns: [{ ...REVIEW.columns[0], current: "מועד", origin: "user" }] },
      },
      "POST /api/ingestions/ing1/approve": () => {
        status = "applied";
        return { body: ingestion("applying") };
      },
      "GET /api/runs/run1": {
        body: run("running", { stage: "run_analyst_stage", stages_done: 1 }),
      },
    });
    renderAt("/ingestions/ing1");
    expect(await screen.findByText(he("review.title"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(he("review.ignored")) }));
    expect(await screen.findByText("שם עובד, ת.ז.", { exact: false })).toBeVisible();
    expect(screen.getByText(`${he("review.missing")}: משמרות`)).toBeInTheDocument();
    const select = screen
      .getAllByLabelText("זמן ההחתמה")
      .find((el) => el.tagName === "INPUT" && el.getAttribute("type") !== "hidden")!;
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole("option", { name: "מועד" }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === "PUT /api/ingestions/ing1/mapping")?.body).toEqual({
        columns: [{ table: "punches", column: "punched_at", source: "מועד" }],
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: he("review.approve") }));
    expect(await screen.findByText(he("run.title"))).toBeInTheDocument();
    expect(
      screen.getByText(
        he("run.stage", { done: "2", total: "8", stage: "מנקים ומסכמים את הנתונים" }),
      ),
    ).toBeInTheDocument();
  });

  it("does not approve while a required column has no source", async () => {
    serve({
      "GET /api/me": { body: ACTIVE },
      "GET /api/ingestions/ing1": { body: ingestion("proposed") },
      "GET /api/ingestions/ing1/review": {
        body: { ...REVIEW, blocking: [{ table: "punches", column: "punched_at" }] },
      },
    });
    renderAt("/ingestions/ing1");
    expect(
      await screen.findByText(he("review.blocking", { columns: "החתמות · זמן ההחתמה" })),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: he("review.approve") })).toBeDisabled();
  });
});

describe("progress and failures", () => {
  it("shows a refused export in the page's language", async () => {
    const error = { code: "core_groups_missing", params: { groups: ["payroll"] } };
    serve({
      "GET /api/me": { body: ACTIVE },
      "GET /api/ingestions/ing1": { body: ingestion("failed", { error }) },
    });
    renderAt("/ingestions/ing1");
    expect(
      await screen.findByText(he("error.core_groups_missing", { groups: "שכר והפקות" })),
    ).toBeInTheDocument();
    expect(problemText(error, "en")).toBe(en("error.core_groups_missing", { groups: "Payroll" }));
    expect(problemText({ code: "never_heard_of", params: {} }, "en")).toBe(en("error.internal"));
  });

  it("shows a finished run's summary, and a failed one can be retried", async () => {
    const summary = { accounts: 80, high: 8, elevated: 4, normal: 68, snapshot_date: "2025-09-01" };
    serve({
      "GET /api/me": { body: ACTIVE },
      "GET /api/runs/run1": { body: run("succeeded", { summary, stages_done: 8 }) },
      "GET /api/runs/run2": {
        body: run("failed", {
          id: "run2",
          error: { code: "pipeline_failed", params: { stage: "gate_contract" } },
        }),
      },
      "POST /api/runs/run2/retry": { status: 201, body: run("queued", { id: "run3" }) },
      "GET /api/runs/run3": { body: run("queued", { id: "run3", queue_position: 2 }) },
    });
    const view = renderAt("/runs/run1");
    expect(await screen.findByText(he("run.done"))).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
    view.unmount();
    renderAt("/runs/run2");
    expect(
      await screen.findByText(he("error.pipeline_failed", { stage: "בדיקת איכות הנתונים" })),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: he("common.retry") }));
    expect(await screen.findByText(he("queue.waiting", { count: "2" }))).toBeInTheDocument();
  });
});

describe("upload and the demo", () => {
  it("sends the zip itself with progress, then follows the upload", async () => {
    const sent: { url: string; body: unknown; type: string | null }[] = [];
    class FakeXhr {
      upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
      status = 0;
      responseText = "";
      statusText = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      private url = "";
      private type: string | null = null;
      open(_method: string, url: string) {
        this.url = url;
      }
      setRequestHeader(name: string, value: string) {
        if (name === "Content-Type") this.type = value;
      }
      send(body: unknown) {
        sent.push({ url: this.url, body, type: this.type });
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
        this.status = 201;
        this.responseText = JSON.stringify(ingestion("proposing"));
        setTimeout(() => this.onload?.(), 0);
      }
      abort() {
        this.onabort?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    serve({
      "GET /api/me": { body: ACTIVE },
      "GET /api/ingestions/ing1": { body: ingestion("proposing", { queue_position: 1 }) },
    });
    renderAt("/upload");
    const file = new File(["PK.."], "export.zip", { type: "application/zip" });
    await userEvent.upload(await screen.findByLabelText(he("upload.choose")), file);
    await userEvent.click(screen.getByRole("button", { name: he("upload.send") }));
    expect(await screen.findByText(he("ingestion.reading"))).toBeInTheDocument();
    expect(sent[0].url).toBe("/api/ingestions?filename=export.zip&language=he");
    expect(sent[0].body).toBe(file);
    expect(sent[0].type).toBe("application/zip");
  });

  it("refuses anything but a zip before sending it", async () => {
    serve({ "GET /api/me": { body: ACTIVE } });
    renderAt("/upload");
    const pdf = new File(["%PDF"], "report.pdf", { type: "application/pdf" });
    await userEvent.upload(await screen.findByLabelText(he("upload.choose")), pdf, {
      applyAccept: false,
    });
    expect(screen.getByText(he("upload.notZip"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: he("upload.send") })).toBeDisabled();
  });

  it("starts the demo in the page's language", async () => {
    const calls = serve({
      "GET /api/me": { body: ACTIVE },
      "GET /api/company": {
        body: {
          ...ACTIVE.company,
          has_model: false,
          has_real_data: false,
          current: null,
          latest_run: null,
        },
      },
      "POST /api/demo": { status: 201, body: ingestion("proposing", { demo: true }) },
      "GET /api/ingestions/ing1": { body: ingestion("proposing", { demo: true }) },
    });
    renderAt("/", "en");
    const card = (await screen.findAllByText(en("home.demoHint")))[0].closest("div")!;
    expect(card).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: en("home.demo") })[0]);
    expect(await screen.findByText(en("ingestion.reading"))).toBeInTheDocument();
    expect(calls.find((c) => c.key === "POST /api/demo")?.body).toEqual({ language: "en" });
    within(document.body);
  });
});
