// The server's JSON API (everything under /api), same origin, session cookie included.
import type { Lang } from "./i18n";

export type CompanyStatus = "pending" | "active" | "rejected" | "suspended";
export type State = "operator" | "needs_company" | CompanyStatus;
export type Currency = "ILS" | "USD" | "EUR";
export const CURRENCIES: Currency[] = ["ILS", "USD", "EUR"];

export interface Company {
  id: number;
  name: string;
  slug: string | null;
  status: CompanyStatus;
  currency: Currency;
  created_at: string;
  decided_at: string | null;
  note: string | null;
}

export interface Me {
  user: { email: string; name: string | null; provider: string; email_verified: boolean };
  is_operator: boolean;
  company: Company | null;
  state: State;
  llm?: boolean; // whether the language model can be asked (a translation)
}

/** A refusal: a stable code and its params (the site words it, see i18n's error.<code>). */
export interface Problem {
  code: string;
  params: Record<string, unknown>;
}

export interface RunSummary {
  accounts: number;
  high: number;
  elevated: number;
  normal: number;
  revenue_at_risk?: number | null; // monthly revenue of the accounts at high risk (null: unknown)
  revenue_total?: number | null;
  snapshot_date: string | null;
}

export interface RunInfo {
  id: string;
  ingestion_id: string;
  demo: boolean;
  status: "queued" | "running" | "succeeded" | "failed";
  language: Lang;
  mode: string | null;
  stage: string | null;
  stages_done: number;
  stages: number;
  error: Problem | null;
  summary: RunSummary | null;
  queue_position: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface MyCompany extends Company {
  has_model: boolean;
  has_real_data: boolean;
  current: { kind: "ingestion" | "run"; id: string; status: string } | null;
  latest_run: RunInfo | null;
}

export interface CompanyRow extends Company {
  user_email: string | null;
}

export type Action = "approve" | "reject" | "suspend" | "reactivate";

export interface Ingestion {
  id: string;
  status: "proposing" | "proposed" | "applying" | "applied" | "failed" | "discarded";
  demo: boolean;
  filename: string;
  size_bytes: number;
  language: Lang;
  mapping_version: number | null;
  auto_approved: boolean;
  error: Problem | null;
  queue_position: number;
  run_id: string | null;
  created_at: string;
}

export interface Review {
  version: number;
  tables: {
    target: string;
    group: string;
    sources: string[];
    rows: number;
    mapped: number;
    total: number;
  }[];
  groups: { present: string[]; missing: string[]; core: string[] };
  ignored: Record<string, string[]>;
  columns: {
    table: string;
    column: string;
    reason: "uncertain" | "missing";
    required: boolean;
    kind: string;
    current: string | null;
    time_column: string | null;
    origin: string | null;
    options: { name: string; kind: string }[];
  }[];
  values: {
    table: string;
    column: string;
    allowed: string[];
    spellings: { spelling: string; value: string | null }[];
  }[];
  notes: string[];
  blocking: { table: string; column: string }[];
}

export interface Fixes {
  columns?: { table: string; column: string; source: string | null }[];
  values?: { table: string; column: string; spelling: string; value: string | null }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly problem: Problem | null = null,
  ) {
    super(detail);
  }
}

function toError(status: number, data: { detail?: unknown }, fallback: string): ApiError {
  const detail = data?.detail;
  if (detail && typeof detail === "object" && "code" in detail) {
    const problem = detail as Problem;
    return new ApiError(status, problem.code, { code: problem.code, params: problem.params ?? {} });
  }
  return new ApiError(status, typeof detail === "string" ? detail : fallback);
}

/** An answer, as the server gives it. */
export interface Answer {
  status: number;
  reason: string;
  data: unknown; // the JSON, or {} when there is none
}

export interface Upload {
  promise: Promise<Answer>;
  abort: () => void;
}

/** How the site reaches its server. The public demo has none: it answers in the browser (demo/). */
export interface Transport {
  send: (method: string, path: string, body?: unknown) => Promise<Answer>;
  upload: (file: File, language: Lang, onProgress: (fraction: number) => void) => Upload;
  text: (path: string) => Promise<Answer>; // `data` is the text itself
  figure: (path: string) => string;
}

const server: Transport = {
  async send(method, path, body) {
    const response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.status === 204 ? undefined : await response.json().catch(() => ({}));
    return { status: response.status, reason: response.statusText, data };
  },

  /** With progress (fetch cannot report it): the zip itself is the request body. */
  upload(file, language, onProgress) {
    const xhr = new XMLHttpRequest();
    const promise = new Promise<Answer>((resolve) => {
      const query = `filename=${encodeURIComponent(file.name)}&language=${language}`;
      xhr.open("POST", `/api/ingestions?${query}`);
      xhr.setRequestHeader("Content-Type", "application/zip");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
      xhr.onload = () => {
        let data: unknown = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // not JSON: the status says enough
        }
        resolve({ status: xhr.status, reason: xhr.statusText, data });
      };
      const interrupted = () =>
        resolve({ status: 0, reason: "", data: { detail: { code: "upload_interrupted" } } });
      xhr.onerror = interrupted;
      xhr.onabort = interrupted;
      xhr.send(file);
    });
    return { promise, abort: () => xhr.abort() };
  },

  async text(path) {
    const response = await fetch(`/api${path}`, { credentials: "same-origin" });
    return {
      status: response.status,
      reason: response.statusText,
      data: response.ok ? await response.text() : undefined,
    };
  },

  figure: (path) => `/api${path}`,
};

let transport = server;

export function setTransport(other: Transport): void {
  transport = other;
}

function settled<T>({ status, reason, data }: Answer): T {
  if (status >= 200 && status < 300) return data as T;
  throw toError(status, (data ?? {}) as { detail?: unknown }, reason);
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  return settled<T>(await transport.send(init.method ?? "GET", path, init.body));
}

export function uploadExport(file: File, language: Lang, onProgress: (fraction: number) => void) {
  const { promise, abort } = transport.upload(file, language, onProgress);
  return { promise: promise.then((answer) => settled<Ingestion>(answer)), abort };
}

export const getMe = () => api<Me>("/me");
export const getProviders = () => api<{ providers: string[] }>("/auth/providers");
export const devLogin = (email: string) =>
  api<void>("/auth/dev-login", { method: "POST", body: { email } });
export const logout = () => api<void>("/auth/logout", { method: "POST" });
export const signupCompany = (name: string, currency: Currency) =>
  api<Company>("/signup/company", { method: "POST", body: { name, currency } });
export const setCurrency = (currency: Currency) =>
  api<Company>("/company/currency", { method: "PUT", body: { currency } });
export const getMyCompany = () => api<MyCompany>("/company");
export const listCompanies = (status: CompanyStatus) =>
  api<{ companies: CompanyRow[] }>(`/admin/companies?status=${status}`);
export const decide = (id: number, action: Action, body: { slug?: string; note?: string }) =>
  api<CompanyRow>(`/admin/companies/${id}/${action}`, { method: "POST", body });

export const tryDemo = (language: Lang) =>
  api<Ingestion>("/demo", { method: "POST", body: { language } });
export const getIngestion = (id: string) => api<Ingestion>(`/ingestions/${id}`);
export const getReview = (id: string) => api<Review>(`/ingestions/${id}/review`);
export const fixMapping = (id: string, fixes: Fixes) =>
  api<Review>(`/ingestions/${id}/mapping`, { method: "PUT", body: fixes });
export const approveIngestion = (id: string) =>
  api<Ingestion>(`/ingestions/${id}/approve`, { method: "POST" });
export const discardIngestion = (id: string) =>
  api<Ingestion>(`/ingestions/${id}/discard`, { method: "POST" });
export const listRuns = () => api<{ runs: RunInfo[] }>("/runs");
export const getRun = (id: string) => api<RunInfo>(`/runs/${id}`);
export const retryRun = (id: string) => api<RunInfo>(`/runs/${id}/retry`, { method: "POST" });

export interface Reason {
  code: string;
  feature: string;
  value: number | string | null; // text for a category (an industry), null when not recorded
  typical: number | string | null;
  contribution: number;
}

export interface ScoredAccount {
  id: string;
  customer_id: string;
  name: string;
  level: "high" | "elevated" | "normal";
  probability: number;
  rank: number;
  mrr?: number | null; // monthly revenue in whole units (null: unknown)
  reasons: Reason[];
}

/** The run another is compared with: the previous month of the same kind (see /changes). */
export interface PreviousRun {
  id: string;
  snapshot_date: string | null;
  finished_at: string | null;
  created_at: string;
  summary: RunSummary | null;
}

export interface Results {
  run: {
    id: string;
    demo: boolean;
    language: Lang;
    mode: string | null;
    finished_at: string | null;
  };
  summary: RunSummary | null;
  previous?: PreviousRun | null;
  currency?: Currency;
  accounts: ScoredAccount[];
  distribution: {
    levels: Record<string, number>;
    histogram: { from: number; to: number; count: number }[];
  };
  trend: { month: string; rate: number | null; rows: number | null }[];
  key_numbers: { label: string; value: number }[];
  insights: {
    headline?: string | null;
    key_findings?: { title: string; evidence: string; business_meaning: string }[] | null;
    recommendations?: string[] | null;
    data_caveats?: string[] | null;
    source?: string | null;
    language?: string | null;
  };
  groups: { present?: string[]; missing?: string[]; core?: string[]; accuracy_cost?: unknown };
  data: {
    snapshot_date?: string | null;
    train_start?: string | null;
    windows?: Record<string, [string, string]> | null;
    cancellations?: { train: number; test: number } | null;
    low_confidence?: boolean | null;
    accounts?: number | null;
  };
}

export interface Advanced {
  selected_model: string | null;
  selection: { rule?: string; selected?: string };
  split: Record<string, { dates?: [string, string]; rows?: number; prevalence?: number }>;
  threshold: number | null;
  candidates: Record<
    string,
    { description: string; test: Record<string, number | null>; cv: Record<string, number> }
  >;
  importance: { feature: string; importance_mean: number; description: string }[];
  figures: string[];
  docs: string[];
}

/** An account that changed since the previous month: its figures now and before. An account no
 * longer in the data has no figures now; one new in the data has none before. */
export interface AccountChange {
  id: string;
  customer_id: string;
  name: string;
  level: ScoredAccount["level"] | null;
  probability: number | null;
  rank: number | null;
  mrr: number | null;
  reasons: Reason[];
  level_before: ScoredAccount["level"] | null;
  probability_before: number | null;
  rank_before: number | null;
  mrr_before: number | null;
}

export type ChangeGroup = "entered_high" | "rose" | "gone";

export type Changes = {
  base: PreviousRun | null;
  counts: Record<ChangeGroup, number>;
} & Record<ChangeGroup, AccountChange[]>;

export const getResults = (id: string) => api<Results>(`/runs/${id}/results`);
export const getChanges = (id: string) => api<Changes>(`/runs/${id}/changes`);
/** One turn of a conversation with the copilot, as sent: accounts named by id only. */
export interface CopilotTurn {
  role: "user" | "model";
  text: string;
}

export interface CopilotAnswer {
  text: string; // markdown; accounts named by id (the browser names them)
  ungrounded: string[]; // numbers in the answer the tools did not return
  tools: string[];
}

/** One question about a run; `message` and `history` with accounts named by id only. */
export const askCopilot = (
  id: string,
  question: {
    message: string;
    history: CopilotTurn[];
    language: Lang;
    glossary: Record<string, string>;
  },
) => api<CopilotAnswer>(`/runs/${id}/copilot`, { method: "POST", body: question });

/** The run's insights in `language`: as written, or translated once by the language model. */
export const translateInsights = (id: string, language: Lang) =>
  api<{ insights: Results["insights"]; translated: boolean }>(`/runs/${id}/insights/translation`, {
    method: "POST",
    body: { language },
  });
export const getAdvanced = (id: string) => api<Advanced>(`/runs/${id}/advanced`);
export const getDoc = async (id: string, name: string) =>
  settled<string>(await transport.text(`/runs/${id}/docs/${name}`));
export const figureUrl = (id: string, name: string) =>
  transport.figure(`/runs/${id}/figures/${name}`);
