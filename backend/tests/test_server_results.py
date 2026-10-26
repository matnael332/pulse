"""A finished run's results for its company: the business view with the account names, the
advanced view, the documents and the figures; nothing else of the run is ever served."""

from pathlib import Path

import pytest

from pulse_ingest.layout import CustomerDir
from pulse_server.worker import Worker
from tests.server_helpers import activate
from tests.test_server_worker import _queued_run

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture()
def finished(server, server_settings, monkeypatch):
    """An active company with one run done by the fake pipeline, and its entity map."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("PYTHONPATH", str(BACKEND))
    monkeypatch.delenv("FAKE_PIPELINE", raising=False)
    company = activate(server)
    run_id = _queued_run(server_settings, company)
    worker = Worker(server_settings, inline=True, pipeline_module="tests.fake_pipeline")
    while worker.run_once():
        pass
    folder = CustomerDir(server_settings.customers_root / "acme")
    folder.entity_map.write_text(
        "pseudo_id,source_id,name\nacc_000001,10001,מאפיית הגליל\nacc_000002,10002,\n",
        encoding="utf-8",
    )
    return run_id


def test_the_business_view_names_the_accounts_at_risk(server, finished):
    shown = server.get(f"/api/runs/{finished}/results").json()
    first, second = shown["accounts"][:2]
    assert (first["name"], first["customer_id"], first["level"]) == (
        "מאפיית הגליל",
        "10001",
        "high",
    )
    assert second["name"] == "" and second["customer_id"] == "10002"
    assert first["reasons"][0]["code"] == "payroll_exports" and not shown["accounts"][4]["reasons"]
    assert shown["distribution"]["levels"] == {"high": 2, "elevated": 1, "normal": 2}
    assert sum(b["count"] for b in shown["distribution"]["histogram"]) == 5
    assert [t["month"] for t in shown["trend"]] == ["2025-01", "2025-02"]
    assert shown["insights"]["headline"] and shown["insights"]["source"] == "template"
    assert shown["groups"]["missing"] == ["shifts"]
    assert shown["summary"]["accounts"] == 5 and not shown["run"]["demo"]


def test_the_advanced_view_and_its_documents(server, finished):
    shown = server.get(f"/api/runs/{finished}/advanced").json()
    assert shown["selected_model"] == "logistic_regression" and shown["threshold"] == 0.33
    assert shown["candidates"]["logistic_regression"]["test"]["roc_auc"] == 0.8
    assert shown["importance"][0]["description"] == "payroll change"
    assert shown["figures"] == ["roc_curves.png"]
    assert shown["docs"] == ["model_card", "evaluation_report", "data_check"]
    card = server.get(f"/api/runs/{finished}/docs/model_card")
    assert card.status_code == 200 and card.text.startswith("# Model card")
    assert card.headers["content-type"].startswith("text/markdown")
    assert server.get(f"/api/runs/{finished}/docs/run_status").status_code == 404


@pytest.mark.parametrize(
    "name", ["model.joblib", "../model.joblib", "..%2Fmodel.joblib", "missing.png", "ROC.png"]
)
def test_only_the_listed_figures_are_served(server, finished, name):
    figure = server.get(f"/api/runs/{finished}/figures/roc_curves.png")
    assert figure.status_code == 200 and figure.content.startswith(b"\x89PNG")
    assert server.get(f"/api/runs/{finished}/figures/{name}").status_code == 404


def test_results_wait_for_a_finished_run_of_ones_own(server, server_settings, finished):
    assert server.get("/api/runs/nope/results").status_code == 404
    queued = server.post(f"/api/runs/{finished}/retry")  # a succeeded run cannot be retried
    assert queued.json()["detail"]["code"] == "not_retryable"
    activate(server, "b@b.example", "Beta", "beta")
    assert server.get(f"/api/runs/{finished}/results").status_code == 404
    assert server.get(f"/api/runs/{finished}/figures/roc_curves.png").status_code == 404
