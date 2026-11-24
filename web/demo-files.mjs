// After `vite build --mode demo`: the packed files (uv run python -m pulse_demo.pack web/public-demo)
// beside the page, and the page again as 404.html, which GitHub Pages answers the reload of any inner
// address with.
import { cpSync } from "node:fs";
import { resolve } from "node:path";

const here = import.meta.dirname;
const out = resolve(here, "dist-demo");
cpSync(resolve(here, "public-demo"), out, { recursive: true });
cpSync(resolve(out, "index.html"), resolve(out, "404.html"));
