"""Smoke test of a running pulse-server: health, then a company from signup to approval.

Needs the dev login and ops@example.com among the operators (the CI docker job sets both):

    PULSE_ENV=development PULSE_DEV_LOGIN=1 PULSE_OPERATOR_EMAILS=ops@example.com \
        uv run pulse-server serve --migrate
    python scripts/server_smoke.py http://127.0.0.1:8100

Standard library only, so it runs anywhere. Exit code 0 when every step passes.
"""

from __future__ import annotations

import http.cookiejar
import json
import sys
import urllib.error
import urllib.request

OWNER, OPERATOR = "owner@acme.example", "ops@example.com"


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


def main(base: str) -> int:
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
    print("server smoke test passed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8100"))
