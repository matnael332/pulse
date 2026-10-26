"""Signing in and out.

Google and Microsoft: ``/auth/{provider}/login`` sends the browser to the provider with a fresh
state, nonce and PKCE verifier kept in a signed, short-lived cookie; ``/callback`` checks the
state, trades the code for the ID token, verifies it (``oidc``) and starts a session. Any failure
starts nothing: the browser goes back to the site's sign-in page (``/login?error=...``) and the
reason goes to the log, never to the page.

The site's own calls live under ``/api/auth`` (providers, logout, the dev login); only the two
browser navigations of a sign-in stay at ``/auth``, where the redirect URIs point.

The dev login (any address, no password) exists only when PULSE_DEV_LOGIN is on, which the
settings refuse in production. It stands in for Google and Microsoft in tests and on a laptop,
as a form (POST) and as a link (GET, for tools that open a fresh browser).
"""

from __future__ import annotations

import hmac
import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from pulse_server.deps import Config, Db
from pulse_server.models import User
from pulse_server.oidc import OidcError, pkce_pair, providers
from pulse_server.security import audit, safe_next, sign_in, sign_out
from pulse_server.settings import Settings

STATE_COOKIE = "pulse_oidc"
LOGIN_PAGE = "/login"
STATE_SECONDS = 600
EMAIL = r"^[^@\s]+@[^@\s]+$"

log = logging.getLogger("pulse_server.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])
dev_router = APIRouter(prefix="/api/auth", tags=["auth"])
browser_router = APIRouter(prefix="/auth", tags=["auth"])


def upsert_user(
    db: Session,
    provider: str,
    subject: str,
    email: str,
    email_verified: bool,
    name: str | None,
) -> User:
    """The user behind a provider's subject, created on the first sign-in (committed)."""
    user = db.scalar(select(User).where(User.provider == provider, User.subject == subject))
    if user is None:
        user = User(provider=provider, subject=subject)
        db.add(user)
        audit(db, email, "signup", provider=provider)
    user.email = email
    user.email_verified = email_verified
    user.display_name = name
    db.commit()
    return user


def _state_signer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.secret_key, salt="oidc-state")


def _redirect_uri(settings: Settings, provider: str) -> str:
    return f"{settings.public_url.rstrip('/')}/auth/{provider}/callback"


@router.get("/providers")
def list_providers(settings: Config) -> dict:
    names = list(providers(settings))
    return {"providers": names + (["dev"] if settings.dev_login else [])}


@browser_router.get("/{provider}/login")
def login(provider: str, request: Request, settings: Config, next: str | None = None):
    found = providers(settings).get(provider)
    if found is None:
        raise HTTPException(404, "unknown sign-in provider")
    state, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    verifier, challenge = pkce_pair()
    try:
        url = request.app.state.oidc.authorize_url(
            found, _redirect_uri(settings, provider), state, nonce, challenge
        )
    except OidcError as exc:
        return _failed(f"{provider} unavailable: {exc}", "unavailable")
    response = RedirectResponse(url, 302)
    signed = _state_signer(settings).dumps(
        {"p": provider, "s": state, "n": nonce, "v": verifier, "next": safe_next(next)}
    )
    response.set_cookie(
        STATE_COOKIE,
        signed,
        max_age=STATE_SECONDS,
        path="/auth/",
        secure=settings.https,
        httponly=True,
        samesite="lax",
    )
    return response


@browser_router.get("/{provider}/callback")
def callback(
    provider: str,
    request: Request,
    db: Db,
    settings: Config,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    found = providers(settings).get(provider)
    if found is None:
        raise HTTPException(404, "unknown sign-in provider")
    try:
        saved = _state_signer(settings).loads(
            request.cookies.get(STATE_COOKIE, ""), max_age=STATE_SECONDS
        )
    except BadSignature:
        return _failed("the sign-in expired or did not start here")
    if saved.get("p") != provider or not hmac.compare_digest(saved.get("s", ""), state or ""):
        return _failed("the sign-in state does not match")
    if error or not code:
        return _failed(f"the provider answered: {error or 'no code'}")
    client = request.app.state.oidc
    try:
        id_token = client.exchange(found, code, _redirect_uri(settings, provider), saved["v"])
        who = client.identity(found, id_token, saved["n"])
    except OidcError as exc:
        return _failed(str(exc))
    user = upsert_user(db, provider, who.subject, who.email, who.email_verified, who.name)
    response = RedirectResponse(saved["next"], 302)
    response.delete_cookie(STATE_COOKIE, path="/auth/")
    sign_in(db, user, response, settings)
    return response


def _failed(reason: str, error: str = "signin") -> RedirectResponse:
    log.warning("sign-in failed: %s", reason)
    response = RedirectResponse(f"{LOGIN_PAGE}?error={error}", 302)
    response.delete_cookie(STATE_COOKIE, path="/auth/")
    return response


@router.post("/logout", status_code=204)
def logout(request: Request, db: Db, settings: Config) -> Response:
    response = Response(status_code=204)
    sign_out(db, request, response, settings)
    return response


class DevLogin(BaseModel):
    email: str = Field(pattern=EMAIL, max_length=320)
    name: str | None = Field(default=None, max_length=200)


@dev_router.post("/dev-login", status_code=204)
def dev_login(body: DevLogin, db: Db, settings: Config) -> Response:
    email = body.email.lower()
    user = upsert_user(db, "dev", email, email, True, body.name)
    response = Response(status_code=204)
    sign_in(db, user, response, settings)
    return response


@dev_router.get("/dev-login")
def dev_login_link(
    db: Db,
    settings: Config,
    email: Annotated[str, Query(pattern=EMAIL, max_length=320)],
    next: str | None = None,
):
    """The dev login as a link, for tools that open a fresh browser (the design inspector)."""
    user = upsert_user(db, "dev", email.lower(), email.lower(), True, None)
    response = RedirectResponse(safe_next(next), 302)
    sign_in(db, user, response, settings)
    return response
