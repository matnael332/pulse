// The landing page's sky: draws sky.ts on a canvas behind the first screen. About 30 frames a
// second, paused while the tab is hidden or the canvas is off screen; one still frame when the
// visitor asks for reduced motion. Decorative only: hidden from screen readers and from the mouse.
import { useEffect, useRef } from "react";

import classes from "./Landing.module.css";
import {
  createOrbit,
  ellipse,
  place,
  RINGS,
  step,
  still,
  TILT,
  type Geometry,
  type Orbit,
} from "./sky";

const FRAME_MS = 1000 / 30;

/** The planet sits opposite the text: on the left in Hebrew, on the right in English. */
export function geometry(width: number, height: number, rtl: boolean): Geometry {
  if (width < 700) {
    return { cx: width * 0.5, cy: height * 0.86, radius: Math.min(width, height) * 0.62 };
  }
  return {
    cx: width * (rtl ? 0.16 : 0.84),
    cy: height * 0.55,
    radius: Math.min(width, height) * 0.78,
  };
}

export function satellitesFor(width: number, height: number): number {
  return Math.min(90, Math.max(24, Math.round((width * height) / 14000)));
}

function draw(ctx: CanvasRenderingContext2D, orbit: Orbit, g: Geometry, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let ring = 0; ring < RINGS; ring++) {
    const { rx, ry } = ellipse(ring, 0, g.radius);
    ctx.beginPath();
    ctx.ellipse(g.cx, g.cy, rx, ry, TILT, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const s of orbit.satellites) {
    const p = place(s, g);
    if (p.alpha <= 0) continue;
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

export function Orbit({
  className,
  rtl,
  paused = false,
}: {
  className?: string;
  rtl: boolean;
  paused?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const planet = useRef<HTMLDivElement>(null);
  const sky = useRef<Orbit | null>(null); // kept across pauses and language switches

  useEffect(() => {
    const canvas = ref.current;
    if (canvas) {
      const box = canvas.getBoundingClientRect();
      placePlanet(planet.current, geometry(box.width, box.height, rtl));
    }
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; // no canvas (tests): only the planet
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let orbit: Orbit = sky.current ?? createOrbit(24);
    let frame = 0;
    let last = 0;
    let visible = true;

    function size() {
      const box = canvas!.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
      placePlanet(planet.current, geometry(width, height, rtl));
      const count = satellitesFor(width, height);
      if (orbit.satellites.length !== count) {
        orbit = reduced.matches ? still(count) : createOrbit(count);
        sky.current = orbit;
      }
      draw(ctx!, orbit, geometry(width, height, rtl), width, height);
    }

    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      step(orbit, (now - last) / 1000);
      last = now;
      draw(ctx!, orbit, geometry(width, height, rtl), width, height);
    }

    function run() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reduced.matches) {
        orbit = still(satellitesFor(width, height));
        draw(ctx!, orbit, geometry(width, height, rtl), width, height);
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
  }, [rtl, paused]);

  return (
    <div className={className} aria-hidden="true">
      <div ref={planet} className={classes.planet} />
      <canvas ref={ref} className={classes.sky} />
    </div>
  );
}
