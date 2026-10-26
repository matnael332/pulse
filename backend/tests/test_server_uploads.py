"""Uploads through the site's API: the stream to disk, the customer's review, approval, the runs.
The worker runs inline with the fake pipeline."""

import zipfile
from pathlib import Path

import pytest

from pulse_core.io import read_json
from pulse_ingest.layout import CustomerDir
from pulse_server.worker import Worker
from tests.conftest import PERSONAL
from tests.server_helpers import activate, login, signup

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def _environment(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("PYTHONPATH", str(BACKEND))
    monkeypatch.delenv("FAKE_PIPELINE", raising=False)


@pytest.fixture()
def company(server):
    return activate(server)


@pytest.fixture()
def worker(server_settings):
    return Worker(server_settings, inline=True, pipeline_module="tests.fake_pipeline")


def drain(worker: Worker) -> None:
    while worker.run_once():
        pass


def send(client, body: bytes, filename: str = "export.zip", **headers):
    return client.post(
        f"/api/ingestions?filename={filename}&language=he",
        content=body,
        headers={"content-type": "application/zip", **headers},
    )


def code(response) -> str:
    return response.json()["detail"]["code"]


def test_upload_review_fix_approve_and_run(
    server, server_settings, company, worker, scrambled_export
):
    sent = send(server, scrambled_export.export.read_bytes())
    assert sent.status_code == 201
    ingestion = sent.json()
    assert ingestion["status"] == "proposing" and ingestion["queue_position"] == 0
    folder = CustomerDir(server_settings.customers_root / "acme")
    stored = folder.uploads(ingestion["id"]) / "export.zip"
    assert stored.read_bytes() == scrambled_export.export.read_bytes()
    assert code(send(server, b"PK..")) == "ingestion_in_flight"

    drain(worker)
    url = f"/api/ingestions/{ingestion['id']}"
    assert server.get(url).json()["status"] == "proposed"
    shown = server.get(f"{url}/review").json()
    assert set(PERSONAL) <= {c for cols in shown["ignored"].values() for c in cols}
    punch = next(c for c in shown["columns"] if c["column"] == "punched_at")
    assert not shown["blocking"] and punch["options"]

    wrong = {"columns": [{"table": "accounts", "column": "account_id", "source": "x"}]}
    refused = server.put(f"{url}/mapping", json=wrong)
    assert refused.status_code == 422 and refused.json()["detail"] == {
        "code": "invalid_edit",
        "params": {"reason": "not_flagged"},
    }
    confirm = {
        "columns": [{"table": "punches", "column": "punched_at", "source": punch["current"]}]
    }
    assert server.put(f"{url}/mapping", json=confirm).status_code == 200
    staged = read_json(folder.staging(ingestion["id"]) / "mapping.proposed.json")
    confirmed = staged["tables"]["punches"]["columns"]["punched_at"]
    assert confirmed["origin"] == "user" and confirmed["time_column"] == punch["time_column"]

    approved = server.post(f"{url}/approve")
    assert approved.status_code == 200 and approved.json()["status"] == "applying"
    drain(worker)
    done = server.get(url).json()
    assert done["status"] == "applied" and done["run_id"]
    run = server.get(f"/api/runs/{done['run_id']}").json()
    assert run["status"] == "succeeded" and run["stages_done"] == run["stages"] == 8
    assert run["summary"]["accounts"] == 5 and not run["demo"]
    mine = server.get("/api/company").json()
    assert mine["has_model"] and mine["has_real_data"] and mine["current"] is None
    assert mine["latest_run"]["id"] == run["id"]
    assert [r["id"] for r in server.get("/api/runs").json()["runs"]] == [run["id"]]

    # another company sees none of it
    activate(server, "b@b.example", "Beta", "beta")
    assert server.get(url).status_code == 404
    assert server.get(f"/api/runs/{run['id']}").status_code == 404


def test_uploads_that_are_refused_leave_nothing(server, server_settings, company):
    folder = CustomerDir(server_settings.customers_root / "acme")
    assert code(send(server, b"")) == "upload_empty"
    assert code(send(server, b"%PDF-1.7 not a zip")) == "upload_not_zip"
    small = server_settings.model_copy(update={"max_upload_mb": 1})
    server.app.state.settings = small
    assert code(send(server, b"PK" + b"0" * (2 << 20))) == "upload_too_large"
    assert not any(folder.root.joinpath("uploads").glob("*/*"))


def test_only_an_active_company_uploads_and_only_from_the_site(server, company):
    cross = send(server, b"PK..", origin="https://evil.example")
    assert cross.status_code == 403
    signup(server, "new@c.example", "Gamma")
    assert send(server, b"PK..").status_code == 403
    server.cookies.clear()
    assert send(server, b"PK..").status_code == 401


def test_a_refused_export_says_why_and_is_not_reviewable(
    server, server_settings, company, worker, tmp_path
):
    export = tmp_path / "bad.zip"
    with zipfile.ZipFile(export, "w") as zf:
        zf.writestr("../evil.csv", "a\n1\n")
    failed = send(server, export.read_bytes()).json()
    drain(worker)
    shown = server.get(f"/api/ingestions/{failed['id']}").json()
    assert shown["status"] == "failed"
    assert shown["error"] == {"code": "archive_unsafe_path", "params": {"file": "../evil.csv"}}
    assert server.post(f"/api/ingestions/{failed['id']}/discard").status_code == 409


def test_a_failed_run_can_be_retried(server, server_settings, company, worker, monkeypatch):
    from tests.test_server_worker import _queued_run

    monkeypatch.setenv("FAKE_PIPELINE", "fail")
    run_id = _queued_run(server_settings, company)
    drain(worker)
    failed = server.get(f"/api/runs/{run_id}").json()
    assert failed["error"] == {"code": "pipeline_failed", "params": {"stage": "gate_contract"}}
    monkeypatch.setenv("FAKE_PIPELINE", "ok")
    again = server.post(f"/api/runs/{run_id}/retry")
    assert again.status_code == 201 and again.json()["status"] == "queued"
    assert server.post(f"/api/runs/{run_id}/retry").json()["detail"]["code"] == (
        "ingestion_in_flight"
    )
    drain(worker)
    assert server.get(f"/api/runs/{again.json()['id']}").json()["status"] == "succeeded"
    login(server, "owner@acme.example")
