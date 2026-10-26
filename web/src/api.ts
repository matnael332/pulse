// The server's JSON API (everything under /api), same origin, session cookie included.
import type { Lang } from "./i18n";

export type CompanyStatus = "pending" | "active" | "rejected" | "suspended";
export type State = "operator" | "needs_company" | CompanyStatus;

export interface Company {
  id: number;
  name: string;
  slug: string | null;
  status: CompanyStatus;
  created_at: string;
  decided_at: string | null;
  note: string | null;
}

export interface Me {
  user: { email: string; name: string | null; provider: string; email_verified: boolean };
  is_operator: boolean;
  company: Company | null;
  state: State;
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

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw toError(response.status, data, response.statusText);
  return data as T;
}

/** The upload, with progress (fetch cannot report it): the zip itself is the request body. */
export function uploadExport(file: File, language: Lang, onProgress: (fraction: number) => void) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Ingestion>((resolve, reject) => {
    const query = `filename=${encodeURIComponent(file.name)}&language=${language}`;
    xhr.open("POST", `/api/ingestions?${query}`);
    xhr.setRequestHeader("Content-Type", "application/zip");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let data: { detail?: unknown } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // not JSON: the status says enough
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as unknown as Ingestion);
      else reject(toError(xhr.status, data, xhr.statusText));
    };
    const interrupted = () =>
      reject(new ApiError(0, "upload_interrupted", { code: "upload_interrupted", params: {} }));
    xhr.onerror = interrupted;
    xhr.onabort = interrupted;
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}

export const getMe = () => api<Me>("/me");
export const getProviders = () => api<{ providers: string[] }>("/auth/providers");
export const devLogin = (email: string) =>
  api<void>("/auth/dev-login", { method: "POST", body: { email } });
export const logout = () => api<void>("/auth/logout", { method: "POST" });
export const signupCompany = (name: string) =>
  api<Company>("/signup/company", { method: "POST", body: { name } });
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
