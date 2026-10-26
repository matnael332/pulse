import { describe, expect, it } from "vitest";

import { geometry, satellitesFor } from "./Orbit";
import { createOrbit, place, step, still } from "./sky";

const G = { cx: 500, cy: 400, radius: 300 };

function run(seconds: number, seed = 7, count = 40) {
  const orbit = createOrbit(count, seed);
  for (let t = 0; t < seconds; t += 1 / 30) step(orbit, 1 / 30);
  return orbit;
}

describe("customers in orbit", () => {
  it("draws the same sky from the same seed", () => {
    const a = run(20).satellites.map((s) => place(s, G));
    const b = run(20).satellites.map((s) => place(s, G));
    expect(a).toEqual(b);
    expect(run(20, 8).satellites.map((s) => place(s, G))).not.toEqual(a);
  });

  it("keeps the count: one leaves, turns red, and a new one takes its place", () => {
    const orbit = createOrbit(40);
    const first = orbit.satellites.map((s) => s);
    let reddest = 0;
    for (let t = 0; t < 60; t += 1 / 30) {
      step(orbit, 1 / 30);
      expect(orbit.satellites).toHaveLength(40);
      reddest = Math.max(reddest, ...orbit.satellites.map((s) => place(s, G).red));
    }
    expect(reddest).toBe(1);
    expect(orbit.satellites.some((s, i) => s !== first[i])).toBe(true); // replaced, not reused
  });

  it("clamps a long pause, so a tab that comes back does not jump", () => {
    const orbit = createOrbit(10);
    const before = orbit.satellites[0].angle;
    step(orbit, 30);
    expect(Math.abs(orbit.satellites[0].angle - before)).toBeLessThan(0.02);
  });

  it("holds one red satellite halfway out on a still page", () => {
    const reds = still(30).satellites.filter((s) => place(s, G).red === 1);
    expect(reds).toHaveLength(1);
  });

  it("sits opposite the text and scales with the screen", () => {
    expect(geometry(1440, 900, true).cx).toBeLessThan(720); // Hebrew: text right, sky left
    expect(geometry(1440, 900, false).cx).toBeGreaterThan(720);
    expect(geometry(390, 844, true).cx).toBe(195); // a phone: centred, low
    expect(satellitesFor(390, 844)).toBe(24);
    expect(satellitesFor(2560, 1440)).toBe(90);
  });
});
