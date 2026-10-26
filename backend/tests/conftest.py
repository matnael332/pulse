"""Shared pytest configuration and fixtures (the toy dataset spec stands in for a real one)."""

import os
import shutil
from pathlib import Path

import pytest

# Keep CrewAI quiet and offline in tests, before anything imports it.
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
os.environ.setdefault("OTEL_SDK_DISABLED", "true")
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")
os.environ.setdefault("CREWAI_TESTING", "true")
os.environ.setdefault("MPLBACKEND", "Agg")

SPEC_REF = "tests.toy_spec:SPEC"


@pytest.fixture(scope="session")
def spec():
    from tests.toy_spec import SPEC

    return SPEC


@pytest.fixture(scope="session")
def toy_data_dir(tmp_path_factory) -> Path:
    """A data folder with raw/ (events.csv, schema, manifest) and an empty lookups/."""
    from tests.toy_spec import write_raw

    data = tmp_path_factory.mktemp("toy_data")
    write_raw(data / "raw")
    (data / "lookups").mkdir()
    return data


@pytest.fixture(scope="session")
def analyst_out(tmp_path_factory, spec, toy_data_dir) -> Path:
    """One deterministic analyst-stage run on the toy data, shared by read-only tests."""
    from pulse_core.stages import run_analyst_stage

    out = tmp_path_factory.mktemp("analyst")
    run_analyst_stage(spec, toy_data_dir / "raw", toy_data_dir / "lookups", out)
    return out


@pytest.fixture(scope="session")
def pipeline_out(tmp_path_factory, spec, analyst_out) -> Path:
    """Analyst output plus the feature and modeling stages (deterministic), shared read-only."""
    from pulse_core.stages import run_feature_stage, run_modeling_stage

    out = tmp_path_factory.mktemp("pipeline") / "artifacts"
    shutil.copytree(analyst_out, out)
    run_feature_stage(spec, out)
    run_modeling_stage(spec, out)
    return out


@pytest.fixture()
def pipeline_copy(tmp_path, pipeline_out) -> Path:
    """A private, mutable copy of the full pipeline output."""
    target = tmp_path / "artifacts"
    shutil.copytree(pipeline_out, target)
    return target


@pytest.fixture(scope="session")
def bundle(pipeline_out):
    """The toy model loaded the way the API loads it."""
    from pulse_api.model import ModelBundle

    loaded = ModelBundle(pipeline_out)
    assert loaded.ok, loaded.error
    return loaded


@pytest.fixture(scope="session")
def api_record() -> dict:
    """A valid /predict record for the toy model (fields are the model features)."""
    return {"row_id": "r9999", "x_num": 1.5, "x_cat": "a", "x_flag": 0, "x_num_sq": 2.25}


@pytest.fixture()
def server_settings(tmp_path, monkeypatch):
    """Server settings on a SQLite file, with the dev login on and one operator."""
    from pulse_server.settings import Settings

    for name in list(os.environ):
        if name.startswith("PULSE_"):
            monkeypatch.delenv(name)
    return Settings(
        _env_file=None,
        env="development",
        dev_login=True,
        database_url=f"sqlite:///{(tmp_path / 'server.db').as_posix()}",
        customers_root=tmp_path / "customers",
        operator_emails="ops@example.com",
        public_url="http://testserver",
    )


@pytest.fixture()
def server(server_settings):
    """A test client of the server on a migrated database."""
    from fastapi.testclient import TestClient

    from pulse_server.app import create_app
    from pulse_server.migrate import upgrade

    upgrade(server_settings.database_url)
    with TestClient(create_app(server_settings)) as client:
        yield client
