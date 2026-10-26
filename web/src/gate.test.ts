import { describe, expect, it } from "vitest";

import { allowed, home } from "./gate";
import { me } from "./test-utils";

describe("the gate's rules", () => {
  it("shows a visitor the landing page, at / and where a failed sign-in comes back", () => {
    expect(allowed(null, "/")).toBe(true);
    expect(allowed(null, "/login")).toBe(true);
    expect(allowed(null, "/upload")).toBe(false);
    expect(home(null)).toBe("/");
  });

  it("gives each signed-in state its page, and an active company its own", () => {
    expect(home(me("needs_company"))).toBe("/welcome");
    expect(home(me("pending"))).toBe("/status");
    expect(home(me("operator"))).toBe("/operator");
    expect(allowed(me("pending"), "/")).toBe(false);
    expect(allowed(me("active"), "/runs/r1")).toBe(true);
    expect(allowed(me("active"), "/login")).toBe(false);
    expect(allowed(me("operator"), "/operator")).toBe(true);
  });
});
