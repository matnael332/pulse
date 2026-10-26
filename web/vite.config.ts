// The web site's build. `npm run dev` serves it on :5173 and forwards the API, the sign-in and
// /health to pulse-server on :8100 (run it with PULSE_PUBLIC_URL=http://localhost:5173).
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const server = "http://127.0.0.1:8100";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": server, "/auth": server, "/health": server },
  },
  // one bundle for now (~160 kB gzipped); split it when the data screens arrive
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 700 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
  },
});
