"""The signed-in user's own view: who am I, and where does my company stand."""

from __future__ import annotations

from fastapi import APIRouter

from pulse_server.deps import Config, CurrentUser, is_operator
from pulse_server.models import Company, User
from pulse_server.settings import Settings

router = APIRouter(tags=["account"])


def company_json(company: Company) -> dict:
    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "status": company.status,
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
