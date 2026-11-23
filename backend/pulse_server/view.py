"""What the screens show of a finished run, read from its artifacts.

Plain functions on files, without the server: the results API serves them (``results``), the worker
keeps a run's summary, and the browser demo answers with the same ones. Only what the screens need
is read: never the model, the clean data, the features or the rows that were scored (of those, only
each account's monthly revenue, see ``scores``).
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from pulse_server import scores

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
INSIGHTS = ("headline", "key_findings", "recommendations", "data_caveats", "source", "language")
DATA_NOTES = (
    "snapshot_date",
    "train_start",
    "windows",
    "cancellations",
    "low_confidence",
    "accounts",
    "groups_missing",
)


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _names(entity_map: Path) -> dict[str, tuple[str, str]]:
    """pseudonym -> (the customer's own account number, the account's name)."""
    if not entity_map.exists():
        return {}
    with open(entity_map, encoding="utf-8", newline="") as handle:
        return {r["pseudo_id"]: (r["source_id"], r["name"]) for r in csv.DictReader(handle)}


def business(art: Path, entity_map: Path) -> dict:
    """The business view's data: the accounts with their names, the distribution and the trend."""
    names = _names(entity_map)
    reasons = {
        e["account_id"]: e["reasons"] for e in _read_json(art / "reasons.json").get("entities", [])
    }
    mrr = scores.scored_mrr(art)
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
                    "mrr": mrr.get(row["account_id"]),
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
    contract = _read_json(art / "dataset_contract.json")
    return {
        "revenue": scores.revenue({a["id"]: a["level"] for a in accounts}, mrr),
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
        "insights": insights(art),
        "groups": contract.get("data_groups") or {},
    }


def insights(art: Path) -> dict:
    """What the language model found, as the screens show it (or the run's general text)."""
    found = _read_json(art / "narratives.json").get("insights") or {}
    return {k: found.get(k) for k in INSIGHTS}


def data_notes(report: dict) -> dict:
    """What to know about the data, from the ingestion's report."""
    return {k: report.get(k) for k in DATA_NOTES}


def advanced(art: Path) -> dict:
    """The model behind the run: its quality, the ones it was chosen from, what drives it."""
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


def summarise(art: Path, report: dict) -> dict:
    """Accounts scored per risk level, the revenue at risk and the snapshot date (for history)."""
    counts = {"high": 0, "elevated": 0, "normal": 0}
    levels: dict[str, str] = {}
    path = art / "scores_current.csv"
    if path.exists():
        with open(path, encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                counts[row["risk_level"]] = counts.get(row["risk_level"], 0) + 1
                levels[row["account_id"]] = row["risk_level"]
    return {
        "accounts": sum(counts.values()),
        **counts,
        **scores.revenue(levels, scores.scored_mrr(art)),
        "snapshot_date": report.get("snapshot_date"),
    }
