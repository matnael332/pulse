"""A run's insights in the other language: translated once by the language model, then kept.

The insights are written in the language the run ran in (a run without the model has the general
text, always in English). The first reader in the other language has them translated; the
translation is checked (the same items, every percentage and decimal as it was) and kept beside
the run's artifacts, never among them, so the next reader gets it without a call. A translation
of other insights (a run's are never rewritten, but a kept file could be stale) is made again.
"""

from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path

from pydantic import BaseModel

from pulse_copilot.grounding import ungrounded
from pulse_core.io import write_json_lf
from pulse_server.llm import Llm

TEXT_FIELDS = ("headline", "key_findings", "recommendations", "data_caveats")
LANGUAGES = {"he": "Hebrew", "en": "English"}
INSTRUCTION = """\
You translate the findings of a customer-churn report into {language} for the business owner \
who reads them. Translate every text field; keep the structure and the number of items in every \
list. Copy every number, percentage, date, amount, currency sign and identifier exactly as it is \
written. Keep the meaning and the tone; add nothing and leave nothing out."""

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


class FindingText(BaseModel):
    title: str
    evidence: str
    business_meaning: str


class InsightsText(BaseModel):
    headline: str
    key_findings: list[FindingText]
    recommendations: list[str]
    data_caveats: list[str]


class TranslationInvalid(Exception):
    """The model's translation changed the structure or a number; nothing is kept."""


def _lock(path: Path) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(str(path), threading.Lock())


def _text(insights: dict) -> dict:
    return {
        "headline": insights.get("headline") or "",
        "key_findings": [
            {k: f.get(k) or "" for k in ("title", "evidence", "business_meaning")}
            for f in insights.get("key_findings") or []
        ],
        "recommendations": list(insights.get("recommendations") or []),
        "data_caveats": list(insights.get("data_caveats") or []),
    }


def _check(original: dict, translated: dict) -> None:
    for field in ("key_findings", "recommendations", "data_caveats"):
        if len(original[field]) != len(translated[field]):
            raise TranslationInvalid(
                f"{field}: {len(translated[field])} items for {len(original[field])}"
            )
    changed = ungrounded(json.dumps(translated, ensure_ascii=False), [original])
    if changed:
        raise TranslationInvalid(f"numbers not in the original: {changed}")


def translate(insights: dict, language: str, folder: Path, llm: Llm) -> dict:
    """``insights`` (as the results serve them) in ``language``; the translation is kept in
    ``folder``. Raises LlmError (no answer) or TranslationInvalid (a bad one)."""
    source = insights.get("language") or "en"
    if source == language or not insights.get("headline"):
        return {"insights": insights, "translated": False}
    original = _text(insights)
    digest = hashlib.sha256(json.dumps(original, sort_keys=True).encode()).hexdigest()
    path = folder / f"insights.{language}.json"
    with _lock(path):
        try:
            kept = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            kept = {}
        if kept.get("original_sha256") != digest:
            answer = llm.structured(
                "translation",
                INSTRUCTION.format(language=LANGUAGES[language]),
                json.dumps(original, ensure_ascii=False),
                InsightsText,
            )
            text = answer.model_dump()
            _check(original, text)
            kept = {
                "language": language,
                "source_language": source,
                "model": llm.model,
                "original_sha256": digest,
                "insights": text,
            }
            write_json_lf(path, kept, ndigits=None)
    shown = {**insights, **kept["insights"], "language": language}
    return {"insights": shown, "translated": True}
