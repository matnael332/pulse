"""The operator's endpoints: the companies waiting for approval, and the decisions on them."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from pulse_server import companies
from pulse_server.account import company_json
from pulse_server.deps import Config, Db, Operator
from pulse_server.models import Company

router = APIRouter(prefix="/admin", tags=["admin"])


def _row(company: Company) -> dict:
    user = company.user
    return {**company_json(company), "user_email": user.email if user else None}


def _company(db, company_id: int) -> Company:
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(404, "no such company")
    return company


@router.get("/companies")
def list_companies(
    operator: Operator,
    db: Db,
    status: Literal["pending", "active", "rejected", "suspended"] | None = None,
) -> dict:
    query = select(Company).order_by(Company.created_at, Company.id)
    if status:
        query = query.where(Company.status == status)
    return {"companies": [_row(c) for c in db.scalars(query)]}


@router.get("/companies/{company_id}")
def get_company(company_id: int, operator: Operator, db: Db) -> dict:
    return _row(_company(db, company_id))


class Decision(BaseModel):
    slug: str | None = Field(default=None, max_length=63)  # approve only
    note: str | None = Field(default=None, max_length=2000)


@router.post("/companies/{company_id}/{action}")
def decide(
    company_id: int,
    action: Literal["approve", "reject", "suspend", "reactivate"],
    operator: Operator,
    db: Db,
    settings: Config,
    body: Decision | None = None,
) -> dict:
    body = body or Decision()
    if body.slug is not None and action != "approve":
        raise HTTPException(422, "only an approval takes a slug")
    company = _company(db, company_id)
    try:
        companies.decide(
            db, company, action, operator.email, settings, slug=body.slug, note=body.note
        )
    except companies.InvalidSlug as exc:
        raise HTTPException(422, str(exc)) from exc
    except companies.Conflict as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    return _row(company)
