"""Helpers for the server's tests: sign in with the dev login, sign a company up, decide on it."""

import httpx
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from pulse_server.db import make_engine
from pulse_server.settings import Settings

OWNER, OPERATOR = "owner@acme.example", "ops@example.com"


def login(client: TestClient, email: str) -> None:
    client.cookies.clear()
    assert client.post("/api/auth/dev-login", json={"email": email}).status_code == 204


def db_session(settings: Settings) -> Session:
    return Session(make_engine(settings.database_url))


def signup(client: TestClient, email: str = OWNER, name: str = "Acme Ltd") -> dict:
    login(client, email)
    response = client.post("/api/signup/company", json={"name": name})
    assert response.status_code == 201
    return response.json()


def decide(client: TestClient, company_id: int, action: str, **body) -> httpx.Response:
    login(client, OPERATOR)
    return client.post(f"/api/admin/companies/{company_id}/{action}", json=body)


def activate(client: TestClient, email: str = OWNER, name: str = "Acme Ltd", slug: str = "acme"):
    """A company signed up and approved; the client is signed in as its user."""
    company = signup(client, email, name)
    approved = decide(client, company["id"], "approve", slug=slug)
    assert approved.status_code == 200
    login(client, email)
    return approved.json()
