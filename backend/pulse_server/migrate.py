"""Alembic from code: the migrations ship inside the package, there is no alembic.ini."""

from __future__ import annotations

from alembic import command
from alembic.config import Config


def alembic_config(url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", "pulse_server:migrations")
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def upgrade(url: str) -> None:
    command.upgrade(alembic_config(url), "head")
