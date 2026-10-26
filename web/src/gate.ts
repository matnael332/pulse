// Who may be where. A visitor sees the landing page (at / and at /login, where a failed sign-in
// comes back); a signed-in user has one page per state, and an active company moves between its own.
import { matchPath } from "react-router";

import type { Me, State } from "./api";

export const PAGE_OF: Record<State, string> = {
  operator: "/operator",
  needs_company: "/welcome",
  pending: "/status",
  rejected: "/status",
  suspended: "/status",
  active: "/",
};
const LANDING = ["/", "/login"];
const ACTIVE_PAGES = ["/", "/upload", "/ingestions/:id", "/runs/:id"];

/** Where someone belongs when the path they asked for is not theirs. */
export function home(me: Me | null): string {
  return me ? PAGE_OF[me.state] : "/";
}

export function allowed(me: Me | null, path: string): boolean {
  if (!me) return LANDING.includes(path);
  if (me.state === "active") return ACTIVE_PAGES.some((pattern) => matchPath(pattern, path));
  return path === PAGE_OF[me.state];
}
