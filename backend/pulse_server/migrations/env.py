"""Alembic environment: the URL comes from pulse_server.migrate, the tables from the models."""

from alembic import context

from pulse_server.db import make_engine
from pulse_server.models import Base

config = context.config


def run_migrations_online() -> None:
    engine = make_engine(config.get_main_option("sqlalchemy.url"))
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    raise SystemExit("offline migrations are not supported")
run_migrations_online()
