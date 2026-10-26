"""The worker: the queue, the steps of an upload, and the pipeline run (a fake one here; the docker
job runs the real one). SQLite, propose and apply inline, the pipeline in a child process."""

import shutil
import zipfile
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from pulse_ingest import session
from pulse_ingest.layout import CustomerDir
from pulse_server import jobs
from pulse_server.models import Ingestion, Job, Run, utcnow
from pulse_server.worker import Worker
from tests.server_helpers import activate, db_session

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture()
def settings(server_settings, tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("PYTHONPATH", str(BACKEND))  # the fake pipeline lives in tests/
    monkeypatch.delenv("FAKE_PIPELINE", raising=False)
    return server_settings.model_copy(
        update={"work_dir": tmp_path / "var", "worker_poll_seconds": 0.05}
    )


@pytest.fixture()
def company(server, settings):
    return activate(server)


def worker(settings, **kwargs) -> Worker:
    return Worker(settings, inline=True, pipeline_module="tests.fake_pipeline", **kwargs)


def drain(w: Worker) -> int:
    done = 0
    while w.run_once():
        done += 1
    return done


def upload(settings, company, export: Path) -> str:
    """What the upload endpoint does: the zip in uploads/<id>/, a row, a propose job."""
    ingestion = session.new_ingestion_id()
    folder = CustomerDir(settings.customers_root / company["slug"])
    folder.uploads(ingestion).mkdir(parents=True)
    shutil.copyfile(export, folder.uploads(ingestion) / "export.zip")
    with db_session(settings) as db:
        db.add(
            Ingestion(
                id=ingestion,
                company_id=company["id"],
                filename=export.name,
                size_bytes=export.stat().st_size,
                language="he",
            )
        )
        jobs.enqueue(db, "propose", company["id"], ingestion_id=ingestion)
        db.commit()
    return ingestion


def approve(settings, company, ingestion: str) -> None:
    """What the approve endpoint does."""
    session.approve(CustomerDir(settings.customers_root / company["slug"]).root, ingestion)
    with db_session(settings) as db:
        row = db.get(Ingestion, ingestion)
        row.status, row.approved_at = "applying", utcnow()
        jobs.enqueue(db, "apply", company["id"], ingestion_id=ingestion)
        db.commit()


def test_an_upload_from_proposal_to_scores(settings, company, scrambled_export):
    w = worker(settings)
    first = upload(settings, company, scrambled_export.export)
    assert drain(w) == 1
    with db_session(settings) as db:
        row = db.get(Ingestion, first)
        assert row.status == "proposed" and row.mapping_version == 1 and not row.auto_approved
        assert any(c["column"] == "punched_at" for c in row.flags["columns"])
    approve(settings, company, first)
    assert drain(w) == 2  # apply, then the run it queues
    folder = CustomerDir(settings.customers_root / company["slug"])
    with db_session(settings) as db:
        row = db.get(Ingestion, first)
        run = db.scalars(select(Run).where(Run.ingestion_id == first)).one()
        assert row.status == "applied" and row.report["snapshot_date"]
        assert (run.status, run.stages_done, run.mode, run.exit_code) == (
            "succeeded",
            8,
            "deterministic",
            0,
        )
        assert run.summary == {
            "accounts": 5,
            "high": 2,
            "elevated": 1,
            "normal": 2,
            "snapshot_date": row.report["snapshot_date"],
        }
        assert {j.status for j in db.scalars(select(Job))} == {"done"}
    assert not any(folder.root.joinpath("uploads").iterdir())
    assert not any(folder.root.joinpath("staging").iterdir())
    assert (folder.artifacts / "scores_current.csv").exists()  # promoted

    second = upload(settings, company, scrambled_export.export)  # next month, same structure
    assert drain(w) == 3  # propose, apply, run: no review
    with db_session(settings) as db:
        row = db.get(Ingestion, second)
        assert row.status == "applied" and row.auto_approved and row.mapping_version == 1


def _queued_run(settings, company) -> str:
    """A run of an applied ingestion, queued (the fake pipeline needs no data)."""
    with db_session(settings) as db:
        ingestion = Ingestion(
            id=session.new_ingestion_id(),
            company_id=company["id"],
            filename="x.zip",
            language="en",
            status="applied",
        )
        db.add(ingestion)
        run = Run(id="run1", company_id=company["id"], ingestion_id=ingestion.id, language="en")
        db.add(run)
        db.flush()
        jobs.enqueue(db, "run", company["id"], ingestion_id=ingestion.id, run_id=run.id)
        db.commit()
    return "run1"


@pytest.mark.parametrize(
    ("mode", "status", "code", "params"),
    [
        ("fail", "failed", "pipeline_failed", {"stage": "gate_contract"}),
        ("crash", "failed", "pipeline_crashed", {"exit_code": 2}),
        ("hang", "failed", "run_timeout", {"minutes": 0.02}),
    ],
)
def test_a_run_that_does_not_succeed_says_why(
    settings, company, monkeypatch, mode, status, code, params
):
    monkeypatch.setenv("FAKE_PIPELINE", mode)
    settings = settings.model_copy(update={"run_timeout_minutes": 0.02})
    run_id = _queued_run(settings, company)
    assert drain(worker(settings)) == 1
    with db_session(settings) as db:
        run = db.get(Run, run_id)
        assert (run.status, run.error_code, run.error_params) == (status, code, params)
        job = db.scalars(select(Job)).one()
        assert job.status == "failed" and job.error


def test_the_queue_is_first_in_first_out_and_claimed_once(settings, company):
    with db_session(settings) as db:
        first = jobs.enqueue(db, "propose", company["id"])
        second = jobs.enqueue(db, "propose", company["id"])
        db.commit()
        assert jobs.queue_position(db, second) == 1
        assert jobs.claim(db).id == first.id
        db.refresh(second)
        assert jobs.queue_position(db, second) == 1  # the running one is still ahead
        assert jobs.claim(db).id == second.id
        assert jobs.claim(db) is None


def test_a_job_whose_worker_died_fails_with_what_it_was_doing(settings, company):
    with db_session(settings) as db:
        db.add(Ingestion(id="ing1", company_id=company["id"], filename="x.zip", language="he"))
        job = jobs.enqueue(db, "propose", company["id"], ingestion_id="ing1")
        db.commit()
        jobs.claim(db)
        job.heartbeat_at = utcnow() - timedelta(minutes=5)
        db.commit()
        assert jobs.recover_stale(db, settings) == [job.id]
        assert db.get(Ingestion, "ing1").error_code == "worker_lost"
        assert db.get(Job, job.id).status == "failed"


@pytest.mark.parametrize("inline", [True, False])  # False: the step runs in a child process
def test_an_unsafe_export_is_refused_and_removed(settings, company, tmp_path, inline):
    bad = tmp_path / "bad.zip"
    with zipfile.ZipFile(bad, "w") as zf:
        zf.writestr("../evil.csv", "a\n1\n")
    ingestion = upload(settings, company, bad)
    w = Worker(settings, inline=inline)
    assert drain(w) == 1
    with db_session(settings) as db:
        row = db.get(Ingestion, ingestion)
        assert (row.status, row.error_code) == ("failed", "archive_unsafe_path")
        assert row.error_params == {"file": "../evil.csv"}
    folder = CustomerDir(settings.customers_root / company["slug"])
    assert not folder.uploads(ingestion).exists() and not folder.staging(ingestion).exists()
