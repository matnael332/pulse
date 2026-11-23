"""A finished run's results, for its company: the business view and the advanced one.

Read from the run's own artifacts (``runs/<id>/artifacts``; every run keeps them), with the
account names joined in from the folder's entity map. Only what the screens need is served:
never the model, the clean data, the features or the rows that were scored (of those, only each
account's monthly revenue is read, see ``scores``).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

from pulse_server import jobs, view
from pulse_server.changes import artifacts_of, base_run, compare, nothing, run_ref
from pulse_server.deps import ActiveCompany, Config, Db, LanguageModel
from pulse_server.errors import http_error
from pulse_server.llm import LlmError
from pulse_server.models import Run
from pulse_server.translate import TranslationInvalid, translate
from pulse_server.uploads import company_run

router = APIRouter(prefix="/api/runs", tags=["results"])
NO_ANSWER = {  # LlmError codes -> HTTP status
    "llm_unavailable": 503,
    "llm_quota": 503,
    "llm_timeout": 504,
    "llm_failed": 502,
}


def _artifacts(settings, db, company, run_id: str) -> tuple[Run, Path, Path]:
    run = company_run(db, company, run_id)
    if run.status != "succeeded":
        raise http_error(409, "not_ready", status=run.status)
    folder = jobs.customer_folder(settings, company, run.ingestion.demo)
    return run, folder.runs / run.id / "artifacts", folder.entity_map


@lru_cache(maxsize=32)  # a dashboard holds two runs: the one shown and its base
def _business(artifacts: str, entity_map: str, _stamp: tuple) -> dict:
    """The business view's data (cached per run and file times: runs never change)."""
    return view.business(Path(artifacts), Path(entity_map))


def _stamp(*paths: Path) -> tuple:
    return tuple(p.stat().st_mtime_ns if p.exists() else 0 for p in paths)


def _view(art: Path, entity_map: Path) -> dict:
    """A run's business view (cached and shared: read it, never change it)."""
    if not (art / "scores_current.csv").exists():
        raise HTTPException(404, "no results for this run")
    stamp = _stamp(art / "scores_current.csv", art / "score_rows.csv", entity_map)
    return _business(str(art), str(entity_map), stamp)


@router.get("/{run_id}/results")
def results(run_id: str, company: ActiveCompany, db: Db, settings: Config) -> dict:
    run, art, entity_map = _artifacts(settings, db, company, run_id)
    business = dict(_view(art, entity_map))
    report = run.ingestion.report or {}
    return {
        "run": {
            "id": run.id,
            "demo": run.ingestion.demo,
            "language": run.language,
            "mode": run.mode,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        },
        # The revenue is read from the artifacts, so runs summarised before it was recorded have it.
        "summary": {**(run.summary or {}), **business.pop("revenue")},
        # The run the figures' changes are counted from: the same base as /changes.
        "previous": run_ref(base_run(db, settings, company, run)),
        "currency": company.currency,
        **business,
        "data": view.data_notes(report),
    }


@router.get("/{run_id}/changes")
def changes(run_id: str, company: ActiveCompany, db: Db, settings: Config) -> dict:
    """The accounts that changed since the previous month (see ``changes``)."""
    run, art, entity_map = _artifacts(settings, db, company, run_id)
    now = _view(art, entity_map)["accounts"]  # 404 for a run without results, base or not
    base = base_run(db, settings, company, run)
    if base is None:
        return {"base": None, **nothing()}
    before = _view(artifacts_of(settings, company, base), entity_map)["accounts"]
    return {"base": run_ref(base), **compare(now, before)}


class Translation(BaseModel):
    language: Literal["he", "en"]


@router.post("/{run_id}/insights/translation")
def translation(
    run_id: str,
    body: Translation,
    company: ActiveCompany,
    db: Db,
    settings: Config,
    model: LanguageModel,
) -> dict:
    """The run's insights in ``language``: as written, kept, or translated now (see translate)."""
    _run_row, art, _ = _artifacts(settings, db, company, run_id)
    try:
        return translate(view.insights(art), body.language, art.parent / "translations", model)
    except LlmError as exc:
        raise http_error(NO_ANSWER.get(exc.code, 502), exc.code) from exc
    except TranslationInvalid as exc:
        raise http_error(502, "translation_invalid") from exc


@router.get("/{run_id}/advanced")
def advanced(run_id: str, company: ActiveCompany, db: Db, settings: Config) -> dict:
    _run_row, art, _ = _artifacts(settings, db, company, run_id)
    return view.advanced(art)


@router.get("/{run_id}/docs/{name}")
def doc(run_id: str, name: str, company: ActiveCompany, db: Db, settings: Config):
    _run_row, art, _ = _artifacts(settings, db, company, run_id)
    path = art / view.DOCS.get(name, "")
    if name not in view.DOCS or not path.is_file():
        raise HTTPException(404, "no such document")
    return PlainTextResponse(path.read_text(encoding="utf-8"), media_type="text/markdown")


@router.get("/{run_id}/figures/{name}")
def figure(run_id: str, name: str, company: ActiveCompany, db: Db, settings: Config):
    _run_row, art, _ = _artifacts(settings, db, company, run_id)
    listed = {p.name for p in (art / "figures").glob("*.png")}
    if not view.FIGURE.match(name) or name not in listed:
        raise HTTPException(404, "no such figure")
    return FileResponse(art / "figures" / name, media_type="image/png")
