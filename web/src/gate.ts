// Who may be where. A visitor sees the landing page (at / and at /login, where a failed sign-in
// comes back). Every company, whatever its state, has its data page (/data: its name, the wait for
// approval, the upload and the run); an active one also has its dashboard, and / sends it to
// where it stands. The operator has the companies screen. Old addresses move to the new ones.
import { generatePath, matchPath } from "react-router";

import type { Me } from "./api";

const LANDING = ["/", "/login"];
const ACTIVE_PAGES = [
  "/",
  "/data",
  "/data/ingestions/:id",
  "/data/runs/:id",
  "/dashboard",
  "/dashboard/:runId",
];
const MOVED: [from: string, to: string][] = [
  ["/welcome", "/data"],
  ["/status", "/data"],
  ["/upload", "/data"],
  ["/ingestions/:id", "/data/ingestions/:id"],
  ["/runs/:id", "/data/runs/:id"],
];

/** Where someone belongs when the path they asked for is not theirs. */
export function home(me: Me | null): string {
  if (!me) return "/";
  if (me.state === "operator") return "/operator";
  return me.state === "active" ? "/" : "/data";
}

export function allowed(me: Me | null, path: string): boolean {
  if (!me) return LANDING.includes(path);
  if (me.state === "operator") return path === "/operator";
  if (me.state === "active") return ACTIVE_PAGES.some((pattern) => matchPath(pattern, path));
  return path === "/data";
}

/** The new address of a page that moved, or null. */
export function legacy(path: string): string | null {
  for (const [from, to] of MOVED) {
    const match = matchPath(from, path);
    if (match) return generatePath(to, match.params);
  }
  return null;
}
