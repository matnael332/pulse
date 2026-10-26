"""The server: settings, database, sign-in sessions, companies and the operator's approval.

Runs on a SQLite file; the CI docker job runs the same flow against Postgres."""

from datetime import timedelta

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from pulse_server.app import create_app
from pulse_server.db import make_engine
from pulse_server.models import Base, LoginSession, utcnow
from pulse_server.security import safe_next
from pulse_server.settings import Settings

OWNER, OPERATOR = "owner@acme.example", "ops@example.com"


def login(client: TestClient, email: str) -> None:
    client.cookies.clear()
    assert client.post("/auth/dev-login", json={"email": email}).status_code == 204


def db_session(settings: Settings) -> Session:
    return Session(make_engine(settings.database_url))


# ----------------------------------------------------------------------------- settings, database


def test_the_migrations_build_exactly_the_models(server, server_settings):
    engine = make_engine(server_settings.database_url)
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    engine.dispose()
    assert diff == []


def test_health(server):
    response = server.get("/health")
    assert response.status_code == 200 and response.json() == {"status": "ok", "db": "ok"}


def test_production_refuses_the_dev_login_and_a_missing_secret(server_settings):
    with pytest.raises(ValidationError, match="DEV_LOGIN"):
        Settings(_env_file=None, env="production", dev_login=True, secret_key="k" * 40)
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(_env_file=None, env="production")
    assert Settings(_env_file=None, env="production", secret_key="k" * 40).env == "production"


def test_operators_are_a_case_insensitive_list(server_settings):
    settings = Settings(_env_file=None, env="development", operator_emails=" A@x.io, b@y.io ,")
    assert settings.operators == {"a@x.io", "b@y.io"}


# ----------------------------------------------------------------------------- sessions


def test_me_needs_a_session(server):
    assert server.get("/me").status_code == 401
    login(server, OWNER)
    me = server.get("/me").json()
    assert me["user"]["email"] == OWNER and me["state"] == "needs_company"
    assert me["company"] is None and not me["is_operator"]


def test_the_dev_login_exists_only_when_switched_on(server_settings):
    settings = server_settings.model_copy(update={"dev_login": False})
    with TestClient(create_app(settings)) as client:
        assert client.post("/auth/dev-login", json={"email": OWNER}).status_code == 404


def test_logout_ends_the_session_for_good(server):
    login(server, OWNER)
    token = server.cookies.get("pulse_session")
    assert server.post("/auth/logout").status_code == 204
    assert server.get("/me").status_code == 401
    server.cookies.set("pulse_session", token)  # the old cookie, replayed
    assert server.get("/me").status_code == 401
    assert server.post("/auth/logout").status_code == 204  # idempotent


def test_an_expired_session_is_refused(server, server_settings):
    login(server, OWNER)
    with db_session(server_settings) as db:
        db.execute(update(LoginSession).values(expires_at=utcnow() - timedelta(seconds=1)))
        db.commit()
    assert server.get("/me").status_code == 401


def test_the_database_keeps_only_a_hash_of_the_token(server, server_settings):
    login(server, OWNER)
    token = server.cookies.get("pulse_session")
    with db_session(server_settings) as db:
        ids = db.scalars(select(LoginSession.id)).all()
    assert len(ids) == 1 and ids[0] != token and len(ids[0]) == 64


def test_session_cookie_flags(server, server_settings):
    response = server.post("/auth/dev-login", json={"email": OWNER})
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "secure" not in cookie
    https = server_settings.model_copy(update={"public_url": "https://pulse.example"})
    with TestClient(create_app(https), base_url="https://pulse.example") as client:
        cookie = client.post("/auth/dev-login", json={"email": OWNER}).headers["set-cookie"]
    assert cookie.startswith("__Host-pulse_session=") and "secure" in cookie.lower()


def test_writes_from_another_origin_are_refused(server):
    evil = {"origin": "https://evil.example"}
    assert server.post("/auth/dev-login", json={"email": OWNER}, headers=evil).status_code == 403
    cross = {"sec-fetch-site": "cross-site"}
    assert server.post("/auth/dev-login", json={"email": OWNER}, headers=cross).status_code == 403
    same = {"origin": "http://testserver"}
    assert server.post("/auth/dev-login", json={"email": OWNER}, headers=same).status_code == 204


def test_hardening_headers(server):
    headers = server.get("/health").headers
    assert headers["x-frame-options"] == "DENY" and headers["cache-control"] == "no-store"
    assert headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("/company", "/company"),
        ("/a?b=1", "/a?b=1"),
        (None, "/"),
        ("", "/"),
        ("//evil.example", "/"),
        ("/\\evil.example", "/"),
        ("https://evil.example/x", "/"),
        ("javascript:alert(1)", "/"),
    ],
)
def test_safe_next(value, expected):
    assert safe_next(value) == expected
