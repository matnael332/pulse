"""ingestions, runs and jobs

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from alembic import op

from pulse_server.db import UTCDateTime

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ingestions",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("demo", sa.Boolean(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("language", sa.String(length=2), nullable=False),
        sa.Column("mapping_version", sa.Integer(), nullable=True),
        sa.Column("auto_approved", sa.Boolean(), nullable=False),
        sa.Column("flags", sa.JSON(), nullable=True),
        sa.Column("report", sa.JSON(), nullable=True),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.Column("error_params", sa.JSON(), nullable=True),
        sa.Column("created_at", UTCDateTime(), nullable=False),
        sa.Column("updated_at", UTCDateTime(), nullable=False),
        sa.Column("approved_at", UTCDateTime(), nullable=True),
        sa.CheckConstraint("language IN ('he', 'en')", name=op.f("ck_ingestions_language")),
        sa.CheckConstraint(
            "status IN ('proposing', 'proposed', 'applying', 'applied', 'failed', 'discarded')",
            name=op.f("ck_ingestions_status"),
        ),
        sa.ForeignKeyConstraint(
            ["company_id"], ["companies.id"], name=op.f("fk_ingestions_company_id_companies")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ingestions")),
    )
    op.create_index(op.f("ix_ingestions_company_id"), "ingestions", ["company_id"], unique=False)
    op.create_table(
        "runs",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("ingestion_id", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("language", sa.String(length=2), nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=True),
        sa.Column("stage", sa.String(length=40), nullable=True),
        sa.Column("stages_done", sa.Integer(), nullable=False),
        sa.Column("exit_code", sa.Integer(), nullable=True),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.Column("error_params", sa.JSON(), nullable=True),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.Column("created_at", UTCDateTime(), nullable=False),
        sa.Column("started_at", UTCDateTime(), nullable=True),
        sa.Column("finished_at", UTCDateTime(), nullable=True),
        sa.CheckConstraint("language IN ('he', 'en')", name=op.f("ck_runs_language")),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed')", name=op.f("ck_runs_status")
        ),
        sa.ForeignKeyConstraint(
            ["company_id"], ["companies.id"], name=op.f("fk_runs_company_id_companies")
        ),
        sa.ForeignKeyConstraint(
            ["ingestion_id"],
            ["ingestions.id"],
            name=op.f("fk_runs_ingestion_id_ingestions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_runs")),
    )
    op.create_index(op.f("ix_runs_company_id"), "runs", ["company_id"], unique=False)
    op.create_index(op.f("ix_runs_ingestion_id"), "runs", ["ingestion_id"], unique=False)
    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("ingestion_id", sa.String(length=32), nullable=True),
        sa.Column("run_id", sa.String(length=40), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", UTCDateTime(), nullable=False),
        sa.Column("started_at", UTCDateTime(), nullable=True),
        sa.Column("heartbeat_at", UTCDateTime(), nullable=True),
        sa.Column("finished_at", UTCDateTime(), nullable=True),
        sa.CheckConstraint("kind IN ('propose', 'apply', 'run')", name=op.f("ck_jobs_kind")),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'done', 'failed')", name=op.f("ck_jobs_status")
        ),
        sa.ForeignKeyConstraint(
            ["company_id"], ["companies.id"], name=op.f("fk_jobs_company_id_companies")
        ),
        sa.ForeignKeyConstraint(
            ["ingestion_id"],
            ["ingestions.id"],
            name=op.f("fk_jobs_ingestion_id_ingestions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["run_id"], ["runs.id"], name=op.f("fk_jobs_run_id_runs"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_jobs")),
    )
    op.create_index(op.f("ix_jobs_company_id"), "jobs", ["company_id"], unique=False)
    op.create_index(op.f("ix_jobs_ingestion_id"), "jobs", ["ingestion_id"], unique=False)
    op.create_index("ix_jobs_status_id", "jobs", ["status", "id"], unique=False)


def downgrade() -> None:
    op.drop_table("jobs")
    op.drop_table("runs")
    op.drop_table("ingestions")
