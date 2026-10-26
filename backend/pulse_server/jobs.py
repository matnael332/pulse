"""The worker's queue in the database: enqueue, claim in order, heartbeat, finish.

A claim is one conditional UPDATE (``... WHERE id = :id AND status = 'queued'``), the same on
Postgres and SQLite: two workers can never take the same job. A running job whose heartbeat stops
(the worker died) is failed as ``worker_lost``, and so is what it was doing.
"""

from __future__ import annotations

import shutil
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from pulse_ingest.layout import CustomerDir
from pulse_server.models import Company, Ingestion, Job, Run, utcnow
from pulse_server.settings import Settings

STALE_AFTER = timedelta(seconds=60)
IN_FLIGHT = ("proposing", "proposed", "applying")


def customer_folder(settings: Settings, company: Company, demo: bool) -> CustomerDir:
    """A company's folder (absolute: the pipeline runs from the repository root); the demo has
    its own, so its secret key, entity map and mappings never meet the real export."""
    root = (settings.customers_root / company.slug).resolve()
    return CustomerDir(root / "demo" if demo else root)


def enqueue(
    db: Session,
    kind: str,
    company_id: int,
    *,
    ingestion_id: str | None = None,
    run_id: str | None = None,
) -> Job:
    job = Job(kind=kind, company_id=company_id, ingestion_id=ingestion_id, run_id=run_id)
    db.add(job)
    return job


def claim(db: Session) -> Job | None:
    """The oldest queued job, now running (committed), or None."""
    while True:
        job_id = db.scalar(select(Job.id).where(Job.status == "queued").order_by(Job.id).limit(1))
        if job_id is None:
            return None
        now = utcnow()
        taken = db.execute(
            update(Job)
            .where(Job.id == job_id, Job.status == "queued")
            .values(status="running", started_at=now, heartbeat_at=now, attempts=Job.attempts + 1)
        )
        db.commit()
        if taken.rowcount == 1:
            return db.get(Job, job_id)


def heartbeat(db: Session, job: Job) -> None:
    job.heartbeat_at = utcnow()
    db.commit()


def finish(db: Session, job: Job, *, error: str | None = None) -> None:
    job.status = "failed" if error else "done"
    job.error = error
    job.finished_at = utcnow()
    db.commit()


def queue_position(db: Session, job: Job | None) -> int:
    """How many jobs go before this one (0: it is running or next)."""
    if job is None or job.status != "queued":
        return 0
    ahead = db.scalar(
        select(func.count()).where(Job.status.in_(("queued", "running")), Job.id < job.id)
    )
    return int(ahead or 0)


def fail_ingestion(
    db: Session, settings: Settings, ingestion: Ingestion, code: str, params: dict | None = None
) -> None:
    """The ingestion failed: its code for the company, and nothing of the export kept."""
    ingestion.status = "failed"
    ingestion.error_code = code
    ingestion.error_params = params or {}
    company = db.get(Company, ingestion.company_id)
    clean_export(customer_folder(settings, company, ingestion.demo), ingestion.id)


def fail_run(run: Run, code: str, params: dict | None = None, exit_code: int | None = None) -> None:
    run.status = "failed"
    run.error_code = code
    run.error_params = params or {}
    run.exit_code = exit_code
    run.finished_at = utcnow()


def clean_export(folder: CustomerDir, ingestion: str) -> None:
    for path in (folder.uploads(ingestion), folder.staging(ingestion)):
        shutil.rmtree(path, ignore_errors=True)


def recover_stale(db: Session, settings: Settings) -> list[int]:
    """Fail the running jobs whose worker stopped beating, and what they were doing."""
    stale = db.scalars(
        select(Job).where(Job.status == "running", Job.heartbeat_at < utcnow() - STALE_AFTER)
    ).all()
    for job in stale:
        finish(db, job, error="worker_lost: no heartbeat")
        if job.run_id:
            run = db.get(Run, job.run_id)
            if run and run.status in ("queued", "running"):
                fail_run(run, "worker_lost")
        elif job.ingestion_id:
            ingestion = db.get(Ingestion, job.ingestion_id)
            if ingestion and ingestion.status in IN_FLIGHT:
                fail_ingestion(db, settings, ingestion, "worker_lost")
        db.commit()
    return [job.id for job in stale]
