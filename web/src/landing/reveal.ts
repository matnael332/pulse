// Section entrances: an element marked data-reveal gets data-shown the first time it is mostly in
// view (the CSS does the rest, and only when motion is welcome). data-playing follows whether a
// marked element is on screen, for loops that should rest out of sight.
import { useEffect, type CSSProperties, type RefObject } from "react";

/** The place of an element in its section's entrance (each step is 80ms later). */
export const order = (i: number) => ({ "--i": i }) as CSSProperties;

export function useReveal(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      element?.querySelectorAll("[data-reveal]").forEach((e) => e.setAttribute("data-shown", ""));
      return;
    }
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-shown", "");
          reveal.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    const play = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        entry.target.setAttribute("data-playing", String(entry.isIntersecting));
      }
    });
    element.querySelectorAll("[data-reveal]").forEach((e) => reveal.observe(e));
    element.querySelectorAll("[data-playing]").forEach((e) => play.observe(e));
    return () => {
      reveal.disconnect();
      play.disconnect();
    };
  }, [root]);
}
