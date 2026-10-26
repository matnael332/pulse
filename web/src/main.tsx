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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DirectionProvider>
      <MantineProvider theme={theme} cssVariablesResolver={cssVariables} forceColorScheme="dark">
        <I18nProvider>
          <SessionProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </SessionProvider>
        </I18nProvider>
      </MantineProvider>
    </DirectionProvider>
  </StrictMode>,
);
