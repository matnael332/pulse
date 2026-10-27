// The sky: customers in orbit. Points of light circle a centre on tilted ellipses. On the landing
// page, every few seconds one drifts off its orbit, turns red and leaves, and a new one fades in, so
// the count stays the same. A result's sky is different: one point per scored account, the ones at
// high risk red on the outer ring, and nobody leaves. Pure: the canvas (Orbit.tsx) only draws what
// this computes, and the tests drive it with a seed.

export const RINGS = 4;
const RED_AFTER = 1.6; // seconds of drift to turn fully red
const FADE_AFTER = 2.2; // seconds of drift before it fades out
export const TILT = -0.32; // radians

export interface Satellite {
  ring: number;
  angle: number;
  speed: number; // radians a second, the sign is the direction
  size: number; // px
  drifting: boolean;
  t: number; // seconds since it started to drift
  out: number; // how far it has drifted, in ring widths
  alpha: number;
  risk: boolean; // an account at high risk: red, on the outer ring
}

export interface Orbit {
  satellites: Satellite[];
  nextDrift: number; // seconds until the next one leaves
  random: () => number;
  leaving: boolean; // whether satellites drift off (the landing) or keep their orbits (a result)
}

export interface SkyOptions {
  risk?: number; // satellites at high risk
  leaving?: boolean;
}

export interface Geometry {
  cx: number;
  cy: number;
  radius: number;
}

export interface Placed {
  x: number;
  y: number;
  r: number;
  alpha: number;
  red: number; // 0 white .. 1 the signal red
}

/** A small seeded generator (mulberry32), so a seed always draws the same sky. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function satellite(random: () => number, visible: boolean, risk = false): Satellite {
  const ring = risk ? RINGS - 1 : Math.floor(random() * RINGS);
  const direction = ring % 2 ? 1 : -1;
  return {
    ring,
    angle: random() * Math.PI * 2,
    speed: (0.05 + random() * 0.08) * direction * (1.4 - ring * 0.18),
    size: 1.2 + random() * 1.8,
    drifting: false,
    t: 0,
    out: 0,
    alpha: visible ? 1 : 0,
    risk,
  };
}

export function createOrbit(count: number, seed = 7, options: SkyOptions = {}): Orbit {
  const random = seeded(seed);
  const risk = Math.min(options.risk ?? 0, count);
  const satellites = Array.from({ length: count }, (_, i) => satellite(random, true, i < risk));
  return { satellites, nextDrift: 1.5, random, leaving: options.leaving ?? true };
}

/** Advance by dt seconds (clamped, so a tab that comes back does not jump). */
export function step(orbit: Orbit, dt: number): void {
  const d = Math.min(Math.max(dt, 0), 0.05);
  orbit.nextDrift -= d;
  if (orbit.leaving && orbit.nextDrift <= 0) {
    const leaving = orbit.satellites.find((s) => !s.drifting && !s.risk && s.alpha === 1);
    if (leaving) leaving.drifting = true;
    orbit.nextDrift = 4 + orbit.random() * 3;
  }
  orbit.satellites.forEach((s, i) => {
    s.angle += s.speed * d;
    if (!s.drifting) {
      s.alpha = Math.min(1, s.alpha + d * 0.6);
      return;
    }
    s.t += d;
    s.out += s.t * s.t * 0.06;
    if (s.t > FADE_AFTER) s.alpha -= d * 0.7;
    if (s.alpha <= 0) orbit.satellites[i] = satellite(orbit.random, false);
  });
}

/** One frame for a still page (reduced motion): one satellite caught halfway out, in red. */
export function still(count: number, seed = 7): Orbit {
  const orbit = createOrbit(count, seed);
  const leaving = orbit.satellites[0];
  Object.assign(leaving, { drifting: true, t: RED_AFTER, out: 0.9 });
  return orbit;
}

/** The radii of a ring, before the tilt. */
export function ellipse(ring: number, out: number, radius: number): { rx: number; ry: number } {
  const rx = radius * (0.75 + ring * 0.28) + out * radius * 0.5;
  return { rx, ry: rx * 0.34 };
}

export function place(s: Satellite, g: Geometry): Placed {
  const { rx, ry } = ellipse(s.ring, s.out, g.radius);
  const x0 = Math.cos(s.angle) * rx;
  const y0 = Math.sin(s.angle) * ry;
  const red = s.risk ? 1 : s.drifting ? Math.min(1, s.t / RED_AFTER) : 0;
  return {
    x: g.cx + x0 * Math.cos(TILT) - y0 * Math.sin(TILT),
    y: g.cy + x0 * Math.sin(TILT) + y0 * Math.cos(TILT),
    r: s.size + red * 1.6,
    alpha: Math.max(0, s.alpha) * (0.55 + 0.45 * (s.size / 3)),
    red,
  };
}
