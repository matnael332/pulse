"""Session tokens and cookies, safe redirects, and the guard every request passes.

The session cookie holds a random token; the database keeps only its sha256, so a leaked
database row cannot be replayed. Every sign-in issues a new token. Writes from another origin
are refused (SameSite=Lax covers the rest), and every response carries the usual hardening
headers and no-store (the site's content-hashed assets: a year's cache).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from urllib.parse import urlsplit

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from pulse_server.models import AuditEvent, LoginSession, User, utcnow
from pulse_server.settings import Settings

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
}
NO_STORE = "no-store"
IMMUTABLE = "public, max-age=31536000, immutable"  # content-hashed site assets


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def session_cookie(settings: Settings) -> str:
    return "__Host-pulse_session" if settings.https else "pulse_session"


def safe_next(value: str | None) -> str:
    """A path on this site, or ``/``: never another host (no open redirect)."""
    if not value or not value.startswith("/") or value.startswith(("//", "/\\")):
        return "/"
    parts = urlsplit(value)
    if parts.scheme or parts.netloc or "\\" in value:
        return "/"
    return value


def audit(
    db: Session,
    actor: str | None,
    action: str,
    company_id: int | None = None,
    **detail,
) -> None:
    db.add(AuditEvent(actor_email=actor, action=action, company_id=company_id, detail=detail))


def sign_in(db: Session, user: User, response: Response, settings: Settings) -> None:
    """A new session for the user (committed) and its cookie on the response."""
    token = new_token()
    now = utcnow()
    db.add(
        LoginSession(
            id=hash_token(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + timedelta(days=settings.session_days),
            last_seen_at=now,
        )
    )
    user.last_login_at = now
    audit(db, user.email, "login", user.company_id, provider=user.provider)
    db.commit()
    response.set_cookie(
        session_cookie(settings),
        token,
        max_age=settings.session_days * 24 * 3600,
        path="/",
        secure=settings.https,
        httponly=True,
        samesite="lax",
    )


def sign_out(db: Session, request: Request, response: Response, settings: Settings) -> None:
    token = request.cookies.get(session_cookie(settings))
    if token:
        row = db.get(LoginSession, hash_token(token))
        if row is not None:
            audit(db, row.user.email, "logout", row.user.company_id)
            db.delete(row)
            db.commit()
    response.delete_cookie(
        session_cookie(settings), path="/", secure=settings.https, httponly=True, samesite="lax"
    )


async def guard(request: Request, call_next) -> Response:
    """Refuse cross-origin writes; add the hardening headers."""
    settings: Settings = request.app.state.settings
    if request.method in UNSAFE_METHODS:
        origin = request.headers.get("origin")
        cross_site = request.headers.get("sec-fetch-site") == "cross-site"
        if (origin and origin != settings.origin) or (not origin and cross_site):
            return JSONResponse({"detail": "cross-origin request refused"}, 403, HEADERS)
    response = await call_next(request)
    for name, value in HEADERS.items():
        response.headers.setdefault(name, value)
    asset = request.url.path.startswith("/assets/") and response.status_code == 200
    response.headers.setdefault("Cache-Control", IMMUTABLE if asset else NO_STORE)
    return response
