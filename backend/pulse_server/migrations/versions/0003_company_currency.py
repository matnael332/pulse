"""the currency of a company's revenue figures

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("companies") as batch:
        batch.add_column(
            sa.Column("currency", sa.String(length=3), server_default="ILS", nullable=False)
        )
        batch.create_check_constraint(
            op.f("ck_companies_currency"), "currency IN ('ILS', 'USD', 'EUR')"
        )


def downgrade() -> None:
    with op.batch_alter_table("companies") as batch:
        batch.drop_constraint(op.f("ck_companies_currency"), type_="check")
        batch.drop_column("currency")
