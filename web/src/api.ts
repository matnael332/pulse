// The server's JSON API (everything under /api), same origin, session cookie included.

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

export interface MyCompany extends Company {
  has_model: boolean;
}

export interface CompanyRow extends Company {
  user_email: string | null;
}

export type Action = "approve" | "reject" | "suspend" | "reactivate";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail);
  }
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
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : response.statusText;
    throw new ApiError(response.status, detail);
  }
  return data as T;
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
