import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { en, he, renderAt, serve } from "./test-utils";

function visitor(providers: string[]) {
  serve({
    "GET /api/me": { status: 401 },
    "GET /api/auth/providers": { body: { providers } },
  });
}

describe("the landing page", () => {
  it("says what pulse is and offers the ways in, at the top and at the close", async () => {
    visitor(["google", "microsoft"]);
    renderAt("/");
    expect(
      await screen.findByRole("heading", { level: 1, name: /מי עומד לעזוב/ }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: he("login.google") })).toHaveAttribute(
      "href",
      "/auth/google/login",
    );
    const close = screen.getByRole("region", { name: /מוכנים/ });
    expect(
      within(close).getByRole("link", { name: he("landing.start.microsoft") }),
    ).toHaveAttribute("href", "/auth/microsoft/login");
    expect(within(close).getByText(he("landing.start.or"))).toBeInTheDocument();
  });

  it("shows a sample customer's reasons, and another on request", async () => {
    visitor(["google"]);
    renderAt("/", "en");
    const first = await screen.findByRole("button", { name: /Galil Bakery/ });
    expect(first).toHaveAttribute("aria-pressed", "true");
    const card = screen.getByRole("article");
    expect(within(card).getByText("Payroll exports stopped")).toBeInTheDocument();
    expect(screen.getByText(en("landing.why.mrr", { amount: "₪1,200" }))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Parpar Kindergartens/ }));
    expect(screen.getByRole("button", { name: /Galil Bakery/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(screen.getByRole("article")).getByText(en("landing.why.none"))).toBeVisible();
    expect(screen.getByText(en("landing.why.sample"))).toBeInTheDocument();
  });

  it("offers the dev login only where the server has it", async () => {
    visitor(["dev"]);
    renderAt("/");
    expect(await screen.findAllByRole("button", { name: he("login.devSubmit") })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: he("login.google") })).not.toBeInTheDocument();
  });

  it("lets the visitor stop what moves, and skip to the content", async () => {
    visitor(["google"]);
    renderAt("/", "en");
    expect(await screen.findByRole("link", { name: en("landing.skip") })).toHaveAttribute(
      "href",
      "#main",
    );
    await userEvent.click(screen.getByRole("button", { name: en("landing.motion.pause") }));
    const play = screen.getByRole("button", { name: en("landing.motion.play") });
    expect(play).toHaveAttribute("aria-pressed", "true");
    expect(play.closest("[data-paused]")).not.toBeNull();
  });
});
