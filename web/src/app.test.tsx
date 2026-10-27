import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { detectLanguage, translate } from "./i18n";
import { he, me, renderAt, serve } from "./test-utils";

describe("language", () => {
  it("follows the browser: English for English, Hebrew otherwise, the saved choice first", () => {
    expect(detectLanguage(null, ["en-US", "he"])).toBe("en");
    expect(detectLanguage(null, ["he-IL"])).toBe("he");
    expect(detectLanguage(null, ["fr-FR"])).toBe("he");
    expect(detectLanguage(null, [])).toBe("he");
    expect(detectLanguage("en", ["he-IL"])).toBe("en");
  });

  it("switches the page's language and direction, and remembers it", async () => {
    serve({
      "GET /api/me": { status: 401 },
      "GET /api/auth/providers": { body: { providers: [] } },
    });
    renderAt("/");
    expect(await screen.findByText(he("login.none"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(await screen.findByText(translate("en", "login.none"))).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem("pulse.lang")).toBe("en");
  });
});

describe("the gate", () => {
  it("sends a visitor to the sign-in page with the configured providers", async () => {
    serve({
      "GET /api/me": { status: 401 },
      "GET /api/auth/providers": { body: { providers: ["google", "microsoft"] } },
    });
    renderAt("/operator");
    const google = await screen.findByRole("link", { name: he("login.google") });
    expect(google).toHaveAttribute("href", "/auth/google/login");
    expect(screen.getByRole("link", { name: he("login.microsoft") })).toBeInTheDocument();
    expect(screen.queryByText(he("login.dev"))).not.toBeInTheDocument();
  });

  it("shows a failed sign-in", async () => {
    serve({
      "GET /api/me": { status: 401 },
      "GET /api/auth/providers": { body: { providers: ["google"] } },
    });
    renderAt("/login?error=signin");
    expect(await screen.findByText(he("login.failed"))).toBeInTheDocument();
  });

  it("lets a new user name the company, then shows it pending", async () => {
    let current = me("needs_company");
    const calls = serve({
      "GET /api/me": () => ({ body: current }),
      "POST /api/signup/company": () => {
        current = me("pending", { name: "Acme" });
        return { status: 201, body: current.company };
      },
    });
    renderAt("/");
    await userEvent.type(await screen.findByLabelText(he("welcome.name")), "Acme");
    await userEvent.click(screen.getByRole("button", { name: he("welcome.submit") }));
    expect(await screen.findByText(he("status.pending.title"))).toBeInTheDocument();
    expect(calls.find((c) => c.key === "POST /api/signup/company")?.body).toEqual({
      name: "Acme",
      currency: "ILS",
    });
  });

  it("shows a rejected company the operator's note", async () => {
    serve({ "GET /api/me": { body: me("rejected", { status: "rejected", note: "not a fit" }) } });
    renderAt("/");
    expect(await screen.findByText(he("status.rejected.title"))).toBeInTheDocument();
    expect(screen.getByText(he("status.reason", { note: "not a fit" }))).toBeInTheDocument();
  });

  it("opens an active company's data page: the upload, the demo, the systems to come", async () => {
    serve({
      "GET /api/me": { body: me("active", { status: "active", slug: "acme" }) },
      "GET /api/company": {
        body: {
          ...me("active", { status: "active", slug: "acme" }).company,
          has_model: false,
          has_real_data: false,
          current: null,
          latest_run: null,
        },
      },
    });
    renderAt("/status"); // an old address moves to the data page
    expect(
      await screen.findByRole("heading", { level: 1, name: he("data.title", { name: "Acme" }) }),
    ).toBeInTheDocument();
    // the heading comes from /api/me; the rest waits for /api/company
    expect(await screen.findByRole("button", { name: he("upload.choose") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: he("home.demo") })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: he("systems.connect") })).toHaveLength(5);
    screen
      .getAllByRole("button", { name: he("systems.connect") })
      .forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByText(he("data.empty"))).toBeInTheDocument();
  });
});

describe("the operator", () => {
  it("approves a pending company with a folder name", async () => {
    let pending = [
      {
        ...me("pending", { id: 7, name: "Beta" }).company!,
        user_email: "owner@beta.example",
      },
    ];
    const calls = serve({
      "GET /api/me": { body: me("operator") },
      "GET /api/admin/companies?status=pending": () => ({ body: { companies: pending } }),
      "POST /api/admin/companies/7/approve": () => {
        const row = { ...pending[0], status: "active", slug: "beta" };
        pending = [];
        return { body: row };
      },
    });
    renderAt("/");
    const row = (await screen.findByText("Beta")).closest("tr")!;
    expect(within(row).getByText("owner@beta.example")).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: he("operator.approve") }));
    await userEvent.type(
      await screen.findByLabelText(he("operator.slug"), { exact: false }),
      "beta",
    );
    await userEvent.click(screen.getByRole("button", { name: he("operator.confirm") }));
    expect(await screen.findByText(he("operator.empty"))).toBeInTheDocument();
    expect(calls.find((c) => c.key === "POST /api/admin/companies/7/approve")?.body).toEqual({
      slug: "beta",
    });
  });

  it("shows the server's refusal in the dialog", async () => {
    serve({
      "GET /api/me": { body: me("operator") },
      "GET /api/admin/companies?status=pending": {
        body: {
          companies: [
            { ...me("pending", { id: 3, name: "Gamma" }).company!, user_email: "g@g.example" },
          ],
        },
      },
      "POST /api/admin/companies/3/approve": {
        status: 409,
        body: { detail: "the slug gamma is taken" },
      },
    });
    renderAt("/operator");
    await userEvent.click(await screen.findByRole("button", { name: he("operator.approve") }));
    await userEvent.click(await screen.findByRole("button", { name: he("operator.confirm") }));
    await waitFor(() => expect(screen.getByText("the slug gamma is taken")).toBeInTheDocument());
  });
});
