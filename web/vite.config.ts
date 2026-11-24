// The web site's build. `npm run dev` serves it on :5173 and forwards the API, the sign-in and
// /health to pulse-server on :8100 (run it with PULSE_PUBLIC_URL=http://localhost:5173).
// `npm run build:demo` builds the public demo (src/demo) for GitHub Pages, under /pulse/.
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

const server = "http://127.0.0.1:8100";

// The site's policy (pulse_server/site.py) for a page without a server to send it: everything from
// this address only. WebAssembly may compile (Python), and the engine's worker starts from a blob
// of the page, which carries this same policy into it.
const POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** The demo's page carries the policy itself. */
function demo(): Plugin {
  return {
    name: "pulse-demo",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: POLICY },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig(({ mode }) => ({
  base: mode === "demo" ? "/pulse/" : "/",
  plugins: [react(), ...(mode === "demo" ? [demo()] : [])],
  worker: { format: "es" as const },
  server: {
    port: 5173,
    proxy: { "/api": server, "/auth": server, "/health": server },
  },
  // one bundle for now (~160 kB gzipped); split it when the data screens arrive
  // assetsInlineLimit 0: every file is served from the site (the CSP refuses data: fonts)
  build: {
    outDir: mode === "demo" ? "dist-demo" : "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    assetsInlineLimit: 0,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
  },
}));
