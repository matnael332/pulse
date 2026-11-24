// The public demo: the site itself, answered in the browser. Loaded only by the demo build (main.tsx).
import { setTransport } from "../api";
import { DICTIONARIES, type Lang } from "../i18n";
import { POLL } from "../poll";
import { slots } from "../slots";
import { createEngine } from "./engine";
import { parts } from "./parts";
import { DemoServer } from "./server";
import { SAID, WORDS } from "./words";

const LEAST_MEMORY_GB = 4;

/** A phone, or a computer with little memory: the sample's ready results instead of a run. */
export function able(): boolean {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  const phone = matchMedia("(pointer: coarse) and (max-width: 900px)").matches;
  return (
    !phone && typeof WebAssembly === "object" && (memory ?? LEAST_MEMORY_GB) >= LEAST_MEMORY_GB
  );
}

export function start(): void {
  const base = import.meta.env.BASE_URL;
  const demo = new DemoServer({
    engine: createEngine,
    base,
    able: able(), // once: turning a tablet around must not change it half way
    company: (lang) => WORDS[lang].company,
  });
  for (const lang of ["he", "en"] as Lang[]) Object.assign(DICTIONARIES[lang], SAID[lang]);
  Object.assign(slots, parts(demo));
  setTransport(demo);
  POLL.ms = 500;
  // a reload in the middle of an upload: the work is gone with the page, so back to its start
  const path = location.pathname.slice(base.length - 1);
  if (DemoServer.lost(path)) history.replaceState(null, "", `${base}data`);
  if (!demo.able) document.documentElement.dataset.demo = "ready";
  demo.warm();
}
