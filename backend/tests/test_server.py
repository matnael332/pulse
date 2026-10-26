"""The server: settings, database, sign-in sessions, companies and the operator's approval.

Runs on a SQLite file; the CI docker job runs the same flow against Postgres."""

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from pydantic import ValidationError

from pulse_server.db import make_engine
from pulse_server.models import Base
from pulse_server.settings import Settings

# ----------------------------------------------------------------------------- settings, database


def test_the_migrations_build_exactly_the_models(server, server_settings):
    engine = make_engine(server_settings.database_url)
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    engine.dispose()
    assert diff == []


def test_health(server):
    response = server.get("/health")
    assert response.status_code == 200 and response.json() == {"status": "ok", "db": "ok"}


def test_production_refuses_the_dev_login_and_a_missing_secret(server_settings):
    with pytest.raises(ValidationError, match="DEV_LOGIN"):
        Settings(_env_file=None, env="production", dev_login=True, secret_key="k" * 40)
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(_env_file=None, env="production")
    assert Settings(_env_file=None, env="production", secret_key="k" * 40).env == "production"


def test_operators_are_a_case_insensitive_list(server_settings):
    settings = Settings(_env_file=None, env="development", operator_emails=" A@x.io, b@y.io ,")
    assert settings.operators == {"a@x.io", "b@y.io"}
