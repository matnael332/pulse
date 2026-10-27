// Shared by the tests: a fake server behind fetch, the app rendered at a path, a /api/me answer.
import { DirectionProvider, MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

import type { Me } from "./api";
import { App } from "./App";
import { I18nProvider, type Key, translate } from "./i18n";
import { SessionProvider } from "./session";
import { cssVariables, theme } from "./theme";

type Reply = { status?: number; body?: unknown };
type Handler = (init: RequestInit | undefined) => Reply;

/** A fake server: "METHOD /api/path" -> handler; anything else is a 404. */
export function serve(routes: Record<string, Handler | Reply>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    calls.push({ key, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const route = routes[key];
    const reply = typeof route === "function" ? route(init) : (route ?? { status: 404 });
    const status = reply.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

export function renderAt(path: string, lang = "he") {
  localStorage.setItem("pulse.lang", lang); // jsdom's browser is English
  return render(
    <DirectionProvider>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariables}
        forceColorScheme="dark"
        env="test"
      >
        <I18nProvider>
          <SessionProvider>
            <MemoryRouter initialEntries={[path]}>
              <App />
            </MemoryRouter>
          </SessionProvider>
        </I18nProvider>
      </MantineProvider>
    </DirectionProvider>,
  );
}

export const he = (key: Key, values?: Record<string, string>) => translate("he", key, values);
export const en = (key: Key, values?: Record<string, string>) => translate("en", key, values);

export function me(
  state: Me["state"],
  company: Partial<NonNullable<Me["company"]>> | null = null,
): Me {
  return {
    user: { email: "dana@acme.example", name: "Dana", provider: "google", email_verified: true },
    is_operator: state === "operator",
    company: company && {
      id: 1,
      name: "Acme",
      slug: null,
      status: "pending",
      currency: "ILS",
      created_at: "2026-10-26T10:00:00Z",
      decided_at: null,
      note: null,
      ...company,
    },
    state,
  };
}
