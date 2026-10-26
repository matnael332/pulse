"""Signing in and out.

The dev login (any address, no password) exists only when PULSE_DEV_LOGIN is on, which the
settings refuse in production. It stands in for Google and Microsoft in tests and on a laptop.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from pulse_server.deps import Config, Db
from pulse_server.models import User
from pulse_server.security import audit, sign_in, sign_out

router = APIRouter(prefix="/auth", tags=["auth"])
dev_router = APIRouter(prefix="/auth", tags=["auth"])


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


@router.post("/logout", status_code=204)
def logout(request: Request, db: Db, settings: Config) -> Response:
    response = Response(status_code=204)
    sign_out(db, request, response, settings)
    return response


class DevLogin(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+$", max_length=320)
    name: str | None = Field(default=None, max_length=200)


@dev_router.post("/dev-login", status_code=204)
def dev_login(body: DevLogin, db: Db, settings: Config) -> Response:
    email = body.email.lower()
    user = upsert_user(db, "dev", email, email, True, body.name)
    response = Response(status_code=204)
    sign_in(db, user, response, settings)
    return response
