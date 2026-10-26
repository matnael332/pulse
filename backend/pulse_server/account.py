"""The signed-in user's own view: who am I, and where does my company stand.

A new user names their company once (``/api/signup/company``); it waits, pending, for an operator.
Operators run the site and have no company of their own.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from pulse_server.deps import ActiveCompany, Config, CurrentUser, Db, is_operator
from pulse_server.models import Company, User
from pulse_server.security import audit
from pulse_server.settings import Settings
from pulse_server.uploads import overview

router = APIRouter(prefix="/api", tags=["account"])
Currency = Literal["ILS", "USD", "EUR"]  # models.CURRENCIES


def company_json(company: Company) -> dict:
    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "status": company.status,
        "currency": company.currency,
        "created_at": company.created_at.isoformat(),
        "decided_at": company.decided_at.isoformat() if company.decided_at else None,
        "note": company.note,
    }


def state(user: User, settings: Settings) -> str:
    """operator, needs_company, or the company's status (pending, active, rejected, suspended)."""
    if is_operator(user, settings):
        return "operator"
    return user.company.status if user.company else "needs_company"


@router.get("/me")
def me(user: CurrentUser, settings: Config) -> dict:
    return {
        "user": {
            "email": user.email,
            "name": user.display_name,
            "provider": user.provider,
            "email_verified": user.email_verified,
        },
        "is_operator": is_operator(user, settings),
        "company": company_json(user.company) if user.company else None,
        "state": state(user, settings),
    }


class Signup(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    currency: Currency = "ILS"


@router.post("/signup/company", status_code=201)
def signup_company(body: Signup, user: CurrentUser, db: Db, settings: Config) -> dict:
    if is_operator(user, settings):
        raise HTTPException(403, "operators have no company")
    if user.company is not None:
        raise HTTPException(409, "this user already has a company")
    company = Company(name=body.name.strip(), status="pending", currency=body.currency)
    db.add(company)
    db.flush()
    user.company = company
    audit(db, user.email, "company.create", company.id, name=company.name)
    db.commit()
    return company_json(company)


class CurrencyChoice(BaseModel):
    currency: Currency


@router.put("/company/currency")
def set_currency(body: CurrencyChoice, user: CurrentUser, db: Db) -> dict:
    """The currency the company's revenue figures are shown in; any status may set it."""
    company = user.company
    if company is None:
        raise HTTPException(404, "no company")
    if company.currency != body.currency:
        audit(db, user.email, "company.currency", company.id, currency=body.currency)
        company.currency = body.currency
        db.commit()
    return company_json(company)


@router.get("/company")
def my_company(company: ActiveCompany, db: Db) -> dict:
    """The company, what is under way, and its latest result."""
    under_way = overview(db, company)
    return {**company_json(company), **under_way, "has_model": bool(under_way["latest_run"])}
