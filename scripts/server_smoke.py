"""Smoke test of a running pulse-server: health, then a company from signup to approval, and
with ``--demo`` the demo through the worker to a finished run (the real pipeline).

Needs the dev login and ops@example.com among the operators (the CI docker job sets both):

    PULSE_ENV=development PULSE_DEV_LOGIN=1 PULSE_OPERATOR_EMAILS=ops@example.com \
        uv run pulse-server serve --migrate
    python scripts/server_smoke.py http://127.0.0.1:8100 [--demo]

Standard library only, so it runs anywhere. Exit code 0 when every step passes.
"""

from __future__ import annotations

import http.cookiejar
import json
import sys
import time
import urllib.error
import urllib.request

OWNER, OPERATOR = "owner@acme.example", "ops@example.com"
DEMO_MINUTES = 15  # building the demo export, reading it, and a full run


class Client:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))

    def call(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with self.opener.open(request, timeout=10) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as exc:
            status, raw = exc.code, exc.read()
        return status, json.loads(raw) if raw else {}

    def raw(self, path: str) -> tuple[int, bytes]:
        try:
            with self.opener.open(self.base + path, timeout=10) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()

    def login(self, email: str) -> None:
        self.cookies.clear()
        expect(
            self.call("POST", "/api/auth/dev-login", {"email": email}), 204, f"dev login {email}"
        )


def expect(answer: tuple[int, dict], status: int, step: str) -> dict:
    got, body = answer
    if got != status:
        raise SystemExit(f"FAIL {step}: HTTP {got} (expected {status}) {body}")
    print(f"ok   {step}")
    return body


def wait(client: Client, path: str, done, step: str) -> dict:
    """Poll ``path`` until ``done(body)``; fail on a failed status or after DEMO_MINUTES."""
    deadline = time.monotonic() + DEMO_MINUTES * 60
    while True:
        status, body = client.call("GET", path)
        if status != 200:
            raise SystemExit(f"FAIL {step}: HTTP {status} {body}")
        if body.get("status") == "failed":
            raise SystemExit(f"FAIL {step}: {body.get('error')}")
        if done(body):
            print(f"ok   {step}")
            return body
        if time.monotonic() > deadline:
            raise SystemExit(f"FAIL {step}: still {body.get('status')} after {DEMO_MINUTES} min")
        time.sleep(3)


def demo(client: Client) -> None:
    """The demo end to end: proposal, the customer's approval, the run, the summary."""
    ingestion = expect(client.call("POST", "/api/demo", {"language": "he"}), 201, "start the demo")
    path = f"/api/ingestions/{ingestion['id']}"
    shown = wait(client, path, lambda b: b["status"] != "proposing", "the demo export is read")
    if shown["status"] == "proposed":
        review = expect(client.call("GET", f"{path}/review"), 200, "the review")
        if review["blocking"]:
            raise SystemExit(f"FAIL the demo's mapping is incomplete: {review['blocking']}")
        expect(client.call("POST", f"{path}/approve"), 200, "approve the mapping")
    applied = wait(client, path, lambda b: b["status"] == "applied", "the data is prepared")
    run = wait(
        client,
        f"/api/runs/{applied['run_id']}",
        lambda b: b["status"] == "succeeded",
        "the pipeline run",
    )
    if not run["summary"] or run["summary"]["accounts"] <= 0:
        raise SystemExit(f"FAIL the run scored no accounts: {run['summary']}")
    if run["summary"].get("revenue_at_risk") is None or not run["summary"].get("revenue_total"):
        raise SystemExit(f"FAIL the run has no revenue figures: {run['summary']}")
    print(f"     {run['summary']}")
    results = expect(client.call("GET", f"/api/runs/{run['id']}/results"), 200, "the results")
    if not any(a["name"] for a in results["accounts"]):
        raise SystemExit("FAIL no account has a name (the entity map was not joined)")
    if any(a["mrr"] is None for a in results["accounts"]):
        raise SystemExit("FAIL an account has no monthly revenue (score_rows was not joined)")
    advanced = expect(client.call("GET", f"/api/runs/{run['id']}/advanced"), 200, "advanced")
    status, image = client.raw(f"/api/runs/{run['id']}/figures/{advanced['figures'][0]}")
    if status != 200 or not image.startswith(bytes.fromhex("89504e47")):  # a PNG
        raise SystemExit(f"FAIL the figure: HTTP {status}")
    status, card = client.raw(f"/api/runs/{run['id']}/docs/model_card")
    if status != 200 or not card.startswith(b"#"):
        raise SystemExit(f"FAIL the model card: HTTP {status}")
    status, _ = client.raw(f"/api/runs/{run['id']}/figures/model.joblib")
    if status != 404:
        raise SystemExit(f"FAIL the model file is served: HTTP {status}")
    print("ok   a figure, the model card, and never the model file")


def main(base: str, with_demo: bool = False) -> int:
    client = Client(base)
    health = expect(client.call("GET", "/health"), 200, "health")
    if health.get("db") != "ok":
        raise SystemExit(f"FAIL health: {health}")
    client.login(OWNER)
    me = expect(client.call("GET", "/api/me"), 200, "me")
    if me["state"] != "needs_company":
        raise SystemExit(f"FAIL a new user should need a company: {me['state']}")
    company = expect(client.call("POST", "/api/signup/company", {"name": "Acme"}), 201, "signup")
    expect(client.call("GET", "/api/company"), 403, "a pending company is not active")
    client.login(OPERATOR)
    pending = expect(client.call("GET", "/api/admin/companies?status=pending"), 200, "pending list")
    if company["id"] not in [c["id"] for c in pending["companies"]]:
        raise SystemExit("FAIL the new company is not in the pending list")
    path = f"/api/admin/companies/{company['id']}/approve"
    approved = expect(client.call("POST", path, {"slug": "acme"}), 200, "approve")
    if approved["slug"] != "acme" or approved["status"] != "active":
        raise SystemExit(f"FAIL approval: {approved}")
    client.login(OWNER)
    if expect(client.call("GET", "/api/me"), 200, "me again")["state"] != "active":
        raise SystemExit("FAIL the company should be active")
    expect(client.call("GET", "/api/company"), 200, "the active company")
    if with_demo:
        demo(client)
    print("server smoke test passed")
    return 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sys.exit(main(args[0] if args else "http://127.0.0.1:8100", "--demo" in sys.argv))
