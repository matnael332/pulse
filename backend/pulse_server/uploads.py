"""A company's data on the site: upload an export (or try the demo), review the proposed mapping,
approve it, and follow the runs. Every route is for an active company and its own rows only (any
other id is a 404); refusals are ``{"detail": {"code", "params"}}``.

The upload's body is the zip itself, streamed straight into ``uploads/<id>/export.zip`` (no
multipart, no second copy); the worker does the rest. One upload at a time per company.
"""

from __future__ import annotations

import shutil
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from starlette.requests import ClientDisconnect

from pulse_ingest import review, session
from pulse_ingest.review import InvalidEdit, Staged
from pulse_server import jobs
from pulse_server.deps import ActiveCompany, Config, CurrentUser, Db
from pulse_server.errors import http_error
from pulse_server.models import Company, Ingestion, Job, Run, utcnow
from pulse_server.security import audit
from pulse_server.settings import Settings
from pulse_specs.workforce_saas.ingest_contract import CONTRACT

router = APIRouter(prefix="/api", tags=["uploads"])
Language = Literal["he", "en"]
UPLOAD_NAME = "export.zip"


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _error(row) -> dict | None:
    return {"code": row.error_code, "params": row.error_params or {}} if row.error_code else None


def _open_job(db: Session, **where) -> Job | None:
    query = select(Job).where(Job.status.in_(("queued", "running")))
    for name, value in where.items():
        query = query.where(getattr(Job, name) == value)
    return db.scalars(query.order_by(Job.id.desc())).first()


def ingestion_json(db: Session, row: Ingestion) -> dict:
    run = db.scalars(
        select(Run).where(Run.ingestion_id == row.id).order_by(Run.created_at.desc())
    ).first()
    return {
        "id": row.id,
        "status": row.status,
        "demo": row.demo,
        "filename": row.filename,
        "size_bytes": row.size_bytes,
        "language": row.language,
        "mapping_version": row.mapping_version,
        "auto_approved": row.auto_approved,
        "error": _error(row),
        "queue_position": jobs.queue_position(db, _open_job(db, ingestion_id=row.id)),
        "run_id": run.id if run else None,
        "created_at": _iso(row.created_at),
    }


def run_json(db: Session, run: Run) -> dict:
    return {
        "id": run.id,
        "ingestion_id": run.ingestion_id,
        "demo": run.ingestion.demo,
        "status": run.status,
        "language": run.language,
        "mode": run.mode,
        "stage": run.stage,
        "stages_done": run.stages_done,
        "stages": 8,
        "error": _error(run),
        "summary": run.summary,
        "queue_position": jobs.queue_position(db, _open_job(db, run_id=run.id)),
        "created_at": _iso(run.created_at),
        "started_at": _iso(run.started_at),
        "finished_at": _iso(run.finished_at),
    }


def _in_flight(db: Session, company: Company) -> bool:
    ingestion = db.scalar(
        select(Ingestion.id).where(
            Ingestion.company_id == company.id, Ingestion.status.in_(jobs.IN_FLIGHT)
        )
    )
    run = db.scalar(
        select(Run.id).where(Run.company_id == company.id, Run.status.in_(("queued", "running")))
    )
    return bool(ingestion or run)


def company_ingestion(db: Session, company: Company, ingestion_id: str) -> Ingestion:
    row = db.get(Ingestion, ingestion_id)
    if row is None or row.company_id != company.id:
        raise HTTPException(404, "no such upload")
    return row


def company_run(db: Session, company: Company, run_id: str) -> Run:
    run = db.get(Run, run_id)
    if run is None or run.company_id != company.id:
        raise HTTPException(404, "no such run")
    return run


def has_real_data(db: Session, company: Company) -> bool:
    return bool(
        db.scalar(
            select(Ingestion.id).where(
                Ingestion.company_id == company.id,
                Ingestion.demo.is_(False),
                Ingestion.status == "applied",
            )
        )
    )


def remove_demo(db: Session, settings: Settings, company: Company) -> None:
    """The demo's rows (runs and jobs go with them) and its folder."""
    db.execute(delete(Ingestion).where(Ingestion.company_id == company.id, Ingestion.demo))
    shutil.rmtree(jobs.customer_folder(settings, company, demo=True).root, ignore_errors=True)


def overview(db: Session, company: Company) -> dict:
    """For /api/company: what is under way, and the latest result."""
    current = db.scalars(
        select(Ingestion)
        .where(Ingestion.company_id == company.id, Ingestion.status.in_(jobs.IN_FLIGHT))
        .order_by(Ingestion.created_at.desc())
    ).first()
    running = db.scalars(
        select(Run)
        .where(Run.company_id == company.id, Run.status.in_(("queued", "running")))
        .order_by(Run.created_at.desc())
    ).first()
    latest = db.scalars(
        select(Run)
        .where(Run.company_id == company.id, Run.status == "succeeded")
        .order_by(Run.finished_at.desc())
    ).first()
    if current:
        under_way = {"kind": "ingestion", "id": current.id, "status": current.status}
    elif running:
        under_way = {"kind": "run", "id": running.id, "status": running.status}
    else:
        under_way = None
    return {
        "current": under_way,
        "latest_run": run_json(db, latest) if latest else None,
        "has_real_data": has_real_data(db, company),
    }


# ------------------------------------------------------------------------------------ uploads


@router.post("/ingestions", status_code=201)
async def upload(
    request: Request,
    company: ActiveCompany,
    user: CurrentUser,
    db: Db,
    settings: Config,
    filename: str = Query(min_length=1, max_length=255),
    language: Language = "he",
) -> dict:
    limit = settings.max_upload_mb << 20
    if _in_flight(db, company):
        raise http_error(409, "ingestion_in_flight")
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise http_error(413, "upload_too_large", max_mb=settings.max_upload_mb)
    ingestion = session.new_ingestion_id()
    folder = jobs.customer_folder(settings, company, demo=False)
    target = folder.uploads(ingestion) / UPLOAD_NAME
    target.parent.mkdir(parents=True)
    size, refusal = 0, None
    try:
        with open(target, "wb") as out:
            async for chunk in request.stream():
                if size == 0 and chunk and not chunk.startswith(b"PK"[: len(chunk)]):
                    refusal = http_error(422, "upload_not_zip")
                    break
                size += len(chunk)
                if size > limit:
                    refusal = http_error(413, "upload_too_large", max_mb=settings.max_upload_mb)
                    break
                out.write(chunk)
    except ClientDisconnect:
        refusal = http_error(400, "upload_interrupted")
    if refusal is None and size < 4:
        refusal = http_error(422, "upload_empty" if size == 0 else "upload_not_zip")
    if refusal is None and _in_flight(db, company):  # another upload won the race
        refusal = http_error(409, "ingestion_in_flight")
    if refusal is not None:
        shutil.rmtree(target.parent, ignore_errors=True)
        raise refusal
    remove_demo(db, settings, company)
    row = Ingestion(
        id=ingestion,
        company_id=company.id,
        filename=filename,
        size_bytes=size,
        language=language,
    )
    db.add(row)
    jobs.enqueue(db, "propose", company.id, ingestion_id=ingestion)
    audit(db, user.email, "ingestion.upload", company.id, ingestion=ingestion, size=size)
    db.commit()
    return ingestion_json(db, row)


@router.get("/ingestions/{ingestion_id}")
def get_ingestion(ingestion_id: str, company: ActiveCompany, db: Db) -> dict:
    return ingestion_json(db, company_ingestion(db, company, ingestion_id))


def _staged(settings: Settings, company: Company, row: Ingestion) -> Staged:
    if row.status != "proposed":
        raise http_error(409, "not_reviewable", status=row.status)
    folder = jobs.customer_folder(settings, company, row.demo)
    return Staged(folder.staging(row.id))


@router.get("/ingestions/{ingestion_id}/review")
def get_review(ingestion_id: str, company: ActiveCompany, db: Db, settings: Config) -> dict:
    row = company_ingestion(db, company, ingestion_id)
    return review.view(_staged(settings, company, row), CONTRACT, row.flags)


class ColumnFix(BaseModel):
    table: str = Field(max_length=64)
    column: str = Field(max_length=64)
    source: str | None = Field(max_length=255)


class ValueFix(BaseModel):
    table: str = Field(max_length=64)
    column: str = Field(max_length=64)
    spelling: str = Field(max_length=255)
    value: str | None = Field(max_length=64)


class Fixes(BaseModel):
    columns: list[ColumnFix] = Field(default_factory=list, max_length=200)
    values: list[ValueFix] = Field(default_factory=list, max_length=500)


@router.put("/ingestions/{ingestion_id}/mapping")
def fix_mapping(
    ingestion_id: str, fixes: Fixes, company: ActiveCompany, db: Db, settings: Config
) -> dict:
    row = company_ingestion(db, company, ingestion_id)
    staged = _staged(settings, company, row)
    try:
        row.flags = review.edit(
            staged,
            CONTRACT,
            row.flags,
            columns=[f.model_dump() for f in fixes.columns],
            values=[f.model_dump() for f in fixes.values],
        )
    except InvalidEdit as exc:
        raise http_error(422, exc.code, **exc.params) from exc
    db.commit()
    return review.view(staged, CONTRACT, row.flags)


@router.post("/ingestions/{ingestion_id}/approve")
def approve(
    ingestion_id: str, company: ActiveCompany, user: CurrentUser, db: Db, settings: Config
) -> dict:
    row = company_ingestion(db, company, ingestion_id)
    staged = _staged(settings, company, row)
    missing = review.blocking(staged.mapping, CONTRACT)
    if missing:
        raise http_error(409, "mapping_incomplete", columns=missing)
    session.approve(staged.staging.parents[1], row.id)
    row.status, row.approved_at = "applying", utcnow()
    jobs.enqueue(db, "apply", company.id, ingestion_id=row.id)
    audit(db, user.email, "ingestion.approve", company.id, ingestion=row.id)
    db.commit()
    return ingestion_json(db, row)


@router.post("/ingestions/{ingestion_id}/discard")
def discard(
    ingestion_id: str, company: ActiveCompany, user: CurrentUser, db: Db, settings: Config
) -> dict:
    row = company_ingestion(db, company, ingestion_id)
    if row.status != "proposed":
        raise http_error(409, "not_reviewable", status=row.status)
    row.status = "discarded"
    jobs.clean_export(jobs.customer_folder(settings, company, row.demo), row.id)
    audit(db, user.email, "ingestion.discard", company.id, ingestion=row.id)
    db.commit()
    return ingestion_json(db, row)


class Demo(BaseModel):
    language: Language = "he"


@router.post("/demo", status_code=201)
def try_demo(body: Demo, company: ActiveCompany, user: CurrentUser, db: Db, settings: Config):
    """The whole path on our synthetic export, in the demo's own folder; replaces any earlier
    demo. Only before the company has real data."""
    if has_real_data(db, company):
        raise http_error(409, "demo_unavailable")
    if _in_flight(db, company):
        raise http_error(409, "ingestion_in_flight")
    remove_demo(db, settings, company)
    row = Ingestion(
        id=session.new_ingestion_id(),
        company_id=company.id,
        demo=True,
        filename="demo.zip",
        language=body.language,
    )
    db.add(row)
    jobs.enqueue(db, "propose", company.id, ingestion_id=row.id)
    audit(db, user.email, "ingestion.demo", company.id, ingestion=row.id)
    db.commit()
    return ingestion_json(db, row)


# ------------------------------------------------------------------------------------ runs


@router.get("/runs")
def list_runs(company: ActiveCompany, db: Db) -> dict:
    runs = db.scalars(
        select(Run).where(Run.company_id == company.id).order_by(Run.created_at.desc()).limit(50)
    )
    return {"runs": [run_json(db, run) for run in runs]}


@router.get("/runs/{run_id}")
def get_run(run_id: str, company: ActiveCompany, db: Db) -> dict:
    return run_json(db, company_run(db, company, run_id))


@router.post("/runs/{run_id}/retry", status_code=201)
def retry(run_id: str, company: ActiveCompany, user: CurrentUser, db: Db) -> dict:
    """A new run on the same data, after a failed one."""
    failed = company_run(db, company, run_id)
    if failed.status != "failed" or failed.ingestion.status != "applied":
        raise http_error(409, "not_retryable", status=failed.status)
    if _in_flight(db, company):
        raise http_error(409, "ingestion_in_flight")
    run = Run(
        id=session.new_ingestion_id(),
        company_id=company.id,
        ingestion_id=failed.ingestion_id,
        language=failed.language,
    )
    db.add(run)
    db.flush()
    jobs.enqueue(db, "run", company.id, ingestion_id=run.ingestion_id, run_id=run.id)
    audit(db, user.email, "run.retry", company.id, run=run.id, after=failed.id)
    db.commit()
    return run_json(db, run)
