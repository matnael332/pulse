import { describe, expect, it } from "vitest";

import { band, beside, geometry, resultGeometry, satellitesFor } from "./Orbit";
import { createOrbit, pin, place, step } from "./sky";

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

  it("lets only one the visitor can see leave", () => {
    const orbit = createOrbit(40);
    for (let t = 0; t < 30; t += 1 / 30) step(orbit, 1 / 30, () => false);
    expect(orbit.satellites.some((s) => s.drifting)).toBe(false);
    const ninth = orbit.satellites[9];
    for (let t = 0; t < 8; t += 1 / 30) step(orbit, 1 / 30, (s) => s === ninth);
    expect(ninth.drifting).toBe(true);
  });

  it("keeps the named points in their spots, red, whoever else circles or leaves", () => {
    const orbit = createOrbit(40, 7, { risk: 2 });
    const spots = beside(true).slice(0, 2);
    pin(orbit, spots);
    for (let t = 0; t < 60; t += 1 / 30) step(orbit, 1 / 30);
    spots.forEach((spot, i) => {
      const s = orbit.satellites[i];
      expect(s.ring).toBe(spot.ring);
      expect(Math.abs(s.angle - spot.angle)).toBeLessThan(0.05);
      expect(place(s, G).red).toBe(1);
    });
    expect(orbit.satellites[2].home).toBeNull(); // not at risk: no spot, no name
    pin(orbit, beside(true)); // more spots than points at risk: the third stays empty
    expect(orbit.satellites.filter((s) => s.home !== null)).toHaveLength(2);
  });

  it("names customers on the side of the sky that faces the text, and inside it", () => {
    for (const rtl of [true, false]) {
      const g = geometry(1440, 900, rtl);
      const orbit = createOrbit(40, 7, { risk: 2 });
      pin(orbit, g.spots!);
      for (const s of orbit.satellites.slice(0, 2)) {
        const p = place(s, g);
        expect(g.clear!(p.x, p.y) || Math.abs(p.x - 720) < 72).toBe(true);
        expect(p.y > 80 && p.y < 820).toBe(true);
      }
    }
    expect(geometry(390, 844, true).spots).toBeUndefined(); // a phone's hero has no room
    expect(resultGeometry(588, 500, true).spots).toHaveLength(2);
    expect(resultGeometry(318, 216, true)).toEqual(band(318, 216));
  });

  it("sits opposite the text and scales with the screen", () => {
    expect(geometry(1440, 900, true).cx).toBeLessThan(720); // Hebrew: text right, sky left
    expect(geometry(1440, 900, false).cx).toBeGreaterThan(720);
    expect(geometry(390, 844, true).cx).toBe(195); // a phone: centred, low
    expect(satellitesFor(390, 844)).toBe(24);
    expect(satellitesFor(2560, 1440)).toBe(90);
  });

  it("draws a result as it is: one point per account, the ones at risk red, nobody leaves", () => {
    const orbit = createOrbit(39, 7, { risk: 2, leaving: false });
    const first = [...orbit.satellites];
    for (let t = 0; t < 30; t += 1 / 30) step(orbit, 1 / 30);
    expect(orbit.satellites).toEqual(first); // the same satellites, none replaced
    expect(orbit.satellites.every((s) => !s.drifting)).toBe(true);
    expect(orbit.satellites.filter((s) => place(s, G).red === 1)).toHaveLength(2);
  });
});
