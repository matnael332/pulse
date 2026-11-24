import "@mantine/core/styles.css";
import "./fonts";
import "./global.css";

import { DirectionProvider, MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { App } from "./App";
import { I18nProvider } from "./i18n";
import { SessionProvider } from "./session";
import { cssVariables, theme } from "./theme";

async function start() {
  // the public demo (vite build --mode demo): the same site, answered in the browser. Any other
  // build drops this line and everything behind it.
  if (import.meta.env.MODE === "demo") (await import("./demo/start")).start();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <DirectionProvider>
        <MantineProvider theme={theme} cssVariablesResolver={cssVariables} forceColorScheme="dark">
          <I18nProvider>
            <SessionProvider>
              <BrowserRouter basename={import.meta.env.BASE_URL}>
                <App />
              </BrowserRouter>
            </SessionProvider>
          </I18nProvider>
        </MantineProvider>
      </DirectionProvider>
    </StrictMode>,
  );
}

void start();
