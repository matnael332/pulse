"""A finished run's results, for its company: the business view and the advanced one.

Read from the run's own artifacts (``runs/<id>/artifacts``; every run keeps them), with the
account names joined in from the folder's entity map. Only what the screens need is served:
never the model, the clean data, the features or the rows that were scored.
"""

from __future__ import annotations

import csv
import json
import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse

from pulse_server import jobs
from pulse_server.deps import ActiveCompany, Config, Db
from pulse_server.errors import http_error
from pulse_server.models import Run
from pulse_server.uploads import company_run

router = APIRouter(prefix="/api/runs", tags=["results"])
DOCS = {
    "model_card": "model_card.md",
    "evaluation_report": "evaluation_report.md",
    "data_check": "cleaning_report.md",
}
FIGURE = re.compile(r"^[a-z0-9_]+\.png$")
TEST_METRICS = (
    "roc_auc",
    "pr_auc",
    "precision_at_top10pct",
    "lift_at_top10pct",
    "brier",
    "precision",
    "recall",
    "flagged_share",
    "threshold",
    "rows",
)
TOP_FEATURES = 15
BINS = 10


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _artifacts(settings, db, company, run_id: str) -> tuple[Run, Path, Path]:
    run = company_run(db, company, run_id)
    if run.status != "succeeded":
        raise http_error(409, "not_ready", status=run.status)
    folder = jobs.customer_folder(settings, company, run.ingestion.demo)
    return run, folder.runs / run.id / "artifacts", folder.entity_map


def _names(entity_map: Path) -> dict[str, tuple[str, str]]:
    """pseudonym -> (the customer's own account number, the account's name)."""
    if not entity_map.exists():
        return {}
    with open(entity_map, encoding="utf-8", newline="") as handle:
        return {r["pseudo_id"]: (r["source_id"], r["name"]) for r in csv.DictReader(handle)}


@lru_cache(maxsize=16)
def _business(artifacts: str, entity_map: str, _stamp: tuple) -> dict:
    """The business view's data (cached per run and file times: runs never change)."""
    art = Path(artifacts)
    names = _names(Path(entity_map))
    reasons = {
        e["account_id"]: e["reasons"] for e in _read_json(art / "reasons.json").get("entities", [])
    }
    accounts = []
    with open(art / "scores_current.csv", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            customer_id, name = names.get(row["account_id"], ("", ""))
            accounts.append(
                {
                    "id": row["account_id"],
                    "customer_id": customer_id,
                    "name": name,
                    "level": row["risk_level"],
                    "probability": float(row["probability"]),
                    "rank": int(row["rank"]),
                    "reasons": reasons.get(row["account_id"], []),
                }
            )
    levels = {"high": 0, "elevated": 0, "normal": 0}
    histogram = [0] * BINS
    for account in accounts:
        levels[account["level"]] = levels.get(account["level"], 0) + 1
        histogram[min(int(account["probability"] * BINS), BINS - 1)] += 1
    eda = _read_json(art / "eda_summary.json")
    trend = [
        {"month": month, "rate": values.get("positive_rate"), "rows": values.get("rows")}
        for month, values in sorted((eda.get("monthly_positive_rate") or {}).items())
    ]
    insights = _read_json(art / "narratives.json").get("insights") or {}
    contract = _read_json(art / "dataset_contract.json")
    return {
        "accounts": accounts,
        "distribution": {
            "levels": levels,
            "histogram": [
                {"from": i / BINS, "to": (i + 1) / BINS, "count": n}
                for i, n in enumerate(histogram)
            ],
        },
        "trend": trend,
        "key_numbers": eda.get("key_numbers") or [],
        "insights": {
            k: insights.get(k)
            for k in (
                "headline",
                "key_findings",
                "recommendations",
                "data_caveats",
                "source",
                "language",
            )
        },
        "groups": contract.get("data_groups") or {},
    }


def _stamp(*paths: Path) -> tuple:
    return tuple(p.stat().st_mtime_ns if p.exists() else 0 for p in paths)


@router.get("/{run_id}/results")
def results(run_id: str, company: ActiveCompany, db: Db, settings: Config) -> dict:
    run, art, entity_map = _artifacts(settings, db, company, run_id)
    if not (art / "scores_current.csv").exists():
        raise HTTPException(404, "no results for this run")
    business = _business(str(art), str(entity_map), _stamp(art / "scores_current.csv", entity_map))
    report = run.ingestion.report or {}
    return {
        "run": {
            "id": run.id,
            "demo": run.ingestion.demo,
            "language": run.language,
            "mode": run.mode,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        },
        "summary": run.summary,
        **business,
        "data": {
            k: report.get(k)
            for k in (
                "snapshot_date",
                "train_start",
                "windows",
                "cancellations",
                "low_confidence",
                "accounts",
                "groups_missing",
            )
        },
    }


@router.get("/{run_id}/advanced")
def advanced(run_id: str, company: ActiveCompany, db: Db, settings: Config) -> dict:
    _run_row, art, _ = _artifacts(settings, db, company, run_id)
    metrics = _read_json(art / "metrics.json")
    meta = _read_json(art / "model_meta.json")
    described = {
        f["name"]: f.get("description", "")
        for f in _read_json(art / "feature_spec.json").get("features", [])
    }
    candidates = {
        name: {
            "description": c.get("description", ""),
            "test": {k: c.get("test", {}).get(k) for k in TEST_METRICS},
            "cv": {k: v for k, v in (c.get("cv") or {}).items() if k != "folds"},
        }
        for name, c in (metrics.get("candidates") or {}).items()
    }
    importance = [
        {**f, "description": described.get(f["feature"], "")}
        for f in (metrics.get("permutation_importance") or {}).get("features", [])[:TOP_FEATURES]
    ]
    figures = sorted(p.name for p in (art / "figures").glob("*.png") if FIGURE.match(p.name))
    return {
        "selected_model": metrics.get("selected_model"),
        "selection": metrics.get("selection") or {},
        "split": metrics.get("split") or {},
        "threshold": meta.get("threshold"),
        "candidates": candidates,
        "importance": importance,
        "figures": figures,
        "docs": [name for name, file in DOCS.items() if (art / file).exists()],
    }


@router.get("/{run_id}/docs/{name}")
def doc(run_id: str, name: str, company: ActiveCompany, db: Db, settings: Config):
    _run_row, art, _ = _artifacts(settings, db, company, run_id)
    path = art / DOCS.get(name, "")
    if name not in DOCS or not path.is_file():
        raise HTTPException(404, "no such document")
    return PlainTextResponse(path.read_text(encoding="utf-8"), media_type="text/markdown")


@router.get("/{run_id}/figures/{name}")
def figure(run_id: str, name: str, company: ActiveCompany, db: Db, settings: Config):
    _run_row, art, _ = _artifacts(settings, db, company, run_id)
    listed = {p.name for p in (art / "figures").glob("*.png")}
    if not FIGURE.match(name) or name not in listed:
        raise HTTPException(404, "no such figure")
    return FileResponse(art / "figures" / name, media_type="image/png")
