import { describe, expect, it } from "vitest";

import { allowed, home, legacy } from "./gate";
import { me } from "./test-utils";

describe("the gate's rules", () => {
  it("shows a visitor the landing page, at / and where a failed sign-in comes back", () => {
    expect(allowed(null, "/")).toBe(true);
    expect(allowed(null, "/login")).toBe(true);
    expect(allowed(null, "/data")).toBe(false);
    expect(home(null)).toBe("/");
  });

  it("gives every company its data page, and an active one its dashboard too", () => {
    expect(home(me("needs_company"))).toBe("/data");
    expect(home(me("pending"))).toBe("/data");
    expect(home(me("active"))).toBe("/");
    expect(home(me("operator"))).toBe("/operator");
    expect(allowed(me("pending"), "/data")).toBe(true);
    expect(allowed(me("pending"), "/dashboard")).toBe(false);
    expect(allowed(me("active"), "/data/runs/r1")).toBe(true);
    expect(allowed(me("active"), "/dashboard/r1")).toBe(true);
    expect(allowed(me("active"), "/login")).toBe(false);
    expect(allowed(me("operator"), "/data")).toBe(false);
  });

  it("moves the old addresses to the new ones", () => {
    expect(legacy("/welcome")).toBe("/data");
    expect(legacy("/upload")).toBe("/data");
    expect(legacy("/ingestions/ing1")).toBe("/data/ingestions/ing1");
    expect(legacy("/runs/r1")).toBe("/data/runs/r1");
    expect(legacy("/data")).toBeNull();
  });
});
