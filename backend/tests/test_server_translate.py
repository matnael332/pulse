"""The insights in the other language: translated once by the language model, checked, and kept
beside the run's artifacts; the original language needs no model, and without one there is none."""

import json
import logging
from types import SimpleNamespace

import pytest

from pulse_ingest.layout import CustomerDir
from pulse_server.llm import Llm
from pulse_server.translate import FindingText, InsightsText
from tests.server_helpers import activate
from tests.test_server_changes import _done

INSIGHTS = {
    "source": "template",
    "language": "en",
    "headline": "2 of 5 accounts are at high risk.",
    "key_findings": [
        {"title": "Payroll", "evidence": "11.9% stopped exporting", "business_meaning": "a sign"}
    ],
    "recommendations": ["Call them"],
    "data_caveats": [],
}
HEBREW = InsightsText(
    headline="2 מתוך 5 לקוחות בסיכון גבוה.",
    key_findings=[
        FindingText(title="שכר", evidence="11.9% הפסיקו להפיק שכר", business_meaning="סימן")
    ],
    recommendations=["להתקשר אליהם"],
    data_caveats=[],
)


class FakeModels:
    def __init__(self, answer=None, error=None):
        self.answer, self.error, self.calls = answer or HEBREW, error, []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        if self.error:
            raise self.error
        return SimpleNamespace(parsed=self.answer, text="", usage_metadata=None)


@pytest.fixture()
def run(server, server_settings):
    """A finished run of an active company, its insights in English (the general text)."""
    company = activate(server)
    _done(server_settings, company, "aug", snapshot="2025-09-01", accounts={})
    art = CustomerDir(server_settings.customers_root / "acme").runs / "aug" / "artifacts"
    (art / "narratives.json").write_text(json.dumps({"insights": INSIGHTS}), encoding="utf-8")
    return art


def _fake(server, **kwargs) -> FakeModels:
    models = FakeModels(**kwargs)
    server.app.state.llm = Llm(client=SimpleNamespace(models=models))
    return models


def _translate(server, language="he"):
    return server.post("/api/runs/aug/insights/translation", json={"language": language})


def test_the_insights_are_translated_once_and_kept(server, run, caplog):
    models = _fake(server)
    before = (run / "narratives.json").read_bytes()
    with caplog.at_level(logging.INFO, logger="pulse_server.llm"):
        first = _translate(server)
    assert "translation:" in caplog.text  # the call and its tokens are logged...
    assert "accounts" not in caplog.text and "שכר" not in caplog.text  # ...never its text
    assert first.status_code == 200 and first.json()["translated"] is True
    shown = first.json()["insights"]
    assert shown["headline"] == HEBREW.headline and shown["language"] == "he"
    assert shown["source"] == "template"  # still the general text, now in Hebrew
    assert shown["key_findings"][0]["evidence"] == "11.9% הפסיקו להפיק שכר"
    sent = json.loads(models.calls[0]["contents"])
    assert sent["headline"] == INSIGHTS["headline"] and "source" not in sent
    assert "Hebrew" in models.calls[0]["config"].system_instruction

    kept = run.parent / "translations" / "insights.he.json"
    assert json.loads(kept.read_text(encoding="utf-8"))["source_language"] == "en"
    assert (run / "narratives.json").read_bytes() == before  # the run's own text never changes
    assert not list(run.rglob("insights.he.json"))  # kept beside the artifacts, not among them

    assert _translate(server).json() == first.json()
    assert len(models.calls) == 1  # the second reader gets the kept translation


def test_the_language_the_run_was_written_in_needs_no_model(server, run):
    models = _fake(server)
    same = _translate(server, "en")
    assert same.status_code == 200 and same.json() == {"insights": INSIGHTS, "translated": False}
    assert models.calls == []


def test_without_the_model_there_is_no_translation(server, run):
    assert server.get("/api/me").json()["llm"] is False
    missing = _translate(server)
    assert missing.status_code == 503 and missing.json()["detail"]["code"] == "llm_unavailable"
    _fake(server)
    assert server.get("/api/me").json()["llm"] is True


@pytest.mark.parametrize(
    ("answer", "why"),
    [
        (HEBREW.model_copy(update={"recommendations": []}), "an item left out"),
        (
            HEBREW.model_copy(
                update={
                    "key_findings": [
                        FindingText(title="שכר", evidence="12% הפסיקו", business_meaning="סימן")
                    ]
                }
            ),
            "a percentage changed",
        ),
    ],
)
def test_a_translation_that_changes_the_report_is_not_kept(server, run, answer, why):
    _fake(server, answer=answer)
    refused = _translate(server)
    assert refused.status_code == 502, why
    assert refused.json()["detail"]["code"] == "translation_invalid"
    assert not (run.parent / "translations" / "insights.he.json").exists()


def test_a_model_without_quota_says_so(server, run):
    quota = Exception("429 RESOURCE_EXHAUSTED")
    quota.code = 429
    _fake(server, error=quota)
    answer = _translate(server)
    assert answer.status_code == 503 and answer.json()["detail"]["code"] == "llm_quota"


def test_only_ones_own_finished_runs_and_two_languages(server, server_settings, run):
    _fake(server)
    assert _translate(server, "fr").status_code == 422
    assert (
        server.post("/api/runs/nope/insights/translation", json={"language": "he"}).status_code
        == 404
    )
    company = activate(server, "b@b.example", "Beta", "beta")
    assert _translate(server).status_code == 404
    _done(server_settings, company, "sept", snapshot="2025-10-01", accounts={}, status="queued")
    waiting = server.post("/api/runs/sept/insights/translation", json={"language": "he"})
    assert waiting.status_code == 409 and waiting.json()["detail"]["code"] == "not_ready"
