"""Companies, their one user, sign-in sessions, the audit log, and a company's data at work.

One user per company is a unique ``users.company_id``. Whether a user is an operator is not
stored: it follows ``PULSE_OPERATOR_EMAILS`` on every request, so removing an address revokes it.

An upload is an ``Ingestion`` (proposing -> proposed -> applying -> applied, or failed or
discarded); an applied one gets a ``Run`` of the pipeline. ``Job`` is the worker's queue: one row
per step to do (propose, apply, run), claimed in order, one at a time.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from pulse_server.db import UTCDateTime

COMPANY_STATUSES = ("pending", "active", "rejected", "suspended")
CURRENCIES = ("ILS", "USD", "EUR")  # what the company's revenue figures are in
PROVIDERS = ("google", "microsoft", "dev")
LANGUAGES = ("he", "en")
INGESTION_STATUSES = ("proposing", "proposed", "applying", "applied", "failed", "discarded")
RUN_STATUSES = ("queued", "running", "succeeded", "failed")
JOB_KINDS = ("propose", "apply", "run")
JOB_STATUSES = ("queued", "running", "done", "failed")


def utcnow() -> datetime:
    return datetime.now(UTC)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (
        CheckConstraint(_in("status", COMPANY_STATUSES), name="status"),
        CheckConstraint(_in("currency", CURRENCIES), name="currency"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str | None] = mapped_column(String(63), unique=True)  # set on approval
    status: Mapped[str] = mapped_column(String(16), default="pending")
    currency: Mapped[str] = mapped_column(String(3), default="ILS", server_default="ILS")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    decided_by: Mapped[str | None] = mapped_column(String(320))
    note: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User | None] = relationship(back_populates="company")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_users_provider_subject"),
        CheckConstraint(_in("provider", PROVIDERS), name="provider"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(16))
    subject: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(320))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    display_name: Mapped[str | None] = mapped_column(String(200))
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    company: Mapped[Company | None] = relationship(back_populates="user")


class LoginSession(Base):
    __tablename__ = "login_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256 of the cookie token
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    user: Mapped[User] = relationship()


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    actor_email: Mapped[str | None] = mapped_column(String(320))
    action: Mapped[str] = mapped_column(String(40))
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), index=True
    )
    detail: Mapped[dict | None] = mapped_column(JSON)


class Ingestion(Base):
    __tablename__ = "ingestions"
    __table_args__ = (
        CheckConstraint(_in("status", INGESTION_STATUSES), name="status"),
        CheckConstraint(_in("language", LANGUAGES), name="language"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # pulse_ingest's ingestion id
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="proposing")
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    filename: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    language: Mapped[str] = mapped_column(String(2))
    mapping_version: Mapped[int | None] = mapped_column(Integer)
    auto_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    flags: Mapped[dict | None] = mapped_column(JSON)  # what the customer may fix (review.flags)
    report: Mapped[dict | None] = mapped_column(JSON)  # the preflight report
    error_code: Mapped[str | None] = mapped_column(String(40))
    error_params: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (
        CheckConstraint(_in("status", RUN_STATUSES), name="status"),
        CheckConstraint(_in("language", LANGUAGES), name="language"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # the pipeline's --run-id
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    ingestion_id: Mapped[str] = mapped_column(
        ForeignKey("ingestions.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(16), default="queued")
    language: Mapped[str] = mapped_column(String(2))
    mode: Mapped[str | None] = mapped_column(String(16))  # llm | deterministic
    stage: Mapped[str | None] = mapped_column(String(40))
    stages_done: Mapped[int] = mapped_column(Integer, default=0)
    exit_code: Mapped[int | None] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(40))
    error_params: Mapped[dict | None] = mapped_column(JSON)
    summary: Mapped[dict | None] = mapped_column(JSON)  # accounts per risk level, snapshot date
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    ingestion: Mapped[Ingestion] = relationship()


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint(_in("kind", JOB_KINDS), name="kind"),
        CheckConstraint(_in("status", JOB_STATUSES), name="status"),
        Index("ix_jobs_status_id", "status", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="queued")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    ingestion_id: Mapped[str | None] = mapped_column(
        ForeignKey("ingestions.id", ondelete="CASCADE"), index=True
    )
    run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)  # for the operator; the company gets a code
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    heartbeat_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
