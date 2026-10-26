"""Who is asking: the signed-in user, the operator, a company that may use the product.

No session: 401. Signed in but not allowed (not an operator, company not active): 403.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from pulse_server.db import get_db
from pulse_server.models import Company, LoginSession, User, utcnow
from pulse_server.security import hash_token, session_cookie
from pulse_server.settings import Settings


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


Db = Annotated[Session, Depends(get_db)]
Config = Annotated[Settings, Depends(get_settings)]


def is_operator(user: User, settings: Settings) -> bool:
    """An operator signs in with a verified address that is in PULSE_OPERATOR_EMAILS."""
    return user.email_verified and user.email.lower() in settings.operators


def current_user(request: Request, db: Db, settings: Config) -> User:
    token = request.cookies.get(session_cookie(settings))
    row = db.get(LoginSession, hash_token(token)) if token else None
    now = utcnow()
    if row is None or row.expires_at <= now:
        raise HTTPException(401, "not signed in")
    row.last_seen_at = now
    db.commit()
    return row.user


CurrentUser = Annotated[User, Depends(current_user)]


def require_operator(user: CurrentUser, settings: Config) -> User:
    if not is_operator(user, settings):
        raise HTTPException(403, "operators only")
    return user


def require_active_company(user: CurrentUser) -> Company:
    if user.company is None or user.company.status != "active":
        raise HTTPException(403, "the company is not active")
    return user.company


Operator = Annotated[User, Depends(require_operator)]
ActiveCompany = Annotated[Company, Depends(require_active_company)]
