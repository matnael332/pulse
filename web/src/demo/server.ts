// The demo's "server": the same addresses and answers as the real one (api.ts), from what is held in
// this tab. The work itself is the product's Python, in the engine. Finished runs are kept in the
// tab's own session storage, so a reload still shows them; closing the tab forgets everything.
import type {
  Advanced,
  Answer,
  Changes,
  Company,
  Ingestion,
  Problem,
  Results,
  Review,
  RunInfo,
  RunSummary,
  Transport,
} from "../api";
import type { Lang } from "../i18n";
import { STAGES } from "../labels";
import type { Engine, Facts, Listener, Loading, Refusal } from "./engine";

const MAX_MB = 60;
const KEY = "pulse.demo";
const SAMPLE = "pulse-sample-export.zip";

/** What the page shows while the engine works. */
export interface Progress {
  loading: Loading | null;
  facts: Partial<Record<string, Facts>>; // by stage, this upload's
}

type Done = {
  ok: true;
  summary: RunSummary;
  results: Omit<Results, "run" | "previous" | "currency">;
  advanced: Advanced;
  docs: Record<string, string>;
};
type Proposed = { ok: true; version: number; review: Review };
type Reviewed = { ok: true; review: Review };

interface Saved {
  started: boolean;
  currency: Company["currency"];
  runs: { info: RunInfo; done: Done }[];
}

export interface Options {
  engine: (listener: Listener) => Engine;
  base: string; // where the demo's files are
  able: boolean; // whether this device can run it (a phone gets the sample's results)
  company: (lang: Lang) => string;
}

const ok = (data: unknown = {}): Answer => ({ status: 200, reason: "", data });
const refused = (status: number, code: string, params: Record<string, unknown> = {}): Answer => ({
  status,
  reason: "",
  data: { detail: { code, params } },
});
const problemOf = ({ code, params }: Refusal): Problem => ({ code, params });
const newId = () => crypto.randomUUID().slice(0, 8);
const now = () => new Date().toISOString();

export class DemoServer implements Transport {
  private saved: Saved;
  private ingestion: Ingestion | null = null;
  private review: Review | null = null;
  private running: RunInfo | null = null;
  private engine: Engine | null = null;
  private listeners = new Set<() => void>();
  progress: Progress = { loading: null, facts: {} };

  constructor(private readonly options: Options) {
    this.saved = { started: false, currency: "ILS", runs: [] };
    try {
      const kept = sessionStorage.getItem(KEY);
      if (kept) this.saved = JSON.parse(kept) as Saved;
    } catch {
      // no storage: a reload starts over
    }
  }

  // ------------------------------------------------------------------ what the page watches
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.progress;

  private show(change: Partial<Progress>) {
    this.progress = { ...this.progress, ...change };
    this.listeners.forEach((listener) => listener());
  }

  get able() {
    return this.options.able;
  }

  // ------------------------------------------------------------------ the visitor
  start() {
    this.saved.started = true;
    this.keep();
    this.warm();
  }

  /** Load Python while the visitor reads the page. */
  warm() {
    if (this.able && this.saved.started && !this.engine) this.engine = this.newEngine();
  }

  /** The paths of a step whose work is gone (a reload in the middle): the data page instead. */
  static lost(path: string): boolean {
    return path.startsWith("/data/");
  }

  private newEngine() {
    return this.options.engine({
      onLoading: (loading) => this.show({ loading }),
      onTell: (stage, facts) => {
        this.show({ facts: { ...this.progress.facts, [stage]: facts } });
        if (this.running && stage !== "propose" && stage !== "apply") {
          const at = (STAGES as readonly string[]).indexOf(stage);
          this.running = { ...this.running, stage, stages_done: Math.max(at, 0) };
        }
      },
    });
  }

  private endEngine() {
    this.engine?.stop();
    this.engine = null;
  }

  private keep() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(this.saved));
    } catch {
      // too large or not allowed: a reload starts over
    }
  }

  private company(): Company {
    const lang = document.documentElement.lang === "en" ? "en" : "he";
    return {
      id: 1,
      name: this.options.company(lang),
      slug: "demo",
      status: "active",
      currency: this.saved.currency,
      created_at: now(),
      decided_at: null,
      note: null,
    };
  }

  // ------------------------------------------------------------------ an upload's way
  private begin(filename: string, size: number, language: Lang, demo: boolean): Ingestion {
    this.review = null;
    this.running = null;
    this.show({ facts: {} });
    this.ingestion = {
      id: newId(),
      status: "proposing",
      demo,
      filename,
      size_bytes: size,
      language,
      mapping_version: null,
      auto_approved: false,
      error: null,
      queue_position: 0,
      run_id: null,
      created_at: now(),
    };
    return this.ingestion;
  }

  private change(id: string, update: Partial<Ingestion>) {
    if (this.ingestion?.id === id) this.ingestion = { ...this.ingestion, ...update };
  }

  private async read(id: string, file: ArrayBuffer) {
    try {
      this.engine ??= this.newEngine();
      await this.engine.put(file);
      const answer = await this.engine.call<Proposed | Refusal>("propose");
      if (!answer.ok) {
        const { present } = answer.params; // what was recognised, though it was not enough
        if (Array.isArray(present) && present.length) {
          this.show({ facts: { refused: { present: present.join(",") } } });
        }
        return this.change(id, { status: "failed", error: problemOf(answer) });
      }
      if (this.ingestion?.id === id) this.review = answer.review;
      this.change(id, { status: "proposed", mapping_version: answer.version });
    } catch (error) {
      this.broke(id, error);
    }
  }

  private async prepare(id: string) {
    try {
      const answer = await this.engine!.call<{ ok: true } | Refusal>("apply");
      if (!answer.ok) return this.change(id, { status: "failed", error: problemOf(answer) });
      this.running = this.newRun(id);
      this.change(id, { status: "applied", run_id: this.running.id });
      void this.model(this.running.id);
    } catch (error) {
      this.broke(id, error);
    }
  }

  private async model(runId: string) {
    try {
      const answer = await this.engine!.call<Done | Refusal>("run");
      if (this.running?.id !== runId) return;
      this.endEngine();
      if (answer.ok) this.finish(this.running, answer);
      else this.running = { ...this.running, status: "failed", error: problemOf(answer) };
    } catch (error) {
      if (this.running?.id !== runId) return;
      this.endEngine();
      this.running = { ...this.running, status: "failed", error: worded(error) };
    }
  }

  private broke(id: string, error: unknown) {
    this.endEngine();
    this.change(id, { status: "failed", error: worded(error) });
  }

  private newRun(ingestionId: string): RunInfo {
    return {
      id: newId(),
      ingestion_id: ingestionId,
      demo: this.ingestion?.demo ?? true,
      status: "running",
      language: this.ingestion?.language ?? "he",
      mode: "deterministic",
      stage: null,
      stages_done: 0,
      stages: STAGES.length,
      error: null,
      summary: null,
      queue_position: 0,
      created_at: now(),
      started_at: now(),
      finished_at: null,
    };
  }

  private finish(run: RunInfo, done: Done) {
    const info: RunInfo = {
      ...run,
      status: "succeeded",
      stages_done: STAGES.length,
      summary: done.summary,
      finished_at: now(),
    };
    this.running = info;
    this.saved.runs = [{ info, done }, ...this.saved.runs].slice(0, 4);
    this.keep();
  }

  /** The sample's results as the build computed them: for a device that cannot run it. */
  private async ready(language: Lang): Promise<Answer> {
    const answer = await fetch(`${this.options.base}sample/results.json`);
    if (!answer.ok) return refused(503, "demo_unavailable");
    const done = (await answer.json()) as Done;
    const ingestion = this.begin(SAMPLE, 0, language, true);
    const run = this.newRun(ingestion.id);
    this.finish(run, done);
    this.change(ingestion.id, { status: "applied", run_id: run.id });
    return ok(this.ingestion);
  }

  // ------------------------------------------------------------------ the transport
  figure = (path: string) => path; // the demo draws none, so nothing asks for one

  upload = (file: File, language: Lang, onProgress: (fraction: number) => void) => {
    const work = async (): Promise<Answer> => {
      if (!this.able) return refused(409, "demo_desktop_only");
      if (file.size > MAX_MB * (1 << 20))
        return refused(413, "upload_too_large", { max_mb: MAX_MB });
      const body = await file.arrayBuffer();
      onProgress(1);
      const ingestion = this.begin(file.name, file.size, language, false);
      void this.read(ingestion.id, body);
      return ok(ingestion);
    };
    return { promise: work(), abort: () => undefined };
  };

  async text(path: string): Promise<Answer> {
    const [, , id, , name] = path.split("/");
    const doc = this.saved.runs.find((r) => r.info.id === id)?.done.docs[name];
    return doc === undefined ? refused(404, "not_found") : ok(doc);
  }

  async send(method: string, path: string, body?: unknown): Promise<Answer> {
    const [, area, id, part] = path.split("?")[0].split("/");
    if (area === "auth" && id === "providers") return ok({ providers: [] });
    if (area === "auth" && id === "logout") {
      this.endEngine();
      this.saved = { started: false, currency: "ILS", runs: [] };
      this.ingestion = this.running = this.review = null;
      this.keep();
      return ok();
    }
    if (!this.saved.started) return refused(401, "signed_out");
    switch (`${method} ${area}`) {
      case "GET me":
        return ok({
          user: { email: "demo", name: "Demo", provider: "demo", email_verified: true },
          is_operator: false,
          company: this.company(),
          state: "active",
          llm: false,
        });
      case "GET company":
        return ok(this.home());
      case "PUT company":
        this.saved.currency = (body as { currency: Company["currency"] }).currency;
        this.keep();
        return ok(this.company());
      case "POST demo":
        return this.sample((body as { language: Lang }).language);
      case "GET runs":
        return id ? this.run(id, part) : ok({ runs: this.saved.runs.map((r) => r.info) });
    }
    if (area === "ingestions" && this.ingestion?.id === id) return this.upload_(method, part, body);
    return refused(404, "not_found");
  }

  private home() {
    const i = this.ingestion;
    const current =
      i && ["proposing", "proposed", "applying"].includes(i.status)
        ? { kind: "ingestion" as const, id: i.id, status: i.status }
        : this.running?.status === "running"
          ? { kind: "run" as const, id: this.running.id, status: "running" }
          : null;
    const latest = this.saved.runs[0]?.info ?? null;
    return {
      ...this.company(),
      has_model: Boolean(latest),
      has_real_data: false, // the sample stays on offer
      current,
      latest_run: latest,
    };
  }

  private async sample(language: Lang): Promise<Answer> {
    if (!this.able) return this.ready(language);
    const answer = await fetch(`${this.options.base}sample/${SAMPLE}`);
    if (!answer.ok) return refused(503, "demo_unavailable");
    const file = await answer.arrayBuffer();
    const ingestion = this.begin(SAMPLE, file.byteLength, language, true);
    void this.read(ingestion.id, file);
    return ok(ingestion);
  }

  private async upload_(method: string, part: string | undefined, body: unknown): Promise<Answer> {
    const { id, status } = this.ingestion!;
    if (method === "GET" && !part) return ok(this.ingestion);
    if (status !== "proposed" || !this.engine) return refused(409, "not_reviewable", { status });
    if (method === "GET" && part === "review") return ok(this.review);
    if (method === "PUT" && part === "mapping") {
      const answer = await this.engine.call<Reviewed | Refusal>("fix", [body]);
      if (!answer.ok) return refused(422, answer.code, answer.params);
      this.review = answer.review;
      return ok(this.review);
    }
    if (method === "POST" && part === "approve") {
      const answer = await this.engine.call<{ ok: true } | Refusal>("approve");
      if (!answer.ok) return refused(409, answer.code, answer.params);
      this.change(id, { status: "applying" });
      void this.prepare(id);
      return ok(this.ingestion);
    }
    if (method === "POST" && part === "discard") {
      this.change(id, { status: "discarded" });
      return ok(this.ingestion);
    }
    return refused(404, "not_found");
  }

  private run(id: string, part: string | undefined): Answer {
    if (!part && this.running?.id === id) return ok(this.running);
    const found = this.saved.runs.find((r) => r.info.id === id);
    if (!found) return refused(404, "not_found");
    const { info, done } = found;
    if (!part) return ok(info);
    if (part === "advanced") return ok(done.advanced);
    if (part === "changes") {
      const none: Changes = {
        base: null,
        counts: { entered_high: 0, rose: 0, gone: 0 },
        entered_high: [],
        rose: [],
        gone: [],
      };
      return ok(none);
    }
    if (part === "results") {
      const results: Results = {
        ...done.results,
        run: {
          id: info.id,
          demo: info.demo,
          language: info.language,
          mode: info.mode,
          finished_at: info.finished_at,
        },
        previous: null,
        currency: this.saved.currency,
      };
      return ok(results);
    }
    return refused(404, "not_found");
  }
}

/** The worker's own failure: out of memory when it says so, else something of ours. */
function worded(error: unknown): Problem {
  const memory = /memory|allocation/i.test(String(error));
  return { code: memory ? "out_of_memory" : "internal", params: {} };
}
