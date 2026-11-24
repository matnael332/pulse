// The public demo: the site itself on a "server" in the tab, with the engine (Python in a worker)
// played by a fake one. The module patches the site (transport, slots, strings), so it has a file of
// its own.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setTransport, type Review, type RunSummary } from "./api";
import { parts } from "./demo/parts";
import { DemoServer, type Options } from "./demo/server";
import type { Engine, Listener } from "./demo/engine";
import { SAID, WORDS } from "./demo/words";
import { DICTIONARIES, translate } from "./i18n";
import { STAGES } from "./labels";
import { POLL } from "./poll";
import { slots } from "./slots";
import { he, renderAt } from "./test-utils";

vi.setConfig({ testTimeout: 30_000 }); // each walks through several pages, some of them lazy

const LAZY = { timeout: 10_000 };
const REVIEW: Review = {
  version: 1,
  tables: [
    { target: "accounts", group: "commercial", sources: ["לקוחות"], rows: 80, mapped: 8, total: 8 },
  ],
  groups: { present: ["commercial"], missing: ["hours"], core: ["commercial"] },
  ignored: { עובדים: ["שם עובד"] },
  columns: [],
  values: [],
  notes: [],
  blocking: [],
};
const SUMMARY: RunSummary = {
  accounts: 1,
  high: 1,
  elevated: 0,
  normal: 0,
  revenue_at_risk: 72,
  revenue_total: 72,
  snapshot_date: "2025-09-01",
};
const DONE = {
  ok: true,
  summary: SUMMARY,
  results: {
    summary: SUMMARY,
    accounts: [
      {
        id: "acc_000001",
        customer_id: "10001",
        name: "מאפיית הנגב",
        level: "high",
        probability: 0.85,
        rank: 1,
        mrr: 72,
        reasons: [],
      },
    ],
    distribution: { levels: { high: 1 }, histogram: [] },
    trend: [{ month: "2025-06", rate: 0.09, rows: 40 }],
    key_numbers: [],
    insights: { source: "template" },
    groups: { missing: ["hours"] },
    data: { cancellations: { train: 15, test: 20 } },
  },
  advanced: {
    selected_model: null,
    selection: {},
    split: {},
    threshold: null,
    candidates: {},
    importance: [],
    figures: [],
    docs: ["model_card"],
  },
  docs: { model_card: "# Card of this run" },
};

interface Fake {
  propose?: unknown;
  apply?: unknown;
  run?: unknown;
}

let engines: { calls: string[]; stopped: boolean; listener: Listener }[] = [];

function engineOf(fake: Fake): Options["engine"] {
  return (listener) => {
    const record = { calls: [] as string[], stopped: false, listener };
    engines.push(record);
    const answer = (value: unknown) => {
      if (value instanceof Error) throw value;
      return value;
    };
    const engine: Engine = {
      put: async () => undefined,
      call: async <T,>(method: string) => {
        record.calls.push(method);
        if (method === "propose") {
          listener.onTell("propose", {
            files: 31,
            rows: 167119,
            tables: 11,
            groups: 8,
            left_out: 4,
          });
          return answer(fake.propose ?? { ok: true, version: 1, review: REVIEW }) as T;
        }
        if (method === "approve") return { ok: true } as T;
        if (method === "apply") {
          listener.onTell("apply", { accounts: 80, train: 15, test: 20 });
          return answer(fake.apply ?? { ok: true }) as T;
        }
        for (const stage of STAGES) listener.onTell(stage, {});
        return answer(fake.run ?? DONE) as T;
      },
      stop: () => {
        record.stopped = true;
      },
    };
    return engine;
  };
}

function open(fake: Fake = {}, able = true, path = "/") {
  const demo = new DemoServer({
    engine: engineOf(fake),
    base: "/pulse/",
    able,
    company: (lang) => WORDS[lang].company,
  });
  Object.assign(DICTIONARIES.he, SAID.he);
  Object.assign(DICTIONARIES.en, SAID.en);
  Object.assign(slots, parts(demo));
  setTransport(demo);
  return renderAt(path);
}

async function enter() {
  await userEvent.click((await screen.findAllByRole("button", { name: WORDS.he.enter }, LAZY))[0]);
  await screen.findByRole("heading", { name: WORDS.he.guideTitle }, LAZY);
}

async function upload(name = "export.zip") {
  const file = new File(["zip"], name, { type: "application/zip" });
  file.arrayBuffer = async () => new ArrayBuffer(3); // jsdom's File has none
  await userEvent.upload(screen.getByLabelText(he("upload.choose")), file);
  await userEvent.click(screen.getByRole("button", { name: he("upload.send") }));
}

beforeEach(() => {
  POLL.ms = 10;
  engines = [];
  sessionStorage.clear();
});
afterEach(() => {
  POLL.ms = 2000;
});

describe("the demo", () => {
  it("opens on the site's own landing page, with its own way in", async () => {
    open();
    expect(await screen.findByRole("heading", { level: 1, name: /מי עומד לעזוב/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: he("login.google") })).not.toBeInTheDocument();
    expect(screen.getAllByText(SAID.he["login.footer"]!).length).toBeGreaterThan(0);
    expect(engines).toHaveLength(0); // nothing is loaded before the visitor asks for it
    await enter();
    expect(engines).toHaveLength(1); // and then at once, while they read
    expect(screen.getByRole("link", { name: WORDS.he.download })).toHaveAttribute(
      "href",
      expect.stringMatching(/sample\/pulse-sample-export\.zip$/),
    );
    expect(screen.getByText(SAID.he["upload.privacy"]!)).toBeVisible();
  });

  it("takes an upload through the review to the dashboard, and says what it did", async () => {
    open();
    await enter();
    await upload();
    const understood = (
      await screen.findByRole("heading", { name: WORDS.he.understood }, LAZY)
    ).closest("section")!;
    expect(within(understood).getByText(/167,119/)).toBeVisible();
    expect(within(understood).getByText(/11 טבלאות זוהו/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: he("review.approve") }));
    expect(await screen.findByRole("table", {}, LAZY)).toBeInTheDocument();
    expect(screen.getAllByText("מאפיית הנגב").length).toBeGreaterThan(0);
    expect(screen.getByText(WORDS.he.noteSky)).toBeVisible();
    expect(engines[0].calls).toEqual(["propose", "approve", "apply", "run"]);
    expect(engines[0].stopped).toBe(true); // its memory goes back
    await userEvent.click(screen.getByRole("button", { name: WORDS.he.hideNotes }));
    expect(screen.queryByText(WORDS.he.noteSky)).not.toBeInTheDocument();
  });

  it("runs the sample without downloading it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new ArrayBuffer(4))),
    );
    open();
    await enter();
    await userEvent.click(screen.getByRole("button", { name: SAID.he["home.demo"]! }));
    expect(await screen.findByRole("button", { name: he("review.approve") }, LAZY)).toBeVisible();
    expect(fetch).toHaveBeenCalledWith("/pulse/sample/pulse-sample-export.zip");
  });

  it("words a file that does not fit, and offers the sample", async () => {
    const refusal = {
      ok: false,
      code: "core_groups_missing",
      params: { groups: ["punches", "usage"], present: ["commercial"] },
    };
    open({ propose: refusal });
    await enter();
    await upload();
    expect(await screen.findByText(/החתמות, שימוש במערכת/, {}, LAZY)).toBeVisible();
    expect(screen.getByText("זוהו: לקוחות וחיוב")).toBeVisible();
    expect(screen.getByText(WORDS.he.failed)).toBeVisible();
    expect(screen.getByRole("link", { name: WORDS.he.download })).toBeInTheDocument();
  });

  it("says so when the browser runs out of memory, and when a gate stops the run", async () => {
    open({ propose: new Error("RangeError: WebAssembly.Memory allocation failed") });
    await enter();
    await upload();
    expect(await screen.findByText(SAID.he["error.out_of_memory"]!, {}, LAZY)).toBeVisible();
    expect(engines[0].stopped).toBe(true);
  });

  it("words a gate that stopped the run", async () => {
    open({ run: { ok: false, code: "pipeline_failed", params: { stage: "gate_contract" } } });
    await enter();
    await upload();
    await userEvent.click(await screen.findByRole("button", { name: he("review.approve") }, LAZY));
    expect(await screen.findByText(/בדיקת איכות הנתונים/, {}, LAZY)).toBeVisible();
  });

  it("refuses a file too large for a browser", async () => {
    open();
    await enter();
    const file = new File(["zip"], "big.zip", { type: "application/zip" });
    Object.defineProperty(file, "size", { value: 61 * (1 << 20) });
    await userEvent.upload(screen.getByLabelText(he("upload.choose")), file);
    await userEvent.click(screen.getByRole("button", { name: he("upload.send") }));
    expect(
      await screen.findByText(he("error.upload_too_large", { max_mb: "60" }), {}, LAZY),
    ).toBeVisible();
  });

  it("keeps a finished run over a reload, in this tab only", async () => {
    const first = open();
    await enter();
    await upload();
    await userEvent.click(await screen.findByRole("button", { name: he("review.approve") }, LAZY));
    await screen.findByRole("table", {}, LAZY);
    first.unmount();
    open({}, true, "/dashboard");
    expect((await screen.findAllByText("מאפיית הנגב", {}, LAZY)).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("link", { name: he("results.advanced") }));
    expect(await screen.findByText("Card of this run", {}, LAZY)).toBeInTheDocument();
  });

  it("shows a phone the sample's ready results, and says that is what they are", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(DONE))),
    );
    open({}, false);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: WORDS.he.enter }, LAZY))[0],
    );
    await userEvent.click(await screen.findByRole("button", { name: WORDS.he.ready }, LAZY));
    expect(await screen.findByRole("table", {}, LAZY)).toBeInTheDocument();
    expect(screen.getByText(WORDS.he.bannerReady)).toBeVisible();
    expect(engines).toHaveLength(0); // Python is never loaded there
  });

  it("starts over when it is left", async () => {
    open();
    await enter();
    await userEvent.click(screen.getByRole("button", { name: "demo" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: he("common.signOut") }));
    expect(await screen.findByRole("heading", { level: 1, name: /מי עומד לעזוב/ })).toBeVisible();
    expect(engines[0].stopped).toBe(true);
  });

  it("says everything in both languages, over strings the site really has", async () => {
    expect(Object.keys(WORDS.en)).toEqual(Object.keys(WORDS.he));
    expect(Object.keys(SAID.en)).toEqual(Object.keys(SAID.he));
    for (const key of Object.keys(SAID.he)) {
      expect(translate("he", key as never)).toBe(SAID.he[key as keyof typeof SAID.he]);
    }
    await waitFor(() => expect(DemoServer.lost("/data/runs/x")).toBe(true));
    expect(DemoServer.lost("/dashboard/x") || DemoServer.lost("/data")).toBe(false);
  });
});
