// The sky (sky.ts) on a canvas: behind the landing page's first screen, and as a result's picture
// in the app (one point per scored account, the ones at high risk in red). A few of the red points
// carry a customer's name and monthly revenue, written beside the point. About 30 frames a second,
// paused while the tab is hidden or the canvas is off screen; one still frame when the visitor asks
// for reduced motion. Hidden from screen readers: the page says the same in its table and figures.
import { useEffect, useRef } from "react";

import classes from "./Landing.module.css";
import {
  createOrbit,
  ellipse,
  pin,
  place,
  RINGS,
  step,
  TILT,
  type Geometry,
  type Orbit,
  type Spot,
} from "./sky";

const FRAME_MS = 1000 / 30;
const ASIDE = 12; // px from a named point to its name
const EDGE = 24; // px kept between a name and the edge of its sky
const MOST_WIDE = 180; // px, the widest name

/** A customer the sky names. */
export interface Named {
  id: string;
  name: string;
  note: string;
}

/** The planet sits opposite the text: on the left in Hebrew, on the right in English. The names
 * are written towards the planet, away from the text; on a phone there is no room for them. */
export function geometry(width: number, height: number, rtl: boolean): Geometry {
  if (width < 700) {
    return {
      cx: width * 0.5,
      cy: height * 0.86,
      radius: Math.min(width, height) * 0.62,
      clear: (_x, y) => y > height * 0.75,
    };
  }
  const side = rtl ? "left" : "right";
  const facing = (angle: number) => (rtl ? angle : Math.PI - angle);
  return {
    cx: width * (rtl ? 0.16 : 0.84),
    cy: height * 0.55,
    radius: Math.min(width, height) * 0.78,
    spots: [
      { ring: 0, angle: facing(rtl ? -0.6 : -1.1), side },
      { ring: 0, angle: facing(0.9), side },
    ],
    clear: (x) => (rtl ? x < width * 0.45 : x > width * 0.55),
  };
}

/** A result's sky inside a panel: the planet left of centre in Hebrew, right of it in English. */
export function panelGeometry(width: number, height: number, rtl: boolean): Geometry {
  return {
    cx: width * (rtl ? 0.32 : 0.68),
    cy: height * 0.42,
    radius: Math.min(width, height) * 0.5,
  };
}

/** The latest result's panel: the sky between its title and its figures, clear of both. */
export function resultGeometry(width: number, height: number, rtl: boolean): Geometry {
  if (width < 420) return band(width, height);
  return {
    cx: width * (rtl ? 0.4 : 0.6),
    cy: height * 0.44,
    radius: Math.min(width, height) * 0.28,
    spots: beside(rtl).slice(0, 2),
  };
}

/** A phone's sky: a band, with one name above the rings and one below. */
export function band(width: number, height: number): Geometry {
  const ring = RINGS - 1;
  return {
    cx: width * 0.5,
    cy: height * 0.5,
    radius: Math.min(height * 0.42, width * 0.2),
    spots: [
      { ring, angle: -0.9, side: "above" },
      { ring, angle: 2.2, side: "below" },
    ],
  };
}

/** Spots on the side that faces the text, one under another, the names outside the rings. */
export function beside(rtl: boolean): Spot[] {
  const ring = RINGS - 1;
  return rtl
    ? [
        { ring, angle: -0.25, side: "right", lift: 0.8 },
        { ring, angle: 0.35, side: "right" },
        { ring, angle: 0.95, side: "right", lift: 0.2 },
      ]
    : [
        { ring, angle: Math.PI + 0.2, side: "left" },
        { ring, angle: Math.PI + 0.75, side: "left", lift: 0.85 },
        { ring, angle: Math.PI + 1.3, side: "left", lift: 0.9 },
      ];
}

type Layout = (width: number, height: number, rtl: boolean) => Geometry;
const MOST = 400; // points drawn at most, however many accounts were scored

export function satellitesFor(width: number, height: number): number {
  return Math.min(90, Math.max(24, Math.round((width * height) / 14000)));
}

type Box = [left: number, top: number, right: number, bottom: number];

const inside = (x: number, y: number, [left, top, right, bottom]: Box) =>
  x > left - 4 && x < right + 4 && y > top - 2 && y < bottom + 2;

/** The rings and the points: none over a name, and the named points over the others. */
function draw(
  ctx: CanvasRenderingContext2D,
  orbit: Orbit,
  g: Geometry,
  w: number,
  h: number,
  names: Box[],
) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let ring = 0; ring < RINGS; ring++) {
    const { rx, ry } = ellipse(ring, 0, g.radius);
    ctx.beginPath();
    ctx.ellipse(g.cx, g.cy, rx, ry, TILT, 0, Math.PI * 2);
    ctx.stroke();
  }
  const pinned = orbit.satellites.filter((s) => s.home !== null);
  const others = orbit.satellites.filter((s) => s.home === null);
  for (const s of [...others, ...pinned]) {
    const p = place(s, g);
    if (p.alpha <= 0 || names.some((box) => inside(p.x, p.y, box))) continue;
    const green = Math.round(255 - p.red * 186);
    const blue = Math.round(255 - p.red * 197);
    ctx.fillStyle = `rgba(255, ${green}, ${blue}, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The planet is a plain circle in the page (it shows without the canvas), under the satellites. */
function placePlanet(planet: HTMLDivElement | null, g: Geometry) {
  if (!planet) return;
  const r = g.radius * 0.55;
  Object.assign(planet.style, {
    left: `${g.cx - r}px`,
    top: `${g.cy - r}px`,
    width: `${2 * r}px`,
    height: `${2 * r}px`,
  });
}

/** Each name beside its point, inside the sky's own box. Returns the boxes they take. */
function placeNames(names: (HTMLElement | null)[], orbit: Orbit, g: Geometry): Box[] {
  return names.flatMap((element, i) => {
    const spot = g.spots?.[i];
    const s = orbit.satellites[i];
    if (!element || !spot || s?.home == null) return [];
    const p = place(s, g);
    const w = element.offsetWidth;
    const h = element.offsetHeight;
    const lift = spot.lift ?? 0.5;
    const [x, y] = {
      right: [p.x + ASIDE, p.y - h * lift],
      left: [p.x - ASIDE - w, p.y - h * lift],
      above: [p.x - w / 2, p.y - ASIDE - h],
      below: [p.x - w / 2, p.y + ASIDE],
    }[spot.side];
    element.style.transform = `translate(${x}px, ${y}px)`;
    return [[x, y, x + w, y + h] as Box];
  });
}

/** The room each name has (a longer one is cut with an ellipsis); a name without a red point of
 * its own in a spot stays hidden. */
function fitNames(names: (HTMLElement | null)[], orbit: Orbit, g: Geometry, width: number) {
  names.forEach((element, i) => {
    const spot = g.spots?.[i];
    const s = orbit.satellites[i];
    if (!element) return;
    element.hidden = !spot || s?.home == null;
    if (!spot || s?.home == null) return;
    const { x } = place(s, g);
    const room = {
      right: width - x - ASIDE,
      left: x - ASIDE,
      above: 2 * Math.min(x, width - x),
      below: 2 * Math.min(x, width - x),
    }[spot.side];
    element.dataset.side = spot.side;
    element.style.maxWidth = `${Math.min(MOST_WIDE, Math.max(0, room - EDGE))}px`;
  });
}

export function Orbit({
  className,
  rtl,
  paused = false,
  layout = geometry,
  result,
  named = [],
}: {
  className?: string;
  rtl: boolean;
  paused?: boolean;
  layout?: Layout;
  result?: { accounts: number; risk: number }; // a result's sky: these points, nobody leaves
  named?: Named[]; // the customers at high risk the sky names, the most likely to leave first
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const planet = useRef<HTMLDivElement>(null);
  const names = useRef<(HTMLElement | null)[]>([]);
  const sky = useRef<Orbit | null>(null); // kept across pauses and language switches

  useEffect(() => {
    const canvas = ref.current;
    if (canvas) {
      placePlanet(planet.current, layout(canvas.clientWidth, canvas.clientHeight, rtl));
    }
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; // no canvas (tests): only the planet
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    const fresh = (count: number) =>
      result
        ? createOrbit(Math.min(result.accounts, MOST), 7, { risk: result.risk, leaving: false })
        : createOrbit(count, 7, { risk: named.length });
    const wanted = () => (result ? Math.min(result.accounts, MOST) : satellitesFor(width, height));
    let orbit: Orbit = sky.current ?? fresh(24);
    let frame = 0;
    let last = 0;
    let visible = true;
    let g = layout(width, height, rtl);

    const shown = () => names.current.slice(0, named.length);

    function paint() {
      draw(ctx!, orbit, g, width, height, placeNames(shown(), orbit, g));
    }

    function size() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas!.clientWidth; // the layout's size: the landing page opens it scaled
      height = canvas!.clientHeight;
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
      g = layout(width, height, rtl);
      placePlanet(planet.current, g);
      const count = wanted();
      if (orbit.satellites.length !== count) {
        orbit = fresh(count);
        sky.current = orbit;
      }
      pin(orbit, (g.spots ?? []).slice(0, named.length));
      fitNames(shown(), orbit, g, width);
      paint();
    }

    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      step(orbit, (now - last) / 1000, (s) => {
        const p = place(s, g);
        return g.clear ? g.clear(p.x, p.y) : true;
      });
      last = now;
      paint();
    }

    function run() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reduced.matches) {
        paint();
      } else if (visible && !document.hidden && !paused) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }

    const resized = new ResizeObserver(size);
    resized.observe(canvas);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      run();
    });
    seen.observe(canvas);
    document.addEventListener("visibilitychange", run);
    reduced.addEventListener("change", run);
    size();
    run();
    return () => {
      sky.current = orbit;
      cancelAnimationFrame(frame);
      resized.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", run);
      reduced.removeEventListener("change", run);
    };
    // a result's numbers and the layout are fixed for one mount (keyed by run); the names may
    // arrive after it
  }, [rtl, paused, named.length]);

  return (
    <div className={className} aria-hidden="true">
      <div ref={planet} className={classes.planet} />
      <canvas ref={ref} className={classes.sky} />
      {named.map(({ id, name, note }, i) => (
        <div
          key={id}
          hidden
          className={classes.named}
          ref={(element) => {
            names.current[i] = element;
          }}
        >
          <bdi className={classes.namedName}>{name}</bdi>
          <span>{note}</span>
        </div>
      ))}
    </div>
  );
}
