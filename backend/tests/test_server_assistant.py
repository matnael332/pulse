"""The business copilot: one answer about a finished run, from tools that know the accounts by
pseudonym only; the reader's words for reasons and levels; the errors and the scoping."""

import json
import logging
from types import SimpleNamespace

import pytest

from pulse_ingest.layout import CustomerDir
from pulse_server.llm import Llm
from tests.server_helpers import activate
from tests.test_server_changes import _done

NAMES = ("מאפיית הגליל", "מוסך הדרום", "10001", "10002")  # the entity map's names and numbers
GLOSSARY = {
    "reason.payroll_exports": "הפסיקו להפיק שכר",
    "level.high": "סיכון גבוה",
    "level.normal": "סיכון רגיל",
}
REASONS = {
    "entities": [
        {
            "account_id": "acc_000001",
            "reasons": [
                {
                    "code": "payroll_exports",
                    "feature": "payroll_exported_delta_1m",
                    "value": -1,
                    "typical": 0,
                    "contribution": 0.2,
                }
            ],
        }
    ]
}


class FakeModels:
    """Gemini with automatic function calling: calls every tool, then answers with what it got."""

    def __init__(self, error=None):
        self.error, self.calls, self.results = error, [], {}

    def generate_content(self, *, model, contents, config):
        self.calls.append({"contents": contents, "config": config})
        if self.error:
            raise self.error
        tools = {f.__name__: f for f in config.tools}
        self.results = {
            "list_accounts_at_risk": tools["list_accounts_at_risk"]("high"),
            "get_account": tools["get_account"]("acc_000001"),
            "get_changes": tools["get_changes"](),
            "get_data_gaps": tools["get_data_gaps"](),
        }
        probability = self.results["get_account"]["probability"]
        return SimpleNamespace(
            text=f"acc_000001 is the riskiest: {probability} likely to leave.",
            usage_metadata=SimpleNamespace(prompt_token_count=120, candidates_token_count=20),
        )


@pytest.fixture()
def runs(server, server_settings):
    """July and August of one company; acc_000001 entered high risk, acc_000002 is gone."""
    company = activate(server)
    july = {"acc_000002": ("high", 0.7, 400), "acc_000001": ("normal", 0.1, 900)}
    august = {"acc_000001": ("high", 0.85, 950), "acc_000003": ("normal", 0.1, 50)}
    _done(server_settings, company, "july", snapshot="2025-08-01", accounts=july, day=0)
    _done(server_settings, company, "aug", snapshot="2025-09-01", accounts=august, day=1)
    art = CustomerDir(server_settings.customers_root / "acme").runs / "aug" / "artifacts"
    (art / "reasons.json").write_text(json.dumps(REASONS), encoding="utf-8")
    return company


def _fake(server, **kwargs) -> FakeModels:
    models = FakeModels(**kwargs)
    server.app.state.llm = Llm(client=SimpleNamespace(models=models))
    return models


def _ask(server, run="aug", **body):
    question = {"message": "מי בסיכון?", "language": "he", "glossary": GLOSSARY, **body}
    return server.post(f"/api/runs/{run}/copilot", json=question)


def test_the_answer_comes_from_the_tools_in_the_readers_words(server, runs, caplog):
    models = _fake(server)
    history = [{"role": "user", "text": "שלום"}, {"role": "model", "text": "שלום, במה אעזור?"}]
    with caplog.at_level(logging.INFO, logger="pulse_server.assistant"):
        answer = _ask(server, history=history)
    assert answer.status_code == 200
    shown = answer.json()
    assert shown["text"] == "acc_000001 is the riskiest: 85.0% likely to leave."
    assert shown["ungrounded"] == []
    assert shown["tools"] == [
        "list_accounts_at_risk",
        "get_account",
        "get_changes",
        "get_data_gaps",
    ]

    results = models.results
    at_risk = results["list_accounts_at_risk"]
    assert at_risk["level"] == "סיכון גבוה" and at_risk["accounts_at_this_level"] == 1
    assert at_risk["monthly_revenue_at_this_level"] == "950 ILS"
    account = results["get_account"]
    assert account["reasons"][0]["reason"] == "הפסיקו להפיק שכר"
    assert account["last_month"] == {"level": "סיכון רגיל", "probability": "10.0%"}
    assert account["rank_of"] == 2
    changes = results["get_changes"]
    assert changes["counts"] == {"entered_high": 1, "rose": 0, "gone": 1}
    assert changes["compared_with_data_as_of"] == "2025-08-01"
    assert [a["id"] for a in changes["gone"]] == ["acc_000002"]

    call = models.calls[0]
    assert "Hebrew" in call["config"].system_instruction
    assert len(call["contents"]) == 3  # the two turns before, then the question
    assert "copilot:" in caplog.text and "מי בסיכון" not in caplog.text  # tokens, never the text


def test_no_account_name_or_number_reaches_the_model(server, runs):
    models = _fake(server)
    assert _ask(server).status_code == 200
    sent = str(models.calls[0]["contents"]) + models.calls[0]["config"].system_instruction
    seen = sent + json.dumps(models.results, ensure_ascii=False)
    for private in NAMES:
        assert private not in seen, private


def test_the_first_month_has_no_changes_to_tell(server, runs):
    models = _fake(server)
    assert _ask(server, run="july").status_code == 200
    assert models.results["get_changes"] == {
        "error": "no earlier month to compare with",
        "source": ["runs"],
    }
    assert "last_month" not in models.results["get_account"]


def test_without_the_model_or_its_quota_there_is_no_answer(server, runs):
    missing = _ask(server)
    assert missing.status_code == 503 and missing.json()["detail"]["code"] == "llm_unavailable"
    quota = Exception("429 RESOURCE_EXHAUSTED")
    quota.code = 429
    _fake(server, error=quota)
    spent = _ask(server)
    assert spent.status_code == 503 and spent.json()["detail"]["code"] == "llm_quota"


@pytest.mark.parametrize(
    "body",
    [
        {"message": ""},
        {"message": "x" * 2001},
        {"language": "fr"},
        {"history": [{"role": "user", "text": "hi"}] * 7},
        {"glossary": {"name.acc_000001": "מאפיית הגליל"}},  # only words for codes, never names
        {"glossary": {"reason.x": "y" * 81}},
    ],
)
def test_a_question_out_of_bounds_is_refused(server, runs, body):
    _fake(server)
    assert _ask(server, **body).status_code == 422


def test_only_ones_own_finished_runs(server, server_settings, runs):
    _fake(server)
    assert _ask(server, run="nope").status_code == 404
    other = activate(server, "b@b.example", "Beta", "beta")
    assert _ask(server).status_code == 404
    _done(server_settings, other, "sept", snapshot="2025-10-01", accounts={}, status="queued")
    waiting = _ask(server, run="sept")
    assert waiting.status_code == 409 and waiting.json()["detail"]["code"] == "not_ready"
