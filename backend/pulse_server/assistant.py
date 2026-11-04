"""The business copilot: a company asks about one finished run, in its own words.

The answer comes from the tools (``assistant_tools``), which see the run's accounts by pseudonym
only. The browser swaps the names the reader typed for those ids before asking, and the ids in
the answer back for names, so no account name or number from the data reaches the model. The
conversation lives in the browser: it sends the last turns with each question. Each question's
tools and tokens go to the log, never its text. There is no usage limit yet (plans will set them).
"""

from __future__ import annotations

import logging
import re
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from pulse_copilot.answer import Recorder
from pulse_copilot.engine import Engine
from pulse_copilot.gemini import error_code
from pulse_copilot.grounding import ungrounded
from pulse_server.assistant_tools import Context, build_tools
from pulse_server.changes import artifacts_of, base_run, compare, snapshot_of
from pulse_server.deps import ActiveCompany, Config, Db, LanguageModel
from pulse_server.errors import http_error
from pulse_server.results import NO_ANSWER, _artifacts, _view

router = APIRouter(prefix="/api/runs", tags=["assistant"])
log = logging.getLogger("pulse_server.assistant")
LANGUAGES = {"he": "Hebrew", "en": "English"}
GLOSSARY_KEY = re.compile(r"^(reason|group|level)\.[a-z0-9_]{1,40}$")
INSTRUCTION = """\
You are pulse's assistant for a company's customer-churn results: the accounts the model scored \
from the company's data as of {snapshot}, how likely each is to leave, why, and what changed \
since the previous month. You help the company's manager decide whom to call.

Rules:
- Answer in {language}, whatever language the question is in.
- Use the tools for every fact and number, and copy numbers exactly as the tools return them \
(they are already formatted, money in {currency}). Never compute, round or estimate a new number.
- An account is known only by its id, like acc_000123. Always write the id exactly, never a name: \
the screen puts the account's name in its place.
- Use the words the tools give for reasons, levels and data groups. Never mention the tools, \
their fields or any technical name: speak as to a manager.
- Answer in 2 to 5 short sentences; use a short list only for several accounts (at most 10).
- You are read-only: you cannot run, change or delete anything.
- If the tools do not have the answer, say so plainly."""


class Turn(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(max_length=4000)


class Question(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=6)
    language: Literal["he", "en"]
    glossary: dict[str, str] = Field(default_factory=dict, max_length=200)

    @field_validator("glossary")
    @classmethod
    def _words(cls, glossary: dict[str, str]) -> dict[str, str]:
        for key, words in glossary.items():
            if not GLOSSARY_KEY.match(key) or len(words) > 80:
                raise ValueError(f"not a glossary entry: {key!r}")
        return glossary


@router.post("/{run_id}/copilot")
def ask(
    run_id: str,
    body: Question,
    company: ActiveCompany,
    db: Db,
    settings: Config,
    model: LanguageModel,
) -> dict:
    """One answer about the run, from its tools; the ids in it are the browser's to name."""
    run, art, entity_map = _artifacts(settings, db, company, run_id)
    if not model.available:
        raise http_error(503, "llm_unavailable")
    view = _view(art, entity_map)
    now = view["accounts"]
    base = base_run(db, settings, company, run)
    before = _view(artifacts_of(settings, company, base), entity_map)["accounts"] if base else None
    context = Context(
        accounts=now,
        currency=company.currency,
        snapshot_date=snapshot_of(run),
        changes=compare(now, before) if before is not None else None,
        before={a["id"]: a for a in before} if before is not None else None,
        base_snapshot=snapshot_of(base) if base else None,
        report=run.ingestion.report or {},
        groups=view["groups"],
        glossary=body.glossary,
    )
    engine = Engine(
        INSTRUCTION.format(
            language=LANGUAGES[body.language],
            currency=company.currency,
            snapshot=context.snapshot_date or "the latest month",
        ),
        client=model.client,
        model=model.model,
    )
    recorder = Recorder()
    history = [turn.model_dump() for turn in body.history]
    try:
        text, usage = engine.run(body.message, history, build_tools(context), recorder)
    except Exception as exc:  # noqa: BLE001 - every failure becomes a code the site words
        code = error_code(exc)
        log.warning(
            "copilot: company %s, run %s: %s (%s)", company.id, run.id, code, type(exc).__name__
        )
        raise http_error(NO_ANSWER.get(code, 502), code) from exc
    tools = [call.name for call in recorder.calls]
    log.info(
        "copilot: company %s, run %s, tools %s, %s prompt and %s output tokens",
        company.id,
        run.id,
        tools,
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    if not text:
        raise http_error(502, "llm_failed")
    return {
        "text": text,
        "ungrounded": ungrounded(text, [call.result for call in recorder.calls]),
        "tools": tools,
    }
